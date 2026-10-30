/**
 * Sahaara AI / CareTrack — Utilities & Modal Manager
 */

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
}
function now() {
  const offset = (State.settings && State.settings.demoClockOffset) || 0;
  return new Date(Date.now() + offset);
}
function todayStr(d) {
  const dt = d || now();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(NaN);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}
function formatDateShort(s) {
  if (!s) return '';
  const d = parseDate(s);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}
function daysBetween(a, b) {
  const da = parseDate(a), db = parseDate(b);
  return Math.round((db - da) / 86400000);
}
function getWeekday(dateStr) {
  return parseDate(dateStr).getDay(); // 0=Sun, 6=Sat
}
function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function formatTime12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}
const CATEGORIES = [
  { id: 'diet', label: 'Diet & nutrition', icon: '🍽️', cssClass: 'cat-diet' },
  { id: 'activity', label: 'Physical activity', icon: '🏃', cssClass: 'cat-activity' },
  { id: 'sleep', label: 'Sleep routine', icon: '🌙', cssClass: 'cat-sleep' },
  { id: 'hydration', label: 'Hydration', icon: '💧', cssClass: 'cat-hydration' },
  { id: 'stress', label: 'Stress management', icon: '🧘', cssClass: 'cat-stress' },
  { id: 'breathing', label: 'Breathing / clinician-approved wellness', icon: '🫁', cssClass: 'cat-breathing' },
  { id: 'other', label: 'Other non-pharmacological', icon: '📋', cssClass: 'cat-other' },
];
function getCategoryInfo(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[6];
}

function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' err' : '');
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}
let modalState = null;
let previousFocus = null;
function openModal(title, bodyHtml, opts = {}) {
  previousFocus = document.activeElement;
  modalState = { title, bodyHtml, wide: !!opts.wide, onMount: opts.onMount };
  renderModal();
}
function closeModal() {
  modalState = null;
  renderModal();
  if (previousFocus && previousFocus.focus) {
    setTimeout(() => previousFocus.focus(), 50);
  }
}
function renderModal() {
  const r = document.getElementById('modal-root');
  if (!modalState) {
    r.innerHTML = '';
    document.body.style.overflow = '';
    return;
  }
  document.body.style.overflow = 'hidden';
  r.innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()" role="dialog" aria-modal="true" aria-label="${esc(modalState.title)}"><div class="modal ${modalState.wide ? 'wide' : ''}"><div class="mh"><h2>${esc(modalState.title)}</h2><button class="btn btn-g btn-ic" aria-label="Close" onclick="closeModal()">${ic('x')}</button></div><div class="mb">${modalState.bodyHtml}</div></div></div>`;
  modalState.onMount && setTimeout(modalState.onMount, 30);
  setTimeout(() => {
    const f = r.querySelector('input,textarea,select,button:not([aria-label=Close])');
    if (f) f.focus();
  }, 50);
}
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (modalState) { closeModal(); return; }
  if (typeof emergencyOpen !== 'undefined' && emergencyOpen) { closeEmergencyModal(); return; }
  if (typeof VoiceMode !== 'undefined' && VoiceMode.isOpen) { closeVoiceMode(); return; }
  if (typeof AI !== 'undefined' && AI.panelOpen) { closeAIPanel(); }
});