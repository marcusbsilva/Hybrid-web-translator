'use strict';
const GOOGLE_API='https://translation.googleapis.com/language/translate/v2';
const DEFAULT_LINGVA='https://translate.plausibility.cloud';
const DEFAULTS={hybridEnabled:false,hybridProvider:'lingva',googleApiKey:'',lingvaInstance:DEFAULT_LINGVA,libreInstance:'http://localhost:5000',libreApiKey:'',deeplApiKey:'',dailyCharBudget:15000,learnedExact:{},learnedMeta:{order:[],charsToday:0,day:''}};
function today(){return new Date().toISOString().slice(0,10)}
async function cfg(){return chrome.storage.local.get(DEFAULTS)}
function htmlDecode(s){return String(s||'').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
async function translateGoogle(texts,lang,key){const r=await fetch(`${GOOGLE_API}?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:texts,target:'en',source:lang==='vi'?'vi':'zh-CN',format:'text'})});if(!r.ok){let d='';try{d=(await r.json())?.error?.message||''}catch{}throw new Error(`Google ${r.status}${d?': '+d:''}`)}const j=await r.json();return(j.data?.translations||[]).map(x=>htmlDecode(x.translatedText||''))}
async function translateLingva(texts,lang,base){base=String(base||DEFAULT_LINGVA).trim().replace(/\/+$/,'');if(!/^https:\/\//i.test(base))throw new Error('Public Lingva must use HTTPS');const source=lang==='vi'?'vi':'zh',out=[];for(const text of texts){const r=await fetch(`${base}/api/v1/${source}/en/${encodeURIComponent(text)}`,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Lingva ${r.status}`);const j=await r.json();if(j.error)throw new Error(`Lingva: ${j.error}`);out.push(htmlDecode(j.translation||''))}return out}
async function translateLibre(texts,lang,base,key){base=String(base||'http://localhost:5000').trim().replace(/\/+$/,'');const body={q:texts,source:lang==='vi'?'vi':'zh',target:'en',format:'text'};if(key)body.api_key=key;const r=await fetch(`${base}/translate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`LibreTranslate ${r.status}`);const j=await r.json();const t=j.translatedText;return Array.isArray(t)?t.map(htmlDecode):[htmlDecode(t)]}
async function translateDeepL(texts,lang,key){if(!key)throw new Error('DeepL API key is not configured');const free=/:fx$/i.test(key),url=`https://${free?'api-free':'api'}.deepl.com/v2/translate`;const r=await fetch(url,{method:'POST',headers:{Authorization:`DeepL-Auth-Key ${key}`,'Content-Type':'application/json'},body:JSON.stringify({text:texts,source_lang:lang==='vi'?'VI':'ZH',target_lang:'EN'})});if(!r.ok)throw new Error(`DeepL ${r.status}`);const j=await r.json();return(j.translations||[]).map(x=>x.text||'')}
async function callProvider(provider,texts,lang,s){if(provider==='google'){if(!s.googleApiKey)throw new Error('Google API key is not configured');return translateGoogle(texts,lang,s.googleApiKey)}if(provider==='libre')return translateLibre(texts,lang,s.libreInstance,s.libreApiKey);if(provider==='deepl')return translateDeepL(texts,lang,s.deeplApiKey);return translateLingva(texts,lang,s.lingvaInstance)}
async function learn(pairs){const s=await cfg(),learned={...(s.learnedExact||{})},meta={...(s.learnedMeta||{})};let order=Array.isArray(meta.order)?meta.order.slice():[];for(const[src,dst]of pairs){if(!src||!dst)continue;if(!(src in learned))order.push(src);learned[src]=dst}const MAX=8000;while(order.length>MAX){const k=order.shift();delete learned[k]}meta.order=order;await chrome.storage.local.set({learnedExact:learned,learnedMeta:meta})}
chrome.runtime.onMessage.addListener((msg,_sender,send)=>{
 if(msg?.type==='SPT_HYBRID_BATCH'){
  (async()=>{
   try{
    const s=await cfg();
    if(!s.hybridEnabled)throw new Error('Hybrid fallback is disabled');
    const provider=s.hybridProvider||'lingva',d=today(),meta={...(s.learnedMeta||{})};
    if(meta.day!==d){meta.day=d;meta.charsToday=0}
    const items=(msg.items||[]).filter(x=>x&&typeof x.text==='string'&&x.text.length<=1200).slice(0,20),learned=s.learnedExact||{},out=new Array(items.length),missing=[];
    for(let i=0;i<items.length;i++){const hit=learned[items[i].text];if(hit)out[i]=hit;else missing.push([i,items[i]])}
    const chars=missing.reduce((a,[,x])=>a+x.text.length,0),budget=Math.max(0,Number(s.dailyCharBudget)||0);
    if(chars&&budget&&meta.charsToday+chars>budget)throw new Error(`Daily fallback budget reached (${meta.charsToday}/${budget})`);
    const groups=new Map();for(const[i,x]of missing){const l=x.lang==='vi'?'vi':'zh';if(!groups.has(l))groups.set(l,[]);groups.get(l).push([i,x])}
    const pairs=[];
    for(const[l,g]of groups){const tr=await callProvider(provider,g.map(([,x])=>x.text),l,s);g.forEach(([idx,x],k)=>{out[idx]=tr[k]||'';if(out[idx])pairs.push([x.text,out[idx]])})}
    if(chars){meta.charsToday+=chars;await chrome.storage.local.set({learnedMeta:meta})}
    if(pairs.length)await learn(pairs);
    send({ok:true,translations:out,apiChars:chars,charsToday:meta.charsToday,provider});
   }catch(e){send({ok:false,error:String(e?.message||e)})}
  })();
  return true;
 }
 if(msg?.type==='SPT_EXPORT_LEARNED'){
  (async()=>{const s=await cfg(),blob='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({version:2,exportedAt:new Date().toISOString(),entries:s.learnedExact||{}},null,2));await chrome.downloads.download({url:blob,filename:'hybrid-web-translator-learned-dictionary.json',saveAs:true});send({ok:true})})().catch(e=>send({ok:false,error:String(e)}));return true;
 }
 if(msg?.type==='SPT_CLEAR_LEARNED'){chrome.storage.local.set({learnedExact:{},learnedMeta:{order:[],charsToday:0,day:today()}}).then(()=>send({ok:true}));return true}
});
