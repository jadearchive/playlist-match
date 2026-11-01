let pageId='';let started=false;
const id=()=>globalThis.crypto?.randomUUID?.()||`v${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
export function startAnalytics(){
 if(started)return;started=true;pageId=id();
 trackAnalytics('pageview');
}
export function trackAnalytics(kind:'pageview'|'compare'){
 if(!started)return;
 const payload=JSON.stringify({kind,eventId:kind==='pageview'?pageId:id(),pageId});
 try{void fetch('/api/analytics/event',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true,credentials:'same-origin',...(typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(5000)}:{})}).catch(()=>{});}catch{}
}
