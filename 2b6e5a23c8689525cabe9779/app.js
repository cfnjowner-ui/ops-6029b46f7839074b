(function(){
'use strict';
// ───── UI CONFIG ─────
var CFG={refreshSec:120,tvPageSec:20,dataFile:'data.enc.json',lsKey:'opsboard_code',lsTv:'opsboard_tv'};
var qs=new URLSearchParams(location.search);
var capOverride=qs.get('cap')?parseInt(qs.get('cap'),10):null;
var D=null,keyCache={},pageIdx=0,pageTimer=null,progTimer=null;
var $=function(id){return document.getElementById(id)};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function money(v){if(v==null)return '—';var a=Math.abs(v);if(a>=1e6)return '$'+(v/1e6).toFixed(2)+'M';if(a>=1e4)return '$'+Math.round(v/1e3)+'K';if(a>=1e3)return '$'+(v/1e3).toFixed(1)+'K';return '$'+Math.round(v)}
function num(v){return v==null?'—':String(v)}
function fd(s){if(!s)return '—';var p=s.split('-');return (+p[1])+'/'+(+p[2])}
function b64(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
// ───── crypto ─────
async function getKey(code,salt,iter){var id=code+'|'+salt+'|'+iter;if(keyCache[id])return keyCache[id];
 var base=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveKey']);
 var k=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(salt),iterations:iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
 keyCache={};keyCache[id]=k;return k}
async function decrypt(blob,code){var k=await getKey(code,blob.salt,blob.iter);
 var pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(blob.iv)},k,b64(blob.ct));return JSON.parse(new TextDecoder().decode(pt))}
async function load(){
 var code=localStorage.getItem(CFG.lsKey);
 if(!code){showLock();return}
 try{var r=await fetch(CFG.dataFile+'?t='+Date.now(),{cache:'no-store'});if(!r.ok)throw new Error('http '+r.status);var blob=await r.json();
  try{D=await decrypt(blob,code)}catch(e){localStorage.removeItem(CFG.lsKey);showLock('Wrong access code');return}
  $('lock').classList.add('hidden');render()}catch(e){$('sub').textContent='Load error: '+e.message+' (will retry)'}
}
function showLock(msg){$('lock').classList.remove('hidden');$('lockerr').textContent=msg||'';$('code').focus()}
$('lockform').addEventListener('submit',function(e){e.preventDefault();var c=$('code').value.trim();if(!c)return;localStorage.setItem(CFG.lsKey,c);$('code').value='';load()});
// ───── svg helpers ─────
function barChart(items,o){ // items:{label,val,val2?,hi?}
 var w=o.w||360,h=o.h||150,pad=(items[0]&&String(items[0].label).indexOf('|')>0)?32:22,bw=(w-20)/items.length,max=Math.max(o.max||0,1);items.forEach(function(i){max=Math.max(max,i.val)});
 var s='<svg viewBox="0 0 '+w+' '+h+'" width="100%" role="img">';
 items.forEach(function(it,i){var x=10+i*bw,bh=(h-pad-16)*it.val/max,y=h-pad-bh,col=it.color||'var(--acc)';
  s+='<rect x="'+(x+bw*.15)+'" y="'+y+'" width="'+bw*.7+'" height="'+Math.max(bh,0)+'" rx="3" fill="'+col+'" opacity="'+(it.partial?.55:1)+'"/>';
  s+='<text class="v" x="'+(x+bw/2)+'" y="'+(y-3)+'" text-anchor="middle">'+esc(it.text!=null?it.text:it.val)+'</text>';
  var lb=String(it.label).split('|');s+='<text x="'+(x+bw/2)+'" y="'+(h-(lb.length>1?15:6))+'" text-anchor="middle">'+esc(lb[0])+'</text>'+(lb.length>1?'<text x="'+(x+bw/2)+'" y="'+(h-4)+'" text-anchor="middle">'+esc(lb[1])+'</text>':'')});
 if(o.line!=null){var ly=h-pad-(h-pad-16)*o.line/max;s+='<line x1="6" x2="'+(w-6)+'" y1="'+ly+'" y2="'+ly+'" stroke="var(--red)" stroke-dasharray="5 4" stroke-width="1.5"/><text x="'+(w-8)+'" y="'+(ly-3)+'" text-anchor="end" style="fill:var(--red)">cap '+o.line+'</text>'}
 return s+'</svg>'}
function stack(c,r){var t=(c+r)||1;return '<div class="bar"><i class="c-core" style="width:'+(c/t*100)+'%"></i><i class="c-retail" style="width:'+(r/t*100)+'%"></i></div>'}
function delta(a,b,isMoney){if(b==null||b===0)return '';var d=a-b,p=Math.round(d/b*100);return '<span class="delta '+(d>=0?'up':'dn')+'">'+(d>=0?'▲':'▼')+' '+Math.abs(p)+'% vs last wk</span>'}
function jobs(list,crit){return (list||[]).map(function(j){return '<span class="jn'+(crit?' crit':'')+'">'+esc(j)+'</span>'}).join('')}
// ───── panels ─────
var STAGE_NOTE={S0:'no install date',S1a:'spec check not done',S1b:'spec done, no purchasing',S2a:'purchasing done, no cut list',S2b:'cut list done, no station work',S3:'saw/edge/bore/drawer started',S4:'all stations / job ready',S5:'install date = today',S6:'install date past, still open',INST:'completed, last 30d',SVC:'ServiceTrac open <180d'};
var P={};
P.accomp=function(){var c=D.completed,s=D.streaks,l=c.last_week,pend=(D.stages.filter(function(x){return x.key==='S5'})[0]||{total:{n:0}}).total.n;
 function tile(lab,p,extra){return '<div class="tile"><div class="lab">'+lab+'</div><div class="big">'+p.total.n+' <small>jobs</small></div><div class="row"><span>Completed</span><b>'+money(p.total.v)+'</b></div><div class="row"><span>$ secured</span><b>'+money(p.secured)+'</b></div><div class="row"><span><span class="core">core '+p.core.n+'</span> · <span class="retail">retail '+p.retail.n+'</span></span>'+(extra||'')+'</div></div>'}
 var h='<div class="tiles">'+tile('Installed today',c.today,'<span class="note">+'+pend+' still open today</span>')+tile('This week (Mon–)',c.week,delta(c.week.total.n,l.total.n))+tile('This month',c.month)+'</div><div class="chips">';
 h+='<span class="chip">🔥 '+s.workday_streak+' workday install streak</span>';
 h+='<span class="chip">📈 '+s.week_streak+' wk streak ≥ prior week</span>';
 if(s.record_week_installs)h+='<span class="chip'+(s.this_week_is_record?' gold':'')+'">🏆 Record week: '+s.record_week_installs.n+' installs (wk of '+fd(s.record_week_installs.week)+')'+(s.this_week_is_record?' — THIS WEEK!':'')+'</span>';
 if(s.record_week_secured)h+='<span class="chip'+(s.this_week_is_secured_record?' gold':'')+'">💰 Record secured wk: '+money(s.record_week_secured.secured)+' (wk of '+fd(s.record_week_secured.week)+')</span>';
 if(s.record_day)h+='<span class="chip">⭐ Best day: '+s.record_day.n+' installs ('+fd(s.record_day.date)+')</span>';
 h+='<span class="chip">Last week: '+l.total.n+' jobs · '+money(l.total.v)+' · '+money(l.secured)+' secured</span></div>';
 return {t:'🎉 Accomplishments',h:h,cls:'wide'}};
P.attention=function(tv){var a=D.attention,h='';if(!a.length)h='<p><span class="pill ok">OK</span> Nothing flagged.</p>';
 var red=a.filter(function(x){return x.level==='RED'}).length,amb=a.length-red;
 a.slice(0,tv?4:99).forEach(function(x){h+='<div class="att '+x.level+'"><div class="t"><span class="pill '+x.level+'">'+x.level+'</span>'+esc(x.title)+'</div><div class="r">'+esc(x.reason)+'</div><div class="m">➜ '+esc(x.move)+'</div>'+(x.jobs.length?'<div>'+jobs(x.jobs.slice(0,tv?8:12))+(x.jobs.length>(tv?8:12)?' <span class="note">+more</span>':'')+'</div>':'')+'</div>'});
 return {t:'⚠️ Needs attention <span class="note">'+red+' red · '+amb+' amber</span>',h:'<div class="attgrid">'+h+'</div>',cls:tv?'wide':'span2'}};
P.stages=function(){var h='<table><tr><th>Stage</th><th>Core #</th><th class="hm">Core $</th><th>Retail #</th><th class="hm">Retail $</th><th>Total #</th><th>Total $</th></tr>',tc=0,tr=0,tcv=0,trv=0;
 D.stages.forEach(function(s){var pipe=s.key!=='INST'&&s.key!=='SVC';if(pipe){tc+=s.core.n;tr+=s.retail.n;tcv+=s.core.v;trv+=s.retail.v}
  h+='<tr><td><b>'+esc(s.label)+'</b><div class="note" style="margin:0">'+esc(STAGE_NOTE[s.key]||'')+(s.median_age!=null?' · med '+s.median_age+'d since sold':'')+'</div>'+stack(s.core.n,s.retail.n)+'</td><td class="core">'+s.core.n+'</td><td class="hm">'+(s.dollars_na?'—':money(s.core.v))+'</td><td class="retail">'+s.retail.n+'</td><td class="hm">'+(s.dollars_na?'—':money(s.retail.v))+'</td><td><b>'+s.total.n+'</b></td><td><b>'+(s.dollars_na?'—':money(s.total.v))+'</b></td></tr>';
  if(s.key==='S6')h+='<tr class="tot"><td>Open pipeline (S0–S6)</td><td class="core">'+tc+'</td><td class="hm">'+money(tcv)+'</td><td class="retail">'+tr+'</td><td class="hm">'+money(trv)+'</td><td>'+(tc+tr)+'</td><td>'+money(tcv+trv)+'</td></tr>'});
 h+='</table><div class="note">Blue = core, orange = retail (Costco/Lowe\'s/HD). Open jobs sold ≤'+D.meta.cutoff_days+'d ago; '+D.meta.stale_open_jobs+' older open jobs ('+money(D.meta.stale_open_dollars)+') excluded as stale. Service $ n/a (WO carries parent job value).</div>';
 return {t:'Pipeline by stage',h:h,cls:'wide'}};
P.capacity=function(tv){var cap=capOverride||D.capacity.per_day,days=D.capacity.days.map(function(d){return {label:d.dow+'|'+fd(d.date),val:d.n,color:d.n>cap?'var(--red)':(d.n>=cap*.9?'var(--amb)':'var(--acc)')}});
 var tw=D.capacity.this_week,nw=D.capacity.next_week,c5=cap*5;
 var h='<div class="kv"><div>This week<b>'+tw.scheduled+' / '+c5+'</b></div><div>Next week<b>'+nw.scheduled+' / '+c5+'</b></div><div>Open backlog<b>'+D.capacity.backlog_jobs+' jobs</b></div><div>= weeks of work<b>'+(D.capacity.backlog_jobs/c5).toFixed(1)+'</b></div></div>';
 h+=barChart(days,{line:cap,max:cap+1,w:380,h:tv?150:150});
 h+='<h3>Backlog by install week (open jobs / $)</h3><table><tr><th>Week of</th><th>Jobs</th><th>$</th><th>Visits</th><th>Load</th></tr>';
 D.capacity.weeks.slice(0,tv?4:9).forEach(function(w){var p=Math.round(w.visits/c5*100);h+='<tr><td>'+fd(w.week)+'</td><td>'+w.jobs+'</td><td>'+money(w.dollars)+'</td><td>'+w.visits+'</td><td style="color:'+(p>100?'var(--red)':p>=85?'var(--amb)':'inherit')+'">'+p+'%</td></tr>'});
 h+='</table><div class="note">Scheduled installs per workday (InstallTrac visits) vs capacity '+cap+'/day (assumed). Visits include completed. Backlog $ excludes past-due.</div>';
 return {t:'Install workload vs capacity (next 10 workdays)',h:h}};
P.blockers=function(tv){var b=D.blockers,lim=tv?11:99,h='<div class="note" style="margin:0 0 6px">Installs within 14 days still before Parts Ready ('+b.filter(function(x){return x.crit}).length+' critical of '+b.length+')</div><div class="scroll"><table><tr><th>Job #</th><th>Stage</th><th>Install</th><th>In</th><th>Seg</th><th>$</th></tr>';
 b.slice(0,lim).forEach(function(x){h+='<tr><td><span class="jn'+(x.crit?' crit':'')+'">'+esc(x.j)+'</span></td><td>'+x.st+'</td><td>'+fd(x.inst)+'</td><td>'+x.dti+'d</td><td class="'+x.seg+'">'+x.seg+'</td><td>'+money(x.v)+'</td></tr>'});
 h+='</table>'+(b.length>lim?'<div class="note">+'+(b.length-lim)+' more</div>':'')+'</div><div class="note">Proxy: no PO/vendor data in ClosetWare. Red = ≤7d out and still design/spec/ordered, ≤3d out in prod queue, or ≤1d out in production.</div>';
 return {t:'Parts-not-ready blockers',h:h}};
P.aging=function(tv){var tot=D.aging.reduce(function(a,x){return a+x.total.n},0)||1,h='<table><tr><th>Since sold</th><th>Core</th><th>Retail</th><th>Jobs</th><th>$</th></tr>';
 D.aging.forEach(function(a){h+='<tr><td>'+a.label+stack(a.core.n,a.retail.n)+'</td><td class="core">'+a.core.n+'</td><td class="retail">'+a.retail.n+'</td><td><b>'+a.total.n+'</b></td><td>'+money(a.total.v)+'</td></tr>'});
 var L=D.lead;h+='</table><div class="kv" style="margin-top:8px"><div>Median age (open)<b>'+num(L.median_open_age)+'d</b></div><div>Sale→install (90d)<b>'+num(L.median_sale_to_install_90d)+'d</b></div><div>p90<b>'+num(L.p90)+'d</b></div></div>';
 var u=D.unscheduled;h+='<h3>Sold – unscheduled ('+u.length+')</h3><div class="scroll">'+u.slice(0,tv?8:99).map(function(x){return '<span class="jn'+(x.age>30?' crit':'')+'">'+esc(x.j)+' · '+x.age+'d · '+money(x.v)+'</span>'}).join('')+'</div>';
 return {t:'Install lead time & aging',h:h}};
P.service=function(tv){var s=D.service,h='<div class="kv"><div>Open (≤'+D.meta.service_window_days+'d)<b>'+s.open+'</b></div><div>Median age<b>'+num(s.median_age)+'d</b></div><div>&gt;30 days<b style="color:'+(s.over30?'var(--red)':'inherit')+'">'+s.over30+'</b></div><div>No visit date<b>'+s.unscheduled+'</b></div></div>';
 h+=barChart(s.buckets.map(function(b,i){return {label:b.label,val:b.n,color:i>=3?'var(--red)':i==2?'var(--amb)':'var(--acc)'}}),{w:340,h:tv?150:120});
 var w=s.completed_wait;h+='<div class="note">Completed in last '+D.meta.service_window_days+'d (n='+w.n+'): created→visit median '+num(w.median)+'d · p75 '+num(w.p75)+'d · p90 '+num(w.p90)+'d. Core '+s.core+' / retail '+s.retail+'. '+s.stale_excluded+' older open WOs excluded (migration backlog).</div>';
 h+='<div class="scroll"><table><tr><th>Service WO</th><th>Age</th><th>Visit</th><th>Cause</th></tr>'+s.list.slice(0,tv?4:40).map(function(x){return '<tr><td><span class="jn'+(x.age>30?' crit':'')+'">'+esc(x.j)+'</span></td><td>'+x.age+'d</td><td>'+(x.sched?fd(x.sched)+' (+'+x.sched_wait+'d)':'—')+'</td><td>'+esc(x.cause||'')+'</td></tr>'}).join('')+'</table></div>';
 return {t:'Service / return-trip queue',h:h}};
P.closeout=function(tv){var n=D.not_closed,h='<div class="note" style="margin:0 0 6px">Install date passed, no completion/installer report ('+n.length+')</div><div class="scroll">'+n.slice(0,tv?40:99).map(function(x){return '<span class="jn'+(x.days>30?' crit':'')+'">'+esc(x.j)+' · '+x.days+'d ago</span>'}).join('')+'</div>';
 var r=D.done_recent;h+='<h3>Installed last 7 days ('+r.length+')</h3><div class="scroll">'+r.slice().sort(function(a,b){return a.d<b.d?1:-1}).slice(0,tv?30:99).map(function(x){return '<span class="jn">'+esc(x.j)+' · '+fd(x.d)+'</span>'}).join('')+'</div>';
 return {t:'Close-out & recent installs',h:h}};
P.trends=function(tv){var W=D.weeks,items=W.map(function(w){return {label:fd(w.week),val:w.n,partial:w.partial}}),it2=W.map(function(w){return {label:fd(w.week),val:w.secured,text:money(w.secured),partial:w.partial,color:'var(--retail)'}});
 var h='<h3 style="margin-top:0">Installs per week (last 8)</h3>'+barChart(items,{w:380,h:tv?150:130})+'<h3>$ secured per week</h3>'+barChart(it2,{w:380,h:tv?150:130})+'<div class="note">Lighter bar = week in progress. Secured = retail 100% + core '+Math.round(D.meta.core_secured_pct*100)+'% of Total Job $, dated by install date.</div>';
 return {t:'Trends – last 8 weeks',h:h}};
P.foot=function(){var m=D.meta;return {t:'Definitions & footnotes',cls:'wide',h:'<ul class="foot"><li><b>Population:</b> NJ JobTrac work orders, not canceled, not completed (no DT_JobCompleted / installer report), sold within '+m.cutoff_days+' days. Older open jobs ('+m.stale_open_jobs+', '+money(m.stale_open_dollars)+') are legacy/never-closed and excluded.</li><li><b>Stages</b> (first match): no install date = Sold-unscheduled; install today = Installing today; install date past = Not closed; else Parts ready (job-ready date or all stations done) → In production (any saw/edge/bore/drawer date) → Production queue (cut list done) → Ordered (purchasing checkpoint) → Spec checked → Design/Spec. "Ordered" is a purchasing checkpoint, not a vendor PO receipt.</li><li><b>Core vs retail:</b> retail = Costco / Lowe\'s / Home Depot opportunity; everything else core (incl. designer).</li><li><b>Installed</b> = completed job dated by install date. Today\'s count lags until the office/installer closes the job. <b>Secured $</b> = retail 100%, core '+Math.round(m.core_secured_pct*100)+'% of Total Job $.</li><li><b>Capacity</b> '+m.cap_per_day+' installs/day is an assumption (config), not a system value. Visits come from InstallTrac work orders (NJ parent jobs).</li><li><b>Service</b> = open ServiceTrac created ≤'+m.service_window_days+' days ago; age = days since created. Service $ not shown (field is parent job value).</li><li>Streaks count Mon–Fri workdays with ≥1 install (holidays not excluded) and consecutive completed weeks with installs ≥ prior week.</li></ul>'}};
// ───── layout ─────
var PAGES=[['accomp','attention'],['stages'],['capacity','blockers'],['aging','service'],['trends','closeout']];
function panelHtml(id,tv){var p=P[id](tv);return '<section class="panel '+(p.cls||'')+'" id="p-'+id+'"><h2>'+p.t+'</h2>'+p.h+'</section>'}
var tv=false;
function render(){
 var m=D.meta,gen=new Date(m.generated_epoch*1000);
 $('sub').textContent='Updated '+gen.toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET · '+m.current_jobs+' open jobs · cap '+(capOverride||m.cap_per_day)+'/day';
 stale();
 var main=$('main');
 if(tv){main.innerHTML=PAGES.map(function(pg,i){return '<div class="page'+(pg.length==1?' one':'')+(i===pageIdx?' active':'')+'">'+pg.map(function(id){return panelHtml(id,true)}).join('')+'</div>'}).join('');dots()}
 else main.innerHTML='<div class="page">'+['accomp','attention','capacity','stages','blockers','aging','service','trends','closeout','foot'].map(function(id){return panelHtml(id,false)}).join('')+'</div>';
}
function stale(){if(!D)return;var mins=(Date.now()/1000-D.meta.generated_epoch)/60,b=$('stale');b.classList.remove('hidden');
 if(mins>D.meta.stale_minutes){b.className='badge';b.textContent='⚠ STALE DATA – '+(mins>=120?Math.round(mins/60)+'h':Math.round(mins)+'m')+' old'}else{b.className='badge ok';b.textContent='● live · '+Math.round(mins)+'m ago'}}
function dots(){$('tvdots').innerHTML=PAGES.map(function(_,i){return '<i class="'+(i===pageIdx?'on':'')+'"></i>'}).join('')}
function showPage(i){pageIdx=(i+PAGES.length)%PAGES.length;var ps=document.querySelectorAll('.page');ps.forEach(function(p,k){p.classList.toggle('active',k===pageIdx)});dots();
 var pr=$('tvprog');pr.style.transition='none';pr.style.width='0';void pr.offsetWidth;pr.style.transition='width '+tvSec+'s linear';pr.style.width='100%'}
var tvSec=CFG.tvPageSec;
function setTv(on){tv=on;document.body.classList.toggle('tv',on);document.body.classList.toggle('dark',on||darkPref);document.documentElement.style.fontSize=on?'1.3vw':'';
 ['tvbar','tvdots'].forEach(function(id){$(id).classList.toggle('hidden',!on)});$('btnTv').textContent=on?'Exit TV':'TV mode';
 clearInterval(pageTimer);if(D)render();if(on){pageIdx=0;showPage(0);pageTimer=setInterval(function(){showPage(pageIdx+1)},tvSec*1000)}}
var darkPref=qs.get('dark')==='1'||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.body.classList.toggle('dark',darkPref);
$('btnTv').onclick=function(){var u=new URL(location.href);if(!tv)u.searchParams.set('tv','1');else u.searchParams.delete('tv');history.replaceState(null,'',u);setTv(!tv)};
$('btnRef').onclick=load;
// hash code: #k=CODE (stored, then removed)
if(location.hash.indexOf('#k=')===0){localStorage.setItem(CFG.lsKey,decodeURIComponent(location.hash.slice(3)));history.replaceState(null,'',location.pathname+location.search)}
if(qs.get('sec'))tvSec=Math.max(5,parseInt(qs.get('sec'),10)||tvSec);
if(qs.get('tv')==='1')setTv(true);
if(qs.get('page')&&tv){pageIdx=+qs.get('page')}
load();setInterval(load,CFG.refreshSec*1000);setInterval(stale,30000);
// TV mode: reload page fully once per day to avoid leaks
setTimeout(function(){location.reload()},6*3600*1000);
})();
