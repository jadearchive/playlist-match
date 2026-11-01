const allowedHost = hostname => /(?:^|\.)y\.qq\.com$/i.test(hostname) || /(?:^|\.)music\.163\.com$/i.test(hostname) || hostname==='163cn.tv' || hostname==='music.apple.com' || hostname==='open.spotify.com' || hostname==='spotify.link';
export class ImportError extends Error { constructor(message){super(message);this.name='ImportError';} }
const cleanText = s => String(s??'').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,v)=>String.fromCodePoint(v[0].toLowerCase()==='x'?parseInt(v.slice(1),16):Number(v))).replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,v)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[v]));
async function request(url,options={}){
  const u = new URL(url);
  if(u.protocol!=='https:'||!allowedHost(u.hostname)||u.port||u.username||u.password)throw new ImportError('请使用 QQ 音乐、网易云、Apple Music 或 Spotify 的官方 HTTPS 分享链接。');
  const response=await fetch(u,{...options,redirect:'manual',signal:AbortSignal.timeout(Math.min(16000,options.timeoutMs??16000)),headers:{'User-Agent':'Mozilla/5.0','Accept':'text/html,application/json','Accept-Language':'zh-CN,zh;q=0.9,en;q=0.7',...options.headers}});
  if(response.status>=300&&response.status<400){
    const location=response.headers.get('location');
    if(!location)throw new ImportError('分享链接跳转失败，请复制完整的歌单链接。');
    if((options.redirectCount||0)>=7)throw new ImportError('分享链接跳转次数过多。');
    return request(new URL(location,u).href,{...options,redirectCount:(options.redirectCount||0)+1});
  }
  if(!response.ok)throw new ImportError(`平台暂时无法读取（${response.status}），请稍后重试或粘贴曲目。`);
  const text=await response.text();
  if(text.length>8_000_000)throw new ImportError('该歌单页面过大，请尝试较小的歌单。');
  return {text,url:u.href};
}
function jsonScripts(html){
 return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>/application\/(?:ld\+)?json/.test(m[1])).flatMap(m=>{try{return [{attrs:m[1],value:JSON.parse(m[2])}]}catch{return []}});
}
function finish({platform,title,tracks,total=null,sourceUrl,warnings=[]}){
  const usable=tracks.filter(t=>t.title&&t.artists?.length).map(t=>({...t,title:cleanText(t.title),artists:t.artists.map(cleanText)}));
  if(!usable.length)throw new ImportError('页面没有返回可读取的歌曲。请检查歌单是否公开，或使用“粘贴曲目”。');
  if(usable.length!==tracks.length)warnings.push('有曲目缺少歌名或歌手，未纳入对比。');
  const complete=Number.isInteger(total)&&total===usable.length;
  if(!complete)warnings.push(total!==null?`平台显示 ${total} 首，本次读取 ${usable.length} 首。`:'平台未提供可核对的总数，无法确认是否已读全。');
  return {platform,title:cleanText(title)||'未命名歌单',tracks:usable,total,complete,sourceUrl,warnings:[...new Set(warnings)]};
}
export async function loadQQ(id,sourceUrl){
 const {text}=await request(`https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${encodeURIComponent(id)}&format=json&song_begin=0&song_num=10000`,{headers:{Referer:'https://y.qq.com/'}});
 let data;try{data=JSON.parse(text)}catch{throw new ImportError('QQ 音乐没有返回歌单数据，请稍后重试。')}
 const p=data.cdlist?.[0];
 if(data.code!==0||!p)throw new ImportError('QQ 音乐歌单不可读取，请确认歌单公开且链接有效。');
 return finish({platform:'QQ 音乐',title:p.dissname,tracks:(p.songlist||[]).map(s=>({title:s.songname,artists:(s.singer||[]).map(a=>a.name),id:s.songmid})),total:Number(p.total_song_num??p.songnum),sourceUrl});
}
export async function loadNetease(id,sourceUrl){
 const deadline=Date.now()+45000;
 const {text}=await request(`https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(id)}&n=100000&s=0`,{headers:{Referer:'https://music.163.com/'}});
 let data;try{data=JSON.parse(text)}catch{throw new ImportError('网易云暂时没有返回曲目，请重试或粘贴曲目。')}
 const p=data.playlist||data.result;
 if(data.code!==200||!p)throw new ImportError('网易云歌单不可读取，请确认歌单公开且链接有效。');
 const initial=p.tracks||[];
 const ids=(p.trackIds||[]).map(t=>t.id).filter(value=>Number.isSafeInteger(value)&&value>0);
 const usable=s=>s?.name&&(s.ar||s.artists||[]).some(a=>a.name);
 const byId=new Map(initial.filter(usable).map(s=>[s.id,s]));
 const missing=[...new Set(ids.filter(songId=>!byId.has(songId)))];
 let failed=false;
 // Fetch only missing records, with bounded concurrency and a request-wide time budget.
 async function fillMissing(songIds,legacy=false){
 const batches=[];
 for(let i=0;i<songIds.length;i+=100)batches.push(songIds.slice(i,i+100));
 for(let i=0;i<batches.length;i+=3){
   if(Date.now()>=deadline){failed=true;break;}
   const group=batches.slice(i,i+3);
   const results=await Promise.allSettled(group.map(async batch=>{
     const query=legacy?`ids=${encodeURIComponent(JSON.stringify(batch))}`:`c=${encodeURIComponent(JSON.stringify(batch.map(songId=>({id:songId}))))}`;
     const result=await request(`https://music.163.com/api/${legacy?'song':'v3/song'}/detail?${query}`,{headers:{Referer:'https://music.163.com/'},timeoutMs:Math.max(1,deadline-Date.now())});
     const detail=JSON.parse(result.text);
     if(detail.code!==200||!Array.isArray(detail.songs))throw new ImportError('网易云曲目补查失败。');
     const requested=new Set(batch);
     return detail.songs.filter(s=>requested.has(s.id)&&usable(s));
   }));
   for(const result of results){
     if(result.status==='fulfilled')for(const song of result.value)byId.set(song.id,song);
     else failed=true;
   }
 }
 }
 await fillMissing(missing);
 // Some records are omitted by v3 in the hosted environment. The public legacy
 // metadata endpoint can still provide their names and individual artist credits.
 await fillMissing([...new Set(ids.filter(songId=>!byId.has(songId)))],true);
 // trackIds is the playlist order; detail responses may use a different order.
 const songs=ids.length?ids.flatMap(songId=>byId.has(songId)?[byId.get(songId)]:[]):initial;
 const warnings=failed&&songs.length<Number(p.trackCount)?['部分曲目补查未成功，可重新读取；当前结果仅基于已读取的歌曲。']:[];
 return finish({platform:'网易云音乐',title:p.name,tracks:songs.map(s=>({title:s.name,artists:(s.ar||s.artists||[]).map(a=>a.name),id:String(s.id)})),total:Number(p.trackCount),sourceUrl,warnings});
}
export function parseSpotify(html,sourceUrl){
 const doc=jsonScripts(html).find(s=>s.attrs.includes('__NEXT_DATA__'))?.value;
 const entity=doc?.props?.pageProps?.state?.data?.entity;
 if(!entity?.trackList)throw new ImportError('Spotify 没有返回可读取的曲目。公开页面也可能受地区或登录限制，可使用“粘贴曲目”。');
 const total = Number.isInteger(entity.trackCount)?entity.trackCount:Number.isInteger(entity.totalTracks)?entity.totalTracks:null;
 return finish({platform:'Spotify',title:entity.name||entity.title,sourceUrl,total,tracks:entity.trackList.filter(t=>t.entityType==='track'||t.uri?.startsWith('spotify:track:')).map(t=>({title:t.title,artists:t.artists?.map(a=>a.name)||String(t.subtitle||'').split(/,\s*/u),id:t.uri})),warnings:['读取自 Spotify 公开嵌入页；较大的歌单可能仅展示部分歌曲。']});
}
export function parseApple(html,sourceUrl){
 const scripts=jsonScripts(html);let playlist=null;
 for(const {value} of scripts){
   const nodes=Array.isArray(value)?value:value['@graph']||[value];
   for(const node of nodes)if(node['@type']==='MusicPlaylist')playlist=node;
 }
 const tracks=Array.isArray(playlist?.track)?playlist.track:playlist?.track?.itemListElement?.map(i=>i.item||i)||[];
 if(tracks.length&&tracks.every(t=>t.byArtist))return finish({platform:'Apple Music',title:playlist.name,sourceUrl,total:Number.isInteger(playlist.numTracks)?playlist.numTracks:null,tracks:tracks.map(t=>({title:t.name,artists:(Array.isArray(t.byArtist)?t.byArtist:[t.byArtist]).filter(Boolean).map(a=>a.name),id:t.url}))});
 const serialized=scripts.find(s=>s.attrs.includes('serialized-server-data'))?.value;
 const found=[];let title=playlist?.name,total=Number.isInteger(playlist?.numTracks)?playlist.numTracks:null;
 const walk=(o,depth=0)=>{
   if(!o||typeof o!=='object'||depth>16)return;
   if(Array.isArray(o)){o.forEach(v=>walk(v,depth+1));return;}
   if((o.itemKind==='song'||o.itemKind==='trackLockup')&&Array.isArray(o.items))found.push(...o.items.filter(t=>t.contentDescriptor?.kind==='song'||o.itemKind==='song'));
   if(o.type==='songs'&&Array.isArray(o.data))found.push(...o.data);
   if(o.kind==='playlist'&&o.title&&!title)title=o.title;
   if(Number.isInteger(o.trackCount))total=o.trackCount;
   for(const value of Object.values(o))walk(value,depth+1);
 };walk(serialized);
 const unique=[...new Map(found.map(t=>[String(t.id||t.contentDescriptor?.identifiers?.storeAdamID),t])).values()];
 return finish({platform:'Apple Music',title:title||html.match(/<title>(.*?)<\/title>/s)?.[1]?.replace(/\s*[-–—]\s*Apple Music.*$/,'').replace(/^‎/,'')||'Apple Music 歌单',sourceUrl,total,tracks:unique.map(t=>({title:t.title||t.attributes?.name,artists:t.subtitleLinks?.filter(a=>a.segue?.destination?.contentDescriptor?.kind==='artist').map(a=>a.title)||t.artists?.map(a=>a.name)||String(t.artistName||t.subtitle||t.attributes?.artistName||'').split(/、|,\s+| & /u),id:t.id}))});
}
export async function importPlaylist(input){
 const match=String(input||'').match(/https:\/\/[^\s<>"“”]+/u);
 if(!match)throw new ImportError('请粘贴完整的 HTTPS 歌单分享链接。');
 let u;try{u=new URL(match[0])}catch{throw new ImportError('链接格式不正确。')}
 if(!allowedHost(u.hostname)||u.protocol!=='https:'||u.port||u.username||u.password)throw new ImportError('暂时只支持四个平台的官方 HTTPS 歌单链接。');
 let html=null;
 if(u.hostname==='163cn.tv'||u.hostname==='spotify.link'||/\/fcgi-bin\/u$/u.test(u.pathname)||/\/share\//u.test(u.pathname)||u.hostname==='i2.y.qq.com'){
   const resolved=await request(u.href);u=new URL(resolved.url);html=resolved.text;
 }
 if(/(?:^|\.)y\.qq\.com$/i.test(u.hostname)){
   const id=u.pathname.match(/\/playlist\/(\d+)/)?.[1]||u.searchParams.get('id')||u.searchParams.get('disstid');
   if(!id||!/^\d+$/u.test(id))throw new ImportError('这是 QQ 音乐链接，但没有找到歌单编号，请复制歌单分享链接。');
   return loadQQ(id,u.href);
 }
 if(/(?:^|\.)music\.163\.com$/i.test(u.hostname)){
   const id=u.searchParams.get('id')||u.hash.match(/(?:\?|&)id=(\d+)/)?.[1]||u.pathname.match(/\/playlist\/(\d+)/)?.[1];
   if(!id||!/^\d+$/u.test(id))throw new ImportError('没有找到网易云歌单编号，请使用歌单链接。');
   return loadNetease(id,u.href);
 }
 if(u.hostname==='open.spotify.com'){
   const id=u.pathname.match(/\/(?:embed\/)?playlist\/([a-zA-Z0-9]+)/)?.[1];
   if(!id)throw new ImportError('请使用 Spotify 歌单链接，而不是歌曲或专辑链接。');
   const result=await request(`https://open.spotify.com/embed/playlist/${id}`);
   return parseSpotify(result.text,u.href);
 }
 if(u.hostname==='music.apple.com'){
   if(!u.pathname.includes('/playlist/'))throw new ImportError('请使用 Apple Music 歌单链接。');
   const result=html?{text:html}:await request(u.href);
   return parseApple(result.text,u.href);
 }
 throw new ImportError('分享链接没有指向支持的歌单页面。');
}
