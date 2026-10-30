/**
 * Sahaara AI / CareTrack — Mental Health & Wellbeing Suite
 */

const MONITOR_KEY = 'caretrack.wellbeing-monitor.v1';
function monitorData() {
  try {
    const raw = store.get(MONITOR_KEY);
    const d = raw ? JSON.parse(raw) : {};
    return { moods: Array.isArray(d.moods) ? d.moods : [], assessments: Array.isArray(d.assessments) ? d.assessments : [], journal: Array.isArray(d.journal) ? d.journal : [] };
  } catch (_) { return { moods: [], assessments: [], journal: [] }; }
}
function saveMonitorData(d) {
  try { store.set(MONITOR_KEY, JSON.stringify(d)); toast('Saved on this device.'); render(); }
  catch (_) { toast('Could not save this entry. Please try again.', true); }
}
function monitorDateLabel(value) { try { return new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}); } catch (_) { return String(value || ''); } }
let monitorEditId = null, monitorSaving = false;
function mLocalInput(d){const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes());}
function monitorWindow(list,days,offset){const end=new Date();end.setHours(23,59,59,999);end.setDate(end.getDate()-offset);const start=new Date(end);start.setDate(start.getDate()-days+1);start.setHours(0,0,0,0);return list.filter(m=>{const t=new Date(m.at).getTime();return t>=start.getTime()&&t<=end.getTime();});}
function monitorAvg(list,key){const v=list.map(m=>m[key]).filter(x=>x!==''&&x!=null&&isFinite(Number(x))).map(Number);return v.length?{avg:v.reduce((a,b)=>a+b,0)/v.length,n:v.length}:null;}
function monitorCompare(label,cur,prev,unit){
  if(!cur||!prev||cur.n<3||prev.n<3)return `<p class="muted">${label}: not enough recorded entries in both weeks to compare (this week ${cur?cur.n:0}, previous week ${prev?prev.n:0}; at least 3 each are needed).</p>`;
  const d=cur.avg-prev.avg,w=Math.abs(d)<0.3?'about the same as':d>0?'higher than':'lower than';
  return `<p class="muted">${label}: your recorded average this week (${cur.avg.toFixed(1)}${unit}, ${cur.n} entries) was ${w} the previous week (${prev.avg.toFixed(1)}${unit}, ${prev.n} entries). This describes your entries only; it does not explain why.</p>`;
}
function monitorChart(list){
  const pts=list.filter(m=>m.mood>=1&&m.mood<=5).map(m=>({t:new Date(m.at).getTime(),v:m.mood})).sort((a,b)=>a.t-b.t);
  if(pts.length<2)return '<p class="muted">A trend line appears once you have at least two check-ins in this period.</p>';
  const W=600,H=180,L=34,R=10,T=10,B=24,t0=pts[0].t,t1=pts[pts.length-1].t||1,sp=(t1-t0)||1;
  const x=t=>L+(t-t0)/sp*(W-L-R),y=v=>T+(5-v)/4*(H-T-B);
  const fmt=t=>new Date(t).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  return `<div class="tablewrap"><svg viewBox="0 0 ${W} ${H}" style="min-width:420px;width:100%" role="img" aria-label="Line chart of ${pts.length} recorded mood ratings from ${fmt(t0)} to ${fmt(t1)}, scale 1 to 5. Gaps mean no entry was recorded.">${[1,2,3,4,5].map(v=>`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity=".12"/><text x="4" y="${y(v)+4}" font-size="11" fill="currentColor" opacity=".7">${v}</text>`).join('')}<polyline fill="none" stroke="var(--brand,#0d9488)" stroke-width="2" points="${pts.map(p=>x(p.t).toFixed(1)+','+y(p.v).toFixed(1)).join(' ')}"/>${pts.map(p=>`<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="var(--brand,#0d9488)"/>`).join('')}<text x="${L}" y="${H-5}" font-size="11" fill="currentColor" opacity=".7">${fmt(t0)}</text><text x="${W-R}" y="${H-5}" font-size="11" text-anchor="end" fill="currentColor" opacity=".7">${fmt(t1)}</text></svg></div><p class="xs muted">Self-reported mood, 1 (very low) to 5 (very good). ${pts.length} recorded entries; days without entries are not plotted and are not treated as low mood.</p>`;
}
function renderMoodPage() {
  const d=monitorData(), recent=d.moods.slice().sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,10);
  const ed=monitorEditId?d.moods.find(m=>m.id===monitorEditId):null, e=ed||{}, now=new Date();
  const emo=['Calm','Happy','Hopeful','Sad','Anxious','Stressed','Angry','Numb','Mixed / unsure'];
  return `<div class="page-h"><div><h1>Mood check-in</h1><p class="muted">Notice how you're feeling over time, without judging yourself.</p></div></div><div class="banner info mb16">${ic('info',16)}<span>Check-ins are self-reported wellness notes, not a diagnosis. Only mood is required; skip anything else. Stored on this device only.</span></div><div class="card p20 mb24"><h3 class="mb16">${ed?'Edit check-in':'How are you feeling right now?'}</h3><form data-monitor="mood" onsubmit="saveMoodCheckin(event)"><label class="field-label" for="wmood">Overall mood (1 = very low, 5 = very good) *</label><select class="input mb16" id="wmood" name="mood" required>${['Choose a rating','1 · Very low','2 · Low','3 · Okay / mixed','4 · Good','5 · Very good'].map((t,i)=>`<option value="${i||''}"${e.mood===i&&i?' selected':''}>${t}</option>`).join('')}</select><label class="field-label" for="wemotion">Main feeling (optional)</label><select class="input mb16" id="wemotion" name="emotion"><option value="">Skip</option>${emo.map(x=>`<option${e.emotion===x?' selected':''}>${x}</option>`).join('')}</select><div class="grid g2"><div><label class="field-label" for="wstress">Stress (0–10, optional)</label><input class="input mb16" id="wstress" name="stress" type="number" inputmode="numeric" min="0" max="10" step="1" value="${esc(e.stress??'')}" placeholder="Skip"></div><div><label class="field-label" for="wsleep">Sleep last night, hours (optional)</label><input class="input mb16" id="wsleep" name="sleep" type="number" inputmode="decimal" min="0" max="24" step="0.5" value="${esc(e.sleep??'')}" placeholder="Skip"></div></div><label class="field-label" for="wtime">Date and time of this check-in</label><input class="input mb16" id="wtime" name="at" type="datetime-local" max="${mLocalInput(now)}" value="${mLocalInput(ed?new Date(ed.at):now)}"><p class="xs muted mb16" style="margin-top:-8px">Change this only if you are intentionally recording an earlier check-in.</p><label class="field-label" for="wtrigger">Anything that may have affected your mood? (optional)</label><textarea class="input mb16" id="wtrigger" name="note" rows="3" maxlength="1500" placeholder="A situation, activity, or something that helped…">${esc(e.note||'')}</textarea><div class="row wrap" style="gap:8px"><button class="btn btn-p" type="submit" id="mood-save">${ed?'Save changes':'Save mood check-in'}</button>${ed?'<button class="btn btn-o" type="button" onclick="cancelMoodEdit()">Cancel</button>':''}</div></form></div><div class="card p20"><h3 class="mb16">Recent check-ins</h3>${recent.length?recent.map(m=>`<div class="row sb" style="padding:12px 0;border-bottom:1px solid var(--line);gap:12px;align-items:flex-start"><div style="min-width:0"><strong>${esc(m.emotion||'Mood')} · ${esc(m.mood)}/5</strong><p class="xs muted">${esc(monitorDateLabel(m.at))}${m.stress!==''&&m.stress!=null?` · Stress ${esc(m.stress)}/10`:''}${m.sleep!==''&&m.sleep!=null?` · ${esc(m.sleep)} h sleep`:''}</p>${m.note?`<p class="muted mt8" style="overflow-wrap:anywhere">${esc(m.note)}</p>`:''}</div><div class="row" style="gap:6px;flex-shrink:0"><button class="btn btn-o btn-sm" onclick="editMoodCheckin('${esc(m.id)}')" aria-label="Edit check-in from ${esc(monitorDateLabel(m.at))}">Edit</button><button class="btn btn-o btn-sm" onclick="deleteMoodCheckin('${esc(m.id)}')" aria-label="Delete check-in from ${esc(monitorDateLabel(m.at))}">Delete</button></div></div>`).join(''):'<p class="muted">No check-ins yet. Your saved entries will appear here.</p>'}</div>`;
}
function editMoodCheckin(id){monitorEditId=id;render();window.scrollTo(0,0);}
function cancelMoodEdit(){monitorEditId=null;render();}
function deleteMoodCheckin(id){if(!confirm('Delete this check-in from this browser? This cannot be undone.'))return;const d=monitorData();d.moods=d.moods.filter(m=>m.id!==id);if(monitorEditId===id)monitorEditId=null;saveMonitorData(d);}
function saveMoodCheckin(e) {
  e.preventDefault(); if(monitorSaving)return;
  const f=new FormData(e.target), mood=Number(f.get('mood')), num=(k,lo,hi)=>{const s=String(f.get(k)||'').trim();if(s==='')return '';const n=Number(s);return isFinite(n)&&n>=lo&&n<=hi?n:NaN;};
  if(!Number.isInteger(mood)||mood<1||mood>5){toast('Choose a mood rating first.',true);return;}
  const stress=num('stress',0,10),sleep=num('sleep',0,24);
  if(Number.isNaN(stress)){toast('Stress must be a whole number from 0 to 10, or left blank.',true);return;}
  if(Number.isNaN(sleep)){toast('Sleep must be between 0 and 24 hours, or left blank.',true);return;}
  const at=new Date(String(f.get('at')||'')||Date.now());
  if(isNaN(at)||at.getTime()>Date.now()+60000){toast('Choose a valid date and time that is not in the future.',true);return;}
  monitorSaving=true;setTimeout(()=>{monitorSaving=false;},800);
  const rec={mood,emotion:String(f.get('emotion')||''),stress,sleep,note:String(f.get('note')||'').trim(),at:at.toISOString()};
  const d=monitorData();
  if(monitorEditId){const i=d.moods.findIndex(m=>m.id===monitorEditId);if(i>=0)d.moods[i]=Object.assign({},d.moods[i],rec,{edited:new Date().toISOString()});monitorEditId=null;}
  else d.moods.push(Object.assign({id:'m'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)},rec));
  d.moods.sort((a,b)=>new Date(a.at)-new Date(b.at));
  saveMonitorData(d);
}
function renderInsightsPage(){
  const d=monitorData(),w7=monitorWindow(d.moods,7,0),p7=monitorWindow(d.moods,7,7),w30=monitorWindow(d.moods,30,0),a7=monitorWindow(d.assessments,7,0),j7=monitorWindow(d.journal,7,0);
  const card=(t,v,s)=>`<div class="card p20"><p class="xs muted">${t}</p><p style="font-size:var(--fs-2xl);font-weight:700;margin-top:6px">${v}</p><p class="xs muted">${s}</p></div>`;
  const m7=monitorAvg(w7,'mood'),s7=monitorAvg(w7,'stress'),sl7=monitorAvg(w7,'sleep');
  return `<div class="page-h"><div><h1>Mental wellbeing insights</h1><p class="muted">Look for patterns in your own check-ins over time.</p></div><button class="btn btn-o" onclick="exportWellbeingData()">${ic('download',16)} Export my data</button></div><div class="banner info mb16">${ic('info',16)}<span>These summaries describe only the entries you recorded. Missing days are not treated as low mood. Nothing here predicts or diagnoses a condition.</span></div><div class="grid g3 mb24">${card('Check-ins, last 7 days',w7.length,`${d.moods.length} saved in total`)}${card('Average mood, last 7 days',m7?m7.avg.toFixed(1)+'/5':'—',m7?`calculated from ${m7.n} entries`:'no entries in this period')}${card('Reflections / journal, last 7 days',a7.length+' / '+j7.length,'counts only; journal text is not shown here')}</div><div class="card p20 mb24"><h3 class="mb16">Mood over the last 30 days</h3>${monitorChart(w30)}</div><div class="card p20 mb24"><h3 class="mb16">This week compared with your previous week</h3>${monitorCompare('Mood',m7,monitorAvg(p7,'mood'),'/5')}${monitorCompare('Stress',s7,monitorAvg(p7,'stress'),'/10')}${monitorCompare('Sleep',sl7,monitorAvg(p7,'sleep'),' h')}</div><div class="card p20"><h3 class="mb16">Recent entries</h3>${w30.length?`<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Mood</th><th>Feeling</th><th>Stress</th><th>Sleep</th></tr></thead><tbody>${w30.slice().reverse().slice(0,30).map(m=>`<tr><td>${esc(monitorDateLabel(m.at))}</td><td>${esc(m.mood)}/5</td><td>${esc(m.emotion||'—')}</td><td>${m.stress===''||m.stress==null?'—':esc(m.stress)+'/10'}</td><td>${m.sleep===''||m.sleep==null?'—':esc(m.sleep)+' h'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">No check-ins in the last 30 days.</p>'}</div>`;
}
function exportWellbeingData(){
  const d=monitorData(),inclJ=confirm('Include your private journal text in this export?\n\nOK = include journal text\nCancel = exclude it (recommended if you will share the file)');
  const out={exportedAt:new Date().toISOString(),note:'Self-reported wellness records stored on this device. Not a medical record or diagnosis.',moods:d.moods,assessments:d.assessments,journal:inclJ?d.journal:{excluded:true,entryCount:d.journal.length}};
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wellbeing-checkins-export.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderAssessmentPage() {
  const d=monitorData(), last=d.assessments[d.assessments.length-1];
  const qs=[['energy','How has your energy been today?'],['worry','How much have worry or tension affected you?'],['sleep','How has your sleep been?'],['focus','How easy was it to focus on everyday tasks?'],['connection','How connected to others have you felt?']];
  return `<div class="page-h"><div><h1>Daily wellbeing reflection</h1><p class="muted">A short check-in to help you reflect on recent patterns.</p></div></div><div class="banner info mb16">${ic('shield',16)}<span>This is an informal reflection, not a validated clinical screening test. It cannot diagnose a condition or replace professional care.</span></div><div class="card p20 mb24"><form onsubmit="saveWellbeingAssessment(event)"><p class="muted mb16">Choose the answer that best fits today. There are no right or wrong answers.</p>${qs.map(([name,q])=>`<div class="mb16"><label class="field-label" for="ass-${name}">${q}</label><select class="input" id="ass-${name}" name="${name}" required><option value="">Select one</option><option value="1">1 · Not at all / very difficult</option><option value="2">2 · A little</option><option value="3">3 · Somewhat</option><option value="4">4 · Quite a lot / mostly well</option><option value="5">5 · Very much / very well</option></select></div>`).join('')}<label class="field-label" for="ass-note">Anything you'd like to remember? (optional)</label><textarea class="input mb16" id="ass-note" name="note" rows="3" maxlength="1000"></textarea><button class="btn btn-p" type="submit">Save reflection</button></form></div><div class="card p20"><h3>Last saved reflection</h3>${last?`<p class="muted mt8">${esc(monitorDateLabel(last.at))}</p><p class="mt8">Average response: <strong>${last.average}/5</strong></p><p class="muted mt8">This score is a personal reflection summary only, not a clinical score.</p>`:'<p class="muted mt8">No reflection saved yet.</p>'}</div>`;
}
function saveWellbeingAssessment(e){e.preventDefault();const f=new FormData(e.target),keys=['energy','worry','sleep','focus','connection'];const values=keys.map(k=>Number(f.get(k)));if(values.some(v=>!v||v<1||v>5)){toast('Please answer each reflection question or skip the assessment.',true);return;}const d=monitorData();d.assessments.push({id:'a'+Date.now(),at:new Date().toISOString(),answers:Object.fromEntries(keys.map(k=>[k,Number(f.get(k))])),average:Math.round(values.reduce((a,b)=>a+b,0)/values.length*10)/10,note:String(f.get('note')||'').trim()});saveMonitorData(d);}
function renderJournalPage(){const d=monitorData(),entries=d.journal.slice().reverse().slice(0,12);return `<div class="page-h"><div><h1>Private journal</h1><p class="muted">Write for yourself. You decide what to record.</p></div></div><div class="banner info mb16">${ic('shield',16)}<span>Entries are stored in this browser's local storage in this prototype. This is not encrypted clinical-record storage; avoid entering information you would not want saved on this device.</span></div><div class="card p20 mb24"><form onsubmit="saveJournalEntry(event)"><label class="field-label" for="jtitle">Title (optional)</label><input class="input mb16" id="jtitle" name="title" maxlength="100" placeholder="A thought, moment, or reflection"><label class="field-label" for="jbody">What's on your mind?</label><textarea class="input mb16" id="jbody" name="body" rows="6" maxlength="5000" required placeholder="Write freely…"></textarea><label class="field-label" for="jtag">Tag (optional)</label><select class="input mb16" id="jtag" name="tag"><option>General</option><option>Stress</option><option>Sleep</option><option>Relationships</option><option>School or work</option><option>Something that helped</option></select><button class="btn btn-p" type="submit">Save journal entry</button></form></div><div class="card p20"><h3 class="mb16">Recent entries</h3>${entries.length?entries.map(j=>`<article style="padding:12px 0;border-bottom:1px solid var(--line)"><div class="row sb"><strong>${esc(j.title||'Journal entry')}</strong><span class="chip">${esc(j.tag||'General')}</span></div><p class="xs muted mt4">${esc(monitorDateLabel(j.at))}</p><p class="mt8" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(j.body)}</p><button class="btn btn-sm btn-g mt8" onclick="deleteJournalEntry('${j.id}')">Delete entry</button></article>`).join(''):'<p class="muted">Your journal entries will appear here.</p>'}</div>`;}
function saveJournalEntry(e){e.preventDefault();const f=new FormData(e.target),body=String(f.get('body')||'').trim();if(!body){toast('Write a little before saving.',true);return;}const d=monitorData();d.journal.push({id:'j'+Date.now(),at:new Date().toISOString(),title:String(f.get('title')||'').trim(),body,tag:String(f.get('tag')||'General')});saveMonitorData(d);}
function deleteJournalEntry(id){if(!confirm('Delete this journal entry from this browser?'))return;const d=monitorData();d.journal=d.journal.filter(j=>j.id!==id);store.set(MONITOR_KEY,JSON.stringify(d));render();}
function renderWellbeingToolkit(){const items=[['Grounding pause','Notice five things you can see, four you can feel, and three you can hear. Stop if this feels uncomfortable.'],['Slow breathing','If comfortable, breathe gently and naturally for a minute. Do not force deep breaths; return to normal breathing if dizzy.'],['Small next step','Choose one manageable action: drink water, stretch gently, step outside with permission, or message someone you trust.'],['Sleep reflection','Try noting your usual bedtime, wake time, and how rested you feel. Focus on patterns rather than perfection.'],['Reach out','Consider talking with a trusted adult, counsellor, or qualified mental health professional if distress persists or affects daily life.']];return `<div class="page-h"><div><h1>Wellbeing toolkit</h1><p class="muted">Small, optional practices for everyday reflection.</p></div></div><div class="banner info mb16">${ic('heart-pulse',16)}<span>These are general wellbeing ideas, not treatment. Choose what feels appropriate for you and skip anything that makes you uncomfortable.</span></div><div class="grid g2">${items.map((x,i)=>`<div class="card p20"><div class="row" style="gap:12px;align-items:flex-start"><span class="ic-box">${ic(i===4?'message-circle':i===3?'clock':i===2?'activity':'heart-pulse')}</span><div><h3>${esc(x[0])}</h3><p class="muted mt8">${esc(x[1])}</p></div></div></div>`).join('')}</div><div class="card p20 mt24"><h3>When you need more support</h3><p class="muted mt8">An app cannot provide emergency care or replace a professional assessment. If you feel unsafe or need urgent help, contact local emergency services or a trusted person who can help you access support.</p></div>`;}
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Wellbeing Overview', icon: 'dashboard' },
  { id: 'mood', label: 'Mood Check-in', icon: 'heart-pulse' },
  { id: 'assessment', label: 'Daily Reflection', icon: 'clipboard-list' },
  { id: 'journal', label: 'Private Journal', icon: 'edit' },
  { id: 'insights', label: 'Mood Trends & Insights', icon: 'bar-chart' },
  { id: 'toolkit', label: 'Wellbeing Toolkit', icon: 'activity' },
  { id: 'ai', label: 'Sahaara AI Assistant', icon: 'sparkles' },
  { id: 'today', label: "Today's Plan", icon: 'calendar' },
  { id: 'prescriptions', label: 'Self-Care Activities', icon: 'clipboard-list' },
  { id: 'alerts', label: 'Reminders & Alerts', icon: 'bell' },
  { id: 'reports', label: 'Reports', icon: 'bar-chart' },
  { id: 'profile', label: 'My Profile', icon: 'user' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
function navigate(route) {
  State.route = route;
  render();
  window.location.hash = route;
  window.scrollTo(0, 0);
}
const TAB_IDS = ['dashboard', 'mood', 'journal', 'insights'];
const TAB_SHORT = { dashboard: 'Overview', mood: 'Mood', journal: 'Journal', insights: 'Insights' };
let moreSheetReturnFocus = null;
function openMoreSheet() {
  if (document.getElementById('more-sheet')) return;
  moreSheetReturnFocus = document.activeElement;
  const alerts = State.alerts.filter(a => !a.dismissed).length;
  const wrap = document.createElement('div');
  wrap.id = 'more-sheet';
  wrap.className = 'more-overlay';
  wrap.innerHTML = '<div class="more-sheet" role="dialog" aria-modal="true" aria-label="All pages"><div class="more-grab" aria-hidden="true"></div>' +
    '<div class="more-head"><h2>All pages</h2><button type="button" class="btn btn-g btn-ic" data-more-close aria-label="Close">' + ic('x') + '</button></div>' +
    '<div class="more-list">' + NAV_ITEMS.map(n => '<button type="button" class="more-item' + (State.route === n.id ? ' on' : '') + '" data-route="' + esc(n.id) + '"' +
      (State.route === n.id ? ' aria-current="page"' : '') + '>' + ic(n.icon) + '<span>' + esc(n.label) + '</span>' +
      (n.id === 'alerts' && alerts ? '<span class="chip bad">' + alerts + '</span>' : '') + '</button>').join('') + '</div></div>';
  wrap.addEventListener('click', function(e) {
    if (e.target === wrap || e.target.closest('[data-more-close]')) { closeMoreSheet(); return; }
    const b = e.target.closest('[data-route]');
    if (b) { const r = b.getAttribute('data-route'); closeMoreSheet(false); navigate(r); }
  });
  document.body.appendChild(wrap);
  document.body.classList.add('more-open');
  const first = wrap.querySelector('.more-item.on') || wrap.querySelector('.more-item');
  if (first) first.focus();
}
function closeMoreSheet(restoreFocus) {
  const el = document.getElementById('more-sheet');
  if (el) el.remove();
  document.body.classList.remove('more-open');
  if (restoreFocus !== false && moreSheetReturnFocus && document.contains(moreSheetReturnFocus)) { try { moreSheetReturnFocus.focus(); } catch (_) {} }
  moreSheetReturnFocus = null;
}
document.addEventListener('keydown', function(e) {
  const sheet = document.getElementById('more-sheet');
  if (!sheet) return;
  if (e.key === 'Escape') { closeMoreSheet(); return; }
  if (e.key !== 'Tab') return;
  const f = sheet.querySelectorAll('button');
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});
window.addEventListener('resize', function() { if (window.innerWidth > 1024) closeMoreSheet(false); });