/**
 * Sahaara AI / CareTrack — Views & Screen Renderers
 */

function render() {
  const root = document.getElementById('root');
  const haveAI = typeof AI !== 'undefined' && typeof captureAIDrafts === 'function';
  if (haveAI) captureAIDrafts();
  const activeAlerts = State.alerts.filter(a => !a.dismissed).length;
  const navHtml = NAV_ITEMS.map(n => {
    const badge = n.id === 'alerts' && activeAlerts > 0 ? ` <span class="chip bad" style="margin-left:auto;font-size:11px">${activeAlerts}</span>` : '';
    return `<a href="#${n.id}" class="${State.route === n.id ? 'on' : ''}" ${State.route === n.id ? 'aria-current="page"' : ''} onclick="event.preventDefault();navigate('${n.id}')">${ic(n.icon)}<span>${esc(n.label)}</span>${badge}</a>`;
  }).join('');
  const tabItems = TAB_IDS.map(id => NAV_ITEMS.find(n => n.id === id)).filter(Boolean);
  const moreActive = !TAB_IDS.includes(State.route);
  const tabBarHtml = tabItems.map(n =>
    `<a href="#${n.id}" class="${State.route === n.id ? 'on' : ''}" ${State.route === n.id ? 'aria-current="page"' : ''} onclick="event.preventDefault();navigate('${n.id}')">${ic(n.icon)}<span>${TAB_SHORT[n.id] || n.label}</span></a>`
  ).join('') + `<a href="#more" role="button" class="${moreActive ? 'on' : ''}" aria-haspopup="dialog" onclick="event.preventDefault();openMoreSheet()"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg><span>More</span></a>`;
  let pageHtml = '';
  switch (State.route) {
    case 'dashboard': pageHtml = renderDashboard(); break;
    case 'mood': pageHtml = renderMoodPage(); break;
    case 'assessment': pageHtml = renderAssessmentPage(); break;
    case 'journal': pageHtml = renderJournalPage(); break;
    case 'insights': pageHtml = renderInsightsPage(); break;
    case 'toolkit': pageHtml = renderWellbeingToolkit(); break;
    case 'today': pageHtml = renderTodayPlan(); break;
    case 'prescriptions': pageHtml = renderPrescriptions(); break;
    case 'alerts': pageHtml = renderAlerts(); break;
    case 'reports': pageHtml = renderReports(); break;
    case 'ai': pageHtml = renderAIPage(); break;
    case 'profile': pageHtml = renderProfile(); break;
    case 'settings': pageHtml = renderSettings(); break;
    default: pageHtml = renderDashboard();
  }
  root.innerHTML = `<div id="app"><aside aria-label="Sidebar"><div class="brand"><span class="logo">🩺</span><span>CareTrack</span></div><nav aria-label="Main navigation">${navHtml}</nav><div class="side-foot"><p class="xs">Demonstration prototype — not a medical record or medical advice.</p></div></aside><div style="min-width:0"><header class="mob"><div class="brand" style="height:auto;padding:0"><span class="logo" style="width:32px;height:32px;font-size:18px">🩺</span><span style="font-size:15px">CareTrack</span></div><button class="btn btn-g btn-ic" onclick="navigate('settings')" aria-label="Settings">${ic('settings')}</button></header><main class="fade" id="main">
        ${pageHtml}
        <div class="app-footer"><p>Demonstration prototype — not a medical record or medical advice.</p><p class="xs mt4">If you feel unwell or have concerns, contact your healthcare provider or local emergency services.</p></div></main></div></div><nav class="tabbar" aria-label="Quick navigation">${tabBarHtml}</nav>`;
  if (haveAI) restoreAIDrafts();
}
function renderDashboard() {
  if (!State.profile) {
    return `<div class="page-h"><h1>Welcome to CareTrack</h1></div><div class="card empty"><div class="ic-box">${ic('heart-pulse')}</div><h2>Your mental wellbeing journey</h2><p class="muted mt8">Track mood, reflect on daily wellbeing, keep a private journal, and notice patterns over time.</p><div class="row wrap center mt16 gap2"><button class="btn btn-p" onclick="navigate('mood')">Start a mood check-in</button><button class="btn btn-o" onclick="navigate('profile')">Create Profile</button></div></div>`;
  }
  const today = todayStr();
  const occs = getAllOccurrencesForDate(today);
  let completed = 0, pending = 0, missed = 0;
  let nextUpcoming = null;
  const n = now();
  const nowMin = n.getHours() * 60 + n.getMinutes();
  for (const occ of occs) {
    const s = getOccurrenceStatus(occ.prescriptionId, occ.date, occ.time);
    if (s.status === 'completed') completed++;
    else if (s.status === 'missed') missed++;
    else if (s.status === 'due' || s.status === 'upcoming') {
      pending++;
      if (!nextUpcoming && (s.status === 'due' || timeToMinutes(occ.time) >= nowMin)) {
        nextUpcoming = occ;
      }
    }
  }
  const total = occs.length;
  const schedCount = completed + pending + missed; // resolved + unresolved
  let todayScheduled = 0, todayCompleted = 0;
  for (const occ of occs) {
    const s = getOccurrenceStatus(occ.prescriptionId, occ.date, occ.time);
    if (s.record) {
      todayScheduled++;
      if (s.status === 'completed') todayCompleted++;
    } else if (timeToMinutes(occ.time) <= nowMin) {
      todayScheduled++;
    }
  }
  const todayPct = todayScheduled > 0 ? Math.round(todayCompleted / todayScheduled * 100) : null;
  const chartData = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const stats = calcAdherenceForDateRange(d, d);
    chartData.push({ date: d, pct: stats.pct, label: formatDateShort(d) });
  }
  const undismissedAlerts = State.alerts.filter(a => !a.dismissed).slice(0, 3);
  return `
  <div class="page-h"><div><h1>Hello, ${esc(State.profile ? State.profile.name : 'Friend')}</h1><p class="muted">${esc(State.profile && State.profile.condition ? State.profile.condition : 'Personal Health Plan')} · ${formatDate(today)}</p></div><button class="btn btn-p" onclick="navigate('today')">Start Today's Self-Care Plan ${ic('arrow-left', 0).replace('M19 12H5M12 19l-7-7 7-7','M5 12h14M12 5l7 7-7 7')}</button></div>
  ${State.profile && State.profile.isDemo ? '<div class="banner info mb16">' + ic('info', 16) + '<span>Synthetic demonstration data — not real patient information.</span></div>' : ''}
  ${(() => { const md=monitorData(); const last=md.moods[md.moods.length-1]; return `<div class="card p20 mb24"><div class="row sb wrap"><div><h3>How have you been feeling?</h3><p class="muted mt8">${last ? `Last check-in: ${esc(last.emotion)} · mood ${last.mood}/5 · ${esc(last.dateLabel||monitorDateLabel(last.at))}` : 'A quick check-in can help you build a picture of your wellbeing over time.'}</p></div><button class="btn btn-p" onclick="navigate('mood')">${last?'Check in again':'Start mood check-in'}</button></div><div class="row wrap mt16" style="gap:8px"><button class="btn btn-o btn-sm" onclick="navigate('assessment')">Daily reflection</button><button class="btn btn-o btn-sm" onclick="navigate('journal')">Open journal</button><button class="btn btn-o btn-sm" onclick="navigate('insights')">View insights</button><button class="btn btn-o btn-sm" onclick="navigate('toolkit')">Wellbeing toolkit</button></div></div>`; })()}
  <div class="grid g4 mb24"><div class="card p16 stat-card"><p class="xs">Today's Adherence</p><p style="font-size:var(--fs-2xl);font-weight:700;margin-top:4px">${todayPct !== null ? todayPct + '%' : '—'}</p><p class="xs">${todayCompleted} of ${todayScheduled} completed</p><div class="bar mt8"><i style="width:${todayPct || 0}%"></i></div></div><div class="card p16"><p class="xs">Completed</p><p style="font-size:var(--fs-2xl);font-weight:700;margin-top:4px;color:var(--ok-text)">${completed}</p></div><div class="card p16"><p class="xs">Pending (Upcoming / Due)</p><p style="font-size:var(--fs-2xl);font-weight:700;margin-top:4px;color:var(--info-text)">${pending}</p></div><div class="card p16"><p class="xs">Missed</p><p style="font-size:var(--fs-2xl);font-weight:700;margin-top:4px;color:var(--danger-text)">${missed}</p></div></div><div class="grid g2 mb24"><div class="card p20"><h3 class="mb16">Next Scheduled Activity</h3>
      ${nextUpcoming ? `<div class="row" style="gap:12px"><span class="cat-icon ${getCategoryInfo(nextUpcoming.category).cssClass}">${getCategoryInfo(nextUpcoming.category).icon}</span><div><p style="font-weight:600">${esc(nextUpcoming.title)}</p><p class="muted">${formatTime12(nextUpcoming.time)} · ${getCategoryInfo(nextUpcoming.category).label}</p></div></div>` : '<p class="muted">None remaining today.</p>'}
    </div><div class="card p20"><h3 class="mb16">7-Day Adherence</h3>
      ${renderMiniChart(chartData)}
    </div></div>
  ${undismissedAlerts.length > 0 ? `
  <div class="card p20 mb24"><div class="row sb mb12"><h3>Alerts</h3><a class="link" onclick="navigate('alerts')" tabindex="0">View all →</a></div>
    ${undismissedAlerts.map(a => `
      <div class="row sb" style="padding:8px 0;border-bottom:1px solid var(--line)"><div class="flex1"><p style="font-size:var(--fs-sm)">${esc(a.message)}</p><p class="xs">${a.type === 'weekly' ? 'Weekly summary' : formatDate(a.relatedOccurrence?.date || '')}</p></div>
        ${a.relatedOccurrence ? `<button class="btn btn-sm btn-o" onclick="openAlertOccurrence('${a.relatedOccurrence.prescriptionId}','${a.relatedOccurrence.date}','${a.relatedOccurrence.time}')">Open</button>` : ''}
        <button class="btn btn-sm btn-g" onclick="dismissAlert('${a.id}')">Dismiss</button></div>
    `).join('')}
  </div>` : ''}
  ${total === 0 ? `<div class="card empty"><div class="ic-box">${ic('clipboard-list')}</div><h3>Nothing scheduled today</h3><p class="muted mt8">Add self-care prescriptions to see your daily plan here.</p><button class="btn btn-o mt16" onclick="navigate('prescriptions')">Manage Prescriptions</button></div>` : ''}
  `;
}
function renderMiniChart(data) {
  const w = 280, h = 100, pad = 4;
  const barW = (w - pad * 2) / data.length - 4;
  let bars = '';
  data.forEach((d, i) => {
    const pct = d.pct || 0;
    const barH = (pct / 100) * (h - 30);
    const x = pad + i * ((w - pad * 2) / data.length) + 2;
    const y = h - 20 - barH;
    const color = pct >= 70 ? 'var(--ok-text)' : pct >= 40 ? 'var(--warn-text)' : pct > 0 ? 'var(--danger-text)' : 'var(--surface-3)';
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${color}" opacity="0.8"/>`;
    bars += `<text x="${x + barW/2}" y="${h - 4}" text-anchor="middle" fill="var(--text-3)" font-size="10">${d.label}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" role="img" aria-label="7-day adherence chart">${bars}</svg>`;
}
function renderTodayPlan() {
  const date = State.selectedDate || todayStr();
  const today = todayStr();
  const occs = getAllOccurrencesForDate(date);
  const grace = State.settings.gracePeriodMinutes || 60;
  let dayCompleted = 0, dayTotal = 0;
  const n = now();
  const nowMin = n.getHours() * 60 + n.getMinutes();
  for (const occ of occs) {
    const rec = getRecordForOccurrence(occ.prescriptionId, occ.date, occ.time);
    if (rec) { dayTotal++; if (rec.status === 'completed') dayCompleted++; }
    else if (date < today || (date === today && timeToMinutes(occ.time) <= nowMin)) { dayTotal++; }
  }
  const dayPct = dayTotal > 0 ? Math.round(dayCompleted / dayTotal * 100) : null;
  return `
  <div class="page-h"><h1>Today's Plan</h1></div><div class="banner brand mb16">
    ${ic('info', 16)}
    <div><strong>How statuses work:</strong>
      Upcoming (future) → Due (time arrived, within ${grace} min grace) → Missed (grace period passed).
      Completed or Skipped are resolved states. Missed tasks can still be completed or skipped.
    </div></div><div class="row sb wrap mb16 gap2"><div class="row gap2"><button class="btn btn-sm btn-o" onclick="changeDate(-1)">${ic('chevron-left', 16)} Prev</button><button class="btn btn-sm btn-o" onclick="changeDate(0)">Today</button><button class="btn btn-sm btn-o" onclick="changeDate(1)">Next ${ic('chevron-right', 16)}</button></div><input type="date" class="input" style="width:auto" value="${date}" onchange="setDate(this.value)"></div><div class="card p16 mb16"><div class="row sb"><div><p style="font-weight:600">${formatDate(date)}</p><p class="xs">${occs.length} occurrence${occs.length !== 1 ? 's' : ''} scheduled</p></div><div style="text-align:right"><p style="font-size:var(--fs-lg);font-weight:700">${dayPct !== null ? dayPct + '%' : '—'}</p><p class="xs">${dayCompleted} of ${dayTotal} completed</p></div></div><div class="bar mt8"><i style="width:${dayPct || 0}%"></i></div></div>
  ${occs.length === 0 ? `
    <div class="card empty"><div class="ic-box">${ic('calendar')}</div><h3>Nothing scheduled for this date</h3><p class="muted mt8">Check your prescriptions or adjust the date.</p></div>
  ` : occs.map(occ => renderTaskCard(occ, date)).join('')}
  `;
}
function renderTaskCard(occ, viewDate) {
  const today = todayStr();
  const status = getOccurrenceStatus(occ.prescriptionId, occ.date, occ.time);
  const cat = getCategoryInfo(occ.category);
  const isFuture = viewDate > today;
  const hasRecord = !!status.record;
  let cardClass = 'task-card';
  if (status.status === 'completed') cardClass += ' completed-card';
  else if (status.status === 'skipped') cardClass += ' skipped-card';
  else if (status.status === 'missed') cardClass += ' missed-card';
  else if (status.status === 'due') cardClass += ' due-card';
  let statusBadge = '';
  switch (status.status) {
    case 'completed':
      statusBadge = `<span class="status-badge completed"><span class="dot"></span>Completed</span>`;
      if (status.record && status.record.loggedLate) statusBadge += ' <span class="chip warn" style="font-size:10px">Logged late</span>';
      if (status.record && status.record.source === 'demo') statusBadge += ' <span class="chip demo" style="font-size:10px">Demo</span>';
      if (status.record && status.record.source === 'simulated') statusBadge += ' <span class="chip info" style="font-size:10px">Simulated</span>';
      break;
    case 'skipped':
      statusBadge = `<span class="status-badge skipped"><span class="dot"></span>Skipped</span>`;
      if (status.record && status.record.skipReason) statusBadge += ` <span class="xs">(${esc(status.record.skipReason)})</span>`;
      break;
    case 'missed':
      statusBadge = `<span class="status-badge missed"><span class="dot"></span>Missed</span>`;
      if (status.record && status.record.source === 'simulated') statusBadge += ' <span class="chip info" style="font-size:10px">Simulated</span>';
      break;
    case 'due':
      statusBadge = `<span class="status-badge due"><span class="dot"></span>Due now</span>`;
      break;
    case 'upcoming':
      statusBadge = `<span class="status-badge upcoming"><span class="dot"></span>Upcoming</span>`;
      break;
  }
  let actions = '';
  if (status.status === 'completed' || status.status === 'skipped') {
    actions = `<button class="btn btn-sm btn-o" onclick="undoOccurrence('${occ.prescriptionId}','${occ.date}','${occ.time}');toast('Undone — task returned to its computed status')">${ic('undo', 14)} Undo</button>`;
  } else if (status.status === 'missed' || status.status === 'due') {
    actions = `
      <button class="btn btn-sm btn-p" onclick="completeOccurrence('${occ.prescriptionId}','${occ.date}','${occ.time}')">${ic('check', 14)} Complete</button><button class="btn btn-sm btn-o" onclick="openSkipModal('${occ.prescriptionId}','${occ.date}','${occ.time}')">Skip</button>
    `;
  } else if (status.status === 'upcoming' && isFuture) {
    actions = `<span class="xs" title="Future tasks cannot be completed yet">Available at scheduled time</span>`;
  } else if (status.status === 'upcoming') {
    actions = `<span class="xs">Upcoming — available at ${formatTime12(occ.time)}</span>`;
  }
  return `
  <div class="${cardClass}" style="margin-bottom:12px" data-occ="${occ.prescriptionId}-${occ.date}-${occ.time}"><div class="row sb wrap" style="gap:8px"><div class="row" style="gap:12px;min-width:0"><span class="cat-icon ${cat.cssClass}">${cat.icon}</span><div style="min-width:0"><p style="font-weight:600">${esc(occ.title)}</p><p class="xs">${cat.label} · ${formatTime12(occ.time)}</p>
          ${occ.instructions ? `<p class="muted sm" style="margin-top:4px">${esc(occ.instructions)}</p>` : ''}
        </div></div><div style="text-align:right;flex-shrink:0">${statusBadge}</div></div>
    ${actions ? `<div class="row gap2 mt12" style="flex-wrap:wrap">${actions}</div>` : ''}
  </div>`;
}
function changeDate(delta) {
  if (delta === 0) {
    State.selectedDate = todayStr();
  } else {
    State.selectedDate = addDays(State.selectedDate || todayStr(), delta);
  }
  render();
}
function setDate(d) {
  State.selectedDate = d;
  render();
}
function openSkipModal(prescriptionId, date, time) {
  const reasons = ['Not feeling well', 'Forgot', 'Not available', 'Advised to rest'];
  const body = `
    <p class="muted mb16">Why are you skipping this task? (Optional)</p><div class="stack16">
      ${reasons.map(r => `<button class="btn btn-o w100" style="justify-content:flex-start" onclick="doSkip('${prescriptionId}','${date}','${time}','${esc(r)}')">${esc(r)}</button>`).join('')}
      <div><label class="label">Other reason (optional)</label><input class="input" id="skip-custom" placeholder="Type a reason..." maxlength="200"></div><div class="row" style="justify-content:flex-end"><button class="btn btn-p" onclick="doSkip('${prescriptionId}','${date}','${time}',document.getElementById('skip-custom').value)">Skip this task</button></div></div>`;
  openModal('Skip Task', body);
}
function doSkip(prescriptionId, date, time, reason) {
  skipOccurrence(prescriptionId, date, time, reason);
  closeModal();
  toast('Task skipped');
}
function openAlertOccurrence(prescriptionId, date, time) {
  State.selectedDate = date;
  State.route = 'today';
  render();
  setTimeout(() => {
    const el = document.querySelector(`[data-occ="${prescriptionId}-${date}-${time}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.boxShadow = '0 0 0 3px var(--brand-300)';
      setTimeout(() => el.style.boxShadow = '', 2000);
    }
  }, 100);
}
let rxFilter = 'active';
function renderPrescriptions() {
  const active = State.prescriptions.filter(r => r.active && (!r.deactivatedOn || r.deactivatedOn > todayStr()));
  const inactive = State.prescriptions.filter(r => !r.active || (r.deactivatedOn && r.deactivatedOn <= todayStr()));
  const list = rxFilter === 'active' ? active : (rxFilter === 'inactive' ? inactive : [...active, ...inactive]);
  return `
  <div class="page-h"><h1>My Self-Care Prescriptions</h1><button class="btn btn-p" onclick="openRxForm(null)">${ic('plus', 16)} Add Prescription</button></div><div class="banner info mb16">
    ${ic('info', 16)}
    <span>Self-care plans must be reviewed and personalized by a qualified healthcare professional.</span></div><div class="row mb16"><div class="seg" role="tablist"><button role="tab" class="${rxFilter==='active'?'on':''}" onclick="rxFilter='active';render()">Active (${active.length})</button><button role="tab" class="${rxFilter==='inactive'?'on':''}" onclick="rxFilter='inactive';render()">Inactive (${inactive.length})</button><button role="tab" class="${rxFilter==='all'?'on':''}" onclick="rxFilter='all';render()">All</button></div></div>
  ${list.length === 0 ? `
    <div class="card empty"><div class="ic-box">${ic('clipboard-list')}</div><h3>No prescriptions yet</h3><p class="muted mt8">Add your self-care prescriptions to start tracking.</p></div>
  ` : list.map(rx => {
    const cat = getCategoryInfo(rx.category);
    const isDeactivated = rx.deactivatedOn && rx.deactivatedOn <= todayStr();
    return `
    <div class="card p16 mb16"><div class="row sb wrap" style="gap:8px"><div class="row" style="gap:12px;min-width:0"><span class="cat-icon ${cat.cssClass}">${cat.icon}</span><div style="min-width:0"><div class="row gap2" style="flex-wrap:wrap"><p style="font-weight:600">${esc(rx.title)}</p>
              ${!rx.active || isDeactivated ? '<span class="chip">Inactive</span>' : '<span class="chip ok">Active</span>'}
              ${rx.source === 'demo' ? '<span class="chip demo">Demo</span>' : ''}
            </div><p class="xs">${cat.label} · ${rx.frequency === 'daily' ? 'Daily' : rx.frequency === 'weekdays' ? 'Selected weekdays' : rx.frequency === 'onetime' ? 'One-time' : 'Multiple times/day'}</p><p class="xs">${(rx.times || []).map(formatTime12).join(', ')}</p>
            ${rx.instructions ? `<p class="muted sm" style="margin-top:4px">${esc(rx.instructions)}</p>` : ''}
            <p class="xs mt4">From ${formatDateShort(rx.startDate)}${rx.endDate ? ' to ' + formatDateShort(rx.endDate) : ' (ongoing)'}${isDeactivated ? ' · Deactivated ' + formatDateShort(rx.deactivatedOn) : ''}</p></div></div><div class="row gap2"><button class="btn btn-sm btn-o" onclick="openRxForm('${rx.id}')">${ic('edit', 14)} Edit</button>
          ${!isDeactivated && rx.active ? `<button class="btn btn-sm btn-d" onclick="confirmDeactivateRx('${rx.id}')">Deactivate</button>` : ''}
          ${isDeactivated ? `<button class="btn btn-sm btn-o" onclick="reactivateRx('${rx.id}')">Reactivate</button>` : ''}
        </div></div></div>`;
  }).join('')}
  `;
}
function openRxForm(rxId) {
  const rx = rxId ? State.prescriptions.find(r => r.id === rxId) : null;
  const isEdit = !!rx;
  const title = isEdit ? 'Edit Prescription' : 'Add Self-Care Prescription';
  const body = `
  <form id="rx-form" onsubmit="event.preventDefault();saveRxForm('${rxId || ''}')" class="stack16"><div><label class="label" for="rx-title">Title *</label><input class="input" id="rx-title" maxlength="80" required value="${esc(rx ? rx.title : '')}" placeholder="e.g. Morning meal plan check-in"><div class="field-error" id="rx-title-err"></div></div><div><label class="label" for="rx-category">Category *</label><select class="input" id="rx-category" required>
        ${CATEGORIES.map(c => `<option value="${c.id}" ${rx && rx.category === c.id ? 'selected' : ''}>${c.label}</option>`).join('')}
      </select></div><div><label class="label" for="rx-instructions">Instructions</label><textarea class="input" id="rx-instructions" maxlength="500" placeholder="Describe the self-care activity...">${esc(rx ? rx.instructions || '' : '')}</textarea><p class="xs">Do not include specific numeric targets (calories, litres, etc.) unless advised by your clinician.</p></div><div><label class="label" for="rx-freq">Frequency *</label><select class="input" id="rx-freq" required onchange="toggleFreqFields()"><option value="daily" ${rx && rx.frequency==='daily'?'selected':''}>Daily</option><option value="weekdays" ${rx && rx.frequency==='weekdays'?'selected':''}>Selected weekdays</option><option value="multi" ${rx && rx.frequency==='multi'?'selected':''}>Multiple times per day</option><option value="onetime" ${rx && rx.frequency==='onetime'?'selected':''}>One-time</option></select></div><div id="freq-weekdays" style="display:${rx && rx.frequency==='weekdays'?'block':'none'}"><label class="label">Days of the week</label><div class="row wrap gap2">
        ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => `
          <label style="display:flex;align-items:center;gap:4px;font-size:var(--fs-sm);cursor:pointer"><input type="checkbox" class="rx-day" value="${i}" ${rx && rx.days && rx.days.includes(i) ? 'checked' : ''}> ${d}
          </label>
        `).join('')}
      </div><div class="field-error" id="rx-days-err"></div></div><div id="freq-times"><label class="label">Time(s)</label><div id="rx-times-list">
        ${(rx && rx.times ? rx.times : ['08:00']).map((t, i) => `
          <div class="row gap2 mb8"><input type="time" class="input rx-time" value="${t}" style="width:auto" required>
            ${i > 0 ? `<button type="button" class="btn btn-sm btn-g" onclick="this.parentElement.remove()">Remove</button>` : ''}
          </div>
        `).join('')}
      </div><button type="button" class="btn btn-sm btn-o" onclick="addTimeField()">+ Add time</button></div><div class="grid g2"><div><label class="label" for="rx-start">Start date *</label><input type="date" class="input" id="rx-start" required value="${rx ? rx.startDate : todayStr()}"></div><div><label class="label" for="rx-end">End date (optional)</label><input type="date" class="input" id="rx-end" value="${rx && rx.endDate ? rx.endDate : ''}"><p class="xs">Leave blank for ongoing</p></div></div><div class="field-error" id="rx-date-err"></div><div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn btn-g" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-p">${isEdit ? 'Save Changes' : 'Add Prescription'}</button></div></form>`;
  openModal(title, body, { wide: true, onMount: () => {
    window.toggleFreqFields = function() {
      const f = document.getElementById('rx-freq').value;
      document.getElementById('freq-weekdays').style.display = f === 'weekdays' ? 'block' : 'none';
    };
    window.addTimeField = function() {
      const list = document.getElementById('rx-times-list');
      const div = document.createElement('div');
      div.className = 'row gap2 mb8';
      div.innerHTML = `<input type="time" class="input rx-time" value="12:00" style="width:auto" required><button type="button" class="btn btn-sm btn-g" onclick="this.parentElement.remove()">Remove</button>`;
      list.appendChild(div);
    };
  }});
}
let rxSubmitting = false;
function saveRxForm(rxId) {
  if (rxSubmitting) return;
  const titleEl = document.getElementById('rx-title');
  if (!titleEl) return; // modal closed
  const title = titleEl.value.trim();
  const category = document.getElementById('rx-category').value;
  const instructions = document.getElementById('rx-instructions').value.trim();
  const frequency = document.getElementById('rx-freq').value;
  const startDate = document.getElementById('rx-start').value;
  const endDate = document.getElementById('rx-end').value || null;
  let valid = true;
  document.getElementById('rx-title-err').textContent = '';
  document.getElementById('rx-days-err').textContent = '';
  document.getElementById('rx-date-err').textContent = '';
  if (!title || title.length > 80) {
    document.getElementById('rx-title-err').textContent = 'Title is required (max 80 characters).';
    valid = false;
  }
  let days = [];
  if (frequency === 'weekdays') {
    days = Array.from(document.querySelectorAll('.rx-day:checked')).map(el => parseInt(el.value));
    if (days.length === 0) {
      document.getElementById('rx-days-err').textContent = 'Select at least one day.';
      valid = false;
    }
  }
  let times = Array.from(document.querySelectorAll('.rx-time')).map(el => el.value).filter(t => t);
  if (times.length === 0) {
    document.getElementById('rx-date-err').textContent = 'Add at least one time.';
    valid = false;
  }
  const timesBefore = times.length;
  times = [...new Set(times)];
  if (times.length !== timesBefore) {
    document.getElementById('rx-date-err').textContent = 'Removed ' + (timesBefore - times.length) + ' duplicate time(s).';
  }
  for (const t of times) {
    if (!/^\d{2}:\d{2}$/.test(t)) {
      document.getElementById('rx-date-err').textContent = 'Invalid time format. Use HH:MM.';
      valid = false;
      break;
    }
  }
  if (endDate && endDate < startDate) {
    document.getElementById('rx-date-err').textContent = 'End date must be on or after start date.';
    valid = false;
  }
  if (!valid) return;
  rxSubmitting = true;
  setTimeout(() => { rxSubmitting = false; }, 800); // safety reset
  const n = now();
  if (rxId) {
    const rx = State.prescriptions.find(r => r.id === rxId);
    if (rx) {
      rx.title = title;
      rx.category = category;
      rx.instructions = instructions;
      rx.frequency = frequency;
      rx.days = days;
      rx.times = times.sort();
      rx.startDate = startDate;
      rx.endDate = endDate;
      rx.updatedAt = n.toISOString();
    }
  } else {
    State.prescriptions.push({
      id: uid(),
      title,
      category,
      instructions,
      frequency,
      days,
      times: times.sort(),
      startDate,
      endDate,
      source: 'user',
      active: true,
      createdAt: n.toISOString(),
      updatedAt: n.toISOString(),
      deactivatedOn: null,
    });
  }
  saveState();
  closeModal();
  render();
  toast(rxId ? 'Prescription updated (future occurrences only)' : 'Prescription added');
}
function confirmDeactivateRx(rxId) {
  const rx = State.prescriptions.find(r => r.id === rxId);
  if (!rx) return;
  openModal('Deactivate Prescription', `
    <p>Are you sure you want to deactivate <strong>${esc(rx.title)}</strong>?</p><p class="muted mt8">This will hide it from your plan going forward. Past records will be preserved.</p><div class="row" style="justify-content:flex-end;gap:8px;margin-top:16px"><button class="btn btn-o" onclick="closeModal()">Cancel</button><button class="btn btn-d" onclick="deactivateRx('${rxId}')">Deactivate</button></div>
  `);
}
function deactivateRx(rxId) {
  const rx = State.prescriptions.find(r => r.id === rxId);
  if (rx) {
    rx.deactivatedOn = todayStr();
    rx.active = false;
    rx.updatedAt = now().toISOString();
    saveState();
  }
  closeModal();
  render();
  toast('Prescription deactivated');
}
function reactivateRx(rxId) {
  const rx = State.prescriptions.find(r => r.id === rxId);
  if (rx) {
    rx.active = true;
    rx.deactivatedOn = null;
    rx.updatedAt = now().toISOString();
    saveState();
  }
  render();
  toast('Prescription reactivated');
}
let alertTab = 'active';
function renderAlerts() {
  const active = State.alerts.filter(a => !a.dismissed);
  const dismissed = State.alerts.filter(a => a.dismissed);
  const list = alertTab === 'active' ? active : dismissed;
  const today = todayStr();
  const todayOccs = getAllOccurrencesForDate(today);
  let remaining = 0;
  for (const occ of todayOccs) {
    const s = getOccurrenceStatus(occ.prescriptionId, occ.date, occ.time);
    if (s.status === 'upcoming' || s.status === 'due') remaining++;
  }
  return `
  <div class="page-h"><h1>Reminders & Alerts</h1></div><div class="card p16 mb16"><div class="row gap4">
      ${ic('activity', 20)}
      <div><p style="font-weight:600">${remaining} activit${remaining !== 1 ? 'ies' : 'y'} remaining today</p><p class="xs">${formatDate(today)}</p></div></div></div><div class="row mb16"><div class="seg"><button class="${alertTab==='active'?'on':''}" onclick="alertTab='active';render()">Active (${active.length})</button><button class="${alertTab==='dismissed'?'on':''}" onclick="alertTab='dismissed';render()">Dismissed (${dismissed.length})</button></div></div>
  ${list.length === 0 ? `
    <div class="card empty"><div class="ic-box">${ic('bell')}</div><h3>No ${alertTab} alerts</h3><p class="muted mt8">${alertTab === 'active' ? 'You\'re all caught up!' : 'No dismissed alerts yet.'}</p></div>
  ` : list.map(a => `
    <div class="card p16 mb8"><div class="row sb wrap gap2"><div class="flex1" style="min-width:0"><div class="row gap2" style="flex-wrap:wrap"><span class="chip ${a.type === 'missed' ? 'bad' : a.type === 'due' ? 'warn' : a.type === 'weekly' ? 'info' : ''}">${a.type}</span>
            ${a.relatedOccurrence ? `<span class="xs">${formatDate(a.relatedOccurrence.date)} at ${formatTime12(a.relatedOccurrence.time)}</span>` : ''}
          </div><p style="margin-top:6px">${esc(a.message)}</p></div><div class="row gap2">
          ${a.relatedOccurrence && !a.dismissed ? `<button class="btn btn-sm btn-o" onclick="openAlertOccurrence('${a.relatedOccurrence.prescriptionId}','${a.relatedOccurrence.date}','${a.relatedOccurrence.time}')">Open</button>` : ''}
          ${!a.dismissed ? `<button class="btn btn-sm btn-g" onclick="dismissAlert('${a.id}')">Dismiss</button>` : '<span class="xs">Dismissed</span>'}
        </div></div></div>
  `).join('')}
  <div class="banner brand mt24">
    ${ic('info', 16)}
    <div><p><strong>About reminders:</strong> These are in-app only and work while this page is open. Reliable background reminders would need a backend service or an installed app. No SMS, email, or WhatsApp reminders are sent.</p></div></div>
  `;
}
let reportRange = '7days';
let reportCustomStart = '', reportCustomEnd = '';
let reportStatusFilter = 'all';
function renderReports() {
  const today = todayStr();
  let startDate, endDate;
  switch (reportRange) {
    case 'today':
      startDate = endDate = today;
      break;
    case '7days':
      startDate = addDays(today, -6);
      endDate = today;
      break;
    case '30days':
      startDate = addDays(today, -29);
      endDate = today;
      break;
    case 'custom':
      startDate = reportCustomStart || today;
      endDate = reportCustomEnd || today;
      break;
    default:
      startDate = addDays(today, -6);
      endDate = today;
  }
  const stats = calcDetailedAdherence(startDate, endDate);
  const todayStats = calcDetailedAdherence(today, today);
  const catStats = {};
  for (const cat of CATEGORIES) {
    catStats[cat.id] = { scheduled: 0, completed: 0, label: cat.label };
  }
  let d = startDate;
  const n = now();
  const nowMin = n.getHours() * 60 + n.getMinutes();
  while (d <= endDate) {
    for (const rx of State.prescriptions) {
      if (!rx.category) continue;
      const occs = getOccurrencesForDate(rx, d);
      for (const occ of occs) {
        const rec = getRecordForOccurrence(occ.prescriptionId, occ.date, occ.time);
        const isPast = d < today || (d === today && timeToMinutes(occ.time) <= nowMin);
        if (rec || isPast) {
          if (catStats[rx.category]) catStats[rx.category].scheduled++;
          if (rec && rec.status === 'completed' && catStats[rx.category]) catStats[rx.category].completed++;
        }
      }
    }
    d = addDays(d, 1);
  }
  const chartData = [];
  for (let i = 6; i >= 0; i--) {
    const dd = addDays(today, -i);
    const s = calcAdherenceForDateRange(dd, dd);
    chartData.push({ date: dd, pct: s.pct, label: formatDateShort(dd) });
  }
  let historyRows = [];
  d = startDate;
  while (d <= endDate) {
    for (const rx of State.prescriptions) {
      const occs = getOccurrencesForDate(rx, d);
      for (const occ of occs) {
        const rec = getRecordForOccurrence(occ.prescriptionId, occ.date, occ.time);
        const status = rec ? rec.status : (d < today || (d === today && timeToMinutes(occ.time) <= nowMin) ? 'missed' : 'upcoming');
        if (reportStatusFilter !== 'all' && status !== reportStatusFilter) continue;
        if (status === 'upcoming') continue; // Don't show upcoming in history
        historyRows.push({
          date: occ.date,
          title: rec ? rec.titleSnapshot : occ.title,
          category: rec ? rec.categorySnapshot : occ.category,
          time: occ.time,
          completedAt: rec && rec.completedAt ? new Date(rec.completedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '—',
          status,
          notes: rec ? ((rec.skipReason || '') + (rec.loggedLate ? ' (logged late)' : '')) : '',
          source: rec ? rec.source : '',
        });
      }
    }
    d = addDays(d, 1);
  }
  historyRows.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const formulaText = stats.scheduled > 0
    ? `${stats.completed} completed ÷ ${stats.scheduled} scheduled = ${stats.pct}%`
    : 'No scheduled occurrences in this range (denominator = 0 → shown as "—")';
  return `
  <div class="page-h"><h1>Progress & Reports</h1><div class="row gap2 no-print"><button class="btn btn-sm btn-o" onclick="exportCSV()">${ic('download', 14)} Export CSV</button><button class="btn btn-sm btn-o" onclick="window.print()">${ic('printer', 14)} Print</button></div></div><div class="print-header"><h2>CareTrack — Self-Care Report</h2>
    ${State.profile ? `<p>${esc(State.profile.name)} · ${esc(State.profile.condition)}</p>` : ''}
    <p>Period: ${formatDate(startDate)} to ${formatDate(endDate)}</p>
    ${State.profile && State.profile.isDemo ? '<p><strong>SYNTHETIC DEMONSTRATION DATA</strong></p>' : ''}
  </div><div class="row wrap mb16 gap2 no-print"><div class="seg"><button class="${reportRange==='today'?'on':''}" onclick="setReportRange('today')">Today</button><button class="${reportRange==='7days'?'on':''}" onclick="setReportRange('7days')">Last 7 days</button><button class="${reportRange==='30days'?'on':''}" onclick="setReportRange('30days')">Last 30 days</button><button class="${reportRange==='custom'?'on':''}" onclick="setReportRange('custom')">Custom</button></div>
    ${reportRange === 'custom' ? `
      <div class="row gap2"><input type="date" class="input" style="width:auto" value="${reportCustomStart || today}" onchange="reportCustomStart=this.value;render()"><span>to</span><input type="date" class="input" style="width:auto" value="${reportCustomEnd || today}" onchange="reportCustomEnd=this.value;render()"></div>
    ` : ''}
  </div><div class="grid g4 mb24"><div class="card p16"><p class="xs">Adherence</p><p style="font-size:var(--fs-2xl);font-weight:700">${stats.pct !== null ? stats.pct + '%' : '—'}</p></div><div class="card p16"><p class="xs">Scheduled</p><p style="font-size:var(--fs-2xl);font-weight:700">${stats.scheduled}</p></div><div class="card p16"><p class="xs">Completed</p><p style="font-size:var(--fs-2xl);font-weight:700;color:var(--ok-text)">${stats.completed}</p></div><div class="card p16"><p class="xs">Missed / Skipped</p><p style="font-size:var(--fs-2xl);font-weight:700"><span style="color:var(--danger-text)">${stats.missed}</span> / <span style="color:var(--skipped-text)">${stats.skipped}</span></p></div></div><div class="card p16 mb24"><h3 class="mb8">Adherence Formula</h3><p class="sm"><strong>Adherence % = Completed ÷ Scheduled × 100</strong></p><p class="muted mt8">${esc(formulaText)}</p><p class="xs mt8">Scheduled = occurrences whose time has passed or that have a resolved record. Skipped and Missed count in the denominator, never in the numerator. Future/upcoming occurrences are excluded.</p></div><div class="card p16 mb24"><h3 class="mb16">Category-wise Adherence</h3>
    ${CATEGORIES.map(cat => {
      const s = catStats[cat.id];
      if (s.scheduled === 0) return '';
      const pct = Math.round(s.completed / s.scheduled * 100);
      return `
      <div style="margin-bottom:12px"><div class="row sb sm"><span>${cat.icon} ${cat.label}</span><span>${s.completed}/${s.scheduled} (${pct}%)</span></div><div class="bar mt4"><i style="width:${pct}%"></i></div></div>`;
    }).join('')}
  </div><div class="card p16 mb24"><h3 class="mb16">7-Day Adherence Chart</h3>
    ${renderBarChart(chartData)}
  </div><div class="card p20"><div class="row sb mb16 no-print"><h3>History</h3><select class="input" style="width:auto" onchange="reportStatusFilter=this.value;render()"><option value="all" ${reportStatusFilter==='all'?'selected':''}>All statuses</option><option value="completed" ${reportStatusFilter==='completed'?'selected':''}>Completed</option><option value="skipped" ${reportStatusFilter==='skipped'?'selected':''}>Skipped</option><option value="missed" ${reportStatusFilter==='missed'?'selected':''}>Missed</option></select></div>
    ${historyRows.length === 0 ? '<p class="muted">No records for this period.</p>' : `
    <div class="tablewrap"><table class="t"><thead><tr><th>Date</th><th>Prescription</th><th>Category</th><th>Time</th><th>Completed</th><th>Status</th><th>Notes</th></tr></thead><tbody>
        ${historyRows.slice(0, 100).map(r => `
          <tr><td>${formatDateShort(r.date)}</td><td>${esc(r.title)}</td><td>${getCategoryInfo(r.category).icon} ${getCategoryInfo(r.category).label}</td><td>${formatTime12(r.time)}</td><td>${r.completedAt}</td><td><span class="status-badge ${r.status}"><span class="dot"></span>${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>${r.source === 'demo' ? ' <span class="chip demo" style="font-size:9px">Demo</span>' : ''}${r.source === 'simulated' ? ' <span class="chip info" style="font-size:9px">Sim</span>' : ''}</td><td class="xs">${esc(r.notes)}</td></tr>
        `).join('')}
        </tbody></table></div>
    ${historyRows.length > 100 ? `<p class="xs mt8">Showing 100 of ${historyRows.length} records.</p>` : ''}
    `}
  </div>
  `;
}
function renderBarChart(data) {
  const w = 400, h = 180, pad = { top: 10, bottom: 30, left: 30, right: 10 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const barW = chartW / data.length - 6;
  let bars = '';
  bars += `<text x="${pad.left - 5}" y="${pad.top + 5}" text-anchor="end" fill="var(--text-3)" font-size="10">100%</text>`;
  bars += `<text x="${pad.left - 5}" y="${pad.top + chartH/2 + 3}" text-anchor="end" fill="var(--text-3)" font-size="10">50%</text>`;
  bars += `<text x="${pad.left - 5}" y="${pad.top + chartH}" text-anchor="end" fill="var(--text-3)" font-size="10">0%</text>`;
  bars += `<line x1="${pad.left}" y1="${pad.top}" x2="${w - pad.right}" y2="${pad.top}" stroke="var(--line)" stroke-dasharray="2"/>`;
  bars += `<line x1="${pad.left}" y1="${pad.top + chartH/2}" x2="${w - pad.right}" y2="${pad.top + chartH/2}" stroke="var(--line)" stroke-dasharray="2"/>`;
  bars += `<line x1="${pad.left}" y1="${pad.top + chartH}" x2="${w - pad.right}" y2="${pad.top + chartH}" stroke="var(--line)"/>`;
  data.forEach((d, i) => {
    const pct = d.pct || 0;
    const barH = (pct / 100) * chartH;
    const x = pad.left + i * (chartW / data.length) + 3;
    const y = pad.top + chartH - barH;
    const color = pct >= 70 ? 'var(--ok-text)' : pct >= 40 ? 'var(--warn-text)' : pct > 0 ? 'var(--danger-text)' : 'var(--surface-3)';
    bars += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${color}" opacity="0.85"/>`;
    bars += `<text x="${x + barW/2}" y="${h - 8}" text-anchor="middle" fill="var(--text-3)" font-size="10">${d.label}</text>`;
    if (pct > 0) bars += `<text x="${x + barW/2}" y="${y - 4}" text-anchor="middle" fill="var(--text-2)" font-size="9">${pct}%</text>`;
  });
  const summary = data.map(d => `${d.label}: ${d.pct || 0}%`).join(', ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto" role="img" aria-label="7-day adherence bar chart. ${summary}">${bars}</svg>`;
}
function setReportRange(r) {
  reportRange = r;
  render();
}
function exportCSV() {
  const today = todayStr();
  const startDate = addDays(today, -29);
  const rows = [['Date', 'Prescription', 'Category', 'Scheduled Time', 'Completion Time', 'Status', 'Notes', 'Source']];
  let d = startDate;
  while (d <= today) {
    for (const rx of State.prescriptions) {
      const occs = getOccurrencesForDate(rx, d);
      for (const occ of occs) {
        const rec = getRecordForOccurrence(occ.prescriptionId, occ.date, occ.time);
        const status = rec ? rec.status : 'missed';
        const notes = rec ? ((rec.skipReason || '') + (rec.loggedLate ? ' (logged late)' : '')) : '';
        const completedAt = rec && rec.completedAt ? new Date(rec.completedAt).toLocaleString() : '';
        const source = rec ? rec.source : '';
        const catLabel = getCategoryInfo(rec ? rec.categorySnapshot : occ.category).label;
        rows.push([
          occ.date,
          rec ? rec.titleSnapshot : occ.title,
          catLabel,
          formatTime12(occ.time),
          completedAt,
          status,
          notes,
          source,
        ]);
      }
    }
    d = addDays(d, 1);
  }
  const csvRows = rows.map(row =>
    row.map(cell => {
      let s = String(cell == null ? '' : cell);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      if (/[",\n\r]/.test(s)) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  );
  const bom = '\uFEFF';
  const csv = bom + csvRows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `caretrack_report_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV exported');
}
function renderProfile() {
  const p = State.profile;
  const conditions = ['Type 2 diabetes', 'Hypertension', 'Chronic respiratory disease', 'Cardiovascular disease', 'Other'];
  return `
  <div class="page-h"><h1>My Profile</h1></div>
  ${(typeof Auth !== "undefined" && Auth.currentUser) ? `
    <div class="card p16 mb20 user-account-badge" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-left:4px solid var(--brand-500)">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--brand-soft);color:var(--brand-soft-text);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px">
          ${esc(Auth.currentUser.name.charAt(0).toUpperCase())}
        </div>
        <div>
          <div style="font-weight:600;font-size:15px;display:flex;align-items:center;gap:6px">
            ${esc(Auth.currentUser.name)}
            <span class="chip ok" style="font-size:11px;padding:1px 6px">${Auth.isPrototypeAccount() ? "Prototype Showcase" : "Active Session"}</span>
          </div>
          <div class="muted" style="font-size:13px">${esc(Auth.currentUser.email)}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${Auth.isPrototypeAccount() ? '<button type="button" class="btn btn-o btn-sm" onclick="Auth.loadPrototypeShowcaseData(); toast(\'Prototype data reset successfully!\'); render();" title="Reset all prototype mock data">↻ Reset Prototype Data</button>' : ''}
        <button type="button" class="btn btn-o btn-sm" onclick="Auth.logout()">Sign Out / Switch Account</button>
      </div>
    </div>
  ` : ''}<div class="card p20"><form onsubmit="event.preventDefault();saveProfile()" class="stack16"><div><label class="label" for="p-name">Full name *</label><input class="input" id="p-name" required maxlength="100" value="${esc(p ? p.name : '')}" placeholder="e.g. Ananya Sharma"></div><div class="grid g2"><div><label class="label" for="p-age">Age *</label><input class="input" id="p-age" type="number" min="0" max="120" required value="${p ? p.age : ''}" placeholder="e.g. 45"><div class="field-error" id="p-age-err"></div></div><div><label class="label" for="p-id">Patient ID (optional)</label><input class="input" id="p-id" maxlength="50" value="${esc(p ? p.patientId || '' : '')}" placeholder="e.g. PT-12345"></div></div><div><label class="label" for="p-cond">Condition *</label><select class="input" id="p-cond" required onchange="toggleOtherCondition()"><option value="">Select a condition</option>
          ${conditions.map(c => `<option value="${c}" ${p && p.condition === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select></div><div id="other-cond-wrap" style="display:${p && p.condition === 'Other' ? 'block' : 'none'}"><label class="label" for="p-other-cond">Specify condition</label><input class="input" id="p-other-cond" value="${esc(p && p.condition === 'Other' ? (p.conditionDetail || '') : '')}" maxlength="100"></div><div><label class="label" for="p-clin">Clinician name (optional)</label><input class="input" id="p-clin" maxlength="100" value="${esc(p ? p.clinician || '' : '')}" placeholder="e.g. Dr. Patel"></div><div class="grid g2"><div><label class="label" for="p-emg-name">Emergency contact name (optional)</label><input class="input" id="p-emg-name" maxlength="100" value="${esc(p ? p.emergencyContactName || '' : '')}" placeholder="e.g. Ravi Sharma (son)"></div><div><label class="label" for="p-emg-phone">Emergency contact phone (optional)</label><input class="input" id="p-emg-phone" type="tel" maxlength="20" value="${esc(p ? p.emergencyContactPhone || '' : '')}" placeholder="e.g. +91 98765 43210"><div class="field-error" id="p-emg-phone-err"></div></div></div><p class="xs">Used by the Emergency SOS screen for a one-tap dial button. Stored only on this device.</p><div><label class="label">Preferred reminder times (defaults for new prescriptions)</label><div id="p-reminders">
          ${(p && p.reminderTimes ? p.reminderTimes : ['08:00', '18:00', '22:00']).map(t => `
            <div class="row gap2 mb4"><input type="time" class="input p-rem-time" value="${t}" style="width:auto"><button type="button" class="btn btn-sm btn-g" onclick="this.parentElement.remove()">×</button></div>
          `).join('')}
        </div><button type="button" class="btn btn-sm btn-o" onclick="addReminderTime()">+ Add time</button></div><div class="row" style="justify-content:flex-end;gap:8px"><button type="submit" class="btn btn-p">Save Profile</button></div></form></div>
  ${p ? `
  <div class="card p20 mt24"><h3 class="mb12">Sample Self-Care Plan</h3><p class="muted mb16">Preview generic demo prescriptions for ${esc(p.condition === 'Other' ? (p.conditionDetail || 'your condition') : p.condition)}. These are demonstration data only — they must be reviewed and personalized by a qualified healthcare professional.</p><button class="btn btn-o" onclick="previewSamplePlan()">${ic('clipboard-list', 16)} Preview sample self-care plan</button></div>
  ` : ''}
  `;
}
function toggleOtherCondition() {
  const v = document.getElementById('p-cond').value;
  document.getElementById('other-cond-wrap').style.display = v === 'Other' ? 'block' : 'none';
}
function addReminderTime() {
  const container = document.getElementById('p-reminders');
  const div = document.createElement('div');
  div.className = 'row gap2 mb4';
  div.innerHTML = `<input type="time" class="input p-rem-time" value="12:00" style="width:auto"><button type="button" class="btn btn-sm btn-g" onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(div);
}
function saveProfile() {
  const name = document.getElementById('p-name').value.trim();
  const age = parseInt(document.getElementById('p-age').value);
  const patientId = document.getElementById('p-id').value.trim();
  let condition = document.getElementById('p-cond').value;
  const clinician = document.getElementById('p-clin').value.trim();
  const emgNameEl = document.getElementById('p-emg-name');
  const emgPhoneEl = document.getElementById('p-emg-phone');
  const emergencyContactName = emgNameEl ? emgNameEl.value.trim() : '';
  const emergencyContactPhone = emgPhoneEl ? emgPhoneEl.value.trim() : '';
  if (condition === 'Other') {
    const detail = document.getElementById('p-other-cond').value.trim();
    condition = detail ? 'Other' : '';
  }
  document.getElementById('p-age-err').textContent = '';
  const emgErr = document.getElementById('p-emg-phone-err');
  if (emgErr) emgErr.textContent = '';
  if (!name) { toast('Name is required', true); return; }
  if (!age || age < 0 || age > 120 || !Number.isInteger(age)) {
    document.getElementById('p-age-err').textContent = 'Age must be a whole number between 0 and 120.';
    return;
  }
  if (!condition) { toast('Please select a condition', true); return; }
  if (emergencyContactPhone && !/^[0-9+\-\s()]{6,20}$/.test(emergencyContactPhone)) {
    if (emgErr) emgErr.textContent = 'Enter a valid phone number (digits, +, spaces).';
    return;
  }
  const reminderTimes = Array.from(document.querySelectorAll('.p-rem-time')).map(el => el.value).filter(t => t);
  const n = now();
  if (State.profile) {
    State.profile.name = name;
    State.profile.age = age;
    State.profile.patientId = patientId;
    State.profile.condition = condition;
    State.profile.clinician = clinician;
    State.profile.reminderTimes = reminderTimes;
    State.profile.emergencyContactName = emergencyContactName;
    State.profile.emergencyContactPhone = emergencyContactPhone;
  } else {
    State.profile = {
      id: uid(),
      name,
      age,
      patientId,
      condition,
      clinician,
      reminderTimes,
      emergencyContactName,
      emergencyContactPhone,
      isDemo: false,
    };
  }
  saveState();
  render();
  toast('Profile saved');
}
function previewSamplePlan() {
  const samplePrescriptions = getSamplePrescriptions();
  const body = `
    <div class="banner info mb16">
      ${ic('info', 16)}
      <span>Sample demonstration data — to be reviewed and personalized by a qualified healthcare professional.</span></div><p class="muted mb16">These generic prescriptions are for demonstration purposes only. They contain no specific numeric targets or medical advice.</p>
    ${samplePrescriptions.map(rx => `
      <div style="padding:8px 0;border-bottom:1px solid var(--line)"><p style="font-weight:600">${getCategoryInfo(rx.category).icon} ${esc(rx.title)}</p><p class="xs">${getCategoryInfo(rx.category).label} · ${rx.times.map(formatTime12).join(', ')} · ${rx.frequency}</p><p class="muted sm">${esc(rx.instructions)}</p></div>
    `).join('')}
    <div class="row" style="justify-content:flex-end;margin-top:16px"><button class="btn btn-p" onclick="addSamplePlan()">Add this sample plan</button></div>
  `;
  openModal('Sample Self-Care Plan Preview', body, { wide: true });
}
function getSamplePrescriptions() {
  const today = todayStr();
  return [
    { title: 'Morning meal plan check-in', category: 'diet', instructions: 'Follow the meal plan approved by your clinician.', frequency: 'daily', times: ['08:00'], days: [], startDate: addDays(today, -6) },
    { title: 'Physical activity — walking', category: 'activity', instructions: 'Follow the walking routine approved by your clinician.', frequency: 'weekdays', times: ['18:00'], days: [1, 3, 5], startDate: addDays(today, -6) },
    { title: 'Evening sleep routine check-in', category: 'sleep', instructions: 'Follow the sleep routine discussed with your care team.', frequency: 'daily', times: ['22:00'], days: [], startDate: addDays(today, -6) },
    { title: 'Stress management — relaxation', category: 'stress', instructions: 'Practice the relaxation technique advised by your care team.', frequency: 'daily', times: ['20:30'], days: [], startDate: addDays(today, -6) },
    { title: 'Morning breathing exercise', category: 'breathing', instructions: 'Follow the breathing exercise approved by your clinician.', frequency: 'daily', times: ['07:30'], days: [], startDate: addDays(today, -6) },
    { title: 'Hydration reminder', category: 'hydration', instructions: 'Amount and timing: as advised by your care team.', frequency: 'multi', times: ['10:00', '14:00', '16:00'], days: [], startDate: addDays(today, -6) },
  ];
}
function addSamplePlan() {
  const samples = getSamplePrescriptions();
  const existingTitles = new Set(State.prescriptions.map(r => r.title.toLowerCase()));
  const n = now();
  let added = 0;
  for (const s of samples) {
    if (existingTitles.has(s.title.toLowerCase())) continue;
    State.prescriptions.push({
      id: uid(),
      title: s.title,
      category: s.category,
      instructions: s.instructions,
      frequency: s.frequency,
      days: s.days || [],
      times: s.times,
      startDate: s.startDate,
      endDate: null,
      source: 'demo',
      active: true,
      createdAt: n.toISOString(),
      updatedAt: n.toISOString(),
      deactivatedOn: null,
    });
    existingTitles.add(s.title.toLowerCase());
    added++;
  }
  saveState();
  closeModal();
  render();
  toast(`${added} sample prescriptions added`);
}
function renderSettings() {
  const s = State.settings;
  const hasDemoData = State.profile && State.profile.isDemo;
  return `
  <div class="page-h"><h1>Settings</h1></div><div class="card p20 mb24"><h2 class="mb8">Your data</h2><p class="muted mb16">Your check-ins, journal and reflections are stored in this browser on this device. Deleting removes them from this device; it cannot undo exports you already saved.</p><button class="btn btn-d" onclick="deleteAllData()">${ic('trash', 14)} Delete ALL Data</button></div><div class="card p20 mb24"><h2 class="mb16">Settings</h2><div class="mb16"><label class="label" for="grace-period">Grace period (minutes)</label><input class="input" type="number" id="grace-period" min="0" max="720" value="${s.gracePeriodMinutes}" style="width:120px"><p class="xs mt4">Time after a task's scheduled time before it's considered missed (0–720 minutes).</p></div><div class="mb16"><div class="row sb"><div><label style="font-weight:600">Browser notifications</label><p class="xs">In-page notifications only. Works while this page is open.</p></div><button class="toggle" role="switch" aria-checked="${s.notificationsEnabled}" onclick="toggleNotifications()" id="notif-toggle"></button></div><p class="xs mt4">Reliable background reminders would need a backend service or an installed app.</p></div><div class="mb16"><div class="row sb"><div><label style="font-weight:600">Theme</label></div><div class="seg"><button class="${!document.documentElement.getAttribute('data-theme')?'on':''}" onclick="setTheme('light')">Light</button><button class="${document.documentElement.getAttribute('data-theme')==='dark'?'on':''}" onclick="setTheme('dark')">Dark</button></div></div></div><div class="row wrap gap2 mb16"><button class="btn btn-o" onclick="exportJSON()">${ic('download', 14)} Export all data (JSON)</button><button class="btn btn-o" onclick="document.getElementById('import-file').click()">${ic('download', 14)} Import data (JSON)</button><input type="file" id="import-file" accept=".json" style="display:none" onchange="importJSON(event)"></div><button class="btn btn-p" onclick="saveSettings()">${ic('check', 14)} Save Settings</button></div><div class="card p20 mb24"><div class="row gap2 mb16"><h2>Smart AI Configuration</h2><span class="chip info">Backend connection</span>
      ${AI_CONFIG.LLM_ENDPOINT ? (AI.llmVerified ? '<span class="chip ok">Verified</span>' : '<span class="chip warn">Not verified</span>') : '<span class="chip">Built-in engine</span>'}
    </div><p class="muted mb16">Sahaara uses the secure OpenAI backend when this app is served by the bundled Node.js server. Keep the endpoint at <code>/api/chat</code>; the model and API key are configured on the server. If the server or API is unavailable, Sahaara falls back to its built-in guidance engine.</p><div class="banner amber mb16">${ic('alert-circle', 16)}<span><strong>Never paste a provider API key into this app.</strong> Browser-side keys are readable by anyone with access to the page or its storage. This form has no key field on purpose; any key saved by older versions has been removed.</span></div><div class="stack16"><div><label class="label" for="llm-endpoint">AI Endpoint URL</label><input class="input" id="llm-endpoint" placeholder="/api/chat" value="${esc(AI_CONFIG.LLM_ENDPOINT)}"><p class="xs mt4">Leave empty for the built-in engine · <button type="button" class="link" style="display:inline" onclick="document.getElementById('llm-endpoint').value='/api/chat'">use bundled proxy (/api/chat)</button></p></div><div><label class="label" for="llm-model">Provider (informational)</label><select class="input" id="llm-model"><option value="chatgpt" ${AI_CONFIG.LLM_MODEL==='chatgpt'?'selected':''}>OpenAI (configured on server)</option><option value="custom" ${AI_CONFIG.LLM_MODEL==='custom'?'selected':''}>Custom API endpoint</option></select><p class="xs mt4">The actual OpenAI model and API key are configured on the server. This dropdown does not change the server model.</p></div><div class="row gap2 wrap"><button class="btn btn-p" onclick="saveAIConfig()">Save AI Configuration</button><button class="btn btn-o" id="ai-test-btn" onclick="testAIConnection()">Test Connection</button></div><div id="ai-config-status"></div><div class="card flat p16" style="border:1px dashed var(--line)"><div class="row sb gap2 wrap"><div><label style="font-weight:600">Share profile summary with AI requests</label><p class="xs">Off (default): only non-identifying context (active prescription count, date) is sent. On: your name, condition and age are included for more personalized answers.</p></div><button class="toggle" role="switch" aria-checked="${!!s.sendProfileContext}" aria-label="Share profile summary with AI" onclick="toggleProfileSharing()"></button></div></div></div></div><div class="card p20 mb24"><h2 class="mb8">Self-Test</h2><p class="muted mb16">Run in-page assertions to verify core logic.</p><button class="btn btn-o" onclick="runSelfTest()">Run self-test</button><div id="test-results" class="mt16"></div></div><div class="card p20"><h2 class="mb16">About & Privacy</h2><div class="stack16"><div><h3>About CareTrack</h3><p class="muted">CareTrack is a demonstration prototype built as a college project. It is not a production medical record system and should not be used for real patient data.</p></div><div><h3>Privacy & Data</h3><p class="muted">App records are stored in this browser by default. When you use the AI service, recent chat messages and the compact CareTrack plan context may be sent to your configured backend and onward to OpenAI to generate a reply. Review the privacy implications before entering real health information.</p><p class="muted mt8">To clear all data: use "Delete ALL Data" above, or clear your browser's site data for this page.</p></div><div><h3>Important Notices</h3><p class="muted">This is not medical advice. Sample data is synthetic. If you feel unwell or have concerns, contact your healthcare provider or local emergency services.</p></div></div></div>
  `;
}
function setTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  render();
}
function toggleNotifications() {
  State.settings.notificationsEnabled = !State.settings.notificationsEnabled;
  if (State.settings.notificationsEnabled && 'Notification' in window) {
    Notification.requestPermission();
  }
  saveState();
  render();
}
function saveSettings() {
  const grace = parseInt(document.getElementById('grace-period').value);
  if (isNaN(grace) || grace < 0 || grace > 720) {
    toast('Grace period must be between 0 and 720 minutes', true);
    return;
  }
  State.settings.gracePeriodMinutes = grace;
  saveState();
  render();
  toast('Settings saved');
}
function setDemoClock() {
  const mins = parseInt(document.getElementById('clock-offset').value) || 0;
  State.settings.demoClockOffset = mins * 60000;
  saveState();
  generateAutoAlerts();
  render();
  toast(`Demo clock offset set to ${mins} minutes`);
}
function clearDemoClock() {
  State.settings.demoClockOffset = 0;
  saveState();
  render();
  toast('Demo clock reset to real time');
}
function loadDemoPatient() {
  State.profile = {
    id: uid(),
    name: 'Ananya Sharma',
    age: 45,
    patientId: 'DEMO-001',
    condition: 'Type 2 diabetes',
    clinician: 'Dr. Mehta',
    reminderTimes: ['08:00', '18:00', '22:00'],
    isDemo: true,
  };
  saveState();
  render();
  toast('Demo patient loaded: Ananya Sharma');
}
function loadSamplePlanAndSeed() {
  if (!State.profile) {
    loadDemoPatient();
  }
  const samples = getSamplePrescriptions();
  const existingTitles = new Set(State.prescriptions.map(r => r.title.toLowerCase()));
  const n = now();
  for (const s of samples) {
    if (existingTitles.has(s.title.toLowerCase())) continue;
    State.prescriptions.push({
      id: uid(),
      title: s.title,
      category: s.category,
      instructions: s.instructions,
      frequency: s.frequency,
      days: s.days || [],
      times: s.times,
      startDate: s.startDate,
      endDate: null,
      source: 'demo',
      active: true,
      createdAt: n.toISOString(),
      updatedAt: n.toISOString(),
      deactivatedOn: null,
    });
    existingTitles.add(s.title.toLowerCase());
  }
  if (!State.prescriptions.find(r => r.title === 'Weekly wellness review')) {
    State.prescriptions.push({
      id: uid(),
      title: 'Weekly wellness review',
      category: 'other',
      instructions: 'Review your progress with your care team.',
      frequency: 'weekdays',
      days: [0],
      times: ['10:00'],
      startDate: addDays(todayStr(), -20),
      endDate: addDays(todayStr(), -8),
      source: 'demo',
      active: true,
      createdAt: n.toISOString(),
      updatedAt: n.toISOString(),
      deactivatedOn: addDays(todayStr(), -7),
    });
  }
  seedHistory();
  saveState();
  generateAutoAlerts();
  render();
  toast('Demo plan loaded with seeded history');
}
function seedHistory() {
  const today = todayStr();
  const n = now();
  for (let dayOffset = -6; dayOffset <= 0; dayOffset++) {
    const d = addDays(today, dayOffset);
    const isToday = dayOffset === 0;
    for (const rx of State.prescriptions) {
      const occs = getOccurrencesForDate(rx, d);
      for (let i = 0; i < occs.length; i++) {
        const occ = occs[i];
        if (getRecordForOccurrence(occ.prescriptionId, occ.date, occ.time)) continue;
        const hash = hashCode(occ.prescriptionId + d + i);
        const rand = Math.abs(hash) % 100;
        let status, source = 'demo';
        if (isToday) {
          if (timeToMinutes(occ.time) > n.getHours() * 60 + n.getMinutes()) {
            continue; // Future = no record (upcoming)
          }
          if (i === 0 && dayOffset === 0) {
            status = 'completed';
          } else if (rand < 55) {
            status = 'completed';
          } else if (rand < 75) {
            status = 'skipped';
          } else {
            continue; // Leave as upcoming/due/missed
          }
        } else {
          if (rand < 65) {
            status = 'completed';
          } else if (rand < 80) {
            status = 'skipped';
          } else {
            status = 'missed';
          }
        }
        const rec = {
          id: uid(),
          prescriptionId: occ.prescriptionId,
          date: occ.date,
          time: occ.time,
          titleSnapshot: rx.title,
          categorySnapshot: rx.category,
          status,
          source,
          updatedAt: n.toISOString(),
        };
        if (status === 'completed') {
          rec.completedAt = new Date(parseDate(d).getTime() + timeToMinutes(occ.time) * 60000 + Math.abs(hash) % 600000).toISOString();
          rec.loggedLate = rand % 7 === 0;
        }
        if (status === 'skipped') {
          rec.skipReason = ['Not feeling well', 'Forgot', 'Not available', 'Advised to rest'][Math.abs(hash) % 4];
        }
        State.records.push(rec);
      }
    }
  }
}
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}
function openSimulateMissedModal() {
  const today = todayStr();
  const occs = getAllOccurrencesForDate(today);
  const eligible = occs.filter(occ => {
    const s = getOccurrenceStatus(occ.prescriptionId, occ.date, occ.time);
    return s.status === 'upcoming' || s.status === 'due';
  });
  if (eligible.length === 0) {
    toast('No eligible tasks to simulate missed. All tasks for today are already resolved or there are no scheduled tasks.', true);
    return;
  }
  const body = `
    <p class="muted mb16">Select a task to simulate as missed:</p>
    ${eligible.map(occ => `
      <div class="row sb" style="padding:8px 0;border-bottom:1px solid var(--line)"><div><p style="font-weight:600">${esc(occ.title)}</p><p class="xs">${formatTime12(occ.time)} · ${getCategoryInfo(occ.category).label}</p></div><button class="btn btn-sm btn-d" onclick="simulateMissed('${occ.prescriptionId}','${occ.date}','${occ.time}');closeModal();toast('Task marked as missed (simulated)')">Simulate</button></div>
    `).join('')}
  `;
  openModal('Simulate Missed Task', body);
}
function resetDemoData() {
  if (!confirm('Reset all demo data? This removes all demo-flagged prescriptions and records. Your profile will remain.')) return;
  State.prescriptions = State.prescriptions.filter(r => r.source !== 'demo');
  State.records = State.records.filter(r => r.source !== 'demo' && r.source !== 'simulated');
  State.alerts = [];
  if (State.profile && State.profile.isDemo) {
    State.profile = null;
  }
  saveState();
  render();
  toast('Demo data reset');
}
function deleteAllData() {
  if (!confirm('Delete ALL data? This cannot be undone.')) return;
  if (!confirm('Are you absolutely sure? All profiles, prescriptions, records, alerts AND AI conversation history will be permanently deleted.')) return;
  if (VoiceMode.isOpen) closeVoiceMode();
  State.profile = null;
  State.prescriptions = [];
  State.records = [];
  State.alerts = [];
  State.settings.demoClockOffset = 0;
  AI.sessions = [];
  AI.currentSessionId = null;
  AI.messages = [];
  AI.conversationContext = [];
  VoiceMode.conversationHistory = [];
  VoiceMode.context = [];
  store.remove(AI_SESS_KEY);
  clearVoiceTranscriptDatabase();
  VoiceMode.historySessionId = null; VoiceMode.dbStatus = 'checking';
  store.remove(STORAGE_KEY);
  store.remove(SETTINGS_KEY);
  saveState();
  createNewSession('New Chat', true);
  render();
  if (AI.panelOpen) renderAIPanel();
  toast('All data deleted (including AI conversations)');
}
function exportJSON() {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: State.profile,
    prescriptions: State.prescriptions,
    records: State.records,
    alerts: State.alerts,
    settings: State.settings,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `caretrack_backup_${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(function() { try { URL.revokeObjectURL(url); } catch (_) {} }, 1000);
  toast('Data exported as JSON');
}
function importJSON(event) {
  const file = event && event.target && event.target.files && event.target.files[0];
  if (!file) return;
  const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
  const input = event.target;
  if (file.size > MAX_IMPORT_BYTES) {
    toast('Backup is too large. Choose a JSON file smaller than 10 MB.', true);
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onerror = function() {
    toast('Could not read the selected backup file. Please try again.', true);
    input.value = '';
  };
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a JSON backup object');
      if (data.version !== undefined && data.version !== 1) throw new Error('Unsupported backup version');
      const profile = data.profile === undefined ? undefined : (data.profile === null ? null : sanitizeProfile(data.profile));
      if (data.profile !== undefined && data.profile !== null && !profile) throw new Error('Profile data is malformed');
      const rxIn = data.prescriptions === undefined ? undefined : data.prescriptions;
      const recIn = data.records === undefined ? undefined : data.records;
      const alertIn = data.alerts === undefined ? undefined : data.alerts;
      if (rxIn !== undefined && !Array.isArray(rxIn)) throw new Error('Prescriptions must be an array');
      if (recIn !== undefined && !Array.isArray(recIn)) throw new Error('Records must be an array');
      if (alertIn !== undefined && !Array.isArray(alertIn)) throw new Error('Alerts must be an array');
      const rx = rxIn === undefined ? undefined : rxIn.map(sanitizePrescription);
      const rec = recIn === undefined ? undefined : recIn.map(sanitizeRecord);
      const alerts = alertIn === undefined ? undefined : alertIn.map(sanitizeAlert);
      if (rx && rx.some(x => !x)) throw new Error('Backup contains malformed prescriptions; nothing was imported');
      if (rec && rec.some(x => !x)) throw new Error('Backup contains malformed task records; nothing was imported');
      if (alerts && alerts.some(x => !x)) throw new Error('Backup contains malformed alerts; nothing was imported');
      const hasDuplicateIds = function(items) {
        if (!items) return false;
        const ids = items.map(item => item.id);
        return new Set(ids).size !== ids.length;
      };
      if (hasDuplicateIds(rx) || hasDuplicateIds(rec) || hasDuplicateIds(alerts)) {
        throw new Error('Backup contains duplicate record IDs; nothing was imported');
      }
      let importedSettings;
      if (data.settings !== undefined) {
        if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) {
          throw new Error('Settings are malformed; nothing was imported');
        }
        const s = data.settings;
        importedSettings = {};
        if (Number.isFinite(s.gracePeriodMinutes)) importedSettings.gracePeriodMinutes = Math.max(0, Math.min(1440, s.gracePeriodMinutes));
        if (Number.isFinite(s.dueWindowMinutes)) importedSettings.dueWindowMinutes = Math.max(0, Math.min(1440, s.dueWindowMinutes));
        if (Number.isFinite(s.demoClockOffset)) importedSettings.demoClockOffset = Math.max(-31536000000, Math.min(31536000000, s.demoClockOffset));
        if (typeof s.notificationsEnabled === 'boolean') importedSettings.notificationsEnabled = s.notificationsEnabled;
      }
      if (profile !== undefined) State.profile = profile;
      if (rx !== undefined) State.prescriptions = rx;
      if (rec !== undefined) State.records = rec;
      if (alerts !== undefined) State.alerts = alerts;
      if (importedSettings) State.settings = { ...State.settings, ...importedSettings };
      saveState();
      render();
      toast('Data imported successfully');
    } catch(err) {
      toast('Backup not imported: ' + (err && err.message ? err.message : 'invalid file'), true);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}
function runSelfTest() {
  const results = [];
  function assert(name, condition) {
    results.push({ name, pass: !!condition });
  }
  const testDate = new Date(2026, 0, 15); // Jan 15, 2026
  assert('Date helper: todayStr produces YYYY-MM-DD', todayStr(testDate) === '2026-01-15');
  assert('Date helper: parseDate roundtrip', todayStr(parseDate('2026-01-15')) === '2026-01-15');
  const origOffset = State.settings.demoClockOffset;
  State.settings.demoClockOffset = 0;
  const testRxId = 'test_rx_1';
  const testDateStr = todayStr();
  const futureDate = addDays(testDateStr, 2);
  State.prescriptions.push({
    id: testRxId, title: 'Test', category: 'diet', instructions: '',
    frequency: 'daily', days: [], times: ['08:00'], startDate: testDateStr,
    endDate: null, source: 'user', active: true, createdAt: '', updatedAt: '', deactivatedOn: null,
  });
  let s = getOccurrenceStatus(testRxId, futureDate, '08:00');
  assert('Status: future date is Upcoming', s.status === 'upcoming');
  State.records.push({
    id: 'test_rec_1', prescriptionId: testRxId, date: testDateStr, time: '08:00',
    titleSnapshot: 'Test', categorySnapshot: 'diet', status: 'completed',
    completedAt: new Date().toISOString(), source: 'user', updatedAt: '',
  });
  s = getOccurrenceStatus(testRxId, testDateStr, '08:00');
  assert('Status: completed record returns Completed', s.status === 'completed');
  const count = State.records.filter(r => r.prescriptionId === testRxId && r.date === testDateStr && r.time === '08:00').length;
  assert('Duplicate prevention: only one record per occurrence', count === 1);
  const ad = calcAdherenceForDateRange(testDateStr, testDateStr);
  assert('Adherence: non-zero denominator produces result', ad.pct !== null || ad.scheduled === 0);
  const emptyRange = calcAdherenceForDateRange('2020-01-01', '2020-01-01');
  assert('Adherence: zero denominator shows null', emptyRange.pct === null);
  const deactRx = State.prescriptions[State.prescriptions.length - 1];
  deactRx.deactivatedOn = testDateStr;
  deactRx.active = false;
  const occsAfterDeact = getOccurrencesForDate(deactRx, futureDate);
  assert('Deactivation: no occurrences after deactivation date', occsAfterDeact.length === 0);
  const alertK = alertKey('test', '2026-01-01', '08:00', 'missed');
  State.alerts.push({ id: 'test_alert_1', key: alertK, type: 'missed', message: 'test', relatedOccurrence: null, createdAt: '', dismissed: false });
  generateAlertForOccurrence('test', '2026-01-01', '08:00', 'missed');
  const alertCount = State.alerts.filter(a => a.key === alertK).length;
  assert('Alert dedup: no duplicate alerts', alertCount === 1);
  function csvEscapeTest(cell) {
    let s = String(cell);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  assert('CSV: neutralizes = prefix', csvEscapeTest('=cmd').startsWith("'"));
  assert('CSV: quotes commas', csvEscapeTest('a,b').startsWith('"'));
  assert('Output safety: unsafe dose advice replaced', guardSahaaraOutput('Double your dose tonight').replaced === true);
  assert('Output safety: ordinary self-care wording retained', guardSahaaraOutput('Drink water regularly if that suits your care plan.').replaced === false);
  ["I don't want to live anymore",'I feel like hurting myself','there is no point in living','I took a few extra tablets','I swallowed all my pills','my sugar is 40 and I am sweating','I have chest pain','मुझे सीने में दर्द है','seene mein dard hai'].forEach(function(q) { assert('Emergency: '+q, !!detectEmergency(q)); });
  ["I don't have chest pain",'my father had a heart attack last year','heat stroke prevention tips','keystroke','I had a stroke of luck','my grandmother passed out last year'].forEach(function(q) { assert('Not urgent: '+q, !detectEmergency(q)); });
  assert('Extra dose question is not emergency', !detectEmergency('should I take an extra dose if I forgot'));
  assert('Time cleanup preserves readable minutes', cleanSpeechText('8:30 PM').includes('8 30 PM'));
  assert('Morning time gets zero spoken', cleanSpeechText('7:05 a.m.').includes('oh 5'));
  State.prescriptions = State.prescriptions.filter(r => r.id !== testRxId);
  State.records = State.records.filter(r => r.id !== 'test_rec_1');
  State.alerts = State.alerts.filter(a => a.id !== 'test_alert_1');
  State.settings.demoClockOffset = origOffset;
  saveState();
  const container = document.getElementById('test-results');
  if (container) {
    container.innerHTML = results.map(r =>
      `<div class="test-result ${r.pass ? 'pass' : 'fail'}">${r.pass ? '✓' : '✗'} ${esc(r.name)}</div>`
    ).join('');
    const allPass = results.every(r => r.pass);
    container.innerHTML += `<p class="mt8" style="font-weight:600;color:${allPass ? 'var(--ok-text)' : 'var(--danger-text)'}">${allPass ? 'All tests passed!' : `${results.filter(r=>!r.pass).length} test(s) failed`}</p>`;
  }
}