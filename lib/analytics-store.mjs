// Loaded lazily so missing database configuration cannot prevent the website from starting.
export function createPostgresAnalytics(connectionString){
 let poolPromise,initialized;
 async function pool(){
  if(!poolPromise)poolPromise=import('pg').then(({default:pg})=>{const url=new URL(connectionString);url.searchParams.set('sslmode','verify-full');const value=new pg.Pool({connectionString:url.toString(),enableChannelBinding:true,max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:10000,query_timeout:8000});value.on('error',()=>{});return value;}).catch(error=>{poolPromise=null;throw error;});
  return poolPromise;
 }
 async function ready(){
  if(!initialized)initialized=pool().then(async db=>{await db.query(`CREATE TABLE IF NOT EXISTS tp_analytics_events (
   event_id text PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('pageview','compare')),
   visitor_hash text NOT NULL, page_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
  ); CREATE INDEX IF NOT EXISTS tp_analytics_created ON tp_analytics_events(created_at);`);return db;}).catch(error=>{initialized=null;throw error;});
  return initialized;
 }
 const convert=row=>({views:Number(row.views),visitors:Number(row.visitors),comparisons:Number(row.comparisons)});
 return {
  async record(event){const db=await ready();await db.query('INSERT INTO tp_analytics_events(event_id,kind,visitor_hash,page_id) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING',[event.eventId,event.kind,event.visitorHash,event.pageId]);},
  async summary(){
   const db=await ready();
   const [periods,daily,first]=await Promise.all([
    db.query(`WITH periods AS (
     SELECT 'all' AS label,NULL::timestamptz AS since UNION ALL
     SELECT 'today',date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai' UNION ALL
     SELECT 'week',(date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai')-interval '6 days') AT TIME ZONE 'Asia/Shanghai'
    ) SELECT p.label,count(e.event_id) FILTER(WHERE e.kind='pageview') AS views,
      count(DISTINCT e.visitor_hash) FILTER(WHERE e.kind='pageview') AS visitors,
      count(e.event_id) FILTER(WHERE e.kind='compare') AS comparisons
      FROM periods p LEFT JOIN tp_analytics_events e ON p.since IS NULL OR e.created_at>=p.since GROUP BY p.label`),
    db.query(`SELECT to_char(created_at AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS day,
      count(*) FILTER(WHERE kind='pageview') AS views,
      count(DISTINCT visitor_hash) FILTER(WHERE kind='pageview') AS visitors,
      count(*) FILTER(WHERE kind='compare') AS comparisons
      FROM tp_analytics_events WHERE created_at >= (date_trunc('day',now() AT TIME ZONE 'Asia/Shanghai')-interval '29 days') AT TIME ZONE 'Asia/Shanghai'
      GROUP BY day ORDER BY day DESC`),
    db.query('SELECT min(created_at) AS started_at FROM tp_analytics_events')
   ]);
   return {periods:Object.fromEntries(periods.rows.map(row=>[row.label,convert(row)])),daily:daily.rows.map(row=>({day:row.day,...convert(row)})),startedAt:first.rows[0].started_at,updatedAt:new Date().toISOString(),timezone:'Asia/Shanghai'};
  },
  async close(){if(poolPromise)await (await poolPromise).end();}
 };
}
