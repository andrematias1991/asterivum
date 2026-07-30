import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAdmin, requireAuth, requireCsrf } from './auth.js';
import { recordActivity, recordPageView } from './analytics.js';
import { db, transaction } from './db.js';
import type { AuthedRequest } from './types.js';

const pageKeys=['dashboard','profiles','chart','editor','analysis','ephemeris','forecast','synastry','astromap','directory','provider','admin'] as const;
const clientEvents=['PDF_EXPORTED','PRINT_STARTED','CHART_CALCULATED','DIRECTORY_SEARCHED'] as const;
const suggestionKinds=['NEW_SPECIALTY','CORRECTION','TRANSLATION','OTHER'] as const;
const iconKeys=['activity','leaf','droplets','circle-dot','sprout','bone','accessibility','flower-2','hand','sparkles','footprints','waves','person-standing','audio-lines','zap','orbit','gallery-vertical-end','binary','heart-handshake','brain','wind','music','apple','flask-conical'] as const;
const slug=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const json=(value:unknown)=>typeof value==='string'?JSON.parse(value):value;

export const platformRoutes=Router();

platformRoutes.post('/analytics/page-view',optionalAuth,async(req:AuthedRequest,res)=>{
  const parsed=z.object({pageKey:z.enum(pageKeys)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid page view'});
  await recordPageView(parsed.data.pageKey,Boolean(req.user));
  res.status(204).end();
});

platformRoutes.post('/analytics/event',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const parsed=z.object({eventType:z.enum(clientEvents),entityType:z.string().trim().max(40).default(''),entityId:z.number().int().positive().nullable().default(null)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid activity event'});
  await recordActivity(req.user!.id,parsed.data.eventType,parsed.data.entityType,parsed.data.entityId);
  res.status(204).end();
});

platformRoutes.post('/account/type-request',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const parsed=z.object({accountType:z.enum(['PROFESSIONAL','CLINIC']),message:z.string().trim().min(20).max(1000)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Describe the professional or clinic account request'});
  const current=await db.first<{accountType:string;verificationStatus:string}>('SELECT account_type AS accountType,verification_status AS verificationStatus FROM users WHERE id=?',[req.user!.id]);
  if(current?.verificationStatus==='PENDING')return res.status(409).json({error:'An account verification request is already pending'});
  await transaction(async client=>{
    await client.execute("UPDATE users SET account_type=?,verification_status='PENDING' WHERE id=?",[parsed.data.accountType,req.user!.id]);
    await client.execute('INSERT INTO activity_events(user_id,event_type,entity_type,entity_id,metadata) VALUES(?,?,?,?,?)',[req.user!.id,'ACCOUNT_TYPE_REQUESTED','user',req.user!.id,JSON.stringify({accountType:parsed.data.accountType,message:parsed.data.message})]);
  });
  res.status(202).json({ok:true});
});

platformRoutes.post('/directory/suggestions',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const parsed=z.object({
    kind:z.enum(suggestionKinds),suggestedNameEn:z.string().trim().max(100).default(''),suggestedNamePt:z.string().trim().max(100).default(''),
    message:z.string().trim().min(15).max(2000),
  }).superRefine((value,ctx)=>{
    if(value.kind==='NEW_SPECIALTY'&&!value.suggestedNameEn&&!value.suggestedNamePt)ctx.addIssue({code:'custom',path:['suggestedNameEn'],message:'Provide a specialty name'});
  }).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Complete the suggestion'});
  const result=await db.execute("INSERT INTO specialty_suggestions(user_id,kind,suggested_name_en,suggested_name_pt,message,status,admin_note) VALUES(?,?,?,?,?,'PENDING','')",[
    req.user!.id,parsed.data.kind,parsed.data.suggestedNameEn,parsed.data.suggestedNamePt,parsed.data.message,
  ]);
  await recordActivity(req.user!.id,'SPECIALTY_SUGGESTED','suggestion',result.insertId);
  res.status(201).json({id:result.insertId});
});

platformRoutes.get('/admin/platform',requireAuth,requireAdmin,async(_req,res)=>{
  const since=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const [pageViews,eventCounts,recentEvents,suggestions,accountRequests]=await Promise.all([
    db.query<{viewDate:string;pageKey:string;anonymousCount:number;authenticatedCount:number}>('SELECT view_date AS viewDate,page_key AS pageKey,anonymous_count AS anonymousCount,authenticated_count AS authenticatedCount FROM page_view_daily WHERE view_date>=? ORDER BY view_date,page_key',[since]),
    db.query<{eventType:string;n:number}>('SELECT event_type AS eventType,count(*) n FROM activity_events WHERE created_at>=? GROUP BY event_type ORDER BY n DESC',[`${since} 00:00:00`]),
    db.query<Record<string,unknown>>(`SELECT e.id,e.event_type AS eventType,e.entity_type AS entityType,e.entity_id AS entityId,e.metadata,e.created_at AS createdAt,u.name AS userName,u.email AS userEmail
      FROM activity_events e LEFT JOIN users u ON u.id=e.user_id ORDER BY e.created_at DESC LIMIT 100`),
    db.query<Record<string,unknown>>(`SELECT s.id,s.kind,s.suggested_name_en AS suggestedNameEn,s.suggested_name_pt AS suggestedNamePt,s.message,s.status,s.created_at AS createdAt,u.name AS userName,u.email AS userEmail
      FROM specialty_suggestions s JOIN users u ON u.id=s.user_id WHERE s.status='PENDING' ORDER BY s.created_at LIMIT 100`),
    db.query<Record<string,unknown>>(`SELECT id,name,email,account_type AS accountType,verification_status AS verificationStatus,created_at AS createdAt,
      (SELECT metadata FROM activity_events e WHERE e.user_id=users.id AND e.event_type='ACCOUNT_TYPE_REQUESTED' ORDER BY e.created_at DESC LIMIT 1) requestMetadata
      FROM users WHERE verification_status='PENDING' ORDER BY created_at LIMIT 100`),
  ]);
  res.json({
    pageViews,eventCounts,recentEvents:recentEvents.map(item=>({...item,metadata:json(item.metadata)})),suggestions,
    accountRequests:accountRequests.map(item=>({...item,requestMetadata:json(item.requestMetadata)})),
  });
});

platformRoutes.post('/admin/account-requests/:userId',requireAuth,requireCsrf,requireAdmin,async(req:AuthedRequest,res)=>{
  const parsed=z.object({action:z.enum(['APPROVE','REJECT']),note:z.string().trim().max(1000).default('')}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid account decision'});
  const userId=Number(req.params.userId);
  const user=await db.first<{accountType:string;verificationStatus:string}>('SELECT account_type AS accountType,verification_status AS verificationStatus FROM users WHERE id=?',[userId]);
  if(!user||user.verificationStatus!=='PENDING')return res.status(404).json({error:'Pending account request not found'});
  const next=parsed.data.action==='APPROVE'?'VERIFIED':'REJECTED';
  await transaction(async client=>{
    await client.execute('UPDATE users SET verification_status=? WHERE id=?',[next,userId]);
    await client.execute('INSERT INTO activity_events(user_id,event_type,entity_type,entity_id,metadata) VALUES(?,?,?,?,?)',[req.user!.id,parsed.data.action==='APPROVE'?'ACCOUNT_TYPE_APPROVED':'ACCOUNT_TYPE_REJECTED','user',userId,JSON.stringify({accountType:user.accountType,note:parsed.data.note})]);
  });
  res.json({ok:true});
});

platformRoutes.post('/admin/suggestions/:id/decision',requireAuth,requireCsrf,requireAdmin,async(req:AuthedRequest,res)=>{
  const parsed=z.object({action:z.enum(['APPROVE','REJECT']),note:z.string().trim().max(1000).default(''),iconKey:z.enum(iconKeys).default('sparkles')}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid suggestion decision'});
  const suggestion=await db.first<{id:number;kind:string;nameEn:string;namePt:string;status:string}>('SELECT id,kind,suggested_name_en AS nameEn,suggested_name_pt AS namePt,status FROM specialty_suggestions WHERE id=?',[Number(req.params.id)]);
  if(!suggestion||suggestion.status!=='PENDING')return res.status(404).json({error:'Pending suggestion not found'});
  await transaction(async client=>{
    if(parsed.data.action==='APPROVE'&&suggestion.kind==='NEW_SPECIALTY'){
      const nameEn=suggestion.nameEn||suggestion.namePt,namePt=suggestion.namePt||suggestion.nameEn;
      const specialtySlug=slug(nameEn);
      if(!specialtySlug)throw new Error('Suggested specialty name cannot create a valid identifier');
      const max=await client.first<{n:number}>('SELECT COALESCE(MAX(sort_order),0)+1 n FROM therapy_specialties');
      await client.execute('INSERT INTO therapy_specialties(slug,name_en,name_pt,regulated,active,sort_order,icon_key) VALUES(?,?,?,0,1,?,?)',[specialtySlug,nameEn,namePt,max?.n||100,parsed.data.iconKey]);
    }
    await client.execute('UPDATE specialty_suggestions SET status=?,admin_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?',[parsed.data.action==='APPROVE'?'APPROVED':'REJECTED',parsed.data.note,req.user!.id,suggestion.id]);
    await client.execute('INSERT INTO activity_events(user_id,event_type,entity_type,entity_id,metadata) VALUES(?,?,?,?,?)',[req.user!.id,parsed.data.action==='APPROVE'?'SUGGESTION_APPROVED':'SUGGESTION_REJECTED','suggestion',suggestion.id,JSON.stringify({note:parsed.data.note})]);
  });
  res.json({ok:true});
});
