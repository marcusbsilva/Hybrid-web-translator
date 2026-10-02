(() => {
'use strict';
const BASE_ZH=globalThis.SPT_ZH||{}, BASE_VI=globalThis.SPT_VI||{};
let ZH={...BASE_ZH}, VI={...BASE_VI}, LEARNED={};
let hybridEnabled=false, googleQueue=new Map(), googleTimer=0, apiCharsToday=0;
const SKIP=new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA','CANVAS','SVG','MATH','SELECT','OPTION']);
const originals=new WeakMap(), done=new WeakSet(), lastApplied=new WeakMap(), cache=new Map();
let enabled=true, observer=null, flushTimer=0, initialized=false;
const pending=new Set();
const HAN=/\p{Script=Han}/u, HAN_RUN=/[\p{Script=Han}]+/gu;
const VI_MARK=/[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/iu;
let byFirst=new Map(), viKeys=[];
const FREQ={
'的':318000,'是':180000,'在':170000,'和':160000,'了':155000,'有':145000,'为':120000,'与':110000,'游戏':95000,'源码':85000,'服务端':70000,'客户端':69000,'服务器':65000,'下载':64000,'开发':62000,'资源':60000,'系统':58000,'玩家':54000,'使用':52000,'支持':50000,'可以':49000,'版本':47000,'前端':45000,'后端':45000,'数据库':43000,'英雄':41000,'装备':40000,'技能':39000,'任务':38000,'运行':37000,'环境':36000,'内容':35000,'论坛':34000,'回复':33000,'登录':32000,'注册':31000,'手机游戏':30000,'卡牌':29000,'手游':28000
};
const DOMAIN=/源码|服务端|客户端|服务器|数据库|Unity|C#|Java|游戏|手游|卡牌|英雄|装备|技能|副本|论坛|下载|开发|资源|账号|登录|注册|教程|配置|编译|运行|商业|版本|前端|后端|玩家|关卡|战斗/;
function rebuildIndexes(){
 byFirst=new Map();
 for(const k of Object.keys(ZH)){const c=k[0];let a=byFirst.get(c);if(!a)byFirst.set(c,a=[]);a.push(k)}
 for(const a of byFirst.values())a.sort((x,y)=>y.length-x.length);
 viKeys=Object.keys(VI).sort((a,b)=>b.length-a.length);
 cache.clear();
}
function scoreWord(w){
 const f=FREQ[w]||0;
 let s=(f?Math.log(f):0)+(w.length*1.7);
 if(w.length===1)s-=5.5;
 if(DOMAIN.test(w))s+=3.8;
 if(w.length>=4)s+=1.2;
 return s;
}
function candidates(s,i){const list=byFirst.get(s[i]);if(!list)return[];const out=[];for(const w of list)if(w.length<=s.length-i&&s.startsWith(w,i))out.push(w);return out}
function segmentHan(s){
 const n=s.length,dp=new Array(n+1).fill(-Infinity),prev=new Array(n+1);dp[0]=0;
 for(let i=0;i<n;i++){
  if(!Number.isFinite(dp[i]))continue;
  const cs=candidates(s,i);
  if(!cs.length){const j=i+1,v=dp[i]-8;if(v>dp[j]){dp[j]=v;prev[j]=[i,s[i],false]}}
  for(const w of cs){const j=i+w.length,v=dp[i]+scoreWord(w);if(v>dp[j]){dp[j]=v;prev[j]=[i,w,true]}}
 }
 const out=[];let p=n;while(p>0&&prev[p]){const [i,w,k]=prev[p];out.push([w,k]);p=i}out.reverse();return out;
}
function cleanEnglish(s){return s
 .replace(/\s*，\s*/g,', ').replace(/\s*。\s*/g,'. ').replace(/\s*；\s*/g,'; ').replace(/\s*：\s*/g,': ')
 .replace(/\s*！\s*/g,'! ').replace(/\s*？\s*/g,'? ')
 .replace(/([a-z0-9#.+\]])([A-Z])/g,'$1 $2').replace(/([A-Z]{2,})([A-Z][a-z])/g,'$1 $2')
 .replace(/([,.;:!?])(?=[A-Za-z0-9])/g,'$1 ')
 .replace(/\s+([,.;:!?%\)\]》])/g,'$1').replace(/([\(\[])[ ]+/g,'$1')
 .replace(/\b(is|are) a the\b/gi,'$1 the').replace(/\bthe a\b/gi,'a').replace(/\band and\b/gi,'and').replace(/\bfor for\b/gi,'for')
 .replace(/\s{2,}/g,' ').trim()}
function smartMixedSpacing(s){
 return s.replace(/([A-Za-z0-9#.+\]])([\p{Script=Han}])/gu,'$1 $2')
         .replace(/([\p{Script=Han}])([A-Za-z0-9#.+])/gu,'$1 $2');
}
function translateHanRun(run){
 if(ZH[run])return ZH[run];
 const seg=segmentHan(run);let out='';
 for(const [w,known] of seg){const t=known?(ZH[w]||w):w;const tLatin=/^[A-Za-z0-9]/.test(t),pLatin=/[A-Za-z0-9]$/.test(out),tHan=HAN.test(t[0]||'');if(out&&((tLatin&&pLatin)||(tLatin&&HAN.test(out.at(-1)))||(tHan&&pLatin)))out+=' ';out+=t}
 return out;
}
const SENTENCE_RULES=[
 [/卡牌和RPG进行完美融合/g,'seamlessly blends card gameplay with RPG mechanics'],
 [/为玩家带来丰富多彩的RPG\+卡牌的游戏体验/g,'delivering a varied RPG/card-game experience'],
 [/在游戏中[^。]*化身为召唤师/g,'In the game, the player takes the role of a summoner'],
 [/招募英雄[^。]*最终称霸天梯/g,'recruits heroes, clears successive stages, and ultimately competes at the top of the ranked ladder'],
 [/分服务端和客户端/g,'includes both server and client'],
 [/服务端用C#开发/g,'the server is developed in C#'],
 [/客户端Unity开发/g,'the client is developed with Unity'],
 [/资源是花钱买来的/g,'the assets were purchased'],
 [/应该是有版权的/g,'and are likely copyrighted'],
 [/请勿商用/g,'please do not use commercially'],
 [/用于[^，。]*学习参考/g,'for learning and reference only'],
 [/运行环境要求Unity5\.0以上/g,'Runtime requirement: Unity 5.0 or later']
];
function translateZhMixed(s){
 let x=s;for(const [re,to] of SENTENCE_RULES)x=x.replace(re,to);
 return cleanEnglish(smartMixedSpacing(x).replace(HAN_RUN,m=>{const t=translateHanRun(m);return ` ${t} `;}));
}
function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function translateVi(s){let out=s;for(const k of viKeys)out=out.replace(new RegExp(`(^|[^\\p{L}])(${escRe(k)})(?=$|[^\\p{L}])`,'giu'),(m,p)=>p+VI[k]);return cleanEnglish(out)}
function lang(s){if(HAN.test(s))return'zh';if(VI_MARK.test(s))return'vi';return null}
function translate(s){const lead=s.match(/^\s*/)?.[0]||'',trail=s.match(/\s*$/)?.[0]||'',body=s.slice(lead.length,s.length-trail.length);if(!body)return s;if(LEARNED[body])return lead+LEARNED[body]+trail;if(cache.has(body))return lead+cache.get(body)+trail;const l=lang(body);if(!l)return s;const t=l==='zh'?translateZhMixed(body):translateVi(body);cache.set(body,t);return lead+t+trail}
function bodyOf(s){const lead=s.match(/^\s*/)?.[0]||'',trail=s.match(/\s*$/)?.[0]||'';return s.slice(lead.length,s.length-trail.length)}
function needsFallback(src,local){
 if(!hybridEnabled||LEARNED[src]||src.length<2||src.length>1200)return false;
 const han=(src.match(/[\p{Script=Han}]/gu)||[]).length, residual=(local.match(/[\p{Script=Han}]/gu)||[]).length;
 if(han){const coverage=1-(residual/han);if(residual>0||coverage<.98)return true;if(han>=10&&/[A-Za-z0-9#.+]\s*[\p{Script=Han}]|[\p{Script=Han}]\s*[A-Za-z0-9#.+]/u.test(local))return true;if(han>=18&&local.length<Math.max(8,src.length*.35))return true}
 if(lang(src)==='vi'&&VI_MARK.test(src)&&(local===src||VI_MARK.test(local)))return true;
 return false;
}
function queueGoogle(node,src,local){
 if(!needsFallback(src,local))return;
 let q=googleQueue.get(src);if(!q){q={text:src,lang:lang(src),nodes:new Set()};googleQueue.set(src,q)}q.nodes.add(node);
 if(!googleTimer)googleTimer=setTimeout(flushGoogle,350);
}
async function flushGoogle(){
 googleTimer=0;if(!hybridEnabled||!googleQueue.size)return;
 const batch=[...googleQueue.values()].slice(0,20);for(const x of batch)googleQueue.delete(x.text);
 try{const r=await chrome.runtime.sendMessage({type:'SPT_HYBRID_BATCH',items:batch.map(x=>({text:x.text,lang:x.lang}))});if(r?.ok){apiCharsToday=r.charsToday||apiCharsToday;batch.forEach((x,i)=>{const t=r.translations?.[i];if(!t)return;LEARNED[x.text]=t;cache.set(x.text,t);for(const n of x.nodes){if(!n.isConnected)continue;const orig=originals.get(n);if(orig&&bodyOf(orig)===x.text){const lead=orig.match(/^\s*/)?.[0]||'',trail=orig.match(/\s*$/)?.[0]||'';const applied=lead+t+trail;lastApplied.set(n,applied);n.nodeValue=applied}}})}}
 catch{}
 if(googleQueue.size&&!googleTimer)googleTimer=setTimeout(flushGoogle,600);
}
function blocked(n){const p=n.parentElement;if(!p)return true;return SKIP.has(p.tagName)||p.isContentEditable||!!p.closest('script,style,noscript,code,pre,textarea,canvas,svg,math,select,[contenteditable="true"]')}
function textNode(n){if(!enabled||blocked(n))return;const s=n.nodeValue;if(!s)return;
 // A framework/forum may reuse a Text node after we translated it. Only skip when
 // the node still contains exactly the value that Hybrid-web-translator applied.
 if(done.has(n)&&lastApplied.get(n)===s)return;
 if(!lang(s)){done.add(n);lastApplied.set(n,s);return;}const t=translate(s);if(t!==s){originals.set(n,s);done.add(n);lastApplied.set(n,t);n.nodeValue=t;queueGoogle(n,bodyOf(s),bodyOf(t))}else{done.add(n);lastApplied.set(n,s);queueGoogle(n,bodyOf(s),bodyOf(t))}}
function attrs(el){if(!(el instanceof Element)||SKIP.has(el.tagName)||el.isContentEditable)return;for(const a of ['title','placeholder','aria-label']){const v=el.getAttribute(a);if(!v||!lang(v))continue;let o={};try{o=JSON.parse(el.dataset.sptAttrs||'{}')}catch{}if(!(a in o))o[a]=v;el.dataset.sptAttrs=JSON.stringify(o);el.setAttribute(a,translate(v))}if(el instanceof HTMLInputElement&&['button','submit','reset'].includes(el.type)&&lang(el.value)){if(!el.dataset.sptValue)el.dataset.sptValue=el.value;el.value=translate(el.value)}}
function collect(root,limit=Infinity){const jobs=[];if(!root)return jobs;if(root.nodeType===3){jobs.push(root);return jobs}if(root.nodeType!==1&&root.nodeType!==11)return jobs;const w=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode(n){if(n.nodeType===1&&SKIP.has(n.tagName))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});let n=root.nodeType===1?root:w.nextNode();while(n&&jobs.length<limit){if(n.nodeType===3){if(n.nodeValue&&lang(n.nodeValue))jobs.push(n)}else attrs(n);n=w.nextNode()}return jobs}
function runJobs(jobs,i=0){if(!enabled)return;const end=Math.min(i+220,jobs.length);for(;i<end;i++)textNode(jobs[i]);if(i<jobs.length){const cb=()=>runJobs(jobs,i);('requestIdleCallback'in window)?requestIdleCallback(cb,{timeout:100}):setTimeout(cb,0)}}
function scan(root=document.body){if(root)runJobs(collect(root))}
function flush(){flushTimer=0;if(!enabled||document.hidden)return;const roots=[...pending];pending.clear();const jobs=[];for(const r of roots)jobs.push(...collect(r,650));runJobs(jobs)}
function schedule(n){pending.add(n);if(!flushTimer)flushTimer=setTimeout(flush,90)}
function scanPlatformContent(){
 // Common post/comment containers: Discuz, vBulletin, phpBB/Forumotion,
 // XenForo, Flarum, NodeBB, WordPress and generic comment systems.
 const selectors=[
  '#postlist','.plhin','.pcb','.t_f','.pct','.authi','.pi','.pob','.pgs','.pg',
  '#posts','.postbit','.postcontainer','.postbody','.postcontent','.content','.userinfo','.postfoot',
  '.post','.postbody','.post-content','.postprofile','.topic-actions','.pagination','.forabg','.forumbg',
  '.message','.message-body','.message-content','.bbWrapper','.structItem','.block-body',
  '.PostStream','.Post','.CommentPost','.PostsUserPage','.topic-post','.posts-list',
  '.posts-list','.topic-body','.topic-item','.post-container','.comment','.comments','.comment-body','.comment-content',
  '#comments','.commentlist','.comment-list','[id^="post_message_"]','[id^="postmessage_"]','[id^="pid"]',
  '.j_l_post','.d_post_content','.core_reply_content','.l_post','.p_content',
  '[data-post-id]','[data-comment-id]','article'
 ];
 const seen=new Set();for(const sel of selectors)for(const el of document.querySelectorAll(sel)){if(seen.has(el))continue;seen.add(el);runJobs(collect(el,1800));}
}
function scanDiscuzPosts(){scanPlatformContent()}
let discuzRescanTimer=0;
function scheduleDiscuzRescan(delay=250){clearTimeout(discuzRescanTimer);discuzRescanTimer=setTimeout(()=>{discuzRescanTimer=0;if(enabled&&!document.hidden)scanDiscuzPosts()},delay)}
function observe(){observer?.disconnect();observer=new MutationObserver(ms=>{if(!enabled||document.hidden)return;for(const m of ms){if(m.type==='childList')for(const n of m.addedNodes)schedule(n);else if(m.type==='characterData'){if(lastApplied.get(m.target)!==m.target.nodeValue)schedule(m.target)}}});observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true})}
function restore(){observer?.disconnect();const w=document.createTreeWalker(document,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))if(originals.has(n)){n.nodeValue=originals.get(n);originals.delete(n);done.delete(n)}document.querySelectorAll('[data-spt-attrs]').forEach(el=>{try{for(const[k,v]of Object.entries(JSON.parse(el.dataset.sptAttrs)))el.setAttribute(k,v)}catch{}delete el.dataset.sptAttrs});document.querySelectorAll('[data-spt-value]').forEach(el=>{el.value=el.dataset.sptValue;delete el.dataset.sptValue});observe()}
async function init(){if(initialized)return;initialized=true;const r=await chrome.storage.local.get({enabled:true,customZh:{},customVi:{},learnedExact:{},hybridEnabled:false,learnedMeta:{}});enabled=r.enabled;hybridEnabled=!!r.hybridEnabled;LEARNED=r.learnedExact||{};apiCharsToday=r.learnedMeta?.charsToday||0;ZH={...BASE_ZH,...(r.customZh||{})};VI={...BASE_VI,...(r.customVi||{})};rebuildIndexes();if(enabled){scan();scanDiscuzPosts();scheduleDiscuzRescan(700);scheduleDiscuzRescan(2200)}observe()}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&enabled){if(pending.size)flush();else{scan(document.body);scanDiscuzPosts()}}});
// Discuz pagination/reply widgets can update posts without a full navigation.
window.addEventListener('pageshow',()=>scheduleDiscuzRescan(300),{passive:true});
document.addEventListener('click',e=>{if(e.target?.closest?.('.pg a,.pgt a,.fastre,.replyadd,.pagination a,.pageNav a,.button[href],a[href*=\"page=\"],a[href*=\"viewthread\"],a[href*=\"showthread\"],a[href*=\"topic\"]'))scheduleDiscuzRescan(700)},{passive:true});
chrome.runtime.onMessage.addListener((msg,_s,send)=>{if(msg.type==='SPT_SET'){enabled=!!msg.enabled;chrome.storage.local.set({enabled});if(enabled)scan();else restore();send({ok:true})}else if(msg.type==='SPT_STATS')send({cache:cache.size,enabled,zh:Object.keys(ZH).length,vi:Object.keys(VI).length,learned:Object.keys(LEARNED).length,hybridEnabled,apiCharsToday,engine:'Hybrid Local DAG/Viterbi 3.1'});else if(msg.type==='SPT_RELOAD_DICT'||msg.type==='SPT_CONFIG_CHANGED'){chrome.storage.local.get({hybridEnabled:false,learnedExact:{},learnedMeta:{}}).then(r=>{hybridEnabled=!!r.hybridEnabled;LEARNED=r.learnedExact||{};apiCharsToday=r.learnedMeta?.charsToday||0;cache.clear();if(enabled){scan(document.body);scanPlatformContent()}send({ok:true})});return true}return true});
init();
})();
