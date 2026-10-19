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
function money$(v){if(v==null)return '—';var n=Math.round(v),neg=n<0;return (neg?'-':'')+'$'+Math.abs(n).toLocaleString('en-US')}
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
function nm(j){var n=(D.names||{})[j];return n?j+' – '+n:j}
function jobs(list,crit){return (list||[]).map(function(j){return '<span class="jn'+(crit?' crit':'')+'">'+esc(nm(j))+'</span>'}).join('')}
function chips(list,fn){return (list||[]).map(function(x){var o=fn(x);return '<span class="jn'+(o.crit?' crit':'')+'">'+esc(nm(x.j))+(o.extra?' · '+esc(o.extra):'')+'</span>'}).join('')||'<span class="note">none</span>'}
// ───── panels ─────
var STAGE_NOTE={S0:'no install date',S1a:'spec check not done',S1b:'spec done, no purchasing',S2a:'purchasing done, no cut list',S2b:'cut list done, no station work',S3:'saw/edge/bore/drawer started',S4:'all stations / job ready',S5:'install date = today',S6:'install date past, still open',INST:'completed, last 30d',SVC:'ServiceTrac open <180d'};
var P={};
P.accomp=function(){var c=D.completed,s=D.streaks,l=c.last_week;
 function tile(lab,p,extra){return '<div class="tile"><div class="lab">'+lab+'</div><div class="big">'+p.total.n+' <small>jobs</small></div><div class="row"><span>Completed</span><b>'+money(p.total.v)+'</b></div><div class="row"><span>$ secured</span><b>'+money(p.secured)+'</b></div><div class="row"><span><span class="core">core '+p.core.n+'</span> · <span class="retail">retail '+p.retail.n+'</span></span>'+(extra||'')+'</div></div>'}
 var h='<div class="tiles">'+tile('This week (Mon–)',c.week,delta(c.week.total.n,l.total.n))+tile('This month',c.month)+'</div><div class="chips">';
 h+='<span class="chip">🔥 '+s.workday_streak+' workday install streak</span>';
 h+='<span class="chip">📈 '+s.week_streak+' wk streak ≥ prior week</span>';
 if(s.record_week_installs)h+='<span class="chip'+(s.this_week_is_record?' gold':'')+'">🏆 Record week: '+s.record_week_installs.n+' installs (wk of '+fd(s.record_week_installs.week)+')'+(s.this_week_is_record?' — THIS WEEK!':'')+'</span>';
 if(s.record_week_secured)h+='<span class="chip'+(s.this_week_is_secured_record?' gold':'')+'">💰 Record secured wk: '+money(s.record_week_secured.secured)+' (wk of '+fd(s.record_week_secured.week)+')</span>';
 if(s.record_day)h+='<span class="chip">⭐ Best day: '+s.record_day.n+' installs ('+fd(s.record_day.date)+')</span>';
 h+='<span class="chip">Last week: '+l.total.n+' jobs · '+money(l.total.v)+' · '+money(l.secured)+' secured</span></div>';
 return {t:'🎉 Accomplishments',h:h,cls:'wide'}};
P.money=function(tv){var M=D.money;if(!M)return {t:'Money due',h:'<p class="note">no data</p>',cls:'wide'};
 var ORDER=['NODATE','FUT','NOW','PAST','SVC','RAW','CPD','OLDBAL','UNPAID','OLD'],COL={NODATE:'#8e9bb0',FUT:'#2f6fdd',NOW:'#1f9d63',PAST:'#e0a100',SVC:'#8a5bd6',RAW:'#e5484d',CPD:'#b3262b',OLDBAL:'#7a1f3d',UNPAID:'#e8892b',OLD:'#5b4636'};
 var by={};M.buckets.forEach(function(b){by[b.key]=b});var T=M.total,tt=T.due||1;
 var h='<div class="mhead"><div><div class="lab">Total due to CFNJ</div><div class="mbig">'+money$(T.due)+'</div></div>'
  +'<div class="kv"><div>Jobs w/ balance<b>'+T.n+'</b></div><div><span class="core">Core</span><b>'+money(T.core.due)+'</b></div><div><span class="retail">Retail</span><b>'+money(T.retail.due)+'</b></div><div>Already collected*<b>'+money(T.collected)+'</b></div><div>Total job value*<b>'+money(T.total_job)+'</b></div></div></div>';
 h+='<div class="mbar">'+ORDER.map(function(k){var b=by[k];if(!b||!b.total.due)return '';var w=b.total.due/tt*100;return '<i style="width:'+w+'%;background:'+COL[k]+'" title="'+esc(b.label)+' '+money$(b.total.due)+'">'+(w>=9?'<span>'+Math.round(w)+'%</span>':'')+'</i>'}).join('')+'</div>';
 h+='<table class="mt"><tr><th>Stage</th><th>Jobs</th><th>$ due</th><th>%</th><th class="hm">Core $</th><th class="hm">Retail $</th><th class="hm">Collected*</th></tr>';
 ORDER.forEach(function(k){var b=by[k];if(!b)return;var sub='';if(b.sub&&(b.sub.flagged||b.sub.aged||b.sub.unflagged)){var f=b.sub.flagged||{n:0,due:0},ag=b.sub.aged||{n:0,due:0},uf=b.sub.unflagged||{n:0,due:0};sub=' <span class="note" style="margin:0">ClosetWare-flagged '+f.n+' · '+money(f.due)+(k==='RAW'?' / not flagged '+uf.n+' · '+money(uf.due):' / my aged rule (≥'+M.collections_aged_days+'d, unflagged) '+ag.n+' · '+money(ag.due))+'</span>'}
  h+='<tr class="'+(k==='OLD'?'old':'')+'"><td><span class="dot" style="background:'+COL[k]+'"></span><b>'+esc(b.label)+'</b><div class="note rule" style="margin:0">'+esc(b.rule)+'</div>'+sub+'<div class="note mo" style="margin:0"><span class="core">core '+b.core.n+' · '+money(b.core.due)+'</span> · <span class="retail">retail '+b.retail.n+' · '+money(b.retail.due)+'</span></div></td><td><b>'+b.total.n+'</b><div class="note hm" style="margin:0"><span class="core">'+b.core.n+'</span>/<span class="retail">'+b.retail.n+'</span></div></td><td><b>'+money$(b.total.due)+'</b></td><td>'+(b.total.due/tt*100).toFixed(1)+'%</td><td class="hm core">'+money(b.core.due)+'</td><td class="hm retail">'+money(b.retail.due)+'</td><td class="hm">'+money(b.collected)+'</td></tr>';
  if(!tv&&b.list.length)h+='<tr class="lst"><td colspan="7"><details><summary>Show '+b.list.length+' job'+(b.list.length>1?'s':'')+' (order # – last name – $ due)</summary><div class="scroll">'+b.list.map(function(x){return '<span class="jn'+(k==='RAW'||k==='CPD'||k==='OLDBAL'?' crit':'')+'">'+esc(nm(x.j))+' – '+money$(x.due)+'</span>'}).join('')+'</div></details></td></tr>'});
 h+='<tr class="tot"><td>Total due to CFNJ</td><td>'+T.n+'</td><td>'+money$(T.due)+'</td><td>100%</td><td class="hm core">'+money(T.core.due)+'</td><td class="hm retail">'+money(T.retail.due)+'</td><td class="hm">'+money(T.collected)+'</td></tr></table>';
 h+='<div class="note">Mutually exclusive, one bucket per order, first match wins: Retail awaiting payment → Core past due (recent) → Old balances → Service → Completed (unpaid) → Older than '+D.meta.cutoff_days+'d → No date → Installing now → Future → Past install. $ due = ClosetWare Balance Due (contract − paid, incl. tax). *Collected / job value (excl. tax) shown for context, for these jobs only. Older-than-'+D.meta.cutoff_days+'d line = open jobs sold >'+D.meta.cutoff_days+'d ago, still included in the total.'
  +'<br><b>Collections split</b> (old “Collections” set = ClosetWare In_Collections__c flag OR installed ≥'+M.collections_aged_days+'d ago with balance): <b>Retail awaiting payment</b> = retail installed/completed ≤'+M.retail_awaiting_days+'d ago with a balance, flagged or not (unflagged ones that would otherwise be “Completed – unpaid” move here; an open service ticket only blocks this for unflagged, &lt;'+M.collections_aged_days+'d orders). <b>Core past due (recent)</b> = flagged or aged ≥'+M.collections_aged_days+'d, installed ≤'+M.old_balance_days+'d ago (the few retail installed '+M.retail_awaiting_days+'–'+M.old_balance_days+'d ago land here too, shown in the retail split). <b>Old balances</b> = flagged/aged but installed &gt;'+M.old_balance_days+'d ago or never installed. “Flagged” = ClosetWare flag; “aged” = my rule only. Retail is flagged automatically ~1 day after install, so the flag alone is not a signal for retail.'+(M.credits.n?' Not counted: '+M.credits.n+' overpaid orders (credits '+money$(M.credits.amt)+')':'')+(M.dust.n?', '+M.dust.n+' rounding balances (&lt;$'+M.balance_min+', '+money$(M.dust.amt)+')':'')+(M.cancelled_orders_excluded?', '+M.cancelled_orders_excluded+' canceled orders.':'.')+'</div>';
 return {t:'💵 Money due to Closet Factory NJ – by stage',h:h,cls:'wide money'}};
P.secured=function(tv){var S=D.secured;if(!S)return {t:'Installs – volume vs $ secured',h:'<p class="note">no data</p>',cls:'wide'};
 var R=S.rates||{},PL={core:'Core',costco:'Costco',lowes:'Lowe\'s',other:'Other partner'};
 function pc(x){return Math.round(x*1000)/10+'%'}
 function cnt(n){return (Math.round(n*10)/10)}
 function split(o,kind){return ['core','costco','lowes'].map(function(k){var a=o[k];var v=kind==='sec'?a:a.v,n=kind==='sec'?null:a.n;return '<span class="sx sx-'+k+'"><i>'+PL[k]+'</i><b>'+money(v)+'</b>'+(n!=null?'<small>'+cnt(n)+' job'+(n==1?'':'s')+'</small>':'')+'</span>'}).join('')+(kind!=='sec'&&o.other&&o.other.n?'<span class="sx sx-other"><i>Other (rate unconfirmed)</i><b>'+money(o.other.v)+'</b><small>'+cnt(o.other.n)+'</small></span>':'')}
 function tile(lab,sub,w,avg){var c=w.confirmed,u=w.unconfirmed,ru=w.rate_unconfirmed||{n:0,v:0},dg=w.designer||{n:0};
  var h='<div class="stile'+(avg?' avg':'')+'"><div class="lab">'+lab+' <span class="note">'+sub+'</span></div>';
  h+='<div class="smet vol"><div class="sl">Total job $ installed (volume)</div><div class="sb">'+money$(w.installed.total.v)+' <small>'+cnt(w.installed.total.n)+' jobs</small></div><div class="ss">'+split(w.installed,'vol')+'</div></div>';
  h+='<div class="smet sec"><div class="sl">$ secured (confirmed installs)</div><div class="sb">'+money$(w.secured.total)+' <small>'+cnt(c.n)+' confirmed</small></div><div class="ss">'+split(w.secured,'sec')+'</div>'
   +'<div class="note" style="margin:2px 0 0">Confirmed by ClosetWare '+cnt(c.closetware)+' · Teams '+cnt(c.teams)+'</div></div>';
  h+='<div class="sunc'+(u.n?' has':'')+'">Installed, not yet confirmed: <b>'+cnt(u.n)+' job'+(u.n==1?'':'s')+' · '+money$(u.v)+'</b> <span class="note">(full value, no secured credit)</span></div>';
  if(ru.n||dg.n)h+='<div class="sflag">'+(ru.n?'⚠ '+cnt(ru.n)+' Home Depot/other-partner job(s) '+money(ru.v)+' – rate unconfirmed, excluded from secured. ':'')+(dg.n?'⚑ '+cnt(dg.n)+' designer-referral job(s) counted as core (flagged).':'')+'</div>';
  return h+'</div>'}
 var tw=S.this_week,lw=S.last_week,a=S.avg4,ws=a.weeks||[];
 var h='<div class="stiles">'+tile('This week','wk of '+fd(tw.week)+' · in progress, through today',tw)+tile('Last week','wk of '+fd(lw.week),lw)+tile('4-week average','wks of '+fd(ws[0])+'–'+fd(ws[ws.length-1])+' (complete weeks)',a,true)+'</div>';
 var T=S.teams||{},tn=T.present?(T.ok?'Teams file '+(T.generated?'updated '+new Date(T.generated).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET':'')+(T.stale?' (STALE)':'')+' · '+T.entries+' Teams confirmation(s), '+T.ambiguous+' ambiguous (not counted)':T.note):(T.note||'no Teams file');
 h+='<div class="note sdef"><b>Definitions:</b> <b>Total job $ installed</b> = full Total Job $ of every job whose install date falls in the week (not canceled; through today) – factory/install volume. <b>$ secured</b> = only installs confirmed complete: ClosetWare Job Completed / Installer Report date, or a Teams message clearly reporting that job completed (partial / punch list / return trip / issue do not count). Rates of job total: core '+pc(R.core)+' (60% deposit already collected; designer referrals treated as core, flagged) · Costco '+pc(R.costco)+' (11% Costco cut + 10% client shop card) · Lowe\'s '+pc(R.lowes)+' (17.5% cut) · Home Depot/other: rate unconfirmed, excluded. Core/Costco/Lowe\'s from Opportunity source type + client flags (source CORE/DESIGNER overrides a Costco flag). '+esc(tn)+'.</div>';
 if(!tv){var U=S.unconfirmed_list||[];h+='<details><summary>Installed, not yet confirmed – '+U.length+' job'+(U.length==1?'':'s')+' (last '+S.weeks.length+' weeks; order # – last name – install date – $)</summary><div class="scroll">'+(U.map(function(x){return '<span class="jn crit">'+esc(nm(x.j))+' · '+fd(x.d)+' · '+esc(PL[x.p]||x.p)+' · '+money(x.v)+(x.amb?' · '+esc(x.amb):'')+'</span>'}).join('')||'<span class="note">none</span>')+'</div></details>';
  var F=S.flags||[];if(F.length)h+='<details><summary>Flags – '+F.length+' job'+(F.length==1?'':'s')+' (designer referral / tie-break / rate unconfirmed)</summary><div class="scroll">'+F.map(function(x){return '<span class="jn">'+esc(nm(x.j))+' · '+fd(x.d)+' · '+esc(x.note)+(x.conf?'':' · not yet confirmed')+'</span>'}).join('')+'</div></details>'}
 return {t:'💰 Installs – total job $ installed vs $ secured',h:h,cls:'wide'}};
P.attention=function(tv){var a=D.attention,h='';if(!a.length)h='<p><span class="pill ok">OK</span> Nothing flagged.</p>';
 var red=a.filter(function(x){return x.level==='RED'}).length,amb=a.length-red;
 a.slice(0,tv?4:99).forEach(function(x){h+='<div class="att '+x.level+'"><div class="t"><span class="pill '+x.level+'">'+x.level+'</span>'+esc(x.title)+'</div><div class="r">'+esc(x.reason)+'</div><div class="m">➜ '+esc(x.move)+'</div>'+(x.jobs.length?'<div>'+jobs(x.jobs.slice(0,tv?8:12))+(x.jobs.length>(tv?8:12)?' <span class="note">+more</span>':'')+'</div>':'')+'</div>'});
 return {t:'⚠️ Needs attention <span class="note">'+red+' red · '+amb+' amber</span>',h:'<div class="attgrid">'+h+'</div>',cls:tv?'wide':'span2'}};
P.stages=function(tvMode){var h='<table><tr><th>Stage</th><th>Core #</th><th class="hm">Core $</th><th>Retail #</th><th class="hm">Retail $</th><th>Total #</th><th>Total $</th></tr>',tc=0,tr=0,tcv=0,trv=0;
 D.stages.forEach(function(s){var pipe=s.key!=='INST'&&s.key!=='SVC';if(pipe){tc+=s.core.n;tr+=s.retail.n;tcv+=s.core.v;trv+=s.retail.v}
  h+='<tr><td><b>'+esc(s.label)+'</b><div class="note" style="margin:0">'+esc(STAGE_NOTE[s.key]||'')+(s.median_age!=null?' · med '+s.median_age+'d since sold':'')+'</div>'+stack(s.core.n,s.retail.n)+'</td><td class="core">'+s.core.n+'</td><td class="hm">'+(s.dollars_na?'—':money(s.core.v))+'</td><td class="retail">'+s.retail.n+'</td><td class="hm">'+(s.dollars_na?'—':money(s.retail.v))+'</td><td><b>'+s.total.n+'</b></td><td><b>'+(s.dollars_na?'—':money(s.total.v))+'</b></td></tr>';
  if(!tvMode&&s.list&&s.list.length)h+='<tr class="lst"><td colspan="7"><details><summary>Show '+s.list.length+' job'+(s.list.length>1?'s':'')+' (order # – last name)</summary><div class="scroll">'+chips(s.list,function(x){return {crit:s.key==='S6'||(x.age>60&&s.key!=='INST'&&s.key!=='SVC'),extra:x.inst?fd(x.inst)+' · '+x.age+'d':x.d?fd(x.d):(x.age!=null?x.age+'d':'')}})+'</div></details></td></tr>';
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
P.blockers=function(tv){var b=D.blockers,lim=tv?11:99,h='<div class="note" style="margin:0 0 6px">Installs within 14 days still before Parts Ready ('+b.filter(function(x){return x.crit}).length+' critical of '+b.length+')</div><div class="scroll"><table><tr><th>Job # – Client</th><th>Stage</th><th>Install</th><th>In</th><th>Seg</th><th>$</th></tr>';
 b.slice(0,lim).forEach(function(x){h+='<tr><td><span class="jn'+(x.crit?' crit':'')+'">'+esc(nm(x.j))+'</span></td><td>'+x.st+'</td><td>'+fd(x.inst)+'</td><td>'+x.dti+'d</td><td class="'+x.seg+'">'+x.seg+'</td><td>'+money(x.v)+'</td></tr>'});
 h+='</table>'+(b.length>lim?'<div class="note">+'+(b.length-lim)+' more</div>':'')+'</div><div class="note">Proxy: no PO/vendor data in ClosetWare. Red = ≤7d out and still design/spec/ordered, ≤3d out in prod queue, or ≤1d out in production.</div>';
 return {t:'Parts-not-ready blockers',h:h}};
function pipeTable(Pp,jobs,summ,c,lim,tv,addon){if(!jobs.length)return '<p class="note">'+(addon?'No add-on jobs in the window.':'no jobs in the window')+'</p>';
 var SHORT=['Design / Spec','Spec checked','Purchased / Ordered','Cut list done<br><small>prod. queue</small>','In production<br><small>saw·edge·bore·drawers</small>','Parts ready','Install date'],
 LC={};
 var h='<div class="pl-sum">'+summ.map(function(s,i){var t=s.n||0;return '<div class="pl-sc"><div class="pl-sn">'+t+'</div><div class="pl-sl">'+SHORT[i].split('<br>')[0]+'</div><div class="pl-sb">'+(t?'<i class="R" style="flex:'+s.red+'"></i><i class="A" style="flex:'+s.amber+'"></i><i class="G" style="flex:'+s.green+'"></i>':'')+'</div></div>'}).join('')
  +'<div class="pl-sc pl-tot"><div class="pl-sn">'+jobs.length+'</div><div class="pl-sl">jobs ≤'+Pp.window_days+'d out</div><div class="pl-leg"><span class="lg R"></span>'+c.red+' <span class="lg A"></span>'+c.amber+' <span class="lg G"></span>'+c.green+'</div></div></div>';
 h+='<div class="note" style="margin:2px 0 6px">'+(addon?'Add-on jobs (extra shelf/add-on orders, lighter production) by <b>current stage</b>':'At-risk jobs by <b>current stage</b>')+' (bar = red / amber / green). Rows sorted by install date, soonest first.'+(tv&&jobs.length>lim?' Top '+lim+' of '+jobs.length+'.':'')+'</div>';
 h+='<div class="pl-wrap"><div class="pl-grid"><div class="pl-row pl-head"><div class="pl-job">Order # – last name</div><div class="pl-meta">Install · seg · $</div>'+SHORT.map(function(x){return '<div class="pl-c">'+x+'</div>'}).join('')+'</div>';
 jobs.slice(0,lim).forEach(function(p){var cells='';
  p.steps.forEach(function(st,i){var cls,mark='',tip=SHORT[i].replace(/<[^>]*>/g,' ');
   if(i===6){cells+='<div class="pl-c pl-inst"><b>'+fd(p.inst)+'</b><small>'+p.dti+'d</small></div>';return}
   if(st.done){cls='done';mark='✓'}else if(i===p.cur){cls='cur';mark=(st.part?(st.n+'/4'):'●')}else cls='todo';
   tip+=': '+(st.done?('done'+(st.d?' '+st.d:'')):(i===p.cur?'CURRENT'+(st.part?' ('+st.n+' of 4 stations)':'')+(st.d&&st.part?' started '+st.d:''):'not done'));
   cells+='<div class="pl-c" title="'+esc(tip)+'" tabindex="0"><span class="pl-dot '+cls+' '+p.lvl+'">'+mark+'</span><small>'+(st.done&&st.d?fd(st.d):(i===p.cur&&st.part&&st.d?fd(st.d):'&nbsp;'))+'</small></div>'});
  var why=p.lvl==='RED'?'RED: projected parts-ready '+fd(p.proj)+' is '+(-p.margin)+'d after needed-by date':p.lvl==='AMBER'?'AMBER: only '+p.margin+'d of slack':'GREEN: '+p.margin+'d of slack';
  h+='<div class="pl-row L'+p.lvl+'" title="'+esc(why+' · est. '+p.rem+'d of work left')+'"><div class="pl-job"><span class="jn '+(p.lvl==='RED'?'crit':'')+'">'+esc(nm(p.j))+'</span></div><div class="pl-meta"><b>'+fd(p.inst)+'</b> · '+p.dti+'d · <span class="'+p.seg+'">'+(p.seg==='retail'?'retail':'core')+'</span> · '+money(p.v)+'</div>'+cells+'</div>'});
 h+='</div></div>';
 return h}
P.pipeline=function(tv){var Pp=D.pipeline;if(!Pp||!(Pp.jobs.length||(Pp.addon_jobs||[]).length))return {t:'Parts pipeline – where each at-risk job is',h:'<p class="note">no jobs in the window</p>',cls:'wide'};
 var c=Pp.counts,ac=Pp.addon_counts||{red:0,amber:0,green:0},aj=Pp.addon_jobs||[];
 var h=pipeTable(Pp,Pp.jobs,Pp.summary,c,tv?(Pp.tv_jobs||12):Pp.jobs.length,tv,false);
 var L=Pp.lags;
 h+='<div class="note">✓ done (hover/tap for milestone date, small text under marker) · ◉ current step · empty = not done (a later step can be filled if an earlier one was skipped/unrecorded). <b>Rule:</b> projected parts-ready = today + remaining median lags (sale→spec '+L.sale_to_spec+'d, spec→purchase '+L.spec_to_purch+'d, purchase→cut list '+L.purch_to_cutlist+'d, cut list→saw '+L.cutlist_to_saw+'d, saw→all stations '+L.prod_to_ready+'d, minus time already elapsed). Needed-by = install − '+Pp.ready_buffer+'d. <span class="pill RED">RED</span> projected after needed-by · <span class="pill">AMBER</span> slack &lt; '+Pp.amber_margin+'d · <span class="pill ok">GREEN</span> otherwise. Proxy only – no PO/vendor data.</div>';

 h+='<h2 class="pl-addon-h">➕ Add-on jobs – parts pipeline <span class="note">'+aj.length+' add-on'+(aj.length==1?'':'s')+' · '+ac.red+' red · '+ac.amber+' amber · '+ac.green+' green</span></h2>'+pipeTable(Pp,aj,Pp.addon_summary||[],ac,tv?(Pp.addon_tv_jobs||6):aj.length,tv,true)+'<div class="note">Add-ons = orders flagged <b>Add-On Order</b> (Order.AddOn__c) in ClosetWare; shown separately, same stages and risk rules, and excluded from the main at-risk table above.</div>';
 return {t:'🧭 Parts pipeline – where each at-risk job is <span class="note">'+c.red+' red · '+c.amber+' amber · '+c.green+' green</span>',h:h,cls:'wide'}};
P.today=function(tv){var s=D.stages.filter(function(x){return x.key==='S5'})[0]||{list:[],total:{n:0}},pd=D.not_closed;
 var h='<div class="note" style="margin:0 0 6px">Installing today ('+s.list.length+')</div><div class="scroll">'+chips(s.list,function(x){return {extra:''}})+'</div>';
 h+='<h3>Past install date – not closed ('+pd.length+')</h3><div class="scroll">'+pd.slice(0,tv?40:99).map(function(x){return '<span class="jn'+(x.days>30?' crit':'')+'">'+esc(nm(x.j))+' · '+fd(x.inst)+' ('+x.days+'d ago)</span>'}).join('')+'</div>';
 return {t:'Installing today & past install date',h:h}};
P.sched=function(tv){var by={};D.jobs.forEach(function(x){if(x.inst&&x.inst>D.meta.today){(by[x.inst]=by[x.inst]||[]).push(x)}});
 var ds=Object.keys(by).sort().slice(0,tv?6:14),h='<div class="note" style="margin:0 0 6px">Open jobs by upcoming install date</div><div class="scroll">';
 if(!ds.length)h+='<span class="note">none</span>';
 ds.forEach(function(d){h+='<h3>'+fd(d)+' ('+by[d].length+')</h3>'+by[d].map(function(x){return '<span class="jn">'+esc(nm(x.j))+' · '+x.st+'</span>'}).join('')});
 return {t:'Install schedule – upcoming',h:h+'</div>'}};
P.aging=function(tv){var tot=D.aging.reduce(function(a,x){return a+x.total.n},0)||1,h='<table><tr><th>Since sold</th><th>Core</th><th>Retail</th><th>Jobs</th><th>$</th></tr>';
 D.aging.forEach(function(a){h+='<tr><td>'+a.label+stack(a.core.n,a.retail.n)+'</td><td class="core">'+a.core.n+'</td><td class="retail">'+a.retail.n+'</td><td><b>'+a.total.n+'</b></td><td>'+money(a.total.v)+'</td></tr>'});
 var L=D.lead;h+='</table><div class="kv" style="margin-top:8px"><div>Median age (open)<b>'+num(L.median_open_age)+'d</b></div><div>Sale→install (90d)<b>'+num(L.median_sale_to_install_90d)+'d</b></div><div>p90<b>'+num(L.p90)+'d</b></div></div>';
 var u=D.unscheduled;h+='<h3>Sold – unscheduled ('+u.length+')</h3><div class="scroll">'+u.slice(0,tv?8:99).map(function(x){return '<span class="jn'+(x.age>30?' crit':'')+'">'+esc(nm(x.j))+' · '+x.age+'d · '+money(x.v)+'</span>'}).join('')+'</div>';
 return {t:'Install lead time & aging',h:h}};
P.service=function(tv){var s=D.service,h='<div class="kv"><div>Open (≤'+D.meta.service_window_days+'d)<b>'+s.open+'</b></div><div>Median age<b>'+num(s.median_age)+'d</b></div><div>&gt;30 days<b style="color:'+(s.over30?'var(--red)':'inherit')+'">'+s.over30+'</b></div><div>No visit date<b>'+s.unscheduled+'</b></div></div>';
 h+=barChart(s.buckets.map(function(b,i){return {label:b.label,val:b.n,color:i>=3?'var(--red)':i==2?'var(--amb)':'var(--acc)'}}),{w:340,h:tv?150:120});
 var w=s.completed_wait;h+='<div class="note">Completed in last '+D.meta.service_window_days+'d (n='+w.n+'): created→visit median '+num(w.median)+'d · p75 '+num(w.p75)+'d · p90 '+num(w.p90)+'d. Core '+s.core+' / retail '+s.retail+'. '+s.stale_excluded+' older open WOs excluded (migration backlog).</div>';
 h+='<div class="scroll"><table><tr><th>Service WO – Client</th><th>Age</th><th>Visit</th><th>Cause</th></tr>'+s.list.slice(0,tv?4:40).map(function(x){return '<tr><td><span class="jn'+(x.age>30?' crit':'')+'">'+esc(nm(x.j))+'</span></td><td>'+x.age+'d</td><td>'+(x.sched?fd(x.sched)+' (+'+x.sched_wait+'d)':'—')+'</td><td>'+esc(x.cause||'')+'</td></tr>'}).join('')+'</table></div>';
 return {t:'Service / return-trip queue',h:h}};
P.closeout=function(tv){var n=D.not_closed,h='<div class="note" style="margin:0 0 6px">Install date passed, no completion/installer report ('+n.length+')</div><div class="scroll">'+n.slice(0,tv?40:99).map(function(x){return '<span class="jn'+(x.days>30?' crit':'')+'">'+esc(nm(x.j))+' · '+x.days+'d ago</span>'}).join('')+'</div>';
 var r=D.done_recent;h+='<h3>Installed last 7 days ('+r.length+')</h3><div class="scroll">'+r.slice().sort(function(a,b){return a.d<b.d?1:-1}).slice(0,tv?30:99).map(function(x){return '<span class="jn">'+esc(nm(x.j))+' · '+fd(x.d)+'</span>'}).join('')+'</div>';
 return {t:'Close-out & recent installs',h:h}};
P.trends=function(tv){var W=D.weeks,items=W.map(function(w){return {label:fd(w.week),val:w.n,partial:w.partial}}),it2=W.map(function(w){return {label:fd(w.week),val:w.secured,text:money(w.secured),partial:w.partial,color:'var(--retail)'}});
 var h='<h3 style="margin-top:0">Installs per week (last 8)</h3>'+barChart(items,{w:380,h:tv?150:130})+'<h3>$ secured per week</h3>'+barChart(it2,{w:380,h:tv?150:130})+'<div class="note">Lighter bar = week in progress. Secured = ClosetWare-confirmed installs × rate (core 40%, Costco 79%, Lowe\'s 82.5%; HD/other excluded), dated by install date. See the “Installs – total job $ installed vs $ secured” panel for Teams confirmations.</div>';
 return {t:'Trends – last 8 weeks',h:h}};
P.foot=function(){var m=D.meta;return {t:'Definitions & footnotes',cls:'wide',h:'<ul class="foot"><li><b>Money due:</b> WorkOrder.Balance_Due__c (= Order.Balance_Due__c = contract amount − total paid), counted once per Order so job + service work orders never double count. Former “Collections” bucket is split into Retail awaiting payment (≤'+(D.money?D.money.retail_awaiting_days:'?')+'d), Core past due (recent, ≤'+(D.money?D.money.old_balance_days:'?')+'d) and Old balances (older/never installed); membership = Order.In_Collections__c or completed job aged ≥ '+(D.money?D.money.collections_aged_days:'?')+' days with balance due (config COLLECTIONS_AGED_DAYS, RETAIL_AWAITING_DAYS, OLD_BALANCE_DAYS).</li><li><b>Population:</b> NJ JobTrac work orders, not canceled, not completed (no DT_JobCompleted / installer report), sold within '+m.cutoff_days+' days. Older open jobs ('+m.stale_open_jobs+', '+money(m.stale_open_dollars)+') are legacy/never-closed and excluded.</li><li><b>Stages</b> (first match): no install date = Sold-unscheduled; install today = Installing today; install date past = Not closed; else Parts ready (job-ready date or all stations done) → In production (any saw/edge/bore/drawer date) → Production queue (cut list done) → Ordered (purchasing checkpoint) → Spec checked → Design/Spec. "Ordered" is a purchasing checkpoint, not a vendor PO receipt.</li><li><b>Core vs retail:</b> retail = Costco / Lowe\'s / Home Depot opportunity; everything else core (incl. designer).</li><li><b>Total job $ installed (volume)</b> = full Total Job $ of jobs with install date in the week (not canceled). <b>$ secured (confirmed installs)</b> = confirmed-complete installs only (ClosetWare Job Completed / Installer Report, or a clear Teams completion report) × core 40% (60% deposit collected; designer = core, flagged) / Costco 79% (11% cut + 10% shop card) / Lowe\'s 82.5% (17.5% cut); Home Depot/other = rate unconfirmed, excluded. Installed-not-confirmed jobs get no secured credit. Accomplishments/Trends use ClosetWare confirmations only.</li><li><b>Capacity</b> '+m.cap_per_day+' installs/day is an assumption (config), not a system value. Visits come from InstallTrac work orders (NJ parent jobs).</li><li><b>Service</b> = open ServiceTrac created ≤'+m.service_window_days+' days ago; age = days since created. Service $ not shown (field is parent job value).</li><li>Streaks count Mon–Fri workdays with ≥1 install (holidays not excluded) and consecutive completed weeks with installs ≥ prior week.</li></ul>'}};
// ───── layout ─────
var PAGES=[['money'],['secured'],['accomp','attention'],['today','sched'],['stages'],['capacity','blockers'],['pipeline'],['aging','service'],['trends','closeout']];
function panelHtml(id,tv){var p=P[id](tv);return '<section class="panel '+(p.cls||'')+'" id="p-'+id+'"><h2>'+p.t+'</h2>'+p.h+'</section>'}
var tv=false;
function render(){
 var m=D.meta,gen=new Date(m.generated_epoch*1000);
 $('sub').textContent='Updated '+gen.toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' ET · '+m.current_jobs+' open jobs · cap '+(capOverride||m.cap_per_day)+'/day';
 stale();
 var main=$('main');
 if(tv){main.innerHTML=PAGES.map(function(pg,i){return '<div class="page'+(pg.length==1?' one':'')+(i===pageIdx?' active':'')+'">'+pg.map(function(id){return panelHtml(id,true)}).join('')+'</div>'}).join('');dots()}
 else main.innerHTML='<div class="page">'+['money','secured','accomp','attention','blockers','pipeline','today','sched','capacity','stages','aging','service','trends','closeout','foot'].map(function(id){return panelHtml(id,false)}).join('')+'</div>';
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
