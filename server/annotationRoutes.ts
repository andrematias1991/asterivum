import { Router } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { requireAuth, requireCsrf } from './auth.js';
import type { AuthedRequest } from './types.js';
import { recordActivity } from './analytics.js';

const point = z.object({ x:z.number().min(0).max(560), y:z.number().min(0).max(560) });
const style = {
  color:z.string().regex(/^#[0-9a-f]{6}$/i),
  width:z.number().min(0.5).max(30),
};
const annotation = z.discriminatedUnion('type', [
  z.object({ id:z.string().min(1).max(80), type:z.literal('PEN'), points:z.array(point).min(2).max(2500), ...style }),
  z.object({ id:z.string().min(1).max(80), type:z.literal('HIGHLIGHTER'), points:z.array(point).min(2).max(2500), ...style }),
  z.object({ id:z.string().min(1).max(80), type:z.enum(['LINE','ARROW','RECTANGLE','ELLIPSE']), start:point, end:point, ...style }),
  z.object({ id:z.string().min(1).max(80), type:z.literal('TEXT'), position:point, text:z.string().trim().min(1).max(240), color:style.color, size:z.number().min(8).max(48) }),
]);
const context = z.object({
  profileId:z.number().int().positive(),
  secondProfileId:z.number().int().positive().optional(),
  mode:z.enum(['NATAL','TRANSIT','PROGRESSION','SYNASTRY']),
  targetDate:z.iso.datetime().optional(),
});
const annotationDocument = z.object({
  title:z.string().trim().min(1).max(150),
  context,
  annotations:z.array(annotation).max(500),
});

function parseJson(value:unknown) {
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}

async function ownsProfiles(userId:number, chartContext:z.infer<typeof context>) {
  const ids=[chartContext.profileId,chartContext.secondProfileId].filter((id):id is number=>Boolean(id));
  if (new Set(ids).size !== ids.length) return false;
  const placeholders=ids.map(()=>'?').join(',');
  const row=await db.first<{n:number}>(`SELECT count(*) n FROM birth_profiles WHERE user_id=? AND id IN (${placeholders})`,[userId,...ids]);
  return row?.n===ids.length;
}

export const annotationRoutes=Router();

annotationRoutes.get('/annotations',requireAuth,async(req:AuthedRequest,res)=>{
  const profileId=Number(req.query.profileId);
  const params:unknown[]=[req.user!.id];
  let filter='';
  if(Number.isInteger(profileId)&&profileId>0){filter=' AND profile_id=?';params.push(profileId);}
  const rows=await db.query<Record<string,unknown>>(`SELECT id,profile_id AS profileId,title,chart_mode AS chartMode,chart_context AS chartContext,created_at AS createdAt,updated_at AS updatedAt FROM chart_annotations WHERE user_id=?${filter} ORDER BY updated_at DESC LIMIT 100`,params);
  res.json({annotations:rows.map(row=>({...row,chartContext:parseJson(row.chartContext)}))});
});

annotationRoutes.get('/annotations/:id',requireAuth,async(req:AuthedRequest,res)=>{
  const row=await db.first<Record<string,unknown>>('SELECT id,profile_id AS profileId,title,chart_mode AS chartMode,chart_context AS chartContext,annotations,created_at AS createdAt,updated_at AS updatedAt FROM chart_annotations WHERE id=? AND user_id=?',[Number(req.params.id),req.user!.id]);
  if(!row)return res.status(404).json({error:'Annotation session not found'});
  res.json({annotation:{...row,chartContext:parseJson(row.chartContext),annotations:parseJson(row.annotations)}});
});

annotationRoutes.post('/annotations',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const parsed=annotationDocument.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid annotation session'});
  if(!await ownsProfiles(req.user!.id,parsed.data.context))return res.status(404).json({error:'Profile not found'});
  const result=await db.execute('INSERT INTO chart_annotations(user_id,profile_id,title,chart_mode,chart_context,annotations) VALUES(?,?,?,?,?,?)',[
    req.user!.id,parsed.data.context.profileId,parsed.data.title,parsed.data.context.mode,JSON.stringify(parsed.data.context),JSON.stringify(parsed.data.annotations),
  ]);
  void recordActivity(req.user!.id,'ANNOTATION_CREATED','annotation',result.insertId,{mode:parsed.data.context.mode}).catch(()=>undefined);
  res.status(201).json({id:result.insertId});
});

annotationRoutes.put('/annotations/:id',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const parsed=annotationDocument.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid annotation session'});
  if(!await ownsProfiles(req.user!.id,parsed.data.context))return res.status(404).json({error:'Profile not found'});
  const result=await db.execute('UPDATE chart_annotations SET profile_id=?,title=?,chart_mode=?,chart_context=?,annotations=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',[
    parsed.data.context.profileId,parsed.data.title,parsed.data.context.mode,JSON.stringify(parsed.data.context),JSON.stringify(parsed.data.annotations),Number(req.params.id),req.user!.id,
  ]);
  if(!result.affectedRows)return res.status(404).json({error:'Annotation session not found'});
  res.json({ok:true});
});

annotationRoutes.delete('/annotations/:id',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const result=await db.execute('DELETE FROM chart_annotations WHERE id=? AND user_id=?',[Number(req.params.id),req.user!.id]);
  if(!result.affectedRows)return res.status(404).json({error:'Annotation session not found'});
  res.status(204).end();
});
