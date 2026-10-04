(() => {
'use strict';
const catalog=globalThis.SPT_Languages, LANGS=catalog.dictionaries;
const BASE=Object.fromEntries(LANGS.map(l=>[l,globalThis['SPT_'+l.toUpperCase()]||{}]));
const DOMAIN=Object.fromEntries(LANGS.map(l=>[l,globalThis['SPT_DOMAIN_'+l.toUpperCase()]||{}]));
const LOCAL_PAIRS={},LOCAL_PAIR_COUNTS={},pairLoads=new Map();
let engine=new SPT_Engine(BASE,DOMAIN,LOCAL_PAIRS),enabled=true,hybridEnabled=false,learned={},paired={},sourceLanguage='auto',targetLanguage='en',generation=0;
const records=new WeakMap(),attributes=new WeakMap(),pending=new Set(),activeRecords=new Set(),scans=new Set(),queue=new Map(),failures=new Map();
let timer=0,hybridTimer=0,busy=false,observer,detectedCounts={},paused=false,lastError='',lastWarning='';
const SKIP='script,style,noscript,code,pre,textarea,canvas,svg,math,select,option,[contenteditable]:not([contenteditable="false"]),[translate="no"],.notranslate,a[href*="mod=space"][href*="uid="],a[href*="space-uid-"]';
const settings={enabled:true,hybridEnabled:false,sourceLanguage:'auto',targetLanguage:'en',learnedExact:{},learnedByPair:{},...Object.fromEntries(LANGS.map(l=>['custom'+l[0].toUpperCase()+l.slice(1),{}]))};
async function loadLocalPairs(target){
 if(!pairLoads.has(target))pairLoads.set(target,chrome.runtime.sendMessage({type:'SPT_LOCAL_DICTIONARY',target}).then(response=>{if(response?.ok&&response.dictionary&&typeof response.dictionary==='object'){LOCAL_PAIRS[target]=response.dictionary;LOCAL_PAIR_COUNTS[target]=Object.values(response.dictionary).reduce((n,terms)=>n+Object.keys(terms).length,0);for(const old of pairLoads.keys())if(pairLoads.size>3&&old!==target&&old!=='en'){pairLoads.delete(old);delete LOCAL_PAIRS[old];delete LOCAL_PAIR_COUNTS[old];}}else pairLoads.delete(target);}).catch(error=>{pairLoads.delete(target);console.debug('Local dictionary unavailable',error);}));
 await pairLoads.get(target);
}
function blocked(el){return !el||!!el.closest(SKIP);}
function rememberFailure(source){failures.set(source,Date.now()+30000);if(failures.size>2000)failures.delete(failures.keys().next().value);}
const FILE_LABEL='[class*="file-name"],[class*="item-title-text"]';
function filenameOptions(node){return {filename:!!(node.nodeType===1?node:node.parentElement)?.closest(FILE_LABEL)};}
function languageFor(text,node){
 const hint=(node.nodeType===1?node:node.parentElement)?.closest('[lang]')?.getAttribute('lang')||document.documentElement.lang;
 const detected=engine.language(text,hint);
 if(sourceLanguage!=='auto'&&catalog.scripts[sourceLanguage]&&!catalog.scripts[sourceLanguage].test(text))return null;
 if(!detected&&/^[\x00-\x7f]+$/.test(text)&&(text.match(/[A-Za-z]{3,}/g)||[]).length<2)return null;
 const lang=sourceLanguage==='auto'?detected:sourceLanguage;
 if(lang&&lang!=='auto')detectedCounts[lang]=(detectedCounts[lang]||0)+1;
 if(lang===targetLanguage)return null;
 if(lang)return lang;
 // With no local evidence, ask the provider to detect sentences only; avoid IDs and URL-only strings.
 return hybridEnabled&&/\p{L}/u.test(text)&&text.trim().split(/\s+/).length>=3?'auto':null;
}
function cached(r){return paired[catalog.pairKey(sourceLanguage,targetLanguage,r.source)]||(targetLanguage==='en'&&['zh','vi','th','ru'].includes(r.lang)?learned[r.source.trim()]:'')||'';}
function fragmentValue(text,lang){return paired[catalog.pairKey(sourceLanguage,targetLanguage,text)]||(targetLanguage==='en'&&['zh','vi','th','ru'].includes(lang)?learned[text.trim()]:'')||'';}
function pipeline(r){
 let english=paired[catalog.pairKey(sourceLanguage,'en',r.source)]||(['zh','vi','th','ru'].includes(r.lang)?learned[r.source.trim()]:'')||'';
 if(!english&&r.fragments&&r.fragments.every(f=>! /\p{L}/u.test(f.text)||engine.acceptable(f.text,f.english,r.lang,'en')))english=r.fragments.map(f=>f.text.replace(f.text.trim(),(f.english||f.text).trim())).join('');
 return engine.pipeline(r.source,r.lang,targetLanguage,{...filenameOptions(r.node),english});
}
function local(r){
 const result=pipeline(r);if(result.complete)return result.text.trim();
 const value=cached(r);if(engine.acceptable(r.source,value,r.lang,targetLanguage))return value.trim();
 if(r.fragments){const values=r.fragments.map(f=>f.value||fragmentValue(f.text,r.lang));if(values.every((v,i)=>! /\p{L}/u.test(r.fragments[i].text)||engine.acceptable(r.fragments[i].text,v,sourceLanguage,targetLanguage)))return r.fragments.map((f,i)=>f.text.replace(f.text.trim(),values[i].trim())).join('').trim();}
 return result.text.trim();
}
function enqueue(record){const source=record.source.trim();if(!hybridEnabled||paused)return;
 const result=pipeline(record);
 if(result.complete||engine.acceptable(source,cached(record),record.lang,targetLanguage))return;
 if(record.fragments&&record.fragments.every(f=>! /\p{L}/u.test(f.text)||engine.acceptable(f.text,f.value||fragmentValue(f.text,record.lang),sourceLanguage,targetLanguage)))return;
 if(targetLanguage==='en'&&source.length<=1200&&!engine.needsFallback(source,record.applied.trim(),record.lang))return;
 if(!/\p{L}/u.test(source)||source.length<1)return;
 if(source.length>64000){lastError='A text block exceeds 64,000 characters and was skipped.';return;}
 if(!record.fragments)record.fragments=catalog.splitText(source).map(text=>({text,record,value:''}));
 for(const fragment of record.fragments){const text=fragment.text.trim();if(!text||! /\p{L}/u.test(text)){fragment.value=fragment.text;continue;}const value=fragment.value||fragmentValue(text,record.lang);if(engine.acceptable(text,value,sourceLanguage,targetLanguage)){fragment.value=value;continue;}if((failures.get(text)||0)>Date.now())continue;
 let job=queue.get(text);if(!job){if(queue.size>=1000)break;job={text,lang:sourceLanguage,target:targetLanguage,fragments:new Set()};queue.set(text,job);}job.fragments.add(fragment);}
 if(!hybridTimer&&!busy&&queue.size)hybridTimer=setTimeout(flushHybrid,150);
}
function refill(){for(const r of activeRecords){if(!r.node.isConnected){activeRecords.delete(r);continue;}if(queue.size>=1000)break;enqueue(r);}}
function current(r){return r.attr?r.node.getAttribute(r.attr):r.node.nodeValue;}
function apply(r,text){if(!enabled||!r.node.isConnected||current(r)!==r.applied)return;const lead=r.source.match(/^\s*/)[0],trail=r.source.match(/\s*$/)[0];r.applied=lead+text+trail;if(r.attr)r.node.setAttribute(r.attr,r.applied);else r.node.nodeValue=r.applied;}
async function flushHybrid(){hybridTimer=0;if(!enabled||!hybridEnabled||paused||busy||!queue.size)return;busy=true;const epoch=generation,batch=[...queue.values()].slice(0,12);for(const job of batch)queue.delete(job.text);
 try{const response=await chrome.runtime.sendMessage({type:'SPT_HYBRID_BATCH',target:targetLanguage,items:batch.map(job=>{const fragment=[...job.fragments][0],mid=engine.pipeline(job.text,fragment.record.lang,targetLanguage,{...filenameOptions(fragment.record.node),english:paired[catalog.pairKey(job.lang,'en',job.text)]||fragment.english});return {text:job.text,lang:job.lang,...(mid.englishComplete?{english:mid.english}:{})};})});
 if(epoch===generation&&enabled&&hybridEnabled){let successes=0;const touched=new Set();batch.forEach((job,i)=>{const mid=response?.intermediate?.[i];if(engine.acceptable(job.text,mid,job.lang,'en')){paired[catalog.pairKey(job.lang,'en',job.text)]=mid;for(const f of job.fragments){f.english=mid;touched.add(f.record);}}const value=response?.ok?response.translations?.[i]:'';if(engine.acceptable(job.text,value,job.lang,job.target)){successes++;paired[catalog.pairKey(job.lang,job.target,job.text)]=value;for(const f of job.fragments){f.value=value;touched.add(f.record);}}else rememberFailure(job.text);});for(const r of touched)apply(r,local(r));
 if(!response?.ok||response.providerFailed){paused=true;lastError=response?.error||response?.telemetry?.lastError||'The translation service is unavailable. Check the server, language models and daily limit, then retry.';}else if(!successes){lastWarning='Some text returned no complete translation. Other page text will continue processing.';}}
 }catch(e){if(epoch===generation){for(const job of batch)rememberFailure(job.text);paused=true;lastError=e.message;}}
 finally{busy=false;if(epoch===generation&&!paused&&enabled&&hybridEnabled){refill();if(queue.size&&!hybridTimer)hybridTimer=setTimeout(flushHybrid,300);}}}
function processText(node){if(!enabled||blocked(node.parentElement)||!node.nodeValue?.trim())return;let r=records.get(node);const value=node.nodeValue;
 if(r&&value===r.applied){enqueue(r);return;}
 if(r)activeRecords.delete(r);const l=languageFor(value,node);if(!l)return;r={node,source:value,applied:value,lang:l};records.set(node,r);activeRecords.add(r);const translation=local(r);apply(r,translation);enqueue(r);}
function processAttrs(el){if(blocked(el))return;let saved=attributes.get(el);if(!saved)attributes.set(el,saved=new Map());for(const attr of ['title','placeholder','aria-label',...(el.tagName==='IMG'?['alt']:[]),...(el.tagName==='INPUT'&&['button','submit','reset'].includes(el.type)?['value']:[])]){
 const value=el.getAttribute(attr);if(!value)continue;let r=saved.get(attr);if(r&&value===r.applied){enqueue(r);continue;}if(r)activeRecords.delete(r);const l=languageFor(value,el);if(!l)continue;r={node:el,attr,source:value,applied:value,lang:l};saved.set(attr,r);activeRecords.add(r);apply(r,local(r));enqueue(r);}}
function scan(root){if(!enabled||!root?.isConnected)return;const token={};scans.add(token);const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode(n){return n.nodeType===1&&blocked(n)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});let node=root;const epoch=generation;
 function chunk(deadline){if(!enabled||epoch!==generation){scans.delete(token);return;}let count=0;const limit=deadline?.didTimeout?40:180;while(node&&count++<limit){if(node.nodeType===3)processText(node);else if(node.nodeType===1)processAttrs(node);node=walker.nextNode();if(deadline&&!deadline.didTimeout&&deadline.timeRemaining()<1)break;}if(node)idle(chunk);else scans.delete(token);}
 idle(chunk);}
function idle(fn){if(window.requestIdleCallback)requestIdleCallback(fn,{timeout:150});else setTimeout(()=>fn(null),0);}
function flush(){timer=0;if(document.hidden)return;const roots=[...pending];pending.clear();for(const root of roots)if(root.isConnected&&!roots.some(other=>other!==root&&other.contains?.(root)))scan(root);}
function schedule(root){if(!root)return;pending.add(root);if(!timer)timer=setTimeout(flush,80);}
function observe(){observer?.disconnect();observer=new MutationObserver(changes=>{if(!enabled)return;for(const m of changes){if(m.type==='childList')for(const n of m.addedNodes)schedule(n);else if(m.type==='characterData'){if(records.get(m.target)?.applied!==m.target.nodeValue)schedule(m.target);}else{const r=attributes.get(m.target)?.get(m.attributeName);if(r?.applied!==m.target.getAttribute(m.attributeName))schedule(m.target);}}});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label','value','alt']});}
function restore(){observer?.disconnect();activeRecords.clear();const w=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let n=document.documentElement;do{if(n.nodeType===3){const r=records.get(n);if(r&&n.nodeValue===r.applied)n.nodeValue=r.source;records.delete(n);}else{const saved=attributes.get(n);if(saved)for(const r of saved.values())if(current(r)===r.applied)n.setAttribute(r.attr,r.source);attributes.delete(n);}}while((n=w.nextNode()));observe();}
async function configure(rebuild=false){const s=await chrome.storage.local.get(rebuild?settings:{enabled:true,hybridEnabled:false,sourceLanguage:'auto',targetLanguage:'en',learnedExact:{},learnedByPair:{}}),wasEnabled=enabled;generation++;detectedCounts={};paused=false;lastError='';lastWarning='';enabled=!!s.enabled;hybridEnabled=!!s.hybridEnabled;learned=s.learnedExact||{};paired=s.learnedByPair||{};sourceLanguage=catalog.normalize(s.sourceLanguage);targetLanguage=catalog.normalize(s.targetLanguage);if(sourceLanguage!=='auto'&&!catalog.names[sourceLanguage])sourceLanguage='auto';if(!catalog.names[targetLanguage])targetLanguage='en';queue.clear();failures.clear();clearTimeout(hybridTimer);hybridTimer=0;
 // Restore owned DOM values before rebuilding, including labels already translated into English.
 if(wasEnabled)restore();if(rebuild){const dicts=Object.fromEntries(LANGS.map(l=>{const custom=s['custom'+l[0].toUpperCase()+l.slice(1)]||{};return [l,Object.keys(custom).length?{...BASE[l],...custom}:BASE[l]];}));const trusted=Object.fromEntries(LANGS.map(l=>[l,{...DOMAIN[l],...(s['custom'+l[0].toUpperCase()+l.slice(1)]||{})}]));engine=new SPT_Engine(dicts,trusted,LOCAL_PAIRS);}const epoch=generation,destination=targetLanguage;if(enabled){await loadLocalPairs('en');if(epoch!==generation)return;if(destination!=='en')await loadLocalPairs(destination);if(epoch===generation&&enabled)schedule(document.documentElement);}}
let configTimer,needsIndexRebuild=false;
chrome.storage.onChanged.addListener((changes,area)=>{if(area!=='local')return;
 const reconfigure=Object.keys(settings).filter(k=>!['learnedExact','learnedByPair'].includes(k)).some(k=>k in changes)||['hybridProvider','studioInstance','lingvaInstance','googleApiKey','deeplApiKey','dailyCharBudget'].some(k=>k in changes);
 if(reconfigure){needsIndexRebuild ||= Object.keys(changes).some(k=>k.startsWith('custom'));clearTimeout(configTimer);configTimer=setTimeout(()=>{const rebuild=needsIndexRebuild;needsIndexRebuild=false;configure(rebuild).catch(console.debug);},60);}
 else{if(changes.learnedExact)learned=changes.learnedExact.newValue||{};if(changes.learnedByPair)paired=changes.learnedByPair.newValue||{};if(changes.learnedExact||changes.learnedByPair)for(const r of activeRecords){const value=local(r);if(engine.acceptable(r.source,value,r.lang,targetLanguage))apply(r,value);}}
});
function coverage(){let translated=0,untranslated=0,partiallyTranslated=0;for(const r of activeRecords){if(!r.node.isConnected){activeRecords.delete(r);continue;}const result=pipeline(r),saved=cached(r),fragmentComplete=r.fragments?.every(f=>! /\p{L}/u.test(f.text)||engine.acceptable(f.text,f.value||fragmentValue(f.text,r.lang),sourceLanguage,targetLanguage));if((result.complete&&r.applied.trim()===result.text.trim())||(saved&&saved.trim()===r.applied.trim()&&engine.acceptable(r.source,saved,r.lang,targetLanguage))||(fragmentComplete&&engine.acceptable(r.source,r.applied,r.lang,targetLanguage)))translated++;else{untranslated++;if(r.applied.trim()!==r.source.trim())partiallyTranslated++;}}return {translated,untranslated,partiallyTranslated,pending:queue.size,scanning:scans.size>0||pending.size>0,busy,paused,lastError,lastWarning};}
chrome.runtime.onMessage.addListener((msg,_sender,send)=>{if(msg.type==='SPT_STATS'){send({...coverage(),enabled,hybridEnabled,sourceLanguage,targetLanguage,detectedLanguage:Object.entries(detectedCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'',learned:catalog.learnedCount({learnedByPair:paired,learnedExact:learned}),cache:engine.cache.size,...engine.counts,localPairs:LOCAL_PAIR_COUNTS[targetLanguage]||0,englishPairs:LOCAL_PAIR_COUNTS.en||0,translationRoute:targetLanguage==='en'?'Source → English':'Source → English → '+catalog.names[targetLanguage],engine:'Hybrid phrase engine 5.2.1'});return false;}if(msg.type==='SPT_SET'){chrome.storage.local.set({enabled:!!msg.enabled}).then(()=>send({ok:true}));return true;}if(msg.type==='SPT_RETRY'){configure(false).then(()=>send({ok:true}));return true;}if(['SPT_CONFIG_CHANGED','SPT_RELOAD_DICT'].includes(msg.type)){configure(true).then(()=>send({ok:true}),e=>send({ok:false,error:e.message}));return true;}return false;});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&enabled)schedule(document.documentElement);});
observe();configure(true).catch(console.debug);
})();
