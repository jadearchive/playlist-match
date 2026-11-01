import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {createAnalytics,validateEvent} from '../lib/analytics.mjs';

const password='test-only-password-never-used-on-production';
const adminHash=createHash('sha256').update(password).digest('hex');
const event={kind:'pageview',eventId:'event_1234567890123456',pageId:'page_1234567890123456'};
async function setup(t,{store,configured=true}={}){
 const records=[];let clock=Date.now();
 const analytics=createAnalytics({store:store||{async record(value){records.push(value)},async summary(){return {private:true,count:records.length}}},adminHash:configured?adminHash:'',secret:'test-only-random-secret-value-with-32-characters',origin:'https://example.test',secureCookies:true,now:()=>clock});
 const server=http.createServer(async(req,res)=>{try{if(await analytics.handle(req,res,new URL(req.url,'http://localhost')))return;res.end('comparison still available');}catch{res.statusCode=500;res.end('error')}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url=`http://127.0.0.1:${server.address().port}`;
 const post=(route,body,headers={})=>fetch(url+'/api/analytics/'+route,{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 return {url,post,records,advance:ms=>clock+=ms};
}
test('statistics require a server-validated session, never just a hidden URL',async t=>{
 const s=await setup(t);
 assert.equal((await fetch(s.url+'/api/analytics/summary')).status,401);
 assert.equal((await s.post('login',{password:'wrong'})).status,401);
 assert.equal((await s.post('login',null)).status,401);
 const login=await s.post('login',{password});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie');assert(cookie.includes('HttpOnly'));assert(cookie.includes('Secure'));assert(cookie.includes('SameSite=Strict'));
 const session=cookie.split(';')[0];
 const summary=await fetch(s.url+'/api/analytics/summary',{headers:{Cookie:session}});assert.equal(summary.status,200);assert.equal((await summary.json()).private,true);
 assert.equal((await fetch(s.url+'/api/analytics/summary',{headers:{Cookie:session+'tampered'}})).status,401);
 s.advance(13*3600000);assert.equal((await fetch(s.url+'/api/analytics/summary',{headers:{Cookie:session}})).status,401);
});
test('events strip playlist details, collect no visitor identity, and owner visits are excluded',async t=>{
 const s=await setup(t);
 assert.deepEqual(validateEvent({...event,url:'private-link',songs:['private-song']}),event);
 assert.equal((await s.post('event',{...event,url:'private-link'})).status,202);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(s.records.length,1);assert.equal(s.records[0].visitorHash,undefined);assert.equal(s.records[0].visitorId,undefined);assert.equal(s.records[0].url,undefined);
 const login=await s.post('login',{password}),session=login.headers.get('set-cookie').split(';')[0];
 assert.equal((await s.post('event',event,{Cookie:session})).status,204);assert.equal(s.records.length,1);
 assert.equal((await s.post('event',{...event,kind:'demo'})).status,400);
});
test('cross-origin requests, oversized bodies and repeated password guesses are rejected',async t=>{
 const s=await setup(t);
 assert.equal((await s.post('login',{password},{Origin:'https://other.test'})).status,403);
 assert.equal((await s.post('event',{...event,padding:'x'.repeat(2100)})).status,400);
 for(let i=0;i<15;i++)assert.equal((await s.post('login',{password:'wrong'})).status,401);
 assert.equal((await s.post('login',{password:'wrong'})).status,429);
 s.advance(16*60000);assert.equal((await s.post('login',{password})).status,200);
});
test('database failure and missing configuration never block the main site',async t=>{
 const s=await setup(t,{store:{async record(){throw Error('offline')},async summary(){throw Error('offline')}}});
 assert.equal((await s.post('event',event)).status,202);
 const login=await s.post('login',{password});
 assert.equal((await fetch(s.url+'/api/analytics/summary',{headers:{Cookie:login.headers.get('set-cookie').split(';')[0]}})).status,503);
 assert.equal(await (await fetch(s.url)).text(),'comparison still available');
 const disabled=await setup(t,{configured:false});assert.equal((await disabled.post('event',event)).status,503);assert.equal((await fetch(disabled.url)).status,200);
});
