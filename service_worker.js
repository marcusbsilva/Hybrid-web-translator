'use strict';
const API='https://translation.googleapis.com/language/translate/v2';
const DEFAULTS={hybridEnabled:false,googleApiKey:'',dailyCharBudget:15000,learnedExact:{},learnedMeta:{order:[],charsToday:0,day:''}};
function today(){return new Date().toISOString().slice(0,10)}
async function cfg(){return chrome.storage.local.get(DEFAULTS)}
async function translateGoogle(texts,lang,key){
  const r=await fetch(`${API}?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:texts,target:'en',source:lang==='vi'?'vi':'zh-CN',format:'text'})});
  if(!r.ok){let detail='';try{detail=(await r.json())?.error?.message||''}catch{}throw new Error(`Google Cloud Translation ${r.status}${detail?': '+detail:''}`)}
  const j=await r.json(); return (j.data?.translations||[]).map(x=>x.translatedText||'');
}
function htmlDecode(s){return s.replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
async function learn(pairs){
  const s=await cfg(); const learned={...(s.learnedExact||{})}; const meta={...(s.learnedMeta||{})}; let order=Array.isArray(meta.order)?meta.order.slice():[];
  for(const [src,dst] of pairs){if(!src||!dst)continue;if(!(src in learned))order.push(src);learned[src]=dst}
  const MAX=4000; while(order.length>MAX){const k=order.shift();delete learned[k]}
  meta.order=order; await chrome.storage.local.set({learnedExact:learned,learnedMeta:meta});
}
chrome.runtime.onMessage.addListener((msg,_sender,send)=>{
 if(msg?.type==='SPT_GOOGLE_BATCH'){
   (async()=>{try{
     const s=await cfg(); if(!s.hybridEnabled)throw new Error('Hybrid fallback is disabled'); if(!s.googleApiKey)throw new Error('Google Cloud API key is not configured');
     const d=today(),meta={...(s.learnedMeta||{})}; if(meta.day!==d){meta.day=d;meta.charsToday=0}
     const items=(msg.items||[]).filter(x=>x&&typeof x.text==='string'&&x.text.length<=1200).slice(0,20);
     const learned=s.learnedExact||{}, out=new Array(items.length), missing=[];
     for(let i=0;i<items.length;i++){const hit=learned[items[i].text];if(hit)out[i]=hit;else missing.push([i,items[i]])}
     const chars=missing.reduce((a,[,x])=>a+x.text.length,0); const budget=Math.max(0,Number(s.dailyCharBudget)||0);
     if(chars && meta.charsToday+chars>budget)throw new Error(`Daily Google budget reached (${meta.charsToday}/${budget} chars)`);
     const groups=new Map();for(const [i,x] of missing){const l=x.lang==='vi'?'vi':'zh';if(!groups.has(l))groups.set(l,[]);groups.get(l).push([i,x])}
     const learnedPairs=[];
     for(const [l,g] of groups){const tr=await translateGoogle(g.map(([,x])=>x.text),l,s.googleApiKey);g.forEach(([idx,x],k)=>{out[idx]=htmlDecode(tr[k]||'');if(out[idx])learnedPairs.push([x.text,out[idx]])})}
     if(chars){meta.charsToday+=chars;await chrome.storage.local.set({learnedMeta:meta})} if(learnedPairs.length)await learn(learnedPairs);
     send({ok:true,translations:out,apiChars:chars,charsToday:meta.charsToday});
   }catch(e){send({ok:false,error:String(e?.message||e)})}})();return true;
 }
 if(msg?.type==='SPT_EXPORT_LEARNED'){
   (async()=>{const s=await cfg();const blob='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({version:1,exportedAt:new Date().toISOString(),entries:s.learnedExact||{}},null,2));await chrome.downloads.download({url:blob,filename:'hybrid-web-translator-learned-dictionary.json',saveAs:true});send({ok:true})})().catch(e=>send({ok:false,error:String(e)}));return true;
 }
 if(msg?.type==='SPT_CLEAR_LEARNED'){chrome.storage.local.set({learnedExact:{},learnedMeta:{order:[],charsToday:0,day:today()}}).then(()=>send({ok:true}));return true}
});
