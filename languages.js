/* Shared routing and validation for the popup, content engine and background worker. */
(() => {
'use strict';
const names={en:'English',pt:'Portuguese (Brazil)',es:'Spanish',fr:'French',ja:'Japanese',zh:'Chinese',vi:'Vietnamese',th:'Thai',ru:'Russian'};
const dictionaries=['zh','vi','th','ru','pt','es','fr','ja'];
function normalize(code){const value=String(code||'').toLowerCase().replace('_','-');if(['ptbr','pt-br','pt-pt'].includes(value))return 'pt';if(value.startsWith('zh'))return 'zh';return value.split('-')[0];}
function pairKey(source,target,text){return normalize(source)+'>'+normalize(target)+'\0'+text.trim();}
const scripts={zh:/\p{Script=Han}/u,ja:/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u,th:/\p{Script=Thai}/u,ru:/\p{Script=Cyrillic}/u};
const vi=/[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữựỳýỵỷỹ]/iu;
function residual(text,source,target='en'){
 let visible=String(text).replace(/https?:\/\/[^\s<>"'【】\[\]]+/gi,'');source=normalize(source);target=normalize(target);
 if(source===target)return false;
 if(source==='vi')return target==='en'&&vi.test(visible);
 if(source==='auto'&&target==='en'&&/[đăơưạảầấậẩẫằắặẳẵềếệểễỉĩọỏồốộổỗờớợởỡụủừứựửữỵỷỹ]/iu.test(visible))return true;
 if(source==='auto'&&target==='zh')visible=visible.replace(/\p{Script=Han}/gu,'');
 if(source==='auto')return Object.entries(scripts).some(([l,re])=>l!==target&&!(l==='zh'&&target==='ja')&&re.test(target==='ja'?visible.replace(/\p{Script=Han}/gu,''):visible));
 if(source==='ja'&&target==='zh')visible=visible.replace(/\p{Script=Han}/gu,'');
 if(source==='zh'&&target==='ja')return false;
 return !!scripts[source]?.test(visible);
}
function suffix(text){return String(text).trim().match(/\.(?:tar\.(?:gz|bz2|xz)|7z|zip|rar|tar|tgz|gz|bz2|xz|exe|msi|apk|iso|txt|pdf|docx?|xlsx?|pptx?|mp[34]|mkv|png|jpe?g|webp|gif)$/i)?.[0]||'';}
function complete(source,value,lang,target='en'){if(typeof value!=='string'||!value.trim()||value.trim()===source.trim()||residual(value,lang,target))return false;const ext=suffix(source);return !ext||value.trim().endsWith(ext);}
function learned(state,source,target,text){return state.learnedByPair?.[pairKey(source,target,text)]||(target==='en'&&['zh','vi','th','ru'].includes(source)?state.learnedExact?.[text.trim()]:'')||'';}
function splitText(text,max=1100){const parts=[];let rest=text;while(rest.length>max){let end=max;const prefix=rest.slice(0,max),matches=[...prefix.matchAll(/[。！？.!?;；\n]\s*|\s+/g)];const boundary=matches.filter(m=>m.index+m[0].length>=max/2).at(-1);if(boundary)end=boundary.index+boundary[0].length;if(/[\uD800-\uDBFF]/.test(rest[end-1]))end--;parts.push(rest.slice(0,end));rest=rest.slice(end);}if(rest)parts.push(rest);return parts;}
function localStudio(state){
 if(state.hybridProvider!=='studio')return false;
 try{const url=new URL(state.studioInstance||'http://localhost:5000');return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&['localhost','127.0.0.1','[::1]'].includes(url.hostname.toLowerCase());}catch{return false;}
}
function fallbackBudget(state){return localStudio(state)?0:Math.max(0,Number(state.dailyCharBudget)||0);}
function learnedCount(state){const paired=Object.keys(state.learnedByPair||{}),english=new Set(paired.filter(k=>k.split('\0')[0].endsWith('>en')).map(k=>k.split('\0')[1]));return paired.length+Object.keys(state.learnedExact||{}).filter(k=>!english.has(k)).length;}
async function loadSettings(storage,defaults){
 const state=await storage.get(defaults);
 if(!['studio','lingva','google','deepl'].includes(state.hybridProvider)){
  const previous=await storage.get(null),patch={hybridProvider:'studio'};
  const obsoleteAddress=Object.entries(previous).find(([key,value])=>key.endsWith('Instance')&&!['studioInstance','lingvaInstance'].includes(key)&&typeof value==='string');
  const address=previous.studioInstance||obsoleteAddress?.[1];
  if(address){try{const url=new URL(address);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)patch.studioInstance=address;}catch{}}
  await storage.set(patch);
  const obsoleteKeys=Object.keys(previous).filter(key=>key.endsWith('Instance')&&!['studioInstance','lingvaInstance'].includes(key)||key.endsWith('ApiKey')&&!['googleApiKey','deeplApiKey'].includes(key));
  if(obsoleteKeys.length&&storage.remove)await storage.remove(obsoleteKeys);
  Object.assign(state,patch);
 }
 return state;
}
globalThis.SPT_Languages={loadSettings,localStudio,fallbackBudget,splitText,learnedCount,names,dictionaries,normalize,pairKey,scripts,residual,suffix,complete,learned};
})();
