import {test} from 'node:test';
import assert from 'node:assert/strict';
import {comparePlaylists,songKey,splitArtists,toCsv} from '../lib/compare.mjs';
import {importPlaylist,parseApple,parseSpotify} from '../lib/importers.mjs';
const p=tracks=>({tracks});
test('version variants merge by song name, without using singer identity',()=>{
 for(const title of ['晴天 (Live)','晴天（录音室版）','晴天 - Live at Taipei','晴天 Live','晴天 (周杰伦版)',' 晴 天 '])assert.equal(songKey(title),songKey('晴天'));
 const r=comparePlaylists(p([{title:'晴天',artists:['A']},{title:'晴天 (Live)',artists:['A']}]),p([{title:'晴天（录音室版）',artists:['B']}]),'songs');
 assert.equal(r.common.length,1);assert.equal(r.aCount,1);assert.equal(r.overlap,1);
 assert.notEqual(songKey('Love (Part 1)'),songKey('Love'));
 assert.notEqual(songKey('Live Forever'),songKey('Forever'));
});
test('collaborators are separate artists; duplicates count once and bands remain intact',()=>{
 const a=p([{title:'x',artists:['A','B']},{title:'y',artists:['A','Earth, Wind & Fire']}]);
 const b=p([{title:'z',artists:['B','C']}]);
 const r=comparePlaylists(a,b,'artists');assert.equal(r.common[0].name,'B');assert.equal(r.aCount,3);assert.equal(r.bCount,2);assert.equal(r.union,4);assert.equal(r.overlap,.25);assert.equal(r.coverageA,1/3);
 assert.deepEqual(splitArtists('A / B、C'),['A','B','C']);assert.deepEqual(splitArtists(['AC/DC']),['AC/DC']);
});
test('disjoint and empty playlists have honest denominators',()=>{
 assert.equal(comparePlaylists(p([]),p([]),'songs').overlap,null);
 assert.equal(comparePlaylists(p([{title:'a',artists:['x']}]),p([]),'songs').overlap,0);
});
test('CSV preserves Chinese and quotes while neutralizing formula values',()=>{
 const csv=toCsv([['歌名','歌手'],['=1+1','A,"B"']]);assert(csv.startsWith('\uFEFF'));assert(csv.includes("\"'=1+1\""));assert(csv.includes('"A,""B"""'));
});
test('reject non-platform URLs and forged domains without network calls',async()=>{
 for(const url of ['https://127.0.0.1/playlist/1','https://music.apple.com.evil.org/playlist/1','https://music.163.com:1234/playlist?id=1','https://me@music.163.com/playlist?id=1','http://music.163.com/playlist?id=1'])await assert.rejects(importPlaylist(url));
});
test('Apple JSON-LD lacking artist names uses structured individual artist links',()=>{
 const ld={'@type':'MusicPlaylist',name:'Test',numTracks:1,track:[{name:'Collab'}]};
 const artist=name=>({title:name,segue:{destination:{contentDescriptor:{kind:'artist'}}}});
 const state={data:[{data:{sections:[{itemKind:'trackLockup',items:[{id:'1',title:'Collab',contentDescriptor:{kind:'song'},subtitleLinks:[artist('A'),artist('B')]}]}]}}]};
 const html=`<script type="application/ld+json">${JSON.stringify(ld)}</script><script type="application/json" id="serialized-server-data">${JSON.stringify(state)}</script>`;
 const r=parseApple(html,'https://music.apple.com/cn/playlist/a/pl.1');assert(r.complete);assert.deepEqual(r.tracks[0].artists,['A','B']);
});
test('Spotify embed without declared total is never marked complete',()=>{
 const state={props:{pageProps:{state:{data:{entity:{name:'Test',trackList:[{title:'Song',subtitle:'A, B',uri:'spotify:track:1'}]}}}}}};
 const r=parseSpotify(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(state)}</script>`,'https://open.spotify.com/playlist/1');assert.equal(r.complete,false);assert.deepEqual(r.tracks[0].artists,['A','B']);
});
