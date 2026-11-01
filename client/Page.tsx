"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, CircleHelp, Disc3, Link2, LoaderCircle, Music2, Plus, Search, Users, X } from 'lucide-react';
import { comparePlaylists, splitArtists, toCsv } from '../lib/compare.mjs';
import {startAnalytics,trackAnalytics} from './analytics';
type Track={title:string;artists:string[]};
type Playlist={title:string;platform:string;tracks:Track[];complete:boolean;total:number|null;warnings:string[];sourceUrl?:string};
type Entry={input:string;mode:'link'|'text';data:Playlist|null;error:string;loading:boolean};
const blank=():Entry=>({input:'',mode:'link',data:null,error:'',loading:false});
const pct=(n:number|null)=>n===null?'—':`${(n*100).toFixed(1)}%`;
const demo:Playlist[]=[
 {title:'午后散步',platform:'演示歌单',complete:true,total:6,warnings:[],tracks:[{title:'晴天',artists:['周杰伦']},{title:'珊瑚海',artists:['周杰伦','梁心颐']},{title:'好久不见',artists:['陈奕迅']},{title:'小幸运',artists:['田馥甄']},{title:'日不落',artists:['蔡依林']},{title:'晴天 (Live)',artists:['周杰伦']}]},
 {title:'夜晚兜风',platform:'演示歌单',complete:true,total:6,warnings:[],tracks:[{title:'晴天 (Live)',artists:['周杰伦']},{title:'好久不见 (录音室版)',artists:['陈奕迅']},{title:'珊瑚海 (Live)',artists:['周杰伦','梁心颐']},{title:'红色高跟鞋',artists:['蔡健雅']},{title:'说爱你',artists:['蔡依林']},{title:'爱的可能',artists:['叶倩文']}]}
];
function parseText(text:string,title:string):Playlist {
 const lines=text.trim().split(/\r?\n/u).filter(s=>s.trim());
 const tracks=lines.map((line,index)=>{
  if(index===0&&/^\s*歌名\s*\t\s*歌手\s*$/u.test(line))return null;
  const cells=line.includes('\t')?line.split('\t'):line.split(/\s+[-–—]\s+/u);
  if(cells.length<2)throw new Error(`第 ${index+1} 行缺少歌手。请用 Tab 或“ - ”分隔歌名和歌手。`);
  const artists=splitArtists(cells.slice(1).join(' / '));
  if(!cells[0].trim()||!artists.length)throw new Error(`第 ${index+1} 行的歌名或歌手为空。`);
  return {title:cells[0].trim(),artists};
 }).filter(Boolean) as Track[];
 if(!tracks.length)throw new Error('请至少粘贴一首歌。');
 if(tracks.length>10000)throw new Error('测试版每张歌单最多支持 10000 首。');
 return {title,platform:'手动粘贴',tracks,total:tracks.length,complete:true,warnings:[]};
}
function Wave({small=false}:{small?:boolean}){return <span aria-hidden="true" className={`wave ${small?'small':''}`}><i/><i/><i/><i/><i/></span>}
function PlaylistCard({entry,index,change,load}:{entry:Entry;index:number;change:(p:Partial<Entry>)=>void;load:()=>void}){
 const letter=index===0?'A':'B';
 return <section className={`playlist-card card-${letter.toLowerCase()}`} aria-label={`歌单 ${letter}`}>
  <div className="card-heading"><span className="letter">{letter}</span><div><h2>歌单 {letter}</h2><p>{index===0?'从你的心头好开始':'再放进另一张歌单'}</p></div><Music2 className="card-icon" size={21}/></div>
  <div className="input-tabs" aria-label={`歌单 ${letter} 导入方式`}><button type="button" aria-pressed={entry.mode==='link'} className={entry.mode==='link'?'selected':''} disabled={entry.loading} onClick={()=>change({mode:'link',input:'',data:null,error:''})}><Link2 size={14}/>歌单链接</button><button type="button" aria-pressed={entry.mode==='text'} className={entry.mode==='text'?'selected':''} disabled={entry.loading} onClick={()=>change({mode:'text',input:'',data:null,error:''})}>粘贴曲目</button></div>
  <label className="sr-only" htmlFor={`input-${letter}`}>{`歌单 ${letter} ${entry.mode==='link'?'链接':'曲目'}`}</label>
  {entry.mode==='link'?<div className="link-field"><Link2 size={17}/><input id={`input-${letter}`} inputMode="url" autoComplete="off" placeholder="粘贴公开歌单的分享链接" value={entry.input} disabled={entry.loading} onChange={e=>change({input:e.target.value,data:null,error:''})}/>{entry.input&&!entry.loading&&<button className="clear" type="button" aria-label={`清空歌单 ${letter}`} onClick={()=>change({input:'',data:null,error:''})}><X size={15}/></button>}</div>:<textarea id={`input-${letter}`} placeholder={'每行一首：歌名 - 歌手\n合唱用 / 分隔：珊瑚海 - 周杰伦 / 梁心颐\n也可以直接粘贴 Excel 的歌名、歌手两列'} value={entry.input} disabled={entry.loading} onChange={e=>change({input:e.target.value,data:null,error:''})}/>}
  {entry.error&&<p className="error" role="alert">{entry.error}</p>}
  {entry.data?<div className="loaded"><span className="loaded-check"><Check size={16}/></span><div><strong>{entry.data.title}</strong><span>{entry.data.platform} · {entry.data.tracks.length} 首{entry.data.complete?' · 数量已核对':' · 完整性未确认'}</span></div><button onClick={load} disabled={entry.loading||!entry.input} type="button">重新读取</button></div>:<div className="card-bottom"><span>{entry.mode==='link'?'支持四个平台的公开歌单':'歌名与歌手用 Tab 或「 - 」分隔'}</span><button type="button" onClick={load} disabled={!entry.input.trim()||entry.loading}>{entry.loading?<><LoaderCircle className="spin" size={14}/>读取中</>:<>读取<ArrowRight size={14}/></>}</button></div>}
 </section>
}
function ResultPanel({result,mode,partial}:{result:any;mode:'songs'|'artists';partial:boolean}){
 const [tab,setTab]=useState<'common'|'onlyA'|'onlyB'>('common');const [search,setSearch]=useState('');const [limit,setLimit]=useState(30);const isSong=mode==='songs';
 const list=result[tab].filter((item:any)=>`${item.name} ${(item.aliases??[]).join(' ')} ${(item.otherAliases??[]).join(' ')} ${isSong?item.tracks.map((t:Track)=>t.artists.join(' ')).join(' '):''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 function download(){
  const rows=[[isSong?'歌名':'歌手','归属','歌单 A 中的曲目','歌单 B 中的曲目'],...['common','onlyA','onlyB'].flatMap(group=>result[group].map((e:any)=>[e.name,group==='common'?'共同':group==='onlyA'?'仅 A':'仅 B',group==='onlyB'?'':e.tracks.map((t:Track)=>`${t.title} — ${t.artists.join(' / ')}`).join('；'),group==='common'?e.otherTracks.map((t:Track)=>`${t.title} — ${t.artists.join(' / ')}`).join('；'):group==='onlyB'?e.tracks.map((t:Track)=>`${t.title} — ${t.artists.join(' / ')}`).join('；'):'']))];
  if(!isSong){rows[0].push('歌单 A 歌曲占比','歌单 B 歌曲占比','相似度贡献（百分点）');let row=1;for(const group of ['common','onlyA','onlyB'])for(const e of result[group])rows[row++].push(pct(group==='onlyB'?0:e.share),pct(group==='common'?e.otherShare:group==='onlyB'?e.share:0),((group==='common'?e.contribution:0)*100).toFixed(1));}
  rows.push(['计算指标',isSong?'歌名重合率（Dice）':'歌手口味相似度',pct(result.overlap),'']);
  rows.push(['计算方式',isSong?'共同歌名数 × 2 ÷ 两边去重歌名数之和':'各共同歌手在两边歌曲占比的较小值相加；每首合唱由歌手平分权重','','']);
  rows.push(['',partial?'此结果仅基于已读取曲目，完整性未确认。':'按导入曲目计算。','','']);
  const url=URL.createObjectURL(new Blob([toCsv(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`同频_${isSong?'歌名':'歌手'}对比.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className={`result-panel ${mode}`}>
  <div className="result-top"><div className="result-title"><span className="result-icon">{isSong?<Music2 size={21}/>:<Users size={21}/>}</span><div><h3>{isSong?'按歌名':'按歌手'}</h3><p>{isSong?'忽略版本，只看共同的歌名':'合唱分别计入，考虑歌曲占比'}</p></div></div><button className="icon-button" onClick={download} aria-label={`导出${isSong?'歌名':'歌手'}对比结果`} title="下载 CSV，可用 Excel 打开"><ArrowDownToLine size={18}/></button></div>
  <div className="metric"><strong>{pct(result.overlap)}</strong><span>{partial?'已读取部分 · ':''}{isSong?'歌名重合率':'口味相似度'}</span><span className="shared-pill">{result.common.length} {isSong?'首共同歌曲':'位共同歌手'}</span></div>
  <div className="overlap-bar" aria-label={isSong?'歌名重合率':'歌手口味相似度'}><div style={{width:`${(result.overlap??0)*100}%`}}/></div><p className="formula">{isSong?`共同 ${result.common.length} × 2 ÷ (${result.aCount} + ${result.bCount})`:'每位共同歌手在两边的歌曲占比，取较小值后相加'}</p>
  <div className="coverage">{[['A',result.aCount,result.coverageA],['B',result.bCount,result.coverageB]].map(([label,count,rate])=><div key={String(label)}><span>歌单 {label}</span><strong>{pct(rate as number|null)}</strong><small>{isSong?`${result.common.length} / ${count} 个歌名`:'共同歌手的歌曲占比'}</small></div>)}</div>
  <div className="detail-tabs" role="tablist" aria-label={isSong?'歌曲结果分类':'歌手结果分类'}>{([['common','共同'],['onlyA','仅 A'],['onlyB','仅 B']] as const).map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} className={tab===key?'active':''} onClick={()=>{setTab(key);setLimit(30)}}>{label}<span>{result[key].length}</span></button>)}</div>
  <div className="search-field"><Search size={15}/><input aria-label={`搜索${isSong?'歌名':'歌手'}`} placeholder={isSong?'搜索歌名或歌手':'搜索歌手'} value={search} onChange={e=>{setSearch(e.target.value);setLimit(30)}}/></div>
  <div className="entry-list">{list.slice(0,limit).map((entry:any,i:number)=><div className="track-row" key={entry.key}><span className="row-number">{String(i+1).padStart(2,'0')}</span><div><strong>{entry.name}</strong><p>{isSong?[...new Set(entry.tracks.flatMap((t:Track)=>t.artists))].join(' / '):tab==='common'?`歌曲占比 A ${pct(entry.share)} / B ${pct(entry.otherShare)}`:`歌曲占比 ${tab==='onlyA'?'A':'B'} ${pct(entry.share)}`}</p>{!isSong&&tab==='common'&&<small>贡献 {(entry.contribution*100).toFixed(1)} 个百分点</small>}{isSong&&tab==='common'&&entry.otherName!==entry.name&&<small>B：{entry.otherName}</small>}</div>{tab==='common'&&<span className="match-check"><Check size={14}/></span>}</div>)}{!list.length&&<div className="empty-list">{search?'没有找到匹配项':tab==='common'?`暂时没有共同${isSong?'歌名':'歌手'}`:'这里没有独有项'}</div>}</div>
  {list.length>limit&&<button className="show-more" onClick={()=>setLimit(limit+50)}>再显示 {Math.min(50,list.length-limit)} 项<ChevronDown size={15}/></button>}
 </section>
}
export default function Home(){
 const [entries,setEntries]=useState<Entry[]>([blank(),blank()]);const [isDemo,setIsDemo]=useState(false);const [busy,setBusy]=useState(false);const [rules,setRules]=useState(false);
 const change=(i:number,patch:Partial<Entry>)=>{setIsDemo(false);setEntries(prev=>prev.map((e,j)=>j===i?{...e,...patch}:e))};
 async function load(i:number){
  const entry=entries[i];if(!entry.input.trim()||entry.loading)return null;change(i,{loading:true,error:'',data:null});
  try{let data:Playlist;if(entry.mode==='text')data=parseText(entry.input,`歌单 ${i===0?'A':'B'}`);else{const response=await fetch('/api/playlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:entry.input}),signal:typeof AbortSignal.timeout==='function'?AbortSignal.timeout(65000):undefined});const body=await response.json() as Playlist & {error?:string};if(!response.ok)throw new Error(body.error||'读取失败，请重试。');data=body;}change(i,{data,loading:false});return data;}
  catch(error){change(i,{loading:false,error:error instanceof Error?error.message:'读取失败，请重试。'});return null;}
 }
 async function compare(){if(busy)return;setBusy(true);await Promise.all(entries.map((e,i)=>e.data?Promise.resolve(e.data):load(i)));setBusy(false)}
 const results=useMemo(()=>entries.every(e=>e.data)?{songs:comparePlaylists(entries[0].data!,entries[1].data!,'songs'),artists:comparePlaylists(entries[0].data!,entries[1].data!,'artists')}:null,[entries]);
 const counted=useRef<[Playlist,Playlist]|null>(null);
 useEffect(()=>{startAnalytics()},[]);
 useEffect(()=>{const a=entries[0].data,b=entries[1].data;if(!isDemo&&a&&b&&(counted.current?.[0]!==a||counted.current?.[1]!==b)){counted.current=[a,b];trackAnalytics('compare');}},[entries[0].data,entries[1].data,isDemo]);
 const partial=entries.some(e=>e.data&&!e.data.complete);
 function loadDemo(){if(entries.some(e=>e.loading))return;setEntries(demo.map(data=>({...blank(),data})));setIsDemo(true)}
 return <div className="app-shell">
  <p className="creator-credit">by 原子核</p>
  <header className="site-header"><a className="brand" href="/" aria-label="同频首页"><Wave/><span>同频</span><em>PLAYLIST MATCH</em></a><div className="header-right"><span className="beta-label"><span/>测试版</span><button className="help-button" onClick={()=>setRules(!rules)} aria-expanded={rules}><CircleHelp size={16}/>计算规则</button></div></header>
  <main><section className="hero"><div><h1>两张歌单，两个人，<br/>多少<span>同频</span>时刻？</h1><p className="hero-description">放进你和 TA 的歌单。<br className="mobile-break"/>从共同的歌，到共同喜欢的歌手。</p><div className="platforms"><span className="platform qq">Q</span><span>QQ 音乐</span><i/><span className="platform netease">网</span><span>网易云</span><i/><span className="platform apple">♪</span><span>Apple Music</span><i/><span className="platform spotify">≋</span><span>Spotify</span></div></div><div className="hero-art" aria-hidden="true"><div className="disc disc-a"><span/><i/></div><div className="disc disc-b"><span/><i/></div><div className="art-label"><Wave small/><span>GOOD MUSIC<br/>BRINGS US CLOSER</span></div><span className="art-cross">+</span></div></section>
  {rules&&<section className="rules"><div><h2>怎么计算同频？</h2><p><b>歌名重合率：</b>共同歌名数 × 2 ÷ 两张歌单各自去重后的歌名数之和（Dice）。例如两边各有 100 个歌名、共同 20 个，重合率为 20%。下方分别展示两张歌单的歌名覆盖率。</p><p>歌名忽略大小写、空格、标点，以及 Live、录音室、重制等版本标记；同名歌即使歌手不同也算重合，同一歌名只计一次。歌曲的简繁体或译名暂不自动合并。</p><p><b>歌手口味相似度：</b>先计算每位歌手在各自歌单中的歌曲占比，再把共同歌手两边占比的较小值相加。例如两边都有 90% 的曲目来自周杰伦、其余歌手完全不同，相似度为 90%。它衡量收藏曲目的分布，不代表实际播放次数。</p><p>每首曲目总权重为 1，合唱由去重后的歌手平分：A / B 合唱时各得 0.5。歌手分别计入，乐队、组合保留为一个艺人。歌单中的多首作品或不同版本会影响歌手占比。</p><p>目前仅合并明确列入映射表的别名，例如周杰伦／周杰倫／Jay Chou、陈奕迅／陳奕迅／Eason Chan、林俊杰／林俊傑／JJ Lin；未收录的别名可能漏配。下方展示共同歌手的歌曲占比，明细按相似度贡献排序。</p><p>公开页面可能限量展示曲目。数量未核对的结果只代表已读取部分。</p></div><button className="icon-button" aria-label="关闭计算规则" onClick={()=>setRules(false)}><X size={18}/></button></section>}
  <div className="section-heading"><div><span className="step">01</span><h2>放进两张歌单</h2></div><button className="demo-button" onClick={loadDemo} disabled={entries.some(e=>e.loading)}>先体验示例<ArrowRight size={14}/></button></div>
  <div className="playlist-grid">{entries.map((entry,i)=><PlaylistCard key={i} index={i} entry={entry} change={p=>change(i,p)} load={()=>void load(i)}/>)}<span className="between-plus" aria-hidden="true"><Plus size={20}/></span></div>
  <div className="compare-action"><p><span className="privacy-dot"/>仅用于本次对比，不保存歌单内容</p><button className="compare-button" onClick={compare} disabled={busy||entries.some(e=>e.loading)||entries.some(e=>!e.data&&!e.input.trim())}>{busy?<LoaderCircle size={18} className="spin"/>:<Wave small/>}{busy?'正在读取歌单…':results?'重新对比':'读取并对比'}<ArrowRight size={17}/></button></div>
  <section id="results" className="results" aria-live="polite"><div className="section-heading"><div><span className="step">02</span><h2>发现你们的同频</h2></div>{results?<span className="result-label">{isDemo?'演示数据':partial?'基于已读取曲目':'曲目数量已核对'}</span>:<span className="quiet">两个角度，分别计算</span>}</div>
  {results?<>{isDemo&&<div className="notice demo-notice"><Disc3 size={17}/><span>正在展示示例数据。粘贴自己的歌单链接，就能开始真实对比。</span></div>}{partial&&<div className="notice"><CircleHelp size={17}/><div><strong>部分歌单完整性未确认</strong>{entries.flatMap((e,i)=>e.data?.warnings.map((m,j)=><p key={`${i}-${j}`}>歌单 {i===0?'A':'B'}：{m}</p>)??[])}</div></div>}<div className="compared-names"><span>A · {entries[0].data!.title}</span><span>×</span><span>B · {entries[1].data!.title}</span></div><div className="result-grid"><ResultPanel key={`artists-${entries.map(e=>e.data?.title).join('-')}`} result={results.artists} mode="artists" partial={partial}/><ResultPanel key={`songs-${entries.map(e=>e.data?.title).join('-')}`} result={results.songs} mode="songs" partial={partial}/></div></>:<div className="waiting"><div className="waiting-art"><Music2 size={24}/><span/><Users size={24}/></div><h3>共同喜欢的，值得被发现</h3><p>读取两张歌单后，这里会展示歌名和歌手重合度。</p><button onClick={loadDemo} disabled={entries.some(e=>e.loading)}>看看示例<ArrowRight size={14}/></button></div>}
  </section></main><footer><span><Wave small/>同频</span><p>好音乐，让我们靠近一点。</p><small>公开链接测试版 · 平台读取结果可能受访问限制</small></footer>
 </div>
}
