import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadNetease} from '../lib/importers.mjs';
const song=id=>({id,name:`Song ${id}`,ar:[{name:'A'},{name:'B'}]});
const fixture=(count,returned=10)=>({code:200,playlist:{name:'Test playlist',trackCount:count,tracks:Array.from({length:returned},(_,i)=>song(i+1)),trackIds:Array.from({length:count},(_,i)=>({id:i+1}))}});
test('fills a 591-track playlist from the initial ten, preserving order and collaborators',async t=>{
 const batches=[];let active=0,maxActive=0;
 t.mock.method(globalThis,'fetch',async url=>{
  if(String(url).includes('/playlist/detail'))return Response.json(fixture(591));
  const ids=JSON.parse(new URL(url).searchParams.get('c')).map(s=>s.id);
  batches.push(ids);active++;maxActive=Math.max(maxActive,active);
  await new Promise(resolve=>setImmediate(resolve));active--;
  return Response.json({code:200,songs:ids.toReversed().map(song)});
 });
 const p=await loadNetease('18550934080','https://music.163.com/m/playlist?id=18550934080');
 assert.equal(p.tracks.length,591);assert.equal(p.total,591);assert.equal(p.complete,true);
 assert.deepEqual(p.tracks.map(s=>s.id),Array.from({length:591},(_,i)=>String(i+1)));
 assert.deepEqual(p.tracks[590].artists,['A','B']);
 assert.equal(batches.flat().length,581);assert.equal(batches.length,6);assert(batches.every(b=>b.length<=100));assert(maxActive<=3);
});
test('leaves a fully returned playlist intact without extra detail requests',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;return Response.json(fixture(200,200))});
 const p=await loadNetease('1','https://music.163.com/playlist?id=1');assert.equal(requests,1);assert.equal(p.tracks.length,200);assert(p.complete);
});
test('keeps available records and reports incomplete results when a batch fails',async t=>{
 t.mock.method(globalThis,'fetch',async url=>{
  if(String(url).includes('/playlist/detail'))return Response.json(fixture(120));
  const ids=JSON.parse(new URL(url).searchParams.get('c')).map(s=>s.id);
  if(ids[0]===11)return new Response('temporarily unavailable',{status:503});
  return Response.json({code:200,songs:[...ids.map(song),song(99999)]});
 });
 const p=await loadNetease('1','https://music.163.com/playlist?id=1');assert.equal(p.tracks.length,20);assert.equal(p.complete,false);assert(p.warnings.some(w=>w.includes('120 首')));assert(p.warnings.some(w=>w.includes('补查未成功')));assert(!p.tracks.some(s=>s.id==='99999'));
});
test('missing or duplicate detail records cannot inflate completeness',async t=>{
 t.mock.method(globalThis,'fetch',async url=>String(url).includes('/playlist/detail')?Response.json(fixture(12)):Response.json({code:200,songs:[song(11),song(11)]}));
 const p=await loadNetease('1','https://music.163.com/playlist?id=1');assert.equal(p.tracks.length,11);assert.equal(p.complete,false);
});
test('uses public legacy metadata when v3 omits a song, without losing artist credits',async t=>{
 let legacyCalls=0;
 t.mock.method(globalThis,'fetch',async url=>{
  if(String(url).includes('/playlist/detail'))return Response.json(fixture(12));
  if(String(url).includes('/v3/song/detail'))return Response.json({code:200,songs:[song(11)]});
  const ids=JSON.parse(new URL(url).searchParams.get('ids'));assert.deepEqual(ids,[12]);legacyCalls++;
  return Response.json({code:200,songs:[{id:12,name:'Song 12',artists:[{name:'C'},{name:'D'}]}]});
 });
 const p=await loadNetease('1','https://music.163.com/playlist?id=1');assert.equal(p.tracks.length,12);assert(p.complete);assert.deepEqual(p.tracks[11].artists,['C','D']);assert.equal(legacyCalls,1);
});

test('uses compatible metadata endpoint when preferred version is rejected, then fills all missing songs',async t=>{
 const methods=[];
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  if(String(url).includes('/playlist/detail')){
   methods.push(new URL(url).pathname);
   if(String(url).includes('/v6/'))return Response.json({code:20001});
   assert.equal(new URL(url).searchParams.get('id'),'783044535');
   assert.equal(new URL(url).searchParams.get('n'),'1000');
   return Response.json(fixture(487,6));
  }
  const ids=JSON.parse(new URL(url).searchParams.get('c')).map(s=>s.id);
  return Response.json({code:200,songs:ids.map(song)});
 });
 const p=await loadNetease('783044535','https://music.163.com/playlist?id=783044535');
 assert.deepEqual(methods,['/api/v6/playlist/detail','/api/v3/playlist/detail']);assert.equal(p.tracks.length,487);assert(p.complete);
});

test('metadata failures are bounded and do not falsely label a public link invalid',async t=>{
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({code:20001})});
 await assert.rejects(loadNetease('1','https://music.163.com/playlist?id=1'),/暂未向本站返回/);
 assert.equal(calls,2);
});


test('verification challenge stops retries and logs only non-sensitive entry availability',async t=>{
 let calls=0;const logs=[];
 t.mock.method(console,'warn',(...args)=>logs.push(args));
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({code:-462,message:'请完成验证操作',data:{verifyType:50,verifyUrl:'https://music.163.com/verify?token=private-secret',verifyToken:'private-secret',params:{sign:'private-signature'}}})});
 await assert.rejects(loadNetease('verification-fixture','https://music.163.com/playlist?id=verification-fixture'),/额外安全验证/);
 assert.equal(calls,1);
 const diagnostic=JSON.parse(logs.find(row=>row[0].includes('verification requirements'))[1]);
 assert.equal(diagnostic.hasWebEntry,true);assert.equal(diagnostic.asksVerification,true);
 assert(!JSON.stringify(logs).includes('private-secret'));assert(!JSON.stringify(logs).includes('private-signature'));
});

test('verification challenge is cooled down without extra upstream requests',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({code:-462,message:'请完成验证',data:{verifyType:40,verifyUrl:'https://music.163.com/verify?token=secret'}})});
 await assert.rejects(loadNetease('cooldown-fixture','https://music.163.com/playlist?id=cooldown-fixture'),/额外安全验证/);
 await assert.rejects(loadNetease('cooldown-fixture','https://music.163.com/playlist?id=cooldown-fixture'),/额外安全验证/);
 assert.equal(calls,1);
});

test('configured parser recovers a public playlist after upstream verification',async t=>{
 const old=process.env.NETEASE_PLAYLIST_PARSER_URL;
 process.env.NETEASE_PLAYLIST_PARSER_URL='https://parser.example.test/playlist';
 t.after(()=>{if(old===undefined)delete process.env.NETEASE_PLAYLIST_PARSER_URL;else process.env.NETEASE_PLAYLIST_PARSER_URL=old;});
 let calls=0;
 t.mock.method(globalThis,'fetch',async url=>{
  calls++;
  if(String(url).startsWith('https://parser.example.test/'))return Response.json({ok:true,title:'Public playlist',count:2,songs:[{name:'Song A',artist:'Artist A'},{name:'Song B',artist:'Artist B'}]});
  return Response.json({code:-462,message:'请完成验证',data:{verifyType:40}});
 });
 const result=await loadNetease('fallback-fixture','https://music.163.com/playlist?id=fallback-fixture');
 assert.equal(result.complete,false);assert.equal(result.tracks.length,2);assert.equal(result.tracks[0].artists[0],'Artist A');assert.equal(calls,1);
});

test('GoMusic structured tracks are preferred over NetEase direct requests',async t=>{
 const old=process.env.GOMUSIC_API_URL;
 process.env.GOMUSIC_API_URL='https://music.unmeta.cn/api/v1/songlists';
 t.after(()=>{if(old===undefined)delete process.env.GOMUSIC_API_URL;else process.env.GOMUSIC_API_URL=old;});
 let calls=0;
 t.mock.method(globalThis,'fetch',async (url,options)=>{
  calls++;
  assert.equal(String(url),'https://music.unmeta.cn/api/v1/songlists');
  assert.equal(options.method,'POST');
  assert.equal(JSON.parse(options.body).url,'https://music.163.com/playlist?id=gomusic-fixture');
  return Response.json({code:1,msg:'success',data:{name:'Test',source:'netease',tracks:[{id:'1',title:'Song',artists:['Artist']}],songs_count:1,total_count:1,complete:true,warnings:[]}});
 });
 const result=await loadNetease('gomusic-fixture','https://music.163.com/playlist?id=gomusic-fixture');
 assert.equal(calls,1);assert.equal(result.tracks[0].title,'Song');assert.equal(result.complete,true);
});
