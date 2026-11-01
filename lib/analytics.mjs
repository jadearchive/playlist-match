import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';

const digest=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{const left=Buffer.from(String(a)),right=Buffer.from(String(b));return left.length===right.length&&timingSafeEqual(left,right)};
const idPattern=/^[A-Za-z0-9_-]{16,80}$/u;
export function validateEvent(value){
 if(!value||!['pageview','compare'].includes(value.kind)||!['eventId','pageId'].every(key=>typeof value[key]==='string'&&idPattern.test(value[key])))return null;
 // Retain only these fields: playlist contents, URLs, IPs and user agents are never stored.
 return {kind:value.kind,eventId:value.eventId,pageId:value.pageId};
}
export function createAnalytics({store,adminHash,secret,origin,secureCookies=true,now=()=>Date.now()}){
 const enabled=Boolean(store&&/^[a-f0-9]{64}$/u.test(adminHash||'')&&secret?.length>=32);
 const failures=new Map(),rates=new Map();let pending=0;
 const hmac=value=>createHmac('sha256',secret||'disabled').update(value).digest('hex');
 const cookie=req=>String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('tp_stats='))?.slice(9)||'';
 function authorized(req){
  if(!enabled)return false;
  const [payload,signature,...extra]=cookie(req).split('.');if(!payload||!signature||extra.length||!equal(signature,hmac(payload)))return false;
  try{const data=JSON.parse(Buffer.from(payload,'base64url').toString());return Number.isFinite(data.expires)&&data.expires>now()&&data.expires<=now()+13*3600000;}catch{return false;}
 }
 const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'});res.end(data===undefined?undefined:JSON.stringify(data));};
 const setCookie=(res,value,maxAge)=>res.setHeader('Set-Cookie',`tp_stats=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies?'; Secure':''}`);
 function limited(map,key,max,windowMs){
  const time=now();for(const [k,v] of map)if(v.until<=time)map.delete(k);
  let item=map.get(key);if(!item){if(map.size>=10000)return true;item={count:0,until:time+windowMs};map.set(key,item);}return ++item.count>max;
 }
 async function body(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2048)throw new Error('Body too large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 return {
  enabled,authorized,
  async handle(req,res,url){
   if(!url.pathname.startsWith('/api/analytics/'))return false;
   if(req.method==='POST'&&req.headers.origin!==origin){reply(res,403,{error:'请求来源不正确。'});return true;}
   if(!enabled){reply(res,503,{error:'统计尚未配置完成，歌单对比可正常使用。'});return true;}
   const fingerprint=hmac(String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown'));
   if(url.pathname==='/api/analytics/login'&&req.method==='POST'){
    if(limited(failures,fingerprint,15,15*60000)){reply(res,429,{error:'尝试过于频繁，请 15 分钟后再试。'});return true;}
    let input;try{input=await body(req)}catch{reply(res,400,{error:'请求格式不正确。'});return true;}
    if(typeof input?.password!=='string'||input.password.length>200||!equal(digest(input.password),adminHash)){reply(res,401,{error:'查看密码不正确。'});return true;}
    failures.delete(fingerprint);
    const payload=Buffer.from(JSON.stringify({expires:now()+12*3600000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
    setCookie(res,`${payload}.${hmac(payload)}`,12*3600);reply(res,200,{ok:true});return true;
   }
   if(url.pathname==='/api/analytics/logout'&&req.method==='POST'){setCookie(res,'',0);reply(res,200,{ok:true});return true;}
   if(url.pathname==='/api/analytics/summary'&&req.method==='GET'){
    if(!authorized(req)){reply(res,401,{error:'请先输入查看密码。'});return true;}
    try{reply(res,200,await store.summary())}catch{reply(res,503,{error:'统计数据库暂时无法连接，请稍后刷新；歌单对比不受影响。'});}return true;
   }
   if(url.pathname==='/api/analytics/event'&&req.method==='POST'){
    if(authorized(req)){reply(res,204);return true;}
    if(limited(rates,fingerprint,180,60000)||pending>=100){reply(res,429);return true;}
    let event;try{event=validateEvent(await body(req))}catch{}
    if(!event){reply(res,400,{error:'无效的统计事件。'});return true;}
    // Acknowledge immediately. Database failure never delays the comparison UI.
    reply(res,202,{ok:true});pending++;
    Promise.resolve().then(()=>store.record(event)).catch(()=>{}).finally(()=>pending--);
    return true;
   }
   reply(res,404,{error:'接口不存在。'});return true;
  }
 };
}
