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
function indexTracks(tracks, mode) {
  const index = new Map();
  for(const track of tracks) {
    const names = mode === 'songs' ? [track.title] : splitArtists(track.artists);
    for(const name of names) {
      const key = mode === 'songs' ? songKey(name) : normalizeName(name);
      if(!key) continue;
      const entry=index.get(key) || {key,name,tracks:[]};
      if(!entry.tracks.includes(track))entry.tracks.push(track);
      index.set(key,entry);
    }
  }
  return index;
}
export function comparePlaylists(a,b,mode) {
  const left=indexTracks(a.tracks,mode),right=indexTracks(b.tracks,mode);
  const common=[],onlyA=[],onlyB=[];
  for(const [key,entry] of left) {
    if(right.has(key)) common.push({...entry,otherName:right.get(key).name,otherTracks:right.get(key).tracks});
    else onlyA.push(entry);
  }
  for(const [key,entry] of right)if(!left.has(key))onlyB.push(entry);
  const union=left.size+right.size-common.length;
  return {mode,common,onlyA,onlyB,aCount:left.size,bCount:right.size,union,
    overlap:union?common.length/union:null,coverageA:left.size?common.length/left.size:null,coverageB:right.size?common.length/right.size:null};
}
export function toCsv(rows) {
  const escape = value => {
    let s=String(value??'');
    if(/^[=+@\-\t\r]/u.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  return '\uFEFF'+rows.map(r=>r.map(escape).join(',')).join('\r\n');
}
