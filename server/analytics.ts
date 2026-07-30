import { db } from './db.js';
import { config } from './config.js';

export async function recordActivity(userId:number|null,eventType:string,entityType='',entityId:number|null=null,metadata:Record<string,unknown>={}) {
  await db.execute('INSERT INTO activity_events(user_id,event_type,entity_type,entity_id,metadata) VALUES(?,?,?,?,?)',[
    userId,eventType,entityType,entityId,JSON.stringify(metadata),
  ]);
}

export async function recordPageView(pageKey:string,authenticated:boolean) {
  const date=new Date().toISOString().slice(0,10);
  if(config.DATABASE_URL){
    await db.execute(`INSERT INTO page_view_daily(view_date,page_key,anonymous_count,authenticated_count) VALUES(?,?,?,?)
      ON DUPLICATE KEY UPDATE anonymous_count=anonymous_count+VALUES(anonymous_count),authenticated_count=authenticated_count+VALUES(authenticated_count)`,
      [date,pageKey,authenticated?0:1,authenticated?1:0]);
  }else{
    await db.execute(`INSERT INTO page_view_daily(view_date,page_key,anonymous_count,authenticated_count) VALUES(?,?,?,?)
      ON CONFLICT(view_date,page_key) DO UPDATE SET anonymous_count=anonymous_count+excluded.anonymous_count,authenticated_count=authenticated_count+excluded.authenticated_count`,
      [date,pageKey,authenticated?0:1,authenticated?1:0]);
  }
}
