// Shared, deterministic comparison rules. Imported by both the UI and Node tests.
export function normalizeName(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/gu, ' ');
}
const versionMarker = /(?:\blive\b|\bstudio\b|\bacoustic\b|\bunplugged\b|\bremaster(?:ed)?\b|\bremix\b|\bversion\b|\bedit\b|\bmix\b|现场|演唱会|录音室|录音棚|重制|混音|不插电|清唱|伴奏|纯音乐|原声版|独唱版|合唱版|重新录制|重录|(?:19|20)\d{2}.*版)/iu;
export function songKey(value) {
  let title = normalizeName(value);
  // Only remove bracketed version annotations; retain meaningful parts of titles.
  title = title.replace(/\([^()]*\)|\[[^\[\]]*\]|【[^【】]*】/gu, part => versionMarker.test(part)||/版(?:本)?[)\]】]$/u.test(part) ? '' : part);
  title = title.replace(/\s+[-–—]\s+(.+)$/u, (whole, suffix) => versionMarker.test(suffix) ? '' : whole);
  title = title.replace(/\s+(?:live|studio(?: version)?|acoustic|remastered(?: \d{4})?|现场版|录音室版|演唱会版)\s*$/iu, '');
  title = title.replace(/\s*\b(?:feat\.?|ft\.?)\s+.+$/iu, '');
  title = title.replace(/\s*\((?:feat\.?|ft\.?).*\)\s*$/iu, '');
  return title.replace(/[\s\p{P}\p{S}]+/gu, '');
}
export function splitArtists(value) {
  // Platforms supply an array of individual artists. Text input uses explicit separators.
  const parts = Array.isArray(value) ? value : String(value || '').split(/\s*(?:\/|、|;|；|\||\n)\s*|\s+(?:&|feat\.?|ft\.?|featuring|和|与)\s+/iu);
  return parts.map(s => String(s).trim()).filter(Boolean);
}
// Deliberately limited aliases: unknown artist names never use fuzzy matching.
const artistAliases = [
  ['周杰伦','周杰倫','Jay Chou'],['陈奕迅','陳奕迅','Eason Chan'],
  ['蔡依林','Jolin Tsai'],['田馥甄','Hebe Tien'],['林俊杰','林俊傑','JJ Lin'],
  ['孙燕姿','孫燕姿','Stefanie Sun'],['蔡健雅','Tanya Chua'],['梁静茹','梁靜茹','Fish Leong'],
];
const artistLookup = new Map(artistAliases.flatMap(names=>names.map(name=>[normalizeName(name),names[0]])));
export function artistKey(value) {
  const name=normalizeName(value);return normalizeName(artistLookup.get(name)||name);
}
function indexTracks(tracks, mode) {
  const index = new Map();
  for(const track of tracks) {
    const names = mode === 'songs' ? [track.title] : splitArtists(track.artists);
    const credits=new Map();
    for(const name of names){const key=mode==='songs'?songKey(name):artistKey(name);if(key)credits.set(key,name);}
    for(const [key,rawName] of credits) {
      const name=mode==='songs'?rawName:artistLookup.get(normalizeName(rawName))||rawName;
      const entry=index.get(key) || {key,name,tracks:[],weight:0,aliases:[]};
      if(!entry.tracks.includes(track))entry.tracks.push(track);
      if(!entry.aliases.includes(rawName))entry.aliases.push(rawName);
      entry.weight+=mode==='artists'?1/credits.size:1;
      index.set(key,entry);
    }
  }
  const total=[...index.values()].reduce((sum,entry)=>sum+entry.weight,0);
  for(const entry of index.values())entry.share=total?entry.weight/total:0;
  return index;
}
export function comparePlaylists(a,b,mode) {
  const left=indexTracks(a.tracks,mode),right=indexTracks(b.tracks,mode);
  const common=[],onlyA=[],onlyB=[];
  for(const [key,entry] of left) {
    if(right.has(key)) {const other=right.get(key);common.push({...entry,otherName:other.name,otherTracks:other.tracks,otherAliases:other.aliases,otherShare:other.share});}
    else onlyA.push(entry);
  }
  for(const [key,entry] of right)if(!left.has(key))onlyB.push(entry);
  const union=left.size+right.size-common.length;
  return {mode,common,onlyA,onlyB,aCount:left.size,bCount:right.size,union,
    overlap:mode==='songs'?(Math.min(left.size,right.size)?common.length/Math.min(left.size,right.size):null):(left.size+right.size?2*common.length/(left.size+right.size):null),
    coverageA:left.size?common.length/left.size:null,
    coverageB:right.size?common.length/right.size:null};
}
export function toCsv(rows) {
  const escape = value => {
    let s=String(value??'');
    if(/^[=+@\-\t\r]/u.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  return '\uFEFF'+rows.map(r=>r.map(escape).join(',')).join('\r\n');
}
