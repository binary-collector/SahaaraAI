/**
 * Sahaara AI / CareTrack — Reactive State Engine & Clinical Logic
 */

const State = {
  profile: null,
  prescriptions: [],
  records: [],
  alerts: [],
  settings: { gracePeriodMinutes: 60, dueWindowMinutes: 0, demoClockOffset: 0, notificationsEnabled: false },
  route: 'dashboard',
  selectedDate: null,
};
const DATA_VERSION = 1;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
function isValidDateStr(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const parts = s.split('-').map(Number);
  const y = parts[0], m = parts[1], day = parts[2];
  if (m < 1 || m > 12 || day < 1 || day > 31) return false;
  const d = new Date(y, m - 1, day);
  return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day;
}
function isValidTimeStr(s) {
  if (typeof s !== 'string' || !TIME_RE.test(s)) return false;
  const [h, m] = s.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}
function sanitizeProfile(p) {
  if (!p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name.trim()) return null;
  const out = { ...p };
  if (typeof out.age !== 'number' || isNaN(out.age)) delete out.age;
  if (out.reminderTimes && !Array.isArray(out.reminderTimes)) delete out.reminderTimes;
  if (Array.isArray(out.reminderTimes)) out.reminderTimes = out.reminderTimes.filter(isValidTimeStr);
  if (typeof out.emergencyContactName !== 'string') delete out.emergencyContactName;
  if (typeof out.emergencyContactPhone !== 'string') delete out.emergencyContactPhone;
  return out;
}
function sanitizePrescription(rx) {
  if (!rx || typeof rx !== 'object') return null;
  if (typeof rx.id !== 'string' || !rx.id) return null;
  if (typeof rx.title !== 'string' || !rx.title.trim()) return null;
  if (!isValidDateStr(rx.startDate)) return null;
  const out = { ...rx };
  out.category = typeof out.category === 'string' ? out.category : 'other';
  out.frequency = ['daily', 'weekdays', 'multi', 'onetime'].includes(out.frequency) ? out.frequency : 'daily';
  out.times = Array.isArray(out.times) ? [...new Set(out.times.filter(isValidTimeStr))].sort() : [];
  if (out.times.length === 0) out.times = ['08:00'];
  out.days = Array.isArray(out.days) ? out.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6) : [];
  out.instructions = typeof out.instructions === 'string' ? out.instructions : '';
  out.endDate = isValidDateStr(out.endDate) ? out.endDate : null;
  out.deactivatedOn = isValidDateStr(out.deactivatedOn) ? out.deactivatedOn : null;
  out.active = out.active !== false;
  return out;
}
function sanitizeRecord(r) {
  if (!r || typeof r !== 'object') return null;
  if (typeof r.id !== 'string' || typeof r.prescriptionId !== 'string') return null;
  if (!isValidDateStr(r.date) || !isValidTimeStr(r.time)) return null;
  if (!['completed', 'skipped', 'missed'].includes(r.status)) return null;
  return r;
}
function sanitizeAlert(a) {
  if (!a || typeof a !== 'object') return null;
  if (typeof a.id !== 'string' || typeof a.key !== 'string' || typeof a.message !== 'string') return null;
  return a;
}
function loadState() {
  try {
    const raw = store.get(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        State.profile = sanitizeProfile(data.profile);
        const rxIn = Array.isArray(data.prescriptions) ? data.prescriptions : [];
        const recIn = Array.isArray(data.records) ? data.records : [];
        const alertIn = Array.isArray(data.alerts) ? data.alerts : [];
        State.prescriptions = rxIn.map(sanitizePrescription).filter(Boolean);
        State.records = recIn.map(sanitizeRecord).filter(Boolean);
        State.alerts = alertIn.map(sanitizeAlert).filter(Boolean);
        const dropped = (rxIn.length - State.prescriptions.length) + (recIn.length - State.records.length) + (alertIn.length - State.alerts.length);
        if (dropped > 0) {
          console.warn(`CareTrack: dropped ${dropped} malformed stored item(s) during load.`);
          toast(`${dropped} damaged item(s) were removed from storage.`, true);
        }
      }
    }
  } catch(e) {
    console.warn('CareTrack: Corrupt storage, resetting to empty state.');
    toast('Data was corrupted and has been reset. You can start fresh.', false);
    store.remove(STORAGE_KEY);
  }
  try {
    const sraw = store.get(SETTINGS_KEY);
    if (sraw) {
      const s = JSON.parse(sraw);
      if (s && typeof s === 'object') {
        if (s.llmApiKey) {
          delete s.llmApiKey;
          console.warn('CareTrack: removed a stored API key from settings (keys must stay server-side).');
        }
        State.settings = { ...State.settings, ...s };
        delete State.settings.llmApiKey;
        if (typeof s.llmEndpoint === 'string') AI_CONFIG.LLM_ENDPOINT = s.llmEndpoint;
        if (typeof s.llmModel === 'string') AI_CONFIG.LLM_MODEL = s.llmModel;
      }
    }
  } catch(e) {}
  State.selectedDate = todayStr();
}
function saveState() {
  const data = {
    profile: State.profile,
    prescriptions: State.prescriptions,
    records: State.records,
    alerts: State.alerts,
  };
  store.set(STORAGE_KEY, JSON.stringify(data));
  store.set(SETTINGS_KEY, JSON.stringify(State.settings));
  if (window.CTBackend) { try { window.CTBackend.pushState(data, State.settings); } catch (e) {} }
}

function isPrescriptionActiveOnDate(rx, dateStr) {
  if (!rx.active) return false;
  if (rx.deactivatedOn && dateStr >= rx.deactivatedOn) return false;
  if (dateStr < rx.startDate) return false;
  if (rx.endDate && dateStr > rx.endDate) return false;
  return true;
}
function getOccurrencesForDate(rx, dateStr) {
  if (!isPrescriptionActiveOnDate(rx, dateStr)) return [];
  const wd = getWeekday(dateStr);
  switch (rx.frequency) {
    case 'daily':
      break;
    case 'weekdays':
      if (!rx.days || !rx.days.includes(wd)) return [];
      break;
    case 'onetime':
      if (dateStr !== rx.startDate) return [];
      break;
    default:
      break;
  }
  const times = (rx.times && rx.times.length > 0) ? rx.times : ['08:00'];
  return times.map(t => ({
    prescriptionId: rx.id,
    date: dateStr,
    time: t,
    title: rx.title,
    category: rx.category,
    instructions: rx.instructions,
  }));
}
function getAllOccurrencesForDate(dateStr) {
  const occs = [];
  for (const rx of State.prescriptions) {
    occs.push(...getOccurrencesForDate(rx, dateStr));
  }
  occs.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  return occs;
}
function getRecordForOccurrence(prescriptionId, date, time) {
  return State.records.find(r =>
    r.prescriptionId === prescriptionId && r.date === date && r.time === time
  );
}
function getOccurrenceStatus(prescriptionId, date, time) {
  const record = getRecordForOccurrence(prescriptionId, date, time);
  if (record) {
    return { status: record.status, record, computed: false };
  }
  const n = now();
  const today = todayStr(n);
  const occMinutes = timeToMinutes(time);
  const nowMinutes = n.getHours() * 60 + n.getMinutes();
  const grace = State.settings.gracePeriodMinutes || 60;
  if (date > today) {
    return { status: 'upcoming', record: null, computed: true };
  }
  if (date < today) {
    return { status: 'missed', record: null, computed: true };
  }
  if (nowMinutes < occMinutes) {
    return { status: 'upcoming', record: null, computed: true };
  }
  if (nowMinutes < occMinutes + grace) {
    return { status: 'due', record: null, computed: true };
  }
  return { status: 'missed', record: null, computed: true };
}
function calcAdherenceForDateRange(startDate, endDate) {
  let scheduled = 0;
  let completed = 0;
  const n = now();
  const today = todayStr(n);
  const nowMinutes = n.getHours() * 60 + n.getMinutes();
  let d = startDate;
  while (d <= endDate) {
    for (const rx of State.prescriptions) {
      const occs = getOccurrencesForDate(rx, d);
      for (const occ of occs) {
        const rec = getRecordForOccurrence(occ.prescriptionId, occ.date, occ.time);
        if (rec) {
          scheduled++;
          if (rec.status === 'completed') completed++;
        } else {
          const occMin = timeToMinutes(occ.time);
          const isPast = d < today || (d === today && nowMinutes >= occMin);
          if (isPast) {
            scheduled++;
          }
        }
      }
    }
    d = addDays(d, 1);
  }
  return { scheduled, completed, skipped: 0, missed: 0, pct: scheduled > 0 ? Math.round(completed / scheduled * 100) : null };
}
function calcDetailedAdherence(startDate, endDate) {
  let scheduled = 0, completed = 0, skipped = 0, missed = 0;
  const n = now();
  const today = todayStr(n);
  const nowMinutes = n.getHours() * 60 + n.getMinutes();
  let d = startDate;
  while (d <= endDate) {
    for (const rx of State.prescriptions) {
      const occs = getOccurrencesForDate(rx, d);
      for (const occ of occs) {
        const rec = getRecordForOccurrence(occ.prescriptionId, occ.date, occ.time);
        if (rec) {
          scheduled++;
          if (rec.status === 'completed') completed++;
          else if (rec.status === 'skipped') skipped++;
          else if (rec.status === 'missed') missed++;
        } else {
          const occMin = timeToMinutes(occ.time);
          const isPast = d < today || (d === today && nowMinutes >= occMin);
          if (isPast) {
            scheduled++;
            missed++;
          }
        }
      }
    }
    d = addDays(d, 1);
  }
  return { scheduled, completed, skipped, missed, pct: scheduled > 0 ? Math.round(completed / scheduled * 100) : null };
}
function completeOccurrence(prescriptionId, date, time) {
  const existing = getRecordForOccurrence(prescriptionId, date, time);
  const rx = State.prescriptions.find(r => r.id === prescriptionId);
  const n = now();
  if (existing) {
    existing.status = 'completed';
    existing.completedAt = n.toISOString();
    existing.loggedLate = (existing.loggedLate !== undefined) ? existing.loggedLate : (date < todayStr() || (date === todayStr() && timeToMinutes(time) + (State.settings.gracePeriodMinutes || 60) < n.getHours() * 60 + n.getMinutes()));
    existing.updatedAt = n.toISOString();
  } else {
    const isLate = date < todayStr() || (date === todayStr() && timeToMinutes(time) + (State.settings.gracePeriodMinutes || 60) < n.getHours() * 60 + n.getMinutes());
    State.records.push({
      id: uid(),
      prescriptionId,
      date,
      time,
      titleSnapshot: rx ? rx.title : 'Unknown',
      categorySnapshot: rx ? rx.category : 'other',
      status: 'completed',
      completedAt: n.toISOString(),
      loggedLate: isLate,
      source: 'user',
      updatedAt: n.toISOString(),
    });
  }
  resolveAlertsForOccurrence(prescriptionId, date, time);
  saveState();
  render();
}
function skipOccurrence(prescriptionId, date, time, reason) {
  const existing = getRecordForOccurrence(prescriptionId, date, time);
  const rx = State.prescriptions.find(r => r.id === prescriptionId);
  const n = now();
  if (existing) {
    existing.status = 'skipped';
    existing.skipReason = reason || '';
    existing.updatedAt = n.toISOString();
  } else {
    State.records.push({
      id: uid(),
      prescriptionId,
      date,
      time,
      titleSnapshot: rx ? rx.title : 'Unknown',
      categorySnapshot: rx ? rx.category : 'other',
      status: 'skipped',
      skipReason: reason || '',
      source: 'user',
      updatedAt: n.toISOString(),
    });
  }
  resolveAlertsForOccurrence(prescriptionId, date, time);
  saveState();
  render();
}
function undoOccurrence(prescriptionId, date, time) {
  const idx = State.records.findIndex(r =>
    r.prescriptionId === prescriptionId && r.date === date && r.time === time
  );
  if (idx >= 0) {
    State.records.splice(idx, 1);
    saveState();
    render();
  }
}
function simulateMissed(prescriptionId, date, time) {
  const existing = getRecordForOccurrence(prescriptionId, date, time);
  const rx = State.prescriptions.find(r => r.id === prescriptionId);
  const n = now();
  if (existing) {
    existing.status = 'missed';
    existing.updatedAt = n.toISOString();
  } else {
    State.records.push({
      id: uid(),
      prescriptionId,
      date,
      time,
      titleSnapshot: rx ? rx.title : 'Unknown',
      categorySnapshot: rx ? rx.category : 'other',
      status: 'missed',
      source: 'simulated',
      updatedAt: n.toISOString(),
    });
  }
  generateAlertForOccurrence(prescriptionId, date, time, 'missed');
  saveState();
  render();
}
function alertKey(prescriptionId, date, time, type) {
  return `${prescriptionId}|${date}|${time}|${type}`;
}
function generateAlertForOccurrence(prescriptionId, date, time, type) {
  const key = alertKey(prescriptionId, date, time, type);
  if (State.alerts.find(a => a.key === key)) return; // deduplicate
  const rx = State.prescriptions.find(r => r.id === prescriptionId);
  let message = '';
  if (type === 'due') {
    message = `"${rx ? rx.title : 'Task'}" is due now (${formatTime12(time)})`;
  } else if (type === 'missed') {
    message = `"${rx ? rx.title : 'Task'}" at ${formatTime12(time)} was missed`;
  }
  State.alerts.push({
    id: uid(),
    key,
    type,
    message,
    relatedOccurrence: { prescriptionId, date, time },
    createdAt: now().toISOString(),
    dismissed: false,
  });
}
function resolveAlertsForOccurrence(prescriptionId, date, time) {
  for (const alert of State.alerts) {
    if (alert.relatedOccurrence &&
        alert.relatedOccurrence.prescriptionId === prescriptionId &&
        alert.relatedOccurrence.date === date &&
        alert.relatedOccurrence.time === time) {
      alert.dismissed = true;
    }
  }
}
function generateAutoAlerts() {
  const date = State.selectedDate || todayStr();
  const occs = getAllOccurrencesForDate(date);
  for (const occ of occs) {
    const s = getOccurrenceStatus(occ.prescriptionId, occ.date, occ.time);
    if (s.status === 'due') {
      generateAlertForOccurrence(occ.prescriptionId, occ.date, occ.time, 'due');
    } else if (s.status === 'missed' && !s.record) {
      generateAlertForOccurrence(occ.prescriptionId, occ.date, occ.time, 'missed');
    }
  }
  const sevenDaysAgo = addDays(todayStr(), -6);
  const stats = calcDetailedAdherence(sevenDaysAgo, todayStr());
  if (stats.missed >= 3) {
    const key = 'weekly_missed_' + todayStr();
    if (!State.alerts.find(a => a.key === key)) {
      State.alerts.push({
        id: uid(),
        key,
        type: 'weekly',
        message: "You've missed several self-care activities this week. Consider reviewing your plan or contacting your healthcare provider if needed.",
        relatedOccurrence: null,
        createdAt: now().toISOString(),
        dismissed: false,
      });
    }
  }
}
function dismissAlert(alertId) {
  const alert = State.alerts.find(a => a.id === alertId);
  if (alert) {
    alert.dismissed = true;
    saveState();
    render();
  }
}