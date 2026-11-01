let pageId='';let visitorId='';let started=false;
const id=()=>globalThis.crypto?.randomUUID?.()||`v${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
export function startAnalytics(){
 if(started)return;started=true;pageId=id();visitorId=id();
 try{const saved=localStorage.getItem('tp_visitor');if(saved&&/^[A-Za-z0-9_-]{16,80}$/u.test(saved))visitorId=saved;else localStorage.setItem('tp_visitor',visitorId);}catch{}
 trackAnalytics('pageview');
}
export function trackAnalytics(kind:'pageview'|'compare'){
 if(!started)return;
 const payload=JSON.stringify({kind,eventId:kind==='pageview'?pageId:id(),pageId,visitorId});
 try{void fetch('/api/analytics/event',{method:'POST',headers:{'Content-Type':'application/json'},body:payload,keepalive:true,credentials:'same-origin',...(typeof AbortSignal.timeout==='function'?{signal:AbortSignal.timeout(5000)}:{})}).catch(()=>{});}catch{}
}
