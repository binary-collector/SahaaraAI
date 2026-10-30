/**
 * Sahaara AI / CareTrack — Offline Sync & Event Batching Layer
 */


(function () {
  'use strict';
  var USER_KEY = 'caretrack.user_id.v1';
  var META_KEY = 'caretrack.sync_meta.v1';
  var QUEUE_KEY = 'caretrack.sync_queue.v1';
  var STATE_KEY = 'caretrack.v1';
  var SETTINGS_KEY = 'caretrack.settings.v1';
  var SESSIONS_KEY = 'caretrack.ai_sessions.v1';
  var UNMATCHED_KEY = 'sahaara_unmatched_v1';
  var PUSH_DEBOUNCE_MS = 700;
  var EVENT_BATCH_MS = 4000;
  var API_BASE_KEY = 'caretrack.api_base.v1';
  function trimSlash(s) { return String(s || '').replace(/\/+$/, ''); }
  function apiBase() {
    try {
      if (typeof window.CARETRACK_API_BASE === 'string' && window.CARETRACK_API_BASE.trim()) {
        return trimSlash(window.CARETRACK_API_BASE.trim());
      }
      var meta = document.querySelector('meta[name="caretrack-api"]');
      if (meta && meta.getAttribute('content') && meta.getAttribute('content').trim()) {
        return trimSlash(meta.getAttribute('content').trim());
      }
      var q = new URLSearchParams(window.location.search).get('api');
      if (q && /^https?:\/\//i.test(q)) { ls.set(API_BASE_KEY, trimSlash(q)); return trimSlash(q); }
      var stored = ls.get(API_BASE_KEY);
      if (stored && /^https?:\/\//i.test(stored)) return trimSlash(stored);
    } catch (_) {}
    return '';
  }
  function url(path) { return apiBase() + path; }
  function isCrossOrigin() {
    var base = apiBase();
    if (!base) return false;
    try { return new URL(base, window.location.href).origin !== window.location.origin; }
    catch (_) { return true; }
  }
  var ls = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (_) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, String(v)); return true; } catch (_) { return false; } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (_) {} },
  };
  function readJson(key, dflt) {
    try { var v = ls.get(key); return v ? JSON.parse(v) : dflt; } catch (_) { return dflt; }
  }
  function writeJson(key, value) { return ls.set(key, JSON.stringify(value)); }
  var ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
  function userId() {
    try {
      var pinned = new URLSearchParams(window.location.search).get('u');
      if (pinned && ID_RE.test(pinned) && pinned !== ls.get(USER_KEY)) ls.set(USER_KEY, pinned);
    } catch (_) {}
    var id = ls.get(USER_KEY);
    if (id && ID_RE.test(id)) return id;
    var fresh = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    ls.set(USER_KEY, fresh);
    return fresh;
  }
  var meta = readJson(META_KEY, { lastSyncAt: null, lastPushAt: null, dirty: false, bootstrapped: false });
  function saveMeta() { writeJson(META_KEY, meta); }
  var state = {
    connected: false,
    engine: null,
    model: null,
    llmConfigured: false,
    serverUserId: null,
    lastError: null,
    queued: 0,
    bootstrapped: false,
  };
  function headers(extra) {
    var h = { 'content-type': 'application/json', 'x-caretrack-user': userId(), 'x-caretrack-device': deviceLabel() };
    try {
      var lang = (typeof AI !== 'undefined' && AI && AI.language) ? AI.language : null;
      if (lang) h['x-caretrack-lang'] = String(lang);
    } catch (_) {}
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  function deviceLabel() {
    var ua = navigator.userAgent || '';
    var kind = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : /Mac OS X/i.test(ua) ? 'mac' : /Windows/i.test(ua) ? 'windows' : /Linux/i.test(ua) ? 'linux' : 'other';
    return kind + (window.matchMedia && window.matchMedia('(pointer:coarse)').matches ? '-touch' : '');
  }
  function api(path, options) {
    var opts = options || {};
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { try { controller.abort(); } catch (_) {} }, opts.timeoutMs || 15000) : null;
    return fetch(url(path), {
      method: opts.method || 'GET',
      headers: headers(opts.headers),
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller ? controller.signal : undefined,
      credentials: isCrossOrigin() ? 'omit' : 'same-origin',
      mode: 'cors',
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      var id = res.headers.get('x-caretrack-user');
      if (id && id !== ls.get(USER_KEY)) ls.set(USER_KEY, id);   // adopt a server-assigned id
      if (!res.ok) return res.text().then(function (t) { throw new Error('HTTP ' + res.status + ' ' + t.slice(0, 160)); });
      var ct = String(res.headers.get('content-type') || '');
      return ct.indexOf('json') >= 0 ? res.json() : res.text();
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      state.connected = false;
      state.lastError = String(err && err.message || err);
      throw err;
    });
  }
  function readQueue() { var q = readJson(QUEUE_KEY, []); return Array.isArray(q) ? q : []; }
  function enqueue(item) {
    var q = readQueue();
    q.push(item);
    if (q.length > 40) q = q.slice(-40);          // bounded: drop the oldest
    writeJson(QUEUE_KEY, q);
    state.queued = q.length;
  }
  function clearQueue() { ls.del(QUEUE_KEY); state.queued = 0; }
  function flushQueue() {
    var q = readQueue();
    if (!q.length) return Promise.resolve();
    clearQueue();
    var merged = { prescriptions: [], records: [], alerts: [], sessions: [], voiceTurns: [] };
    var byId = { prescriptions: {}, records: {}, alerts: {}, sessions: {}, voiceTurns: {} };
    q.forEach(function (item) {
      var payload = item && item.body ? item.body : {};
      ['prescriptions', 'records', 'alerts', 'sessions', 'voiceTurns'].forEach(function (key) {
        (payload[key] || []).forEach(function (row) {
          var id = row && (row.id || row.sessionId || row.messageId);
          if (!id) return;
          if (!byId[key][id]) { byId[key][id] = row; merged[key].push(row); }
        });
      });
      if (payload.profile) merged.profile = payload.profile;
      if (payload.settings) merged.settings = Object.assign({}, merged.settings || {}, payload.settings);
      if (payload.currentSessionId) merged.currentSessionId = payload.currentSessionId;
    });
    return api('/api/sync/push', { method: 'POST', body: merged }).then(function () {
      meta.lastPushAt = new Date().toISOString(); meta.dirty = false; saveMeta();
    }).catch(function () { enqueue({ at: Date.now(), body: merged }); });
  }
  function debounced(key, ms, sender) {
    var timer = null;
    return function () {
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        meta.dirty = true; saveMeta();
        sender.apply(null, args).then(function () {
          state.connected = true;
          meta.lastPushAt = new Date().toISOString(); meta.dirty = false; saveMeta();
        }).catch(function () { /* queued by sender */ });
      }, ms);
    };
  }
  function localStateIsEmpty() {
    var local = readJson(STATE_KEY, null);
    if (!local) return true;
    return !local.profile && !(local.prescriptions || []).length && !(local.records || []).length;
  }
  function unionById(preferred, other) {
    var seen = {};
    var out = [];
    (preferred || []).forEach(function (row) { if (row && row.id && !seen[row.id]) { seen[row.id] = 1; out.push(row); } });
    (other || []).forEach(function (row) { if (row && row.id && !seen[row.id]) { seen[row.id] = 1; out.push(row); } });
    return out;
  }
  function mergeSessions(serverPayload, localPayload) {
    var server = (serverPayload && serverPayload.sessions) || [];
    var local = (localPayload && localPayload.sessions) || [];
    if (!local.length) return serverPayload;
    if (!server.length) return localPayload;
    var byId = {};
    server.forEach(function (s) { if (s && s.id) byId[s.id] = s; });
    local.forEach(function (s) {
      if (!s || !s.id) return;
      var remote = byId[s.id];
      if (!remote) { byId[s.id] = s; return; }
      var lm = (s.messages || []).length, rm = (remote.messages || []).length;
      if (lm > rm) byId[s.id] = s;
      else if (lm === rm && String(s.updatedAt || '') > String(remote.updatedAt || '')) byId[s.id] = s;
    });
    var sessions = Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
    var currentSessionId = (serverPayload && serverPayload.currentSessionId) || (localPayload && localPayload.currentSessionId) || (sessions[0] && sessions[0].id) || null;
    return { sessions: sessions, currentSessionId: currentSessionId };
  }
  function applyEndpointOverride() {
    try {
      var base = apiBase();
      if (!base) return;
      if (typeof AI_CONFIG !== 'undefined' && AI_CONFIG) {
        var current = String(AI_CONFIG.LLM_ENDPOINT || '');
        if (!current || current === '/api/chat' || current === base + '/api/chat') {
          AI_CONFIG.LLM_ENDPOINT = base + '/api/chat';
        }
      }
    } catch (_) {}
  }
  applyEndpointOverride();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyEndpointOverride);
  }
  window.addEventListener('load', applyEndpointOverride);
  var bootstrapPromise = null;
  function bootstrap() {
    if (bootstrapPromise) return bootstrapPromise;
    applyEndpointOverride();
    bootstrapPromise = api('/api/sync/bootstrap', { timeoutMs: 20000 }).then(function (data) {
      state.connected = true;
      state.engine = data.ai && data.ai.engine;
      state.model = data.ai && data.ai.model;
      state.llmConfigured = !!(data.ai && data.ai.llmConfigured);
      state.serverUserId = data.userId;
      state.bootstrapped = true;
      meta.bootstrapped = true; meta.lastSyncAt = new Date().toISOString();
      var localState = readJson(STATE_KEY, null);
      var localSettings = readJson(SETTINGS_KEY, null);
      var localSessions = readJson(SESSIONS_KEY, null);
      var server = (data && data.state) || {};
      var serverHasData = !!(server.profile || (server.prescriptions || []).length || (server.records || []).length);
      var serverWins = serverHasData && (localStateIsEmpty() || !meta.dirty);
      if (serverWins) {
        var nextState = {
          profile: server.profile || null,
          prescriptions: server.prescriptions || [],
          records: unionById(server.records || [], (localState && localState.records) || []),
          alerts: unionById(server.alerts || [], (localState && localState.alerts) || []),
        };
        if (localState && !localStateIsEmpty()) {
          nextState.prescriptions = unionById(server.prescriptions || [], localState.prescriptions || []);
        }
        writeJson(STATE_KEY, nextState);
        var mergedSettings = Object.assign({}, server.settings || {}, localSettings || {});
        delete mergedSettings.llmApiKey;
        if (server.settings && Object.keys(server.settings).length) mergedSettings = Object.assign({}, localSettings || {}, server.settings);
        delete mergedSettings.llmApiKey;
        writeJson(SETTINGS_KEY, mergedSettings);
      } else if (serverHasData && meta.dirty) {
        writeJson(STATE_KEY, {
          profile: (localState && localState.profile) || server.profile || null,
          prescriptions: unionById((localState && localState.prescriptions) || [], server.prescriptions || []),
          records: unionById((localState && localState.records) || [], server.records || []),
          alerts: unionById((localState && localState.alerts) || [], server.alerts || []),
        });
      }
      var mergedSessions = mergeSessions(data.sessions, localSessions);
      if (mergedSessions && (mergedSessions.sessions || []).length) writeJson(SESSIONS_KEY, mergedSessions);
      return flushQueue().then(function () {
        if (!serverWins && (localState || localSessions)) {
          return pushNow({
            profile: localState ? localState.profile : undefined,
            prescriptions: localState ? localState.prescriptions : undefined,
            records: localState ? localState.records : undefined,
            alerts: localState ? localState.alerts : undefined,
            settings: localSettings || undefined,
            sessions: mergedSessions ? mergedSessions.sessions : undefined,
            currentSessionId: mergedSessions ? mergedSessions.currentSessionId : undefined,
          }).catch(function () {});
        }
      });
    }).then(function () {
      reloadApp();
      return status();
    }).catch(function (err) {
      state.connected = false;
      state.lastError = String(err && err.message || err);
      state.bootstrapped = true;
      try { console.info('CareTrack: backend unreachable, continuing in offline mode.', state.lastError); } catch (_) {}
      return status();
    });
    return bootstrapPromise;
  }
  function reloadApp() {
    try {
      if (typeof loadState === 'function') loadState();
      if (typeof loadSessions === 'function') loadSessions();
      if (typeof generateAutoAlerts === 'function') generateAutoAlerts();
      if (typeof saveState === 'function') saveState();
      if (typeof render === 'function') render();
      if (typeof refreshAIDisplay === 'function') refreshAIDisplay();
      if (typeof VoiceMode !== 'undefined' && VoiceMode && VoiceMode.isOpen && typeof initializeVoiceTranscriptHistory === 'function') {
        VoiceMode.context = (typeof AI !== 'undefined' && AI.conversationContext) ? AI.conversationContext.slice() : [];
        initializeVoiceTranscriptHistory();
        if (typeof renderVoiceMode === 'function') renderVoiceMode();
      }
      autoVerifyOnce();
    } catch (err) {
      try { console.warn('CareTrack: post-sync re-render failed', err); } catch (_) {}
    }
  }
  var autoVerified = false;
  function autoVerifyOnce() {
    if (autoVerified) return;
    try {
      if (typeof AI_CONFIG === 'undefined' || !AI_CONFIG || !AI_CONFIG.LLM_ENDPOINT) return;
      if (typeof AI !== 'undefined' && AI && AI.llmVerified) return;
      if (typeof testAIConnection !== 'function') return;
      autoVerified = true;
      testAIConnection();
    } catch (_) {}
  }
  function pushNow(payload) {
    var body = {};
    for (var k in payload) if (payload[k] !== undefined) body[k] = payload[k];
    if (!Object.keys(body).length) return Promise.resolve();
    return api('/api/sync/push', { method: 'POST', body: body, timeoutMs: 20000 }).catch(function (err) {
      enqueue({ at: Date.now(), body: body });
      throw err;
    });
  }
  function isEffectivelyEmpty(data) {
    var d = data || {};
    return !d.profile
      && !(d.prescriptions || []).length
      && !(d.records || []).length
      && !(d.alerts || []).length;
  }
  var pushStateDebounced = debounced('state', PUSH_DEBOUNCE_MS, function (data, settings) {
    if (!state.bootstrapped) return Promise.resolve();
    if (isEffectivelyEmpty(data) && !settings) return Promise.resolve();
    return pushNow({
      profile: data && data.profile !== undefined ? data.profile : null,
      prescriptions: data ? data.prescriptions : undefined,
      records: data ? data.records : undefined,
      alerts: data ? data.alerts : undefined,
      settings: settings || undefined,
    });
  });
  var pushSessionsDebounced = debounced('sessions', PUSH_DEBOUNCE_MS, function (sessions, currentSessionId) {
    if (!state.bootstrapped) return Promise.resolve();
    return pushNow({ sessions: sessions || [], currentSessionId: currentSessionId || undefined });
  });
  function pushVoiceTurn(record) {
    if (!record || !record.text) return Promise.resolve(false);
    return api('/api/voice/turns', { method: 'POST', body: record, timeoutMs: 12000 })
      .then(function () { state.connected = true; return true; })
      .catch(function () { enqueue({ at: Date.now(), body: { voiceTurns: [record] } }); return false; });
  }
  var eventBuffer = [];
  var eventTimer = null;
  function logEvent(type, detail, latencyMs) {
    try {
      eventBuffer.push({
        type: String(type), detail: detail || null,
        latencyMs: Number.isFinite(latencyMs) ? Math.round(latencyMs) : null,
        sessionId: (typeof AI !== 'undefined' && AI && AI.currentSessionId) || null,
        createdAt: new Date().toISOString(),
      });
      if (eventBuffer.length > 50) flushEvents();
      else if (!eventTimer) eventTimer = setTimeout(flushEvents, EVENT_BATCH_MS);
    } catch (_) {}
  }
  function flushEvents() {
    if (eventTimer) { clearTimeout(eventTimer); eventTimer = null; }
    if (!eventBuffer.length) return Promise.resolve();
    var batch = eventBuffer.splice(0, eventBuffer.length);
    return api('/api/voice/events', { method: 'POST', body: { events: batch }, timeoutMs: 10000 }).catch(function () {});
  }
  function logUnmatched(text) {
    if (!text) return Promise.resolve();
    var q = String(text).slice(0, 240);
    return api('/api/voice/unmatched', { method: 'POST', body: { items: [{ q: q, language: langOf() }] }, timeoutMs: 10000 }).catch(function () {});
  }
  function logEmergency(utterance, kind, selfHarm, source) {
    return api('/api/voice/emergency', {
      method: 'POST',
      body: { utterance: String(utterance || '').slice(0, 500), kind: kind || null, selfHarm: !!selfHarm, language: langOf(), source: source || 'voice', sessionId: (typeof AI !== 'undefined' && AI && AI.currentSessionId) || null },
      timeoutMs: 10000,
    }).catch(function () {});
  }
  function langOf() {
    try { return (typeof AI !== 'undefined' && AI && AI.language) ? String(AI.language) : 'en'; } catch (_) { return 'en'; }
  }
  function status() {
    return {
      connected: !!state.connected,
      engine: state.engine || null,
      model: state.model || null,
      llmConfigured: !!state.llmConfigured,
      userId: userId(),
      queued: readQueue().length,
      lastSyncAt: meta.lastSyncAt,
      lastPushAt: meta.lastPushAt,
      dirty: !!meta.dirty,
      bootstrapped: !!state.bootstrapped,
      lastError: state.lastError,
    };
  }
  function deleteSession(sessionId) {
    if (!sessionId) return Promise.resolve();
    return api('/api/sessions/' + encodeURIComponent(sessionId), { method: 'DELETE', timeoutMs: 10000 }).catch(function () {});
  }
  window.addEventListener('online', function () { flushQueue(); flushEvents(); });
  window.addEventListener('beforeunload', function () { try { flushEvents(); } catch (_) {} });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushEvents(); });
  window.CTBackend = {
    userId: userId,
    bootstrap: bootstrap,
    pushState: pushStateDebounced,
    pushStateNow: function (data, settings) {
      return pushNow({ profile: data ? data.profile : null, prescriptions: data && data.prescriptions, records: data && data.records, alerts: data && data.alerts, settings: settings })
        .then(function () { return status(); }, function () { return status(); });
    },
    pushSessions: pushSessionsDebounced,
    pushSessionsNow: function (sessions, currentSessionId) {
      return pushNow({ sessions: sessions || [], currentSessionId: currentSessionId })
        .then(function () { return status(); }, function () { return status(); });
    },
    pushVoiceTurn: pushVoiceTurn,
    deleteSession: deleteSession,
    logEvent: logEvent,
    logUnmatched: logUnmatched,
    logEmergency: logEmergency,
    flush: function () { return Promise.all([flushQueue(), flushEvents()]); },
    status: status,
    api: api,
    apiBase: apiBase,
    setApiBase: function (value) {
      var v = trimSlash(String(value === undefined || value === null ? '' : value).trim());
      if (v && !/^https?:\/\//i.test(v)) throw new Error('API base must be an absolute http(s) URL, or empty for same-origin.');
      if (v) ls.set(API_BASE_KEY, v); else ls.del(API_BASE_KEY);
      applyEndpointOverride();
      return v;
    },
    version: '1.1.0',
  };
})();
