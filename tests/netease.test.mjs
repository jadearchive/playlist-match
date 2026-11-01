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
