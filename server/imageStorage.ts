import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { config } from './config.js';

let s3:S3Client|undefined;
function client() {
  if(!config.imageStorageConfigured)throw new Error('Production image storage is not configured');
  return s3 ||= new S3Client({
    endpoint:config.S3_ENDPOINT,region:config.S3_REGION,forcePathStyle:true,
    credentials:{accessKeyId:config.S3_ACCESS_KEY_ID!,secretAccessKey:config.S3_SECRET_ACCESS_KEY!},
  });
}

export async function storeListingImage(input:Buffer) {
  const image=sharp(input,{failOn:'error',limitInputPixels:40_000_000}).rotate();
  const metadata=await image.metadata();
  if(!metadata.width||!metadata.height)throw new Error('The uploaded file is not a valid image');
  const output=await image.resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:84}).toBuffer();
  const finalMetadata=await sharp(output).metadata();
  const key=`listings/${new Date().toISOString().slice(0,7)}/${randomUUID()}.webp`;
  if(config.isProduction){
    await client().send(new PutObjectCommand({Bucket:config.S3_BUCKET!,Key:key,Body:output,ContentType:'image/webp',CacheControl:'public,max-age=31536000,immutable'}));
  }else{
    const path=resolve(config.UPLOAD_DIRECTORY,key);
    await mkdir(dirname(path),{recursive:true});
    await writeFile(path,output);
  }
  return {storageKey:key,mimeType:'image/webp',width:finalMetadata.width!,height:finalMetadata.height!};
}

export function listingImageUrl(storageKey:string) {
  if(config.isProduction)return `${config.IMAGE_PUBLIC_BASE_URL!.replace(/\/$/,'')}/${storageKey}`;
  return `/uploads/${storageKey}`;
}

export async function deleteListingImage(storageKey:string) {
  if(config.isProduction)await client().send(new DeleteObjectCommand({Bucket:config.S3_BUCKET!,Key:storageKey}));
  else await unlink(resolve(config.UPLOAD_DIRECTORY,storageKey)).catch(()=>undefined);
}
