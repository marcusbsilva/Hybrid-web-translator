const $=id=>document.getElementById(id);
const enabled=$('enabled'),hybrid=$('hybrid'),provider=$('provider'),key=$('key'),lingva=$('lingva'),libre=$('libre'),libreKey=$('libreKey'),deeplKey=$('deeplKey'),budget=$('budget'),saved=$('saved');
let saveTimer=null,savedTimer=null,loading=true;
async function tab(){return (await chrome.tabs.query({active:true,currentWindow:true}))[0]}
function toggleProvider(){document.querySelectorAll('.providerBox').forEach(x=>x.classList.add('hidden'));const b=$(provider.value+'Box');if(b)b.classList.remove('hidden')}
async function notify(){try{const t=await tab();await chrome.tabs.sendMessage(t.id,{type:'SPT_CONFIG_CHANGED'})}catch{}}
function flashSaved(){saved.classList.add('show');clearTimeout(savedTimer);savedTimer=setTimeout(()=>saved.classList.remove('show'),1300)}
async function persist({flash=true}={}){
  if(loading)return;
  await chrome.storage.local.set({enabled:enabled.checked,hybridEnabled:hybrid.checked,hybridProvider:provider.value,googleApiKey:key.value.trim(),lingvaInstance:lingva.value.trim()||'https://translate.plausibility.cloud',libreInstance:libre.value.trim()||'http://localhost:5000',libreApiKey:libreKey.value.trim(),deeplApiKey:deeplKey.value.trim(),dailyCharBudget:Math.max(1000,Number(budget.value)||15000)});
  await notify(); if(flash)flashSaved(); await refresh();
}
function schedulePersist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist(),450)}
async function load(){
  const r=await chrome.storage.local.get({enabled:true,hybridEnabled:false,hybridProvider:'lingva',googleApiKey:'',lingvaInstance:'https://translate.plausibility.cloud',libreInstance:'http://localhost:5000',libreApiKey:'',deeplApiKey:'',dailyCharBudget:15000});
  enabled.checked=r.enabled;hybrid.checked=r.hybridEnabled;provider.value=r.hybridProvider||'lingva';key.value=r.googleApiKey||'';lingva.value=r.lingvaInstance||'https://translate.plausibility.cloud';libre.value=r.libreInstance||'http://localhost:5000';libreKey.value=r.libreApiKey||'';deeplKey.value=r.deeplApiKey||'';budget.value=r.dailyCharBudget||15000;toggleProvider();loading=false;await refresh();
}
function paint(s){
  const isOn=!!s.hybridEnabled,b=$('hybridBadge');b.textContent=isOn?'Hybrid ON':'Hybrid OFF';b.className='badge '+(isOn?'on':'off');
  $('providerStat').textContent=s.provider||'Local only';$('learnedStat').textContent=String(s.learned??0);$('cacheStat').textContent=String(s.cache??0);$('fallbackStat').textContent=`${s.apiCharsToday??0} chars`;$('zhStat').textContent=String(s.zh??'—');$('viStat').textContent=String(s.vi??'—');$('engineStat').textContent=s.engine||'Hybrid local translator';
}
async function refresh(){
  const stored=await chrome.storage.local.get({learnedExact:{},learnedMeta:{},hybridEnabled:false,hybridProvider:'lingva'});
  try{const t=await tab(),r=await chrome.tabs.sendMessage(t.id,{type:'SPT_STATS'});paint({...r,provider:stored.hybridProvider});}
  catch{paint({hybridEnabled:stored.hybridEnabled,provider:stored.hybridProvider,learned:Object.keys(stored.learnedExact||{}).length,cache:0,apiCharsToday:stored.learnedMeta?.charsToday||0,engine:'Page translator unavailable on this tab'});}
}
provider.addEventListener('change',()=>{toggleProvider();persist()});
[enabled,hybrid].forEach(el=>el.addEventListener('change',()=>persist()));
[key,lingva,libre,libreKey,deeplKey,budget].forEach(el=>{el.addEventListener('input',schedulePersist);el.addEventListener('change',()=>persist())});
$('export').onclick=async()=>{const r=await chrome.runtime.sendMessage({type:'SPT_EXPORT_LEARNED'});if(!r?.ok)alert(r?.error||'Export failed')};
load();
