'use strict';
importScripts('languages.js');
const catalog=globalThis.SPT_Languages;

const GOOGLE_API = 'https://translation.googleapis.com/language/translate/v2';
const DEFAULT_LINGVA = 'https://translate.plausibility.cloud';
const DEFAULTS = {
  sourceLanguage:'auto',
  targetLanguage:'en',
  hybridEnabled:false,
  hybridProvider:'studio',
  googleApiKey:'',
  lingvaInstance:DEFAULT_LINGVA,
  studioInstance:'http://localhost:5000',
  deeplApiKey:'',
  dailyCharBudget:15000,
  learnedExact:{},
  learnedByPair:{},
  learnedMeta:{order:[],charsToday:0,day:''},
  hybridTelemetry:{
    status:'idle', lastProvider:'', lastHttpStatus:0, lastError:'',
    lastRequestAt:'', requestsToday:0, successfulToday:0, failedToday:0,
    charsSentToday:0, lastStatusText:'', lastContentType:'', lastResponseBody:'', lastUrl:'', lastDurationMs:0, lastErrorType:'', day:''
  }
};

const LINGVA_FAILOVER_DEFAULTS = [
  'https://translate.plausibility.cloud',
  'https://lingva.lunar.icu',
  'https://translate.projectsegfau.lt',
  'https://translate.dr460nf1r3.org',
  'https://lingva.garudalinux.org',
  'https://translate.jae.fi'
];
const LINGVA_CB_THRESHOLD = 3;
const LINGVA_CB_COOLDOWN_MS = 5 * 60 * 1000;
const lingvaCircuit = new Map();

const providerChains = new Map();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0,10);
async function cfg(){ return catalog.loadSettings(chrome.storage.local,DEFAULTS); }
function htmlDecode(s){ return String(s||'').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'); }
function cleanTranslation(s){ return htmlDecode(s).trim(); }

async function telemetry(patch={}){
  const s = await cfg();
  let t = {...(s.hybridTelemetry||{})};
  const d = today();
  if(t.day !== d) t = {status:'idle',lastProvider:'',lastHttpStatus:0,lastError:'',lastRequestAt:'',requestsToday:0,successfulToday:0,failedToday:0,charsSentToday:0,lastStatusText:'',lastContentType:'',lastResponseBody:'',lastUrl:'',lastDurationMs:0,lastErrorType:'',day:d};
  Object.assign(t, patch, {day:d});
  await chrome.storage.local.set({hybridTelemetry:t});
  return t;
}
async function noteAttempt(provider, chars=0){
  const t=await telemetry();
  return telemetry({
    status:'requesting',
    lastProvider:provider,
    lastError:'',
    lastRequestAt:new Date().toISOString(),
    requestsToday:(t.requestsToday||0)+1,
    charsSentToday:(t.charsSentToday||0)+Math.max(0, Number(chars)||0)
  });
}
async function noteSuccess(provider,status=200){
  const t=await telemetry();
  return telemetry({status:'ok',lastProvider:provider,lastHttpStatus:status,lastError:'',successfulToday:(t.successfulToday||0)+1});
}
async function noteFailure(provider,error,status=0){
  const t=await telemetry();
  return telemetry({status:'error',lastProvider:provider,lastHttpStatus:status,lastError:String(error||'Unknown error').slice(0,240),failedToday:(t.failedToday||0)+1});
}

function serializeProvider(provider, task){
  const previous = providerChains.get(provider) || Promise.resolve();
  const next = previous.catch(()=>{}).then(task);
  providerChains.set(provider, next);
  next.then(()=>{if(providerChains.get(provider)===next)providerChains.delete(provider);},()=>{if(providerChains.get(provider)===next)providerChains.delete(provider);});
  return next;
}

async function fetchJson(url, options, provider, retries=1, requestChars=0,validate=null){
  let lastErr;
  for(let attempt=0; attempt<=retries; attempt++){
    await noteAttempt(provider, requestChars);
    const started=performance.now();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const r=await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
      const contentType=r.headers.get('content-type')||'';
      const raw=await r.text();
      clearTimeout(timer);
      let j=null;
      try{ j=raw ? JSON.parse(raw) : {}; }catch{}
      const duration=Math.round(performance.now()-started);
      const safeUrl=url.replace(/([?&]key=)[^&]+/i,'$1[REDACTED]');
      const bodyPreview=String(raw||'').slice(0,500);
      await telemetry({
        lastProvider:provider,lastHttpStatus:r.status,lastStatusText:r.statusText||'',
        lastContentType:contentType,lastResponseBody:bodyPreview,lastUrl:safeUrl,
        lastDurationMs:duration,lastErrorType:r.ok?'':'http'
      });
      if(!r.ok){
        const detail=j?.error?.message || j?.error || bodyPreview || r.statusText || 'HTTP error';
        const err=new Error(`${provider} ${r.status}: ${detail}`);
        err.httpStatus=r.status; err.statusText=r.statusText; err.responseBody=bodyPreview;
        throw err;
      }
      if(j===null)throw Object.assign(new Error(`${provider} returned invalid JSON`),{httpStatus:r.status});
      if(validate){try{validate(j);}catch(e){e.httpStatus=r.status;e.errorType='response';e.responseBody=bodyPreview;throw e;}}
      await noteSuccess(provider,r.status);
      return j;
    }catch(e){
      clearTimeout(timer);
      const duration=Math.round(performance.now()-started);
      const type=e?.errorType||(e?.name==='AbortError'?'timeout':e?.httpStatus?'http':'network');
      lastErr=e;
      await telemetry({
        lastProvider:provider,lastDurationMs:duration,lastErrorType:type,
        lastStatusText:e?.statusText||'',lastResponseBody:e?.responseBody||''
      });
      await noteFailure(provider,e?.message||e,e?.httpStatus||0);
      const retryable=e?.name==='AbortError'||(!e?.httpStatus&&e?.name!=='SyntaxError')||e.httpStatus===429||[502,503,504].includes(e.httpStatus);
      if(attempt>=retries||!retryable) break;
      await sleep(500*(2**attempt));
    }
  }
  throw lastErr||new Error(`${provider} request failed`);
}

async function diagnosticFetch(url, timeoutMs=10000){
  const started=performance.now(), controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
    const raw=await r.text();
    clearTimeout(timer);
    let json=null; try{json=raw?JSON.parse(raw):{};}catch{}
    return {
      ok:r.ok,httpStatus:r.status,statusText:r.statusText||'',
      durationMs:Math.round(performance.now()-started),
      contentType:r.headers.get('content-type')||'',
      response:String(raw||'').slice(0,700),json
    };
  }catch(e){
    clearTimeout(timer);
    return {
      ok:false,httpStatus:0,durationMs:Math.round(performance.now()-started),
      errorType:e?.name==='AbortError'?'timeout':'network',
      error:String(e?.message||e)
    };
  }
}

function lingvaResponseError(j){
  if(j?.error)return typeof j.error==='string'?j.error:(j.error.message||'Lingva returned an API error');
  if(typeof j?.translation!=='string'||!j.translation.trim())return 'Lingva returned no valid translation';
  return '';
}
function diagnosticReason(result){
  if(result.errorType==='timeout')return 'Request timed out';
  if(result.httpStatus===403)return 'Access blocked (HTTP 403)';
  if(result.httpStatus===404)return 'Lingva API not found (HTTP 404)';
  if(result.httpStatus===429)return 'Rate limit reached (HTTP 429)';
  if(result.httpStatus>=500)return `Translation server failed (HTTP ${result.httpStatus})`;
  return result.apiError||result.error||'Invalid response or no translation';
}
async function probeLingvaTranslation(instance,source='zh',target='en',text='你好'){
  const endpoint=`${instance}/api/v1/${source}/${target}/${encodeURIComponent(text)}`;
  const result=await diagnosticFetch(endpoint,10000);
  result.endpoint=endpoint;
  result.apiError=lingvaResponseError(result.json);
  result.translation=typeof result.json?.translation==='string'?cleanTranslation(result.json.translation):'';
  result.ok=!!(result.ok&&!result.apiError&&result.translation);
  if(result.ok)lingvaMarkSuccess(instance);else lingvaMarkFailure(instance,result.httpStatus||0);
  result.reason=result.ok?'Translation is working':diagnosticReason(result);
  delete result.json;return result;
}
async function lingvaDiagnostics(base,source='zh',target='en',text='你好'){
  base=normalizeLingvaInstance(base||DEFAULT_LINGVA);
  const saved=(await chrome.storage.local.get({lingvaLastWorkingInstance:''})).lingvaLastWorkingInstance;
  const candidates=lingvaCandidates(base,saved),instances=[];
  const healthPromise=diagnosticFetch(`${base}/api/v1/languages/source`,10000);
  // Three concurrent innocuous probes, independent of cooldown and fallback budget.
  for(let i=0;i<candidates.length;i+=3){
    const group=await Promise.all(candidates.slice(i,i+3).map(async instance=>({instance,translation:await probeLingvaTranslation(instance,source,target,text)})));
    instances.push(...group);
  }
  const health=await healthPromise;
  health.endpoint=`${base}/api/v1/languages/source`;
  health.count=Array.isArray(health.json?.languages)?health.json.languages.length:0;
  health.ok=!!(health.ok&&health.count);delete health.json;
  const working=instances.find(x=>x.translation.ok);
  if(working)await chrome.storage.local.set({lingvaLastWorkingInstance:working.instance});
  const translation=working?.translation||instances[0]?.translation;
  return {health,translation,instances,selectedInstance:working?.instance||'',primaryInstance:base,allFailed:!working};
}

async function translateGoogle(texts,lang,key,target='en'){
  const j=await fetchJson(`${GOOGLE_API}?key=${encodeURIComponent(key)}`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({q:texts,target:target==='zh'?'zh-CN':target,...(lang==='auto'?{}:{source:lang==='zh'?'zh-CN':lang}),format:'text'})
  },'google',1,texts.reduce((n,t)=>n+t.length,0));
  return (j?.data?.translations||[]).map(x=>cleanTranslation(x.translatedText||''));
}

function normalizeLingvaInstance(v){
  const raw=String(v||'').trim();if(!raw)return '';
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid Lingva HTTP(S) address');
  // Also accept a pasted API endpoint instead of duplicating /api/v1.
  url.pathname=url.pathname.replace(/\/api\/v1(?:\/.*)?$/,'').replace(/\/+$/,'');
  url.search='';url.hash='';return url.href.replace(/\/+$/,'');
}
function lingvaCandidates(primary,saved=''){
  return [...new Set([normalizeLingvaInstance(primary),normalizeLingvaInstance(saved),...LINGVA_FAILOVER_DEFAULTS.map(normalizeLingvaInstance)].filter(Boolean))];
}
function lingvaCircuitState(base){
  const now=Date.now(), s=lingvaCircuit.get(base)||{fails:0,openUntil:0};
  if(s.openUntil && s.openUntil<=now){s.openUntil=0;lingvaCircuit.set(base,s);}
  return s;
}
function lingvaAvailable(base){ return lingvaCircuitState(base).openUntil<=Date.now(); }
function lingvaMarkSuccess(base){ lingvaCircuit.set(base,{fails:0,openUntil:0}); }
function lingvaMarkFailure(base,status=0){
  const state=lingvaCircuitState(base);state.fails=(state.fails||0)+1;
  state.openUntil=Date.now()+(state.fails>=LINGVA_CB_THRESHOLD?LINGVA_CB_COOLDOWN_MS:30000);
  state.httpStatus=status;lingvaCircuit.set(base,state);
}

async function translateLingva(texts,lang,base,target='en'){
  const source=lang, out=[];
  const saved=(await chrome.storage.local.get({lingvaLastWorkingInstance:''})).lingvaLastWorkingInstance;
  const instances=lingvaCandidates(base,saved),failedInBatch=new Set();
  for(let i=0;i<texts.length;i++){
    if(i) await sleep(300);
    const text=texts[i]; let translated='', lastError=null;
    for(const instance of instances){
      if(failedInBatch.has(instance)||!lingvaAvailable(instance)) continue;
      try{
        const url=`${instance}/api/v1/${source}/${target}/${encodeURIComponent(text)}`;
        const j=await fetchJson(url,{method:'GET',headers:{Accept:'application/json'}},'lingva',0,text.length,value=>{const error=lingvaResponseError(value);if(error)throw new Error(error);});
        translated=cleanTranslation(j?.translation||'');
        if(!translated) throw new Error('Lingva returned an empty translation');
        lingvaMarkSuccess(instance);
        await chrome.storage.local.set({lingvaLastWorkingInstance:instance});
        break;
      }catch(e){
        lastError=e;failedInBatch.add(instance);lingvaMarkFailure(instance,e?.httpStatus||0);
      }
    }
    out.push(translated);
    if(!translated && lastError) await telemetry({status:'error',lastError:String(lastError?.message||lastError)});
  }
  if(out.every(x=>!x)) throw new Error('No Lingva instance could translate. Run the connection test for details or select local LocalTranslator Studio.');
  return out;
}

async function translateStudio(texts,lang,base,target='en'){
  base=String(base||'http://localhost:5000').trim().replace(/\/+$/,'');
  const body={q:texts,source:lang,target,format:'text'};
  const j=await fetchJson(`${base}/translate`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  },'studio',1,texts.reduce((n,t)=>n+t.length,0));
  const t=j?.translatedText;
  const out=(Array.isArray(t)?t:[t]).map(cleanTranslation);
  if(out.length!==texts.length||out.some(x=>!x))throw new Error('LocalTranslator Studio returned incomplete translations');
  return out;
}

async function translateDeepL(texts,lang,key,target='en'){
  if(!key) throw new Error('DeepL API key is not configured');
  const free=/:fx$/i.test(key);
  const url=`https://${free?'api-free':'api'}.deepl.com/v2/translate`;
  const j=await fetchJson(url,{
    method:'POST',
    headers:{Authorization:`DeepL-Auth-Key ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({text:texts,...(lang==='auto'?{}:{source_lang:lang.toUpperCase()}),target_lang:target==='pt'?'PT-BR':target.toUpperCase()})
  },'deepl',1,texts.reduce((n,t)=>n+t.length,0));
  return (j?.translations||[]).map(x=>cleanTranslation(x.text||''));
}

async function callProvider(provider,texts,lang,s,target=s.targetLanguage||'en'){
  return serializeProvider(provider, async()=>{
    if(provider==='google'){
      if(!s.googleApiKey) throw new Error('Google API key is not configured');
      return translateGoogle(texts,lang,s.googleApiKey,target);
    }
    if(provider==='studio') return translateStudio(texts,lang,s.studioInstance,target);
    if(provider==='deepl') return translateDeepL(texts,lang,s.deeplApiKey,target);
    return translateLingva(texts,lang,s.lingvaInstance,target);
  });
}

function completeTranslation(source,value,lang,target='en'){return catalog.complete(source,value,lang,target);}

async function learn(pairs,target='en'){
  const s=await cfg(), learned={...(s.learnedExact||{})}, paired={...(s.learnedByPair||{})}, meta={...(s.learnedMeta||{})};
  let order=Array.isArray(meta.order)?meta.order.slice():[];
  for(const [src,dst,lang] of pairs){
    if(!src||!dst||src===dst) continue;
    const key=catalog.pairKey(lang,target,src);paired[key]=dst;
    if(target==='en'&&['zh','vi','th','ru'].includes(lang)){if(!(src in learned))order.push(src);learned[src]=dst;}
  }
  const MAX=8000;
  while(order.length>MAX){ const k=order.shift(); delete learned[k]; }
  meta.order=order;const keys=Object.keys(paired);while(keys.length>MAX)delete paired[keys.shift()];
  await chrome.storage.local.set({learnedExact:learned,learnedByPair:paired,learnedMeta:meta});
}

// Non-English destinations always use an English intermediate. Cache both legs.
async function translateViaEnglish(unique, mapping, settings, provider, target){
  const intermediate=new Array(unique.length), final=new Array(unique.length), errors=[];
  let charged=0, budgetError='';
  async function translate(entries,source,destination){
    const result=new Map(), missing=[];
    const current=await cfg();
    for(const text of new Set(entries)){
      const hit=catalog.learned(current,source,destination,text);
      if(completeTranslation(text,hit,source,destination))result.set(text,hit);
      else missing.push(text);
    }
    if(!missing.length)return result;
    const meta={...(current.learnedMeta||{})};
    if(meta.day!==today()){meta.day=today();meta.charsToday=0;}
    const chunks=missing.map(text=>catalog.splitText(text,1100));
    const outgoing=chunks.flat(), chars=outgoing.reduce((n,t)=>n+t.length,0);
    const budget=catalog.fallbackBudget(settings);
    if(budget&&meta.charsToday+chars>budget){budgetError=`Daily fallback budget reached (${meta.charsToday}/${budget})`;return result;}
    meta.charsToday+=chars;charged+=chars;
    await chrome.storage.local.set({learnedMeta:meta});
    const translated=[];
    for(let start=0;start<outgoing.length;start+=30){
      try{translated.push(...await callProvider(provider,outgoing.slice(start,start+30),source,settings,destination));}
      catch(e){errors.push(e.message);await noteFailure(provider,e.message,e.httpStatus||0);translated.push(...outgoing.slice(start,start+30).map(()=>''));}
    }
    let offset=0;const learned=[];
    missing.forEach((text,index)=>{
      const parts=chunks[index],values=translated.slice(offset,offset+parts.length);offset+=parts.length;
      if(parts.every((part,i)=>!/[\p{L}]/u.test(part)||completeTranslation(part,values[i],source,destination))){
        const value=values.map((v,i)=>v?parts[i].replace(parts[i].trim(),v.trim()):parts[i]).join('');
        if(completeTranslation(text,value,source,destination)){result.set(text,value);learned.push([text,value,source]);}
      }
    });
    if(learned.length)await learn(learned,destination);
    return result;
  }
  const groups=new Map();
  for(let i=0;i<unique.length;i++){
    const item=unique[i], cached=catalog.learned(settings,item.lang,target,item.text);
    if(completeTranslation(item.text,cached,item.lang,target)){final[i]=cached;continue;}
    if(item.lang===target){final[i]=item.text;continue;}
    if(item.lang==='en')intermediate[i]=item.text;
    else if(completeTranslation(item.text,item.english,item.lang,'en'))intermediate[i]=item.english;
    else {if(!groups.has(item.lang))groups.set(item.lang,[]);groups.get(item.lang).push(i);}
  }
  for(const [source,indices] of groups){
    const values=await translate(indices.map(i=>unique[i].text),source,'en');
    indices.forEach(i=>intermediate[i]=values.get(unique[i].text)||'');
  }
  const englishTexts=intermediate.filter(Boolean);
  const values=budgetError?new Map():await translate(englishTexts,'en',target);
  const learned=[];
  intermediate.forEach((english,i)=>{
    const value=values.get(english);
    if(value&&completeTranslation(unique[i].text,value,unique[i].lang,target)){
      final[i]=value;learned.push([unique[i].text,value,unique[i].lang]);
    }
  });
  if(learned.length)await learn(learned,target);
  const latest=await cfg();
  return {ok:!budgetError,error:budgetError||errors[0]||'',providerFailed:errors.length>0&&!final.some(Boolean),
    translations:mapping.map(i=>final[i]||''),intermediate:mapping.map(i=>intermediate[i]||''),
    apiChars:charged,charsToday:latest.learnedMeta?.charsToday||0,provider,telemetry:await telemetry()};
}

chrome.runtime.onMessage.addListener((msg,_sender,send)=>{
  if(msg?.type==='SPT_CLEAR_COOLDOWN'){lingvaCircuit.clear();send({ok:true});return false;}
  if(msg?.type==='SPT_HYBRID_BATCH'){
    serializeProvider('learning-batch',async()=>{
      try{
        const s=await cfg();
        if(!s.hybridEnabled) throw new Error('Hybrid fallback is disabled');

        const provider=s.hybridProvider||'studio', target=catalog.normalize(s.targetLanguage||'en');
        if(!catalog.names[target])throw new Error('Unsupported target language');
        const d=today(), meta={...(s.learnedMeta||{})};
        if(meta.day!==d){ meta.day=d; meta.charsToday=0; }

        // Deduplicate before provider calls. The response is still mapped back
        // to every original item so callers keep the same batch contract.
        if(!Array.isArray(msg.items)||msg.items.length>30||msg.items.some(x=>!x||typeof x.text!=='string'||!x.text.trim()||x.text.includes('\0')||x.text.length>1200))throw new Error('Invalid translation batch');
        const raw=msg.items;
        const unique=[], keyToUnique=new Map(), originalToUnique=[];
        for(const x of raw){
          const lang=catalog.normalize(x.lang||'auto');
          if(lang!=='auto'&&!catalog.names[lang])throw new Error('Unsupported source language');
          const key=`${lang}\0${x.text}`;
          let u=keyToUnique.get(key);
          if(u===undefined){ u=unique.length; keyToUnique.set(key,u); unique.push({text:x.text,lang,english:typeof x.english==='string'&&x.english.length<=64000?x.english:''}); }
          originalToUnique.push(u);
        }

        if(target!=='en'){send(await translateViaEnglish(unique,originalToUnique,s,provider,target));return;}

        const uniqueOut=new Array(unique.length), missing=[];
        for(let i=0;i<unique.length;i++){
          const hit=catalog.learned(s,unique[i].lang,target,unique[i].text);
          if(completeTranslation(unique[i].text,hit,unique[i].lang,target)) uniqueOut[i]=hit;
          else missing.push([i,unique[i]]);
        }

        const chars=missing.reduce((a,[,x])=>a+x.text.length,0);
        const budget=catalog.fallbackBudget(s);
        if(chars&&budget&&meta.charsToday+chars>budget)
          throw new Error(`Daily fallback budget reached (${meta.charsToday}/${budget})`);

        // Reserve the budget BEFORE I/O, including failed provider calls.
        meta.charsToday+=chars;
        await chrome.storage.local.set({learnedMeta:meta});
        const groups=new Map();
        for(const [i,x] of missing){
          if(!groups.has(x.lang)) groups.set(x.lang,[]);
          groups.get(x.lang).push([i,x]);
        }

        const pairs=[],providerErrors=[];
        for(const [l,g] of groups){
          let tr;
          try{tr=await callProvider(provider,g.map(([,x])=>x.text),l,s);}catch(e){providerErrors.push(e.message);await noteFailure(provider,e.message,e.httpStatus||0);continue;}
          let incomplete=false;
          g.forEach(([idx,x],k)=>{
            const candidate=cleanTranslation(tr[k]||'');
            const translated=completeTranslation(x.text,candidate,l,target)?candidate:'';
            if(candidate&&!translated)incomplete=true;
            uniqueOut[idx]=translated;
            if(translated && translated!==x.text) pairs.push([x.text,translated,l]);
          });
          if(incomplete)await noteFailure(provider,'Incomplete translation: source characters remain, text is unchanged, or the file extension was lost');
        }

        const successfulChars=pairs.reduce((n,[src])=>n+src.length,0);

        if(pairs.length) await learn(pairs,target);

        const out=originalToUnique.map(i=>uniqueOut[i]||'');
        const tel=await telemetry();
        send({ok:true,providerFailed:providerErrors.length>0&&pairs.length===0,error:providerErrors.length?providerErrors[0]:'',translations:out,apiChars:successfulChars,charsToday:meta.charsToday,provider,telemetry:tel});
      }catch(e){
        const tel=await telemetry();
        send({ok:false,error:String(e?.message||e),telemetry:tel});
      }
    }).catch(e=>send({ok:false,error:e.message}));
    return true;
  }

  if(msg?.type==='SPT_HYBRID_STATUS'){
    (async()=>{
      const s=await cfg();
      send({ok:true,telemetry:s.hybridTelemetry||DEFAULTS.hybridTelemetry});
    })();
    return true;
  }


  if(msg?.type==='SPT_LOCAL_DICTIONARY'){
    (async()=>{const target=catalog.normalize(msg.target);if(!catalog.names[target])throw new Error('Unsupported local dictionary target');
      const response=await fetch(chrome.runtime.getURL('dictionaries/pairs/'+target+'.json'));if(!response.ok)throw new Error('Local dictionary could not be read');
      const dictionary=await response.json();send({ok:true,target,dictionary});
    })().catch(error=>send({ok:false,error:error.message}));return true;
  }

  if(msg?.type==='SPT_HYBRID_DIAGNOSE'){
    (async()=>{
      const s=await cfg();
      const provider=s.hybridProvider||'studio';
      const source=catalog.normalize(s.sourceLanguage||'auto'),target=catalog.normalize(s.targetLanguage||'en');
      const samples={en:'Hello',pt:'Olá',es:'Hola',fr:'Bonjour',ja:'こんにちは',zh:'你好',vi:'Xin chào',th:'สวัสดี',ru:'Здравствуйте'};
      const text=samples[source]||(target==='zh'?'Hello':'你好');
      let diagnostics=null;
      if(provider==='lingva') diagnostics=await lingvaDiagnostics(s.lingvaInstance,source,target,text);
      else {
        const base=String(s.studioInstance||'http://localhost:5000').replace(/\/+$/,'');
        const health=provider==='studio'?await diagnosticFetch(`${base}/languages`):{ok:true,httpStatus:0,durationMs:0};
        const languages=Array.isArray(health.json)?health.json.map(x=>({code:x.code,targets:x.targets||[]})):[];
        delete health.json;health.count=languages.length;
        let translation;
        const start=performance.now();
        try{if(provider==='studio'&&languages.length){const from=languages.find(l=>catalog.normalize(l.code)===source);if(!languages.some(l=>catalog.normalize(l.code)===target))throw new Error('LocalTranslator Studio has no installed model for '+catalog.names[target]+'. Open the Studio Models page and install the required language.');if(source!=='auto'&&(!from||(from.targets.length&&!from.targets.some(l=>catalog.normalize(l)===target))))throw new Error('LocalTranslator Studio does not support the selected language pair: '+source+' → '+target);}
        const out=await callProvider(provider,[text],source,s,target);translation={ok:completeTranslation(text,out[0],source,target),translation:out[0],httpStatus:200,durationMs:Math.round(performance.now()-start)};}
        catch(e){translation={ok:false,error:e.message,httpStatus:e.httpStatus||0,durationMs:Math.round(performance.now()-start)};}
        diagnostics={health,translation,languages};
      }
      Object.assign(diagnostics,{source,target,text});
      send({ok:true,provider,diagnostics});
    })().catch(e=>send({ok:false,error:String(e?.message||e)}));
    return true;
  }

  if(msg?.type==='SPT_EXPORT_LEARNED'){
    (async()=>{
      const s=await cfg();
      const blob='data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify({version:5,exportedAt:new Date().toISOString(),entries:s.learnedExact||{},pairs:s.learnedByPair||{}},null,2));
      await chrome.downloads.download({url:blob,filename:'hybrid-web-translator-learned-dictionary.json',saveAs:true});
      send({ok:true});
    })().catch(e=>send({ok:false,error:String(e)}));
    return true;
  }
});
