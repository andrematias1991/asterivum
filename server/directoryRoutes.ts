import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { db, transaction, type DatabaseClient } from './db.js';
import { requireAdmin, requireAuth, requireCsrf } from './auth.js';
import type { AuthedRequest } from './types.js';
import { deleteListingImage, listingImageUrl, storeListingImage } from './imageStorage.js';
import { recordActivity } from './analytics.js';

const locationSchema=z.object({
  label:z.string().trim().min(1).max(100),
  address:z.string().trim().max(180).default(''),
  city:z.string().trim().min(1).max(100),
  region:z.string().trim().max(100).default(''),
  country:z.string().trim().min(2).max(100),
  postalCode:z.string().trim().max(24).default(''),
  latitude:z.number().min(-90).max(90),
  longitude:z.number().min(-180).max(180),
  markerPrecision:z.enum(['EXACT','APPROXIMATE']).default('EXACT'),
  isPrimary:z.boolean().default(false),
  imageId:z.number().int().positive().nullable().default(null),
});
const credentialSchema=z.object({
  specialtyId:z.number().int().positive().nullable().default(null),
  title:z.string().trim().min(1).max(120),
  issuer:z.string().trim().max(140).default(''),
  registrationNumber:z.string().trim().max(100).default(''),
});
export const listingPayloadSchema=z.object({
  listingType:z.enum(['PRACTITIONER','CLINIC']),
  name:z.string().trim().min(2).max(120),
  summary:z.string().trim().min(10).max(240),
  description:z.string().trim().min(20).max(4000),
  email:z.union([z.literal(''),z.email()]).default(''),
  phone:z.string().trim().max(40).default(''),
  website:z.union([z.literal(''),z.url().max(300)]).default(''),
  languages:z.array(z.string().trim().min(2).max(40)).min(1).max(12),
  specialtyIds:z.array(z.number().int().positive()).min(1).max(20),
  credentials:z.array(credentialSchema).max(20).default([]),
  locations:z.array(locationSchema).min(1).max(8),
  publishEmail:z.boolean().default(false),
  publishPhone:z.boolean().default(false),
}).superRefine((payload,ctx)=>{
  if(payload.publishEmail&&!payload.email)ctx.addIssue({code:'custom',path:['email'],message:'A public email is required'});
  if(payload.publishPhone&&!payload.phone)ctx.addIssue({code:'custom',path:['phone'],message:'A public phone is required'});
  if(payload.locations.filter(location=>location.isPrimary).length!==1)ctx.addIssue({code:'custom',path:['locations'],message:'Choose exactly one primary location'});
  if(new Set(payload.specialtyIds).size!==payload.specialtyIds.length)ctx.addIssue({code:'custom',path:['specialtyIds'],message:'Choose each specialty once'});
});

type ListingPayload=z.infer<typeof listingPayloadSchema>;
type ListingRow={id:number;userId:number;status:string;draftPayload:unknown;publishedPayload:unknown;publishedRevisionId:number|null;moderationFeedback:string;createdAt:string;updatedAt:string};

function parseJson<T>(value:unknown):T {
  if(typeof value==='string')return JSON.parse(value) as T;
  return value as T;
}
const encode=(value:unknown)=>JSON.stringify(value);
const roundCoordinate=(value:number)=>Math.round(value*100)/100;
const distanceKm=(aLat:number,aLng:number,bLat:number,bLng:number)=>{
  const r=6371,toRad=(value:number)=>value*Math.PI/180;
  const dLat=toRad(bLat-aLat),dLng=toRad(bLng-aLng);
  const h=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
  return 2*r*Math.asin(Math.sqrt(h));
};
const rowPayload=(row:ListingRow,key:'draftPayload'|'publishedPayload')=>parseJson<ListingPayload|null>(row[key]);

async function specialtyMap(client:DatabaseClient=db) {
  const rows=await client.query<{id:number;slug:string;nameEn:string;namePt:string;regulated:number|boolean;active:number|boolean;sortOrder:number;iconKey:string}>('SELECT id,slug,name_en AS nameEn,name_pt AS namePt,regulated,active,sort_order AS sortOrder,icon_key AS iconKey FROM therapy_specialties ORDER BY sort_order,name_en');
  return new Map(rows.map(row=>[Number(row.id),row]));
}

async function validateSpecialties(payload:ListingPayload,requireCredentials:boolean) {
  const available=await specialtyMap();
  if(payload.specialtyIds.some(id=>!available.get(id)?.active))return 'Choose valid specialties';
  if(requireCredentials) {
    const regulated=payload.specialtyIds.filter(id=>Boolean(available.get(id)?.regulated));
    const documented=new Set(payload.credentials.filter(item=>item.registrationNumber).map(item=>item.specialtyId));
    if(regulated.some(id=>!documented.has(id)))return 'A professional registration number is required for every regulated specialty';
  }
  return null;
}

function publicPayload(row:ListingRow,specialties:Map<number,Awaited<ReturnType<typeof specialtyMap>> extends Map<number,infer V>?V:never>,images:Map<number,string>) {
  const payload=rowPayload(row,'publishedPayload')!;
  return {
    id:row.id,status:row.status,listingType:payload.listingType,name:payload.name,summary:payload.summary,description:payload.description,
    email:payload.publishEmail?payload.email:'',phone:payload.publishPhone?payload.phone:'',website:payload.website,languages:payload.languages,
    specialties:payload.specialtyIds.map(id=>specialties.get(id)).filter(Boolean),
    credentials:payload.credentials.map(item=>({specialtyId:item.specialtyId,title:item.title,issuer:item.issuer,verified:false})),
    locations:payload.locations.map(location=>({
      ...location,
      imageUrl:location.imageId?images.get(location.imageId)||'':'',
      imageId:undefined,
      address:location.markerPrecision==='EXACT'?location.address:'',
      postalCode:location.markerPrecision==='EXACT'?location.postalCode:'',
      latitude:location.markerPrecision==='APPROXIMATE'?roundCoordinate(location.latitude):location.latitude,
      longitude:location.markerPrecision==='APPROXIMATE'?roundCoordinate(location.longitude):location.longitude,
    })),
  };
}

async function listingByOwner(id:number,userId:number) {
  return db.first<ListingRow>('SELECT id,user_id AS userId,status,draft_payload AS draftPayload,published_payload AS publishedPayload,published_revision_id AS publishedRevisionId,moderation_feedback AS moderationFeedback,created_at AS createdAt,updated_at AS updatedAt FROM provider_listings WHERE id=? AND user_id=?',[id,userId]);
}

async function listingImages(listingIds:number[]) {
  if(!listingIds.length)return new Map<number,string>();
  const placeholders=listingIds.map(()=>'?').join(',');
  const rows=await db.query<{id:number;storageKey:string}>(`SELECT id,storage_key AS storageKey FROM listing_images WHERE listing_id IN (${placeholders})`,listingIds);
  return new Map(rows.map(row=>[Number(row.id),listingImageUrl(row.storageKey)]));
}
function payloadImages(payload:ListingPayload|null,images:Map<number,string>) {
  if(!payload)return null;
  return {...payload,locations:payload.locations.map(location=>({...location,imageUrl:location.imageId?images.get(location.imageId)||'':''}))};
}

async function validateImages(payload:ListingPayload,listingId:number) {
  const ids=[...new Set(payload.locations.map(location=>location.imageId).filter((value):value is number=>Boolean(value)))];
  if(!ids.length)return null;
  const placeholders=ids.map(()=>'?').join(',');
  const row=await db.first<{n:number}>(`SELECT count(*) n FROM listing_images WHERE listing_id=? AND id IN (${placeholders})`,[listingId,...ids]);
  return row?.n===ids.length?null:'Choose images uploaded to this listing';
}

async function providerAccount(userId:number) {
  return db.first<{role:string;accountType:string;verificationStatus:string}>('SELECT role,account_type AS accountType,verification_status AS verificationStatus FROM users WHERE id=?',[userId]);
}
async function canPublishAs(userId:number,listingType:ListingPayload['listingType']) {
  const account=await providerAccount(userId);
  return account?.role==='ADMIN'||(account?.verificationStatus==='VERIFIED'&&((account.accountType==='PROFESSIONAL'&&listingType==='PRACTITIONER')||(account.accountType==='CLINIC'&&listingType==='CLINIC')));
}

const imageUpload=multer({
  storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1},
  fileFilter:(_req,file,callback)=>callback(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype)),
});

async function projectPublished(client:DatabaseClient,listingId:number,payload:ListingPayload) {
  await client.execute('DELETE FROM listing_locations WHERE listing_id=?',[listingId]);
  await client.execute('DELETE FROM listing_specialties WHERE listing_id=?',[listingId]);
  await client.execute('DELETE FROM listing_credentials WHERE listing_id=?',[listingId]);
  for(const location of payload.locations){
    const approximate=location.markerPrecision==='APPROXIMATE';
    await client.execute('INSERT INTO listing_locations(listing_id,label,address,city,region,country,postal_code,latitude,longitude,marker_precision,is_primary) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[
      listingId,location.label,approximate?'':location.address,location.city,location.region,location.country,approximate?'':location.postalCode,
      approximate?roundCoordinate(location.latitude):location.latitude,approximate?roundCoordinate(location.longitude):location.longitude,location.markerPrecision,location.isPrimary?1:0,
    ]);
  }
  for(const specialtyId of new Set(payload.specialtyIds))await client.execute('INSERT INTO listing_specialties(listing_id,specialty_id) VALUES(?,?)',[listingId,specialtyId]);
  for(const credential of payload.credentials)await client.execute('INSERT INTO listing_credentials(listing_id,specialty_id,title,issuer,registration_number,verified) VALUES(?,?,?,?,?,?)',[
    listingId,credential.specialtyId,credential.title,credential.issuer,credential.registrationNumber,0,
  ]);
}

export const directoryRoutes=Router();

directoryRoutes.get('/directory/specialties',async(_req,res)=>{
  const rows=await db.query('SELECT id,slug,name_en AS nameEn,name_pt AS namePt,regulated,icon_key AS iconKey FROM therapy_specialties WHERE active=1 ORDER BY sort_order,name_en');
  res.json({specialties:rows});
});

directoryRoutes.get('/directory/listings',async(req,res)=>{
  const parsed=z.object({
    q:z.string().trim().max(100).optional(),specialtyId:z.coerce.number().int().positive().optional(),
    latitude:z.coerce.number().min(-90).max(90).optional(),longitude:z.coerce.number().min(-180).max(180).optional(),
    radius:z.coerce.number().min(1).max(500).default(100),
  }).safeParse(req.query);
  if(!parsed.success)return res.status(400).json({error:'Invalid directory filters'});
  const rows=await db.query<ListingRow>("SELECT id,user_id AS userId,status,draft_payload AS draftPayload,published_payload AS publishedPayload,published_revision_id AS publishedRevisionId,moderation_feedback AS moderationFeedback,created_at AS createdAt,updated_at AS updatedAt FROM provider_listings WHERE status='APPROVED' AND published_payload IS NOT NULL ORDER BY approved_at DESC LIMIT 300");
  const specialties=await specialtyMap();
  const images=await listingImages(rows.map(row=>row.id));
  const query=parsed.data.q?.toLocaleLowerCase()||'';
  const listings=rows.map(row=>publicPayload(row,specialties,images)).map(listing=>{
    const primary=listing.locations.find(location=>location.isPrimary)||listing.locations[0];
    const distance=parsed.data.latitude!==undefined&&parsed.data.longitude!==undefined&&primary
      ?distanceKm(parsed.data.latitude,parsed.data.longitude,primary.latitude,primary.longitude):null;
    return {...listing,distanceKm:distance};
  }).filter(listing=>{
    if(parsed.data.specialtyId&&!listing.specialties.some(item=>item?.id===parsed.data.specialtyId))return false;
    if(query&&!`${listing.name} ${listing.summary} ${listing.description} ${listing.locations.map(item=>`${item.city} ${item.region} ${item.country}`).join(' ')} ${listing.specialties.map(item=>item?.nameEn).join(' ')}`.toLocaleLowerCase().includes(query))return false;
    return listing.distanceKm===null||listing.distanceKm<=parsed.data.radius;
  }).sort((a,b)=>(a.distanceKm??Infinity)-(b.distanceKm??Infinity));
  res.json({listings});
});

directoryRoutes.get('/directory/listings/:id',async(req,res)=>{
  const row=await db.first<ListingRow>("SELECT id,user_id AS userId,status,draft_payload AS draftPayload,published_payload AS publishedPayload,published_revision_id AS publishedRevisionId,moderation_feedback AS moderationFeedback,created_at AS createdAt,updated_at AS updatedAt FROM provider_listings WHERE id=? AND status='APPROVED' AND published_payload IS NOT NULL",[Number(req.params.id)]);
  if(!row)return res.status(404).json({error:'Listing not found'});
  res.json({listing:publicPayload(row,await specialtyMap(),await listingImages([row.id]))});
});

directoryRoutes.get('/directory/mine',requireAuth,async(req:AuthedRequest,res)=>{
  const rows=await db.query<ListingRow>('SELECT id,user_id AS userId,status,draft_payload AS draftPayload,published_payload AS publishedPayload,published_revision_id AS publishedRevisionId,moderation_feedback AS moderationFeedback,created_at AS createdAt,updated_at AS updatedAt FROM provider_listings WHERE user_id=? ORDER BY updated_at DESC',[req.user!.id]);
  const images=await listingImages(rows.map(row=>row.id));
  res.json({listings:rows.map(row=>({...row,draftPayload:payloadImages(rowPayload(row,'draftPayload'),images),publishedPayload:payloadImages(rowPayload(row,'publishedPayload'),images)}))});
});

directoryRoutes.post('/directory/listings',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const parsed=listingPayloadSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid listing',details:z.flattenError(parsed.error)});
  if(!await canPublishAs(req.user!.id,parsed.data.listingType))return res.status(403).json({error:'A verified Professional or Clinic account is required for this listing type'});
  const specialtyError=await validateSpecialties(parsed.data,false);
  if(specialtyError)return res.status(400).json({error:specialtyError});
  const result=await db.execute("INSERT INTO provider_listings(user_id,status,draft_payload,moderation_feedback) VALUES(?,'DRAFT',?,'')",[req.user!.id,encode(parsed.data)]);
  res.status(201).json({id:result.insertId});
});

directoryRoutes.put('/directory/listings/:id',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const parsed=listingPayloadSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid listing',details:z.flattenError(parsed.error)});
  const listing=await listingByOwner(Number(req.params.id),req.user!.id);
  if(!listing)return res.status(404).json({error:'Listing not found'});
  if(listing.status==='SUSPENDED')return res.status(403).json({error:'Suspended listings cannot be edited'});
  if(!await canPublishAs(req.user!.id,parsed.data.listingType))return res.status(403).json({error:'A verified Professional or Clinic account is required for this listing type'});
  const specialtyError=await validateSpecialties(parsed.data,false);
  if(specialtyError)return res.status(400).json({error:specialtyError});
  const imageError=await validateImages(parsed.data,listing.id);
  if(imageError)return res.status(400).json({error:imageError});
  await db.execute('UPDATE provider_listings SET draft_payload=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?',[encode(parsed.data),listing.id,req.user!.id]);
  res.json({ok:true});
});

directoryRoutes.post('/directory/listings/:id/submit',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const confirmations=z.object({
    confirmAccuracy:z.literal(true),
    confirmPublication:z.literal(true),
    confirmClaims:z.literal(true),
  }).safeParse(req.body);
  if(!confirmations.success)return res.status(400).json({error:'Confirm accuracy, publication consent, and responsible health claims'});
  const listing=await listingByOwner(Number(req.params.id),req.user!.id);
  if(!listing)return res.status(404).json({error:'Listing not found'});
  if(listing.status==='SUSPENDED')return res.status(403).json({error:'Suspended listings cannot be submitted'});
  if(await db.first("SELECT id FROM listing_revisions WHERE listing_id=? AND status='PENDING'",[listing.id]))return res.status(409).json({error:'This listing already has a pending review'});
  const parsed=listingPayloadSchema.safeParse(rowPayload(listing,'draftPayload'));
  if(!parsed.success)return res.status(400).json({error:'Complete the listing before submitting'});
  if(!await canPublishAs(req.user!.id,parsed.data.listingType))return res.status(403).json({error:'A verified Professional or Clinic account is required for this listing type'});
  const specialtyError=await validateSpecialties(parsed.data,true);
  if(specialtyError)return res.status(400).json({error:specialtyError});
  const imageError=await validateImages(parsed.data,listing.id);
  if(imageError)return res.status(400).json({error:imageError});
  const result=await transaction(async client=>{
    const revision=await client.execute("INSERT INTO listing_revisions(listing_id,submitted_by,payload,status,admin_note) VALUES(?,?,?,'PENDING','')",[listing.id,req.user!.id,encode(parsed.data)]);
    if(!listing.publishedPayload)await client.execute("UPDATE provider_listings SET status='PENDING',submitted_at=CURRENT_TIMESTAMP,moderation_feedback='',updated_at=CURRENT_TIMESTAMP WHERE id=?",[listing.id]);
    else await client.execute("UPDATE provider_listings SET submitted_at=CURRENT_TIMESTAMP,moderation_feedback='',updated_at=CURRENT_TIMESTAMP WHERE id=?",[listing.id]);
    return revision;
  });
  void recordActivity(req.user!.id,'LISTING_SUBMITTED','listing',listing.id).catch(()=>undefined);
  res.status(202).json({revisionId:result.insertId});
});

directoryRoutes.post('/directory/listings/:id/image',requireAuth,requireCsrf,(req:AuthedRequest,res,next)=>{
  imageUpload.single('image')(req,res,async error=>{
    if(error)return res.status(400).json({error:error instanceof multer.MulterError?error.message:'Invalid image upload'});
    try{
      const listing=await listingByOwner(Number(req.params.id),req.user!.id);
      if(!listing)return res.status(404).json({error:'Listing not found'});
      if(listing.status==='SUSPENDED')return res.status(403).json({error:'Suspended listings cannot upload images'});
      const draft=listingPayloadSchema.safeParse(rowPayload(listing,'draftPayload'));
      if(!draft.success||!await canPublishAs(req.user!.id,draft.data.listingType))return res.status(403).json({error:'A verified Professional or Clinic account is required to upload listing images'});
      if(!req.file)return res.status(400).json({error:'Choose a JPEG, PNG, or WebP image'});
      const imageCount=await db.first<{n:number}>('SELECT count(*) n FROM listing_images WHERE listing_id=?',[listing.id]);
      if((imageCount?.n||0)>=12)return res.status(409).json({error:'Remove unused listing images before uploading another'});
      const altText=z.string().trim().max(200).catch('').parse(req.body.altText);
      const stored=await storeListingImage(req.file.buffer);
      let result;
      try{
        result=await db.execute('INSERT INTO listing_images(listing_id,storage_key,mime_type,width,height,alt_text) VALUES(?,?,?,?,?,?)',[
          listing.id,stored.storageKey,stored.mimeType,stored.width,stored.height,altText,
        ]);
      }catch(databaseError){
        await deleteListingImage(stored.storageKey);
        throw databaseError;
      }
      res.status(201).json({image:{id:result.insertId,url:listingImageUrl(stored.storageKey),width:stored.width,height:stored.height,altText}});
    }catch(uploadError){next(uploadError);}
  });
});

directoryRoutes.delete('/directory/listings/:listingId/images/:imageId',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const listing=await listingByOwner(Number(req.params.listingId),req.user!.id);
  if(!listing)return res.status(404).json({error:'Listing not found'});
  const image=await db.first<{id:number;storageKey:string}>('SELECT id,storage_key AS storageKey FROM listing_images WHERE id=? AND listing_id=?',[Number(req.params.imageId),listing.id]);
  if(!image)return res.status(404).json({error:'Image not found'});
  const used=[rowPayload(listing,'draftPayload'),rowPayload(listing,'publishedPayload')].some(payload=>payload?.locations.some(location=>location.imageId===image.id));
  if(used)return res.status(409).json({error:'Remove this image from the location and save the listing first'});
  await deleteListingImage(image.storageKey);
  await db.execute('DELETE FROM listing_images WHERE id=? AND listing_id=?',[image.id,listing.id]);
  res.status(204).end();
});

directoryRoutes.delete('/directory/listings/:id',requireAuth,requireCsrf,async(req:AuthedRequest,res)=>{
  const listing=await listingByOwner(Number(req.params.id),req.user!.id);
  if(!listing)return res.status(404).json({error:'Listing not found'});
  if(listing.publishedPayload)return res.status(409).json({error:'Published listings must be withdrawn by an administrator'});
  await db.execute('DELETE FROM provider_listings WHERE id=? AND user_id=?',[listing.id,req.user!.id]);
  res.status(204).end();
});

directoryRoutes.get('/admin/directory',requireAuth,requireAdmin,async(_req,res)=>{
  const revisions=await db.query<Record<string,unknown>>(`SELECT r.id,r.listing_id AS listingId,r.payload,r.status,r.admin_note AS adminNote,r.created_at AS createdAt,l.status AS listingStatus,l.published_payload AS publishedPayload,u.name AS ownerName,u.email AS ownerEmail
    FROM listing_revisions r JOIN provider_listings l ON l.id=r.listing_id JOIN users u ON u.id=l.user_id
    WHERE r.status='PENDING' ORDER BY r.created_at ASC LIMIT 200`);
  const listingStats=await db.query<{status:string;n:number}>('SELECT status,count(*) n FROM provider_listings GROUP BY status');
  const published=await db.query<Record<string,unknown>>(`SELECT l.id,l.status,l.published_payload AS publishedPayload,l.moderation_feedback AS moderationFeedback,l.updated_at AS updatedAt,u.name AS ownerName,u.email AS ownerEmail
    FROM provider_listings l JOIN users u ON u.id=l.user_id
    WHERE l.published_payload IS NOT NULL AND l.status IN ('APPROVED','SUSPENDED') ORDER BY l.updated_at DESC LIMIT 200`);
  res.json({
    revisions:revisions.map(row=>({...row,payload:parseJson(row.payload),publishedPayload:parseJson(row.publishedPayload)})),
    published:published.map(row=>({...row,publishedPayload:parseJson(row.publishedPayload)})),
    stats:Object.fromEntries(listingStats.map(row=>[row.status,row.n])),
  });
});

directoryRoutes.post('/admin/directory/:revisionId/decision',requireAuth,requireCsrf,requireAdmin,async(req:AuthedRequest,res)=>{
  const parsed=z.object({action:z.enum(['APPROVE','REQUEST_CHANGES','REJECT']),note:z.string().trim().max(2000).default('')}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid moderation decision'});
  const revision=await db.first<{id:number;listingId:number;payload:unknown;status:string}>('SELECT id,listing_id AS listingId,payload,status FROM listing_revisions WHERE id=?',[Number(req.params.revisionId)]);
  if(!revision||revision.status!=='PENDING')return res.status(404).json({error:'Pending revision not found'});
  const listing=await db.first<ListingRow>('SELECT id,user_id AS userId,status,draft_payload AS draftPayload,published_payload AS publishedPayload,published_revision_id AS publishedRevisionId,moderation_feedback AS moderationFeedback,created_at AS createdAt,updated_at AS updatedAt FROM provider_listings WHERE id=?',[revision.listingId]);
  if(!listing)return res.status(404).json({error:'Listing not found'});
  const payload=listingPayloadSchema.parse(parseJson(revision.payload));
  const before=listing.status;
  await transaction(async client=>{
    if(parsed.data.action==='APPROVE'){
      await projectPublished(client,listing.id,payload);
      await client.execute("UPDATE listing_revisions SET status='APPROVED',admin_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?",[parsed.data.note,req.user!.id,revision.id]);
      await client.execute("UPDATE provider_listings SET status='APPROVED',published_payload=?,published_revision_id=?,moderation_feedback='',approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",[encode(payload),revision.id,listing.id]);
    } else {
      const revisionStatus=parsed.data.action==='REQUEST_CHANGES'?'CHANGES_REQUESTED':'REJECTED';
      const listingStatus=listing.publishedPayload?'APPROVED':'REJECTED';
      await client.execute('UPDATE listing_revisions SET status=?,admin_note=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?',[revisionStatus,parsed.data.note,req.user!.id,revision.id]);
      await client.execute('UPDATE provider_listings SET status=?,moderation_feedback=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[listingStatus,parsed.data.note,listing.id]);
    }
    const after=parsed.data.action==='APPROVE'?'APPROVED':listing.publishedPayload?'APPROVED':'REJECTED';
    await client.execute('INSERT INTO moderation_events(listing_id,revision_id,admin_id,action,from_status,to_status,note) VALUES(?,?,?,?,?,?,?)',[listing.id,revision.id,req.user!.id,parsed.data.action,before,after,parsed.data.note]);
  });
  void recordActivity(req.user!.id,`LISTING_${parsed.data.action}`,'listing',listing.id,{ownerUserId:listing.userId}).catch(()=>undefined);
  res.json({ok:true});
});

directoryRoutes.post('/admin/directory/listings/:id/status',requireAuth,requireCsrf,requireAdmin,async(req:AuthedRequest,res)=>{
  const parsed=z.object({action:z.enum(['SUSPEND','RESTORE']),note:z.string().trim().max(2000).default('')}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:'Invalid listing status'});
  const listing=await db.first<ListingRow>('SELECT id,user_id AS userId,status,draft_payload AS draftPayload,published_payload AS publishedPayload,published_revision_id AS publishedRevisionId,moderation_feedback AS moderationFeedback,created_at AS createdAt,updated_at AS updatedAt FROM provider_listings WHERE id=?',[Number(req.params.id)]);
  if(!listing)return res.status(404).json({error:'Listing not found'});
  const next=parsed.data.action==='SUSPEND'?'SUSPENDED':listing.publishedPayload?'APPROVED':'DRAFT';
  await transaction(async client=>{
    await client.execute('UPDATE provider_listings SET status=?,moderation_feedback=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[next,parsed.data.note,listing.id]);
    await client.execute('INSERT INTO moderation_events(listing_id,revision_id,admin_id,action,from_status,to_status,note) VALUES(?,?,?,?,?,?,?)',[listing.id,null,req.user!.id,parsed.data.action,listing.status,next,parsed.data.note]);
  });
  res.json({ok:true});
});
