/* Local phrase engine. Indexes are built lazily per language, never per node. */
(() => {
'use strict';
const catalog=globalThis.SPT_Languages, scripts=catalog.scripts;
const latin=['vi','pt','es','fr'];
const vietnamese=/[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữựỳýỵỷỹ]/iu;
const letter=/[\p{L}\p{N}_]/u;
class Engine {
 constructor(dicts,trusted=dicts,pairs={}){this.pairs=pairs;this.dicts=dicts;this.counts=Object.fromEntries(Object.entries(dicts).map(([language,terms])=>[language,Object.keys(terms).length]));this.trusted=trusted;this.trustedIndexes=new Map();this.indexes=new Map();this.safeIndexes=new Map();this.destinations=new Map();this.proseIndexes=new Map();this.proseCompleteness=new Map();this.cache=new Map();}
 usable(key,value,l){
  if(typeof value!=='string'||!value.trim())return false;
  if(scripts[l]&&!scripts[l].test(key))return false;
  if(Object.hasOwn(this.trusted[l]||{},key))return true;
  // General glosses are lexical references, not ready-made UI translations.
  if((l==='zh'||l==='th'||l==='ja')&&Array.from(key).length<2)return false;
  if(l==='vi'&&!vietnamese.test(key))return false;
  if(/[;:(),|\[\]{}]/.test(value)||value.length>45||value.split(/\s+/).length>5)return false;
  if(/^(?:see |variant |surname |[Aa]n? |[Tt]he |[Aa]lternative |[Aa]bbreviation |[Rr]omanization )/.test(value))return false;
  if(/\b(?:province|prefecture|surname|county|district|pinyin|romanization|spelling|form of|plural of)\b/i.test(value))return false;
  return !/[^\u0000-\u007f]/.test(value);
 }
 language(text,hint=''){
  hint=catalog.normalize(hint);const body=text.trim().normalize('NFC').toLowerCase();
  if(/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text))return 'ja';
  if(scripts.zh.test(text)){if(hint==='ja')return 'ja';if(hint==='zh')return 'zh';if(this.trustedIndex('ja').has(body)&&!this.trustedIndex('zh').has(body))return 'ja';return 'zh';}
  for(const l of ['th','ru'])if(scripts[l].test(text))return l;
  const hits=latin.filter(l=>this.trustedIndex(l).has(body));if(hits.length===1)return hits[0];if(hits.includes(hint))return hint;
  if(/^(?:search|download|upload|settings|home|files?|games?|open|close|cancel|confirm|help|save|log in|log out)$/i.test(body))return 'en';
  const profiles={pt:'não você vocês arquivo arquivos pasta pastas senha configurações baixar pesquisar obrigado olá português uma meu meus minha minhas',es:'usted ustedes archivo archivos carpeta carpetas contraseña descargar buscar gracias hola español una mis pero los las el',fr:'vous fichier fichiers dossier dossiers télécharger rechercher merci bonjour français une des les avec pour mot passe',vi:'tải miễn phí người máy không nhắn đăng nhập trả lời'};
  const words=body.match(/[\p{L}]+/gu)||[],scores=Object.entries(profiles).map(([l,terms])=>[l,words.reduce((n,w)=>n+(terms.split(' ').includes(w)?1:0),0)]).sort((a,b)=>b[1]-a[1]);
  if(scores[0][1]>0&&scores[0][1]>(scores[1]?.[1]||0))return scores[0][0];
  if(/[đăơưạảầấậẩẫằắặẳẵềếệểễỉĩọỏồốộổỗờớợởỡụủừứựửữỵỷỹ]/iu.test(text))return 'vi';
  if(/[ñ¿¡]/i.test(text))return 'es';
  if([...latin,'en'].includes(hint)&&/\p{L}/u.test(text))return hint;
  return null;
 }
 trustedIndex(l){if(!this.trustedIndexes.has(l)){const map=new Map();for(const [key,value]of Object.entries(this.trusted[l]||{}))map.set(key.normalize('NFC').toLowerCase(),{key,value});this.trustedIndexes.set(l,map);}return this.trustedIndexes.get(l);}
 index(l,trustedOnly=false){const indexes=trustedOnly?this.safeIndexes:this.indexes;if(indexes.has(l))return indexes.get(l);const index=new Map(),normalized=new Map();for(const [key,value]of Object.entries(trustedOnly?{}:(this.dicts[l]||{})))normalized.set(key.normalize('NFC').toLowerCase(),{key,value});for(const [k,pair]of this.trustedIndex(l))normalized.set(k,pair);for(const [k,{key,value}]of normalized){if(!key||!this.usable(key,value,l))continue;const first=k[0];if(!index.has(first))index.set(first,[]);index.get(first).push([k,value]);}for(const bucket of index.values())bucket.sort((a,b)=>b[0].length-a[0].length);indexes.set(l,index);return index;}
 filename(text){return !!catalog.suffix(text);}
 residual(text,l,target='en'){return catalog.residual(text,l,target);}
 acceptable(source,value,l=this.language(source),target='en'){return catalog.complete(source,value,l,target);}
 resolve(text,learned,options={}){
  // Complete curated phrases beat old learned values, including old English mistakes.
  const l=options.language||this.language(text,options.hint),curated=this.translate(text,l,{...options,trustedOnly:true});
  if(this.acceptable(text,curated,l))return curated;
  if(this.acceptable(text,learned,l))return text.replace(text.trim(),learned.trim());
  return this.translate(text,l,options);
 }
 pair(text,source,target){
  const table=this.pairs[target]?.[source];if(!table)return '';
  const body=text.trim().normalize('NFC'),key=body.toLowerCase();
  const value=Object.hasOwn(table,key)?table[key]:'';if(value)return text.replace(text.trim(),value);
  const parts=body.match(/^(.*?)(\s*(?:\([\d,]+\)|[\d,:. /-]+))$/);
  if(parts&&Object.hasOwn(table,parts[1].toLowerCase()))return text.replace(text.trim(),table[parts[1].toLowerCase()]+parts[2]);
  return '';
 }
 referenceEnglish(text,source){
  const body=text.trim(),dict=this.dicts[source]||{},value=dict[body]||dict[body.normalize('NFC').toLowerCase()];
  if(typeof value!=='string')return [];
  return value.split(';').slice(0,3).map(v=>v.replace(/^to /,'').trim()).filter(v=>this.usable(body,v,source)).map(v=>text.replace(body,v));
 }
 knownIdentity(text,source,target,options={}){if(options.filename||this.filename(text))return false;const value=this.pair(text,source,target);return !!value&&value.trim()===text.trim();}
 route(text,source,target,options={}){
  if(source===target)return text;
  const filename=!!options.filename||this.filename(text),curated=this.translate(text,source,{...options,trustedOnly:true});
  if(target==='en'){if(this.acceptable(text,curated,source,target))return curated;const direct=!filename&&this.pair(text,source,target);return this.acceptable(text,direct,source,target)?direct:curated;}
  if(!this.destinations.has(target)){const map=new Map();for(const [term,value]of Object.entries(this.trusted[target]||{})){const key=value.trim().normalize('NFC').toLowerCase();if(!map.has(key))map.set(key,term);}this.destinations.set(target,map);}
  const map=this.destinations.get(target),fromEnglish=english=>{
   const body=english.trim().normalize('NFC'),value=map.get(body.toLowerCase());if(value)return text.replace(text.trim(),value);
   const parts=body.match(/^(.*?)(\s*(?:\([\d,]+\)|[\d,:. /-]+|\.[A-Za-z0-9]+))$/);
   if(parts&&map.has(parts[1].toLowerCase()))return text.replace(text.trim(),map.get(parts[1].toLowerCase())+parts[2]);return '';
  };
  const english=source==='en'?text:curated,complete=source==='en'||this.acceptable(text,english,source);
  // Curated UI and filename meanings always win over imported lexical senses.
  if(complete){const value=fromEnglish(english);if(value)return value;if(!filename){const lexical=this.pair(english,'en',target);if(this.acceptable(text,lexical,source,target))return lexical;}}
  if(filename)return text;
  const direct=this.pair(text,source,target);if(this.acceptable(text,direct,source,target))return direct;
  const pivots=complete?[english]:[this.pair(text,source,'en'),...this.referenceEnglish(text,source)];
  for(const pivot of pivots){if(!pivot||(source!=='en'&&!this.acceptable(text,pivot,source)))continue;const value=fromEnglish(pivot);if(value)return value;const lexical=this.pair(pivot,'en',target);if(this.acceptable(text,lexical,source,target))return lexical;}
  if(!complete&&text.length<=200){const pivot=this.translate(text,source,options);if(this.acceptable(text,pivot,source)){const value=fromEnglish(pivot)||this.pair(pivot,'en',target);if(this.acceptable(text,value,source,target))return value;}}return text;
 }
 // Destinations other than English always consume an English intermediate.
 pipeline(text,source,target,options={}){
  if(source===target)return {text,english:source==='en'?text:'',englishComplete:true,complete:true};
  const natural=source==='en'?text:this.prose(text,source,'en',options);
  const englishStrict=this.route(text,source,'en',options);
  const canonical=text.trim().replace(/\s+/gu,' ');
  const localComplete=source==='en'||this.acceptable(text,englishStrict,source,'en')||this.knownIdentity(text,source,'en',options)||
    this.acceptable(canonical,this.route(canonical,source,'en',options),source,'en')||this.proseCompleteness.get('prose\0'+source+'\0en\0'+text)===true;
  const supplied=!localComplete&&options.english&&this.acceptable(text,options.english,source,'en');
  const english=supplied?options.english:natural,englishComplete=localComplete||!!supplied;
  if(target==='en')return {text:english,english,englishComplete,complete:englishComplete};
  const final=this.prose(english,'en',target,options),strict=this.route(english,'en',target,options);
  const targetComplete=this.acceptable(english,strict,'en',target)||this.knownIdentity(english,'en',target,options)||this.proseCompleteness.get('prose\0en\0'+target+'\0'+english)===true;
  return {text:final,english,englishComplete,complete:englishComplete&&targetComplete};
 }
 // Ordinary page text can retain known translations without weakening filename validation.
 prose(text,source,target,options={}){
  if(source===target)return text;
  const strict=options.filename||this.filename(text),whole=this.route(text,source,target,options);
  if(this.acceptable(text,whole,source,target)||this.knownIdentity(text,source,target,options))return whole;
  if(strict)return target==='en'?this.resolve(text,'',{...options,language:source}):text;
  const canonical=text.trim().replace(/\s+/gu,' ');if(canonical!==text.trim()){const value=this.route(canonical,source,target);if(this.acceptable(canonical,value,source,target))return text.replace(text.trim(),value.trim());}
  if(['zh','ja'].includes(source)&&[...text.trim()].length<=3)return text;
  const cacheKey='prose\0'+source+'\0'+target+'\0'+text;if(this.cache.has(cacheKey))return this.cache.get(cacheKey);
  let index;
  if(source==='en'){
   if(!this.proseIndexes.has(target)){
    const terms=new Map(Object.entries(this.pairs[target]?.en||{}));
    for(const [term,english]of Object.entries(this.trusted[target]||{}))terms.set(english.normalize('NFC').toLowerCase(),term);
    const buckets=new Map();for(const [term,value]of terms){if(!term||term.length<2)continue;const first=term[0];if(!buckets.has(first))buckets.set(first,[]);buckets.get(first).push([term,value]);}
    for(const bucket of buckets.values())bucket.sort((a,b)=>b[0].length-a[0].length);
    if(this.proseIndexes.size>=3)this.proseIndexes.delete(this.proseIndexes.keys().next().value);this.proseIndexes.set(target,buckets);
   }index=this.proseIndexes.get(target);
  }else index=this.index(source);
  const normalized=text.normalize('NFC'),lower=normalized.toLowerCase(),wordBoundary=[...latin,'ru','en'].includes(source);
  let output='',i=0,changed=false,previousTranslated=false,fullyKnown=true;
  const append=(value,translated=false)=>{if(output&&(translated||previousTranslated)&&/[\p{L}\p{N}]$/u.test(output)&&/^[\p{L}\p{N}]/u.test(value))output+=' ';output+=value;previousTranslated=translated;};
  while(i<normalized.length){
   const rest=normalized.slice(i),url=rest.match(/^(?:https?:\/\/[^\s<>"'【】\[\]]+|www\.[A-Za-z0-9_./%?=&+#:~-]+)/i);
   if(url){append(url[0]);i+=url[0].length;continue;}
   const title=rest.match(/^[《「『]([^》」』]+)[》」』]/u);if(title){const translated=this.route(title[1],source,target,{filename:true});const known=this.acceptable(title[1],translated,source,target);append(known?title[0][0]+translated+title[0].at(-1):title[0],known);changed ||= known;i+=title[0].length;continue;}
   if(!wordBoundary){const token=rest.match(/^[A-Za-z0-9_@.+:\/\\%=-]+/);if(token){append(token[0]);i+=token[0].length;continue;}}
   let hit=null;
   if(!wordBoundary||i===0||!letter.test(normalized[i-1]))for(const [key,english]of index.get(lower[i])||[]){
    const end=i+key.length;if(!lower.startsWith(key,i)||(wordBoundary&&end<normalized.length&&letter.test(normalized[end])))continue;
    const original=normalized.slice(i,end);let value;
    if(source==='en')value=english;
    else if(target==='en')value=english;
    else value=this.route(original,source,target);
    if(value&&(this.acceptable(original,value,source,target)||this.knownIdentity(original,source,target))){hit={end,value};break;}
   }
   if(hit){append(hit.value,hit.value!==normalized.slice(i,hit.end));changed ||= hit.value!==normalized.slice(i,hit.end);i=hit.end;}
   else{const char=String.fromCodePoint(normalized.codePointAt(i));if(/\p{L}/u.test(char))fullyKnown=false;append(char);i+=char.length;}
  }
  if(changed)output=output.replace(/，/g,', ').replace(/。/g,'. ').replace(/：/g,': ').replace(/！/g,'! ').replace(/？/g,'? ').replace(/ +([,.;:!?])/g,'$1');else output=text;
  if(this.proseCompleteness.size>=3000)this.proseCompleteness.delete(this.proseCompleteness.keys().next().value);this.proseCompleteness.set(cacheKey,fullyKnown);this.remember(cacheKey,output);return output;
 }
 translate(text,l=this.language(text),options={}){if(!l)return text;const trustedOnly=!!options.trustedOnly||!!options.filename||this.filename(text),key=l+'\0'+trustedOnly+'\0'+text;if(this.cache.has(key))return this.cache.get(key);const dict=this.dicts[l]||{},body=text.trim();
 const override=this.trustedIndex(l).get(body.normalize('NFC').toLowerCase()),exact=override||{key:body,value:trustedOnly?undefined:dict[body]};
 if(this.usable(exact.key,exact.value,l)){const result=text.replace(body,exact.value);this.remember(key,result);return result;}
 if(!this.dicts[l])return text;
 const normalized=text.normalize('NFC'),lower=normalized.toLowerCase(),index=this.index(l,trustedOnly),wordBoundary=latin.includes(l)||l==='ru';let output='',i=0;
 const append=value=>{if((l==='zh'||l==='th'||l==='ja')&&output&&/[A-Za-z0-9]$/.test(output)&&/^[A-Za-z0-9]/.test(value))output+=' ';output+=value;};
 while(i<normalized.length){
 const rest=normalized.slice(i);
 // A download attribution is a label around a domain, not one long URL.
 const attribution=l==='zh'&&rest.match(/^[【\[]((?:https?:\/\/)?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[A-Za-z0-9_./%?=&+-]*)?)(?:提供下载|提供下載)[】\]]\s*/);
 if(attribution){append('[Download available at '+attribution[1]+'] ');i+=attribution[0].length;continue;}
 if(!latin.includes(l)){
  const url=rest.match(/^(?:https?:\/\/[^\s<>"'【】\[\]]+|www\.[A-Za-z0-9_./%?=&+#:~-]+)/i);
  if(url){output+=url[0];i+=url[0].length;continue;}
  const token=rest.match(/^[A-Za-z0-9_@.+:\/\\%=-]+/);
  if(token){output+=token[0];i+=token[0].length;continue;}
 }
 let hit=null;if(!wordBoundary||i===0||!letter.test(normalized[i-1])){for(const [k,value]of index.get(lower[i])||[]){const end=i+k.length;if(lower.startsWith(k,i)&&(!wordBoundary||end===normalized.length||!letter.test(normalized[end]))){hit={end,value,k};break;}}}
 if((l==='zh'||l==='ja')&&scripts[l].test(normalized[i])){
  // Translate contiguous Han runs atomically. Unknown characters never get glued to English glosses.
  const run=rest.match(l==='ja'?/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/u:/^\p{Script=Han}+/u)[0],end=i+run.length;
  if(hit&&hit.end>end){append(hit.value);i=hit.end;continue;}
  let cursor=i,parts=[],complete=true;
  while(cursor<end){let found=null;for(const [k,value]of index.get(lower[cursor])||[])if(cursor+k.length<=end&&lower.startsWith(k,cursor)){found={end:cursor+k.length,value};break;}
   if(!found){complete=false;break;}parts.push(found.value);cursor=found.end;}
  append(complete?parts.join(' '):run);i=end;if(complete&&/[A-Za-z0-9]/.test(normalized[i]||''))output+=' ';
 }else if(hit){append(hit.value);i=hit.end;}else{const c=String.fromCodePoint(normalized.codePointAt(i));output+=c;i+=c.length;}
 }
 output=output.replace(/，/g,', ').replace(/。/g,'. ').replace(/：/g,': ').replace(/！/g,'! ').replace(/？/g,'? ').replace(/ +([,.;:!?])/g,'$1').replace(/ {2,}/g,' ');
 // Never display a partially translated Chinese label, even across punctuation or Latin markers.
 if((l==='zh'||l==='ja')&&output!==text&&this.residual(output,l))output=text;
 // Latin reference matching is conservative: prefer whole phrases over incomplete word-by-word output.
 if(['pt','es','fr'].includes(l)&&output!==text){const originalWords=body.match(/[\p{L}]+/gu)||[];const resultWords=output.toLowerCase().match(/[\p{L}]+/gu)||[];if(originalWords.some(w=>resultWords.includes(w.toLowerCase())&&!/^(?:a|i|o|e|de|do|da|le|la|el|en|un|une|www|com|zip|rar|h5)$/i.test(w)))output=text;}
 this.remember(key,output);return output;}
 remember(k,v){if(this.cache.size>=3000)this.cache.delete(this.cache.keys().next().value);this.cache.set(k,v);}
 needsFallback(source,local,l=this.language(source)){
 if(!l||l==='en'||source.trim().length<1||source.length>1200)return false;
 const curated=this.translate(source,l,{trustedOnly:true});if(curated.trim()===local.trim()&&(curated!==source||this.trustedIndex(l).has(source.trim().toLowerCase())))return false;
 if(source===local)return /\p{L}/u.test(source)&&!/^https?:\/\//i.test(source);
 if(this.residual(local,l))return true;
 return latin.includes(l)||source.trim().split(/\s+/).length>=5||((l==='zh'||l==='ja')&&Array.from(source).length>=14)||(l==='th'&&source.length>=24);
 }

}
globalThis.SPT_Engine=Engine;
})();
