import {createHash} from 'node:crypto';
export async function readKugou(u,request){
 const collection=u.searchParams.get('global_specialid');
 const special=u.searchParams.get('specialid');
 if(!(collection&&/^[A-Za-z0-9_]{1,160}$/.test(collection))&&!(special&&/^\d+$/.test(special)))throw new Error('没有找到酷狗歌单编号，请复制歌单分享链接。');
 const deadline=Date.now()+40000,seen=new Map(),warnings=[];
 let total=null,title='酷狗歌单',consistent=true;
 for(let page=1;page<=500&&Date.now()<deadline;page++){
  const stamp=String(Date.now());
  const p={srcappid:'2919',clientver:'20000',clienttime:stamp,mid:'-',uuid:stamp,dfid:'-',appid:'1058',uid:'0',token:'',type:'0',module:'playlist',page:String(page),pagesize:'20',...(collection?{global_collection_id:collection}:{specialid:special})};
  const key='NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt';
  p.signature=createHash('md5').update(key+Object.keys(p).sort().map(k=>k+'='+p[k]).join('')+key).digest('hex');
  let body;
  try{body=JSON.parse((await request('https://pubsongscdn.kugou.com/v2/get_other_list_file?'+new URLSearchParams(p),{timeoutMs:Math.max(1,deadline-Date.now())})).text);
   if(body.error_code!==0||!Array.isArray(body.data?.info))throw new Error('酷狗暂未返回歌单曲目，请确认链接公开或稍后重试。');
  }catch(e){if(!seen.size)throw e;warnings.push('部分曲目读取失败，结果仅基于已读取歌曲。');break;}
  const data=body.data;
  if(Number.isInteger(data.count)&&data.count>=0){if(total!==null&&total!==data.count)consistent=false;total=data.count;}
  title=data.listname||data.specialname||title;
  const before=seen.size;
  for(const s of data.info){
   const id=String(s.fileid??s.mixsongid??s.hash??'');
   const artists=(s.singerinfo||[]).map(a=>a.name).filter(Boolean);
   const name=String(s.name||'');const split=name.indexOf(' - ');
   const songTitle=s.songname||(split>=0?name.slice(split+3):name);
   if(id&&!seen.has(id))seen.set(id,{id,title:songTitle,artists});
  }
  if(total!==null&&seen.size>=total||!data.info.length||seen.size===before)break;
 }
 if(!consistent){warnings.push('读取过程中歌单数量发生变化，请重新读取核对。');total=null;}
 if(total===null||seen.size!==total)warnings.push('酷狗歌单未完整读取，请核对数量。');
 return {platform:'酷狗音乐',title,tracks:[...seen.values()],total,sourceUrl:u.href,warnings};
}
