import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readKugou} from '../lib/kugou.mjs';
const url=new URL('https://activity.kugou.com/share/a?global_specialid=collection_3_1_98_0');
const song=i=>({fileid:i,name:'A、B - Song '+i,singerinfo:[{name:'A'},{name:'B'}]});
test('pagination preserves collaborators and strips performer prefix',async()=>{
 let calls=0;const r=await readKugou(url,async u=>{calls++;const p=Number(new URL(u).searchParams.get('page'));return {text:JSON.stringify({error_code:0,data:{count:25,info:Array.from({length:p===1?20:5},(_,i)=>song((p-1)*20+i))}})}});
 assert.equal(calls,2);assert.equal(r.tracks.length,25);assert.equal(r.tracks[0].title,'Song 0');assert.deepEqual(r.tracks[0].artists,['A','B']);
});
test('duplicate pages stop and do not claim full count',async()=>{
 let calls=0;const r=await readKugou(url,async()=>{calls++;return {text:JSON.stringify({error_code:0,data:{count:30,info:[song(1)]}})}});
 assert.equal(calls,2);assert.equal(r.tracks.length,1);assert(r.warnings.length);
});
test('failed later page preserves honest partial data',async()=>{
 let calls=0;const r=await readKugou(url,async()=>{if(calls++)throw Error('network');return {text:JSON.stringify({error_code:0,data:{count:30,info:[song(1)]}})}});
 assert.equal(r.tracks.length,1);assert(r.warnings.length);
});
test('invalid identifier rejected without network',async()=>{
 await assert.rejects(readKugou(new URL('https://activity.kugou.com/'),()=>{throw Error('unexpected')}),/编号/);
});
