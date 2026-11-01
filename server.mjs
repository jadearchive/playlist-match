import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {importPlaylist,ImportError} from './lib/importers.mjs';
import {createAnalytics} from './lib/analytics.mjs';
import {createPostgresAnalytics} from './lib/analytics-store.mjs';

const publicRoot=path.resolve(fileURLToPath(new URL('./public/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const sendJson=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
const analyticsStore=process.env.ANALYTICS_DATABASE_URL?createPostgresAnalytics(process.env.ANALYTICS_DATABASE_URL):null;
const analytics=createAnalytics({store:analyticsStore,adminHash:process.env.ANALYTICS_ADMIN_HASH,secret:process.env.ANALYTICS_SECRET,origin:process.env.ANALYTICS_ORIGIN||'http://localhost:3000',secureCookies:(process.env.ANALYTICS_ORIGIN||'').startsWith('https://')});
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/healthz'){sendJson(res,200,{ok:true});return;}
  if(await analytics.handle(req,res,url))return;
  if(url.pathname==='/api/playlist'){
   if(req.method!=='POST'){res.setHeader('Allow','POST');sendJson(res,405,{error:'请使用 POST 请求。'});return;}
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>8000){sendJson(res,413,{error:'链接内容过长。'});return;}chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{sendJson(res,400,{error:'请求格式不正确。'});return;}
   if(typeof input.url!=='string'||input.url.length>4000){sendJson(res,400,{error:'请提供有效歌单链接。'});return;}
   try{sendJson(res,200,await importPlaylist(input.url));}catch(error){sendJson(res,422,{error:error instanceof ImportError?error.message:'平台读取超时或暂时无法连接，请稍后重试，也可以粘贴曲目继续。'});}
   return;
  }
  if(req.method!=='GET'&&req.method!=='HEAD'){sendJson(res,405,{error:'不支持该请求方法。'});return;}
  let pathname;try{pathname=decodeURIComponent(url.pathname)}catch{sendJson(res,400,{error:'路径格式不正确。'});return;}
  const isStats=pathname==='/stats'||pathname==='/stats/'||pathname==='/stats.html';
  if(isStats){res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");}
  const file=path.resolve(publicRoot,'.'+(pathname==='/'?'/index.html':isStats?'/stats.html':pathname));
  if(!file.startsWith(publicRoot+path.sep)&&file!==path.join(publicRoot,'index.html')){sendJson(res,404,{error:'页面不存在。'});return;}
  let data;try{data=await fs.readFile(file)}catch{sendJson(res,404,{error:'页面不存在。'});return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':isStats?'no-store':'no-cache'});
  res.end(req.method==='HEAD'?undefined:data);
 }catch{if(!res.headersSent)sendJson(res,500,{error:'服务暂时不可用。'});else res.end();}
});
server.requestTimeout=70000;
server.listen(Number(process.env.PORT||3000),process.env.HOST||'0.0.0.0',()=>{console.log(`Playlist Match listening on port ${server.address().port}`)});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{try{await analyticsStore?.close()}finally{process.exit(0)}}));
