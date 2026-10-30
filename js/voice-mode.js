/**
 * Sahaara AI — Conversational Voice Mode & 3D WebGL Orb
 */

const VoiceMode = {
  isOpen: false,
  isListening: false,
  isSpeaking: false,
  isThinking: false,
  pending: false,
  userStopped: false,
  micDenied: false,
  srSupported: null,
  lastProcessedText: '',
  lastFinalIndex: 0,
  recognition: null,
  synthesis: window.speechSynthesis || null,
  conversationHistory: [],
  context: [],
  currentTranscript: '',
  recognitionFinalBuffer: '',
  autoListen: true,
  muted: false,
  ttsProvider: null,
  activeAudio: null,
  audioObjectUrl: null,
  speechRate: 0.94,
  waveInterval: null,
  ttsPulseTimers: [],
  silenceTimer: null,
  restartTimer: null,
  fillerTimer: null,
  processingTranscript: false,
  voiceFirstToken: false,
  speechQueue: [],
  speechBuffer: '',
  speechStreamDone: false,
  speechPlaying: false,
  fillerActive: false,
  replyMessage: null,
  pendingAction: null,
  emergencyCard: null,
  emergencyActive: false,
  noticeText: '',
  turnId: 0,
  voice3dOrb: null,
  dbStatus: 'checking',
  historySessionId: null,
  animeRingTweens: [],
  animeBarTweens: [],
};
const VOICE_DB_NAME = 'caretrack_voice_ai_v1';
const VOICE_DB_VERSION = 1;
const VOICE_DB_STORE = 'turns';
var voiceTranscriptDbPromise = null;
function openVoiceTranscriptDatabase() {
  if (!window.indexedDB) return Promise.resolve(null);
  if (voiceTranscriptDbPromise) return voiceTranscriptDbPromise;
  voiceTranscriptDbPromise = new Promise(function(resolve) {
    let request;
    try { request = window.indexedDB.open(VOICE_DB_NAME, VOICE_DB_VERSION); }
    catch (_) { voiceTranscriptDbPromise = null; resolve(null); return; }
    request.onupgradeneeded = function() {
      const db = request.result;
      let turns;
      if (!db.objectStoreNames.contains(VOICE_DB_STORE)) turns = db.createObjectStore(VOICE_DB_STORE, { keyPath: 'id' });
      else turns = request.transaction.objectStore(VOICE_DB_STORE);
      if (!turns.indexNames.contains('sessionId')) turns.createIndex('sessionId', 'sessionId', { unique: false });
      if (!turns.indexNames.contains('createdAt')) turns.createIndex('createdAt', 'createdAt', { unique: false });
    };
    request.onsuccess = function() {
      const db = request.result;
      db.onversionchange = function() { try { db.close(); } catch (_) {} voiceTranscriptDbPromise = null; };
      resolve(db);
    };
    request.onerror = function() { voiceTranscriptDbPromise = null; resolve(null); };
    request.onblocked = function() { voiceTranscriptDbPromise = null; resolve(null); };
  });
  return voiceTranscriptDbPromise;
}
function mergeVoiceTranscriptRecords(first, second) {
  const records = new Map();
  (first || []).concat(second || []).forEach(function(item) {
    if (!item || !item.text) return;
    const time = item.time || item.createdAt || new Date().toISOString();
    const id = String(item.id || [item.role || 'bot', time, item.text].join('|'));
    records.set(id, Object.assign({}, item, { id: id, time: time }));
  });
  return Array.from(records.values()).sort(function(a, b) { return new Date(a.time).getTime() - new Date(b.time).getTime(); }).slice(-100);
}
function voiceTranscriptFallback(sessionId) {
  if (String(AI.currentSessionId || 'default') !== String(sessionId || 'default')) return [];
  return (AI.messages || []).filter(function(message) { return message && (message.source === 'voice' || message.voiceMode); })
    .map(function(message) {
      return { id: message.id, role: message.role, text: message.text, time: message.time, source: message.source, voiceMode: !!message.voiceMode, emergency: !!message.emergency, emergencyData: message.emergencyData || null, interrupted: !!message.interrupted, error: message.error || null, selfHarm: !!message.selfHarm };
    }).slice(-100);
}
function loadVoiceTranscriptHistory(sessionId) {
  const sid = String(sessionId || 'default');
  const fallback = voiceTranscriptFallback(sid);
  return openVoiceTranscriptDatabase().then(function(db) {
    if (!db) return { available: false, records: fallback, databaseIds: [] };
    return new Promise(function(resolve) {
      let request;
      try { request = db.transaction(VOICE_DB_STORE, 'readonly').objectStore(VOICE_DB_STORE).index('sessionId').getAll(sid); }
      catch (_) { resolve({ available: false, records: fallback }); return; }
      request.onsuccess = function() {
        const databaseRecords = (request.result || []).map(function(record) {
          return { id: record.messageId || record.id, role: record.role, text: record.text, time: record.createdAt, source: record.source, voiceMode: !!record.voiceMode, emergency: !!record.emergency, emergencyData: record.emergencyData || null, interrupted: !!record.interrupted, error: record.error || null, selfHarm: !!record.selfHarm };
        });
        resolve({ available: true, records: mergeVoiceTranscriptRecords(databaseRecords, fallback), databaseIds: databaseRecords.map(function(record) { return String(record.id); }) });
      };
      request.onerror = function() { resolve({ available: false, records: fallback, databaseIds: [] }); };
    });
  }).catch(function() { return { available: false, records: fallback }; });
}
function writeVoiceTranscriptRecord(message, sessionId) {
  if (!message || !String(message.text || '').trim()) return Promise.resolve(false);
  const sid = String(sessionId || AI.currentSessionId || 'default');
  const messageId = String(message.id || uid());
  const createdAt = message.time || new Date().toISOString();
  const record = {
    id: 'voice::' + sid + '::' + messageId, messageId: messageId, sessionId: sid,
    role: message.role === 'bot' ? 'bot' : 'user', text: String(message.text), source: message.source || 'voice',
    voiceMode: !!message.voiceMode, emergency: !!message.emergency, emergencyData: message.emergencyData || null,
    interrupted: !!message.interrupted, error: message.error || null, selfHarm: !!message.selfHarm,
    language: AI.language, createdAt: createdAt
  };
  if (window.CTBackend) { try { window.CTBackend.pushVoiceTurn(record); } catch (e) {} }
  return openVoiceTranscriptDatabase().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve) {
      let transaction;
      try {
        transaction = db.transaction(VOICE_DB_STORE, 'readwrite');
        const store = transaction.objectStore(VOICE_DB_STORE);
        store.put(record);
        const existing = store.index('sessionId').getAll(sid);
        existing.onsuccess = function() {
          const rows = (existing.result || []).sort(function(a, b) { return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); });
          rows.slice(0, Math.max(0, rows.length - 500)).forEach(function(old) { store.delete(old.id); });
        };
        transaction.oncomplete = function() { resolve(true); };
        transaction.onerror = transaction.onabort = function() { resolve(false); };
      } catch (_) { resolve(false); }
    });
  }).catch(function() { return false; });
}
function deleteVoiceTranscriptSession(sessionId) {
  const sid = String(sessionId || 'default');
  return openVoiceTranscriptDatabase().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve) {
      let transaction;
      try {
        transaction = db.transaction(VOICE_DB_STORE, 'readwrite');
        const store = transaction.objectStore(VOICE_DB_STORE);
        const request = store.index('sessionId').getAll(sid);
        request.onsuccess = function() { (request.result || []).forEach(function(record) { store.delete(record.id); }); };
        transaction.oncomplete = function() { resolve(true); };
        transaction.onerror = transaction.onabort = function() { resolve(false); };
      } catch (_) { resolve(false); }
    });
  }).catch(function() { return false; });
}
function clearVoiceTranscriptDatabase() {
  return openVoiceTranscriptDatabase().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve) {
      try {
        const transaction = db.transaction(VOICE_DB_STORE, 'readwrite');
        transaction.objectStore(VOICE_DB_STORE).clear();
        transaction.oncomplete = function() { resolve(true); };
        transaction.onerror = transaction.onabort = function() { resolve(false); };
      } catch (_) { resolve(false); }
    });
  }).catch(function() { return false; });
}
function voiceDatabaseStatusLabel() {
  try {
    if (window.CTBackend) {
      const backend = window.CTBackend.status();
      if (backend.connected) {
        return backend.queued > 0
          ? 'Synced to server · ' + backend.queued + ' queued'
          : 'Synced to server database';
      }
      if (backend.queued > 0) return 'Offline · ' + backend.queued + ' queued';
    }
  } catch (e) {}
  return VoiceMode.dbStatus === 'ready' ? 'Saved on this device' : VoiceMode.dbStatus === 'checking' ? 'Opening local database…' : 'Chat backup active';
}
function migrateVoiceTranscriptRecords(records, sessionId) {
  const sid = String(sessionId || 'default');
  const candidates = (records || []).filter(function(record) { return record && record.id && record.text && (record.role === 'user' || record.role === 'bot'); });
  if (!candidates.length) return Promise.resolve(true);
  return openVoiceTranscriptDatabase().then(function(db) {
    if (!db) return false;
    return new Promise(function(resolve) {
      try {
        const transaction = db.transaction(VOICE_DB_STORE, 'readwrite');
        const store = transaction.objectStore(VOICE_DB_STORE);
        candidates.forEach(function(record) {
          const messageId = String(record.id);
          store.put({
            id: 'voice::' + sid + '::' + messageId, messageId: messageId, sessionId: sid,
            role: record.role, text: String(record.text), source: record.source || 'voice',
            voiceMode: !!record.voiceMode, emergency: !!record.emergency, emergencyData: record.emergencyData || null,
            interrupted: !!record.interrupted, error: record.error || null, selfHarm: !!record.selfHarm,
            language: AI.language, createdAt: record.time || new Date().toISOString()
          });
        });
        const request = store.index('sessionId').getAll(sid);
        request.onsuccess = function() {
          const rows = (request.result || []).sort(function(a, b) { return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); });
          rows.slice(0, Math.max(0, rows.length - 500)).forEach(function(record) { store.delete(record.id); });
        };
        transaction.oncomplete = function() { resolve(true); };
        transaction.onerror = transaction.onabort = function() { resolve(false); };
      } catch (_) { resolve(false); }
    });
  }).catch(function() { return false; });
}
function restoreVoiceTranscriptChatSession(records, sessionId) {
  const sid = String(sessionId || 'default');
  if (String(AI.currentSessionId || 'default') !== sid) return;
  const messages = Array.isArray(AI.messages) ? AI.messages : (AI.messages = []);
  const knownIds = new Set(messages.map(function(message) { return message && message.id ? String(message.id) : ''; }).filter(Boolean));
  let added = false;
  (records || []).forEach(function(record) {
    if (!record || !record.text || !record.id || knownIds.has(String(record.id))) return;
    const message = {
      id: String(record.id), role: record.role === 'bot' ? 'bot' : 'user', text: String(record.text),
      time: record.time || new Date().toISOString(), source: record.source || 'voice', voiceMode: !!record.voiceMode,
      emergency: !!record.emergency, emergencyData: record.emergencyData || null, interrupted: !!record.interrupted,
      error: record.error || null, selfHarm: !!record.selfHarm
    };
    messages.push(message); knownIds.add(message.id); added = true;
  });
  if (added) messages.sort(function(a, b) { return new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime(); });
  if ((!AI.conversationContext || !AI.conversationContext.length) && records && records.length) {
    let pendingUser = null;
    const recoveredContext = [];
    records.forEach(function(record) {
      if (record.role === 'user') { pendingUser = detectEmergency(String(record.text || '')) ? null : String(record.text || ''); return; }
      if (record.role !== 'bot') return;
      if (record.emergency || record.interrupted || record.source === 'local') { pendingUser = null; return; }
      if (pendingUser) { recoveredContext.push({ role: 'user', text: pendingUser }, { role: 'bot', text: String(record.text || '') }); pendingUser = null; }
    });
    if (recoveredContext.length) { AI.conversationContext = trimContext(recoveredContext); added = true; }
  }
  if (VoiceMode.isOpen) VoiceMode.context = (AI.conversationContext || []).slice();
  if (added) {
    saveSessions();
    if (AI.panelOpen || State.route === 'ai') refreshAIDisplay();
  }
}
function initializeVoiceTranscriptHistory() {
  const sessionId = String(AI.currentSessionId || 'default');
  VoiceMode.historySessionId = sessionId;
  VoiceMode.dbStatus = 'checking';
  VoiceMode.conversationHistory = voiceTranscriptFallback(sessionId).map(function(record) {
    return { id: record.id, role: record.role, text: record.text, time: record.time, source: record.source, emergency: record.emergency, emergencyData: record.emergencyData };
  });
  loadVoiceTranscriptHistory(sessionId).then(function(result) {
    if (!VoiceMode.isOpen || VoiceMode.historySessionId !== sessionId || String(AI.currentSessionId || 'default') !== sessionId) return;
    restoreVoiceTranscriptChatSession(result.records, sessionId);
    VoiceMode.dbStatus = result.available ? 'ready' : 'fallback';
    VoiceMode.conversationHistory = result.records.map(function(record) {
      return { id: record.id, role: record.role, text: record.text, time: record.time, source: record.source, emergency: record.emergency, emergencyData: record.emergencyData };
    });
    if (result.available) {
      const knownIds = new Set(result.databaseIds || []);
      const missingRecords = result.records.filter(function(record) { return !knownIds.has(String(record.id)); });
      if (missingRecords.length) migrateVoiceTranscriptRecords(missingRecords, sessionId).then(function(saved) {
        if (!saved && VoiceMode.isOpen && VoiceMode.historySessionId === sessionId) { VoiceMode.dbStatus = 'fallback'; updateVoiceDatabaseBadge(); }
      });
    }
    updateVoiceDatabaseBadge();
    renderVoiceMode();
  });
}
function updateVoiceDatabaseBadge() {
  const badge = document.querySelector('#voice-fullscreen .voice-db-badge');
  if (!badge) return;
  badge.className = 'voice-db-badge ' + (VoiceMode.dbStatus || 'fallback');
  badge.innerHTML = '<span class="voice-db-dot" aria-hidden="true"></span>' + esc(voiceDatabaseStatusLabel());
}
function _initVoice3DOrb(state) {
  const container = document.getElementById('voice-orb-3d');
  if (!container) return;
  if (!VoiceMode.voice3dOrb) {
    VoiceMode.voice3dOrb = new Voice3DOrb(container);
  } else if (!VoiceMode.voice3dOrb.failed && VoiceMode.voice3dOrb.renderer) {
    const canvas = VoiceMode.voice3dOrb.renderer.domElement;
    if (canvas && canvas.parentNode !== container) {
      container.appendChild(canvas);
      if (VoiceMode.voice3dOrb._onResize) VoiceMode.voice3dOrb._onResize();
    }
  } else if (VoiceMode.voice3dOrb.failed) {
    if (!container.querySelector('.voice-orb-fallback')) {
      container.innerHTML = '<div class="voice-orb-fallback ' + (state || 'idle') + '" aria-hidden="true"><span>✨</span></div>';
    }
  }
  VoiceMode.voice3dOrb.setState(state || 'idle');
  if (state === 'listening') {
    VoiceMode.voice3dOrb.enableAudioReactivity();
  } else {
    VoiceMode.voice3dOrb.disableAudioReactivity();
  }
  _animateAudioRings(state);
}
function _animateAudioRings(state) {
  VoiceMode.animeRingTweens.forEach(t => { try { t.pause(); } catch(e) {} });
  VoiceMode.animeRingTweens = [];
  const rings = document.querySelectorAll('.voice-audio-ring');
  if (!rings.length) return;
  const intensity = state === 'listening' ? 1.0 : state === 'speaking' ? 0.8 : state === 'thinking' ? 0.5 : 0.2;
  const duration = state === 'thinking' ? 1500 : 2500;
  rings.forEach((ring, i) => {
    if (ctPrefersReducedMotion()) {
      ring.style.opacity = String(0.25 * intensity);
      ring.style.transform = 'scale(' + (1 + i * 0.06) + ')';
      return;
    }
    const tween = anime.animate(ring, {
      scale: [0.85 + i * 0.05, 1.25 + i * 0.08],
      opacity: [0.6 * intensity, 0],
      duration: duration + i * 400,
      ease: anime.eases.out(2),
      loop: true,
      delay: i * 600,
    });
    VoiceMode.animeRingTweens.push(tween);
  });
}
function _animateVoiceWaveBars() {
  const bars = document.querySelectorAll('.voice-wave-bar');
  if (!bars.length) return;
  VoiceMode.animeBarTweens.forEach(t => { try { t.pause(); } catch(e) {} });
  VoiceMode.animeBarTweens = [];
  const isActive = VoiceMode.isListening || VoiceMode.isSpeaking;
  const isSpeaking = VoiceMode.isSpeaking;
  const baseHeight = 8;
  bars.forEach((bar, i) => {
    bar.classList.toggle('active', isActive);
    bar.classList.toggle('speaking', isSpeaking);
    if (isActive && !ctPrefersReducedMotion()) {
      const maxHeight = isSpeaking ? 40 : 32;
      const tween = anime.animate(bar, {
        height: [
          { to: baseHeight },
          { to: maxHeight * (0.4 + Math.sin(i * 0.5) * 0.6) },
          { to: baseHeight }
        ],
        duration: 500 + i * 30,
        ease: anime.eases.inOut(2),
        loop: true,
        delay: i * 40,
      });
      VoiceMode.animeBarTweens.push(tween);
    } else {
      bar.style.height = baseHeight + 'px';
    }
  });
}
function getVoiceState() {
  return VoiceMode.isSpeaking ? 'speaking' : VoiceMode.isThinking ? 'thinking' : VoiceMode.isListening ? 'listening' : 'idle';
}
function clearVoiceTimers() {
  (VoiceMode.ttsPulseTimers || []).forEach(function(timer) { clearInterval(timer); }); VoiceMode.ttsPulseTimers = [];
  ['silenceTimer', 'restartTimer', 'fillerTimer', 'waveInterval'].forEach(function(key) {
    if (VoiceMode[key]) { clearTimeout(VoiceMode[key]); clearInterval(VoiceMode[key]); VoiceMode[key] = null; }
  });
}
function cancelVoicePlayback(reason, abortRequest) {
  VoiceMode.turnId++;
  clearVoiceTimers();
  VoiceMode.speechQueue = []; VoiceMode.speechBuffer = ''; VoiceMode.speechStreamDone = false; VoiceMode.speechPlaying = false; VoiceMode.fillerActive = false;
  if (VoiceMode.synthesis) { try { VoiceMode.synthesis.cancel(); } catch (_) {} }
  if (VoiceMode.activeAudio) { try { VoiceMode.activeAudio.pause(); VoiceMode.activeAudio.currentTime = 0; } catch (_) {} VoiceMode.activeAudio = null; }
  if (VoiceMode.audioObjectUrl) { try { URL.revokeObjectURL(VoiceMode.audioObjectUrl); } catch (_) {} VoiceMode.audioObjectUrl = null; }
  if (abortRequest && AI.activeController) { try { AI.activeController.abort(reason || 'voice-barge-in'); } catch (_) {} }
  VoiceMode.isSpeaking = false;
}
let voiceMicPermissionGrantedForPage = false;
let voiceMicPermissionPromise = null;
function prepareVoiceMicrophone() {
  if (voiceMicPermissionGrantedForPage) return Promise.resolve({ ok: true });
  if (voiceMicPermissionPromise) return voiceMicPermissionPromise;
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return Promise.resolve({ ok: false, reason: 'secure' });
  }
  const checkExistingGrant = navigator.permissions && navigator.permissions.query
    ? navigator.permissions.query({ name: 'microphone' }).then(function(status) {
        return status && status.state === 'granted';
      }).catch(function() { return false; })
    : Promise.resolve(false);
  voiceMicPermissionPromise = checkExistingGrant.then(function(alreadyGranted) {
    if (alreadyGranted) {
      voiceMicPermissionGrantedForPage = true;
      return { ok: true };
    }
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    }).then(function(stream) {
      stream.getTracks().forEach(function(track) { try { track.stop(); } catch (_) {} });
      voiceMicPermissionGrantedForPage = true;
      return { ok: true };
    });
  }).catch(function(error) {
    const name = error && error.name || '';
    let reason = 'unknown';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') reason = 'denied';
    else if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') reason = 'no-device';
    else if (name === 'NotReadableError' || name === 'TrackStartError') reason = 'busy';
    else if (!window.isSecureContext) reason = 'secure';
    return { ok: false, reason: reason };
  }).finally(function() { voiceMicPermissionPromise = null; });
  return voiceMicPermissionPromise;
}
function openVoiceMode() {
  if (VoiceMode.isOpen) return;
  if (AI.pending && AI.activeController) {
    try { AI.activeController.abort('voice-barge-in'); } catch (_) {}
    AI.requestSeq++; AI.pending = false; AI.isThinking = false; AI.currentStreamMessageId = null;
  }
  VoiceMode.isOpen = true; VoiceMode.userStopped = false; VoiceMode.currentTranscript = ''; VoiceMode.noticeText = 'Connecting to your microphone…'; VoiceMode.emergencyCard = null; VoiceMode.emergencyActive = false; VoiceMode.replyMessage = null;
  if (window.CTBackend) { try { window.CTBackend.logEvent('session_open', { supported: !!(window.SpeechRecognition || window.webkitSpeechRecognition), secure: !!window.isSecureContext }); } catch (e) {} }
  VoiceMode.context = (AI.conversationContext || []).slice();
  initializeVoiceTranscriptHistory();
  if (AI.synthesis && AI.isSpeaking) stopAISpeech(false);
  if (AI.isListening && AI.recognition) { try { AI.recognition.abort(); } catch (_) {} AI.isListening = false; }
  const el = document.getElementById('voice-fullscreen');
  if (el) { el.className = 'voice-fullscreen open'; renderVoiceMode(); }
  prepareVoiceMicrophone().then(function(result) {
    if (!VoiceMode.isOpen) return;
    if (result.ok) {
      VoiceMode.noticeText = '';
      startVoiceListening();
      return;
    }
    VoiceMode.userStopped = true;
    VoiceMode.micDenied = result.reason === 'denied';
    if (window.CTBackend) { try { window.CTBackend.logEvent('mic_denied', { reason: result.reason }); } catch (e) {} }
    VoiceMode.noticeText = result.reason === 'secure'
      ? 'For microphone access, open CareTrack from HTTPS or http://localhost. You can still type below.'
      : result.reason === 'no-device'
        ? 'No microphone was found. Connect a microphone or type your message below.'
        : result.reason === 'busy'
          ? 'Your microphone may be in use by another app. Close that app and tap the orb to retry.'
          : 'Microphone access is blocked. In Chrome, open the site controls beside the address bar, set Microphone to Allow, then reopen Voice AI. You can still type below.';
    renderVoiceMode();
  });
}
function closeVoiceMode() {
  const hadVoiceRequest = VoiceMode.pending;
  if (window.CTBackend) { try { window.CTBackend.logEvent('session_close', { hadPendingRequest: hadVoiceRequest, turns: (VoiceMode.conversationHistory || []).length, micDenied: !!VoiceMode.micDenied }); window.CTBackend.flush(); } catch (e) {} }
  VoiceMode.isOpen = false; VoiceMode.isListening = false; VoiceMode.isSpeaking = false; VoiceMode.isThinking = false; VoiceMode.pending = false; VoiceMode.userStopped = true;
  VoiceMode.currentTranscript = ''; VoiceMode.currentTranscriptFinal = ''; VoiceMode.noticeText = ''; VoiceMode.pendingAction = null; VoiceMode.emergencyCard = null; VoiceMode.emergencyActive = false;
  cancelVoicePlayback('voice-close', hadVoiceRequest);
  if (VoiceMode.recognition) { try { VoiceMode.recognition.stop(); } catch (_) {} try { VoiceMode.recognition.abort(); } catch (_) {} }
  VoiceMode.processingTranscript = false;
  VoiceMode.animeRingTweens.forEach(function(t) { try { t.pause(); } catch (_) {} }); VoiceMode.animeRingTweens = [];
  VoiceMode.animeBarTweens.forEach(function(t) { try { t.pause(); } catch (_) {} }); VoiceMode.animeBarTweens = [];
  if (VoiceMode.voice3dOrb) { VoiceMode.voice3dOrb.dispose(); VoiceMode.voice3dOrb = null; }
  const fab = document.getElementById('voice-fab'); if (fab) fab.classList.remove('active');
  const el = document.getElementById('voice-fullscreen'); if (el) { el.className = 'voice-fullscreen closed'; el.innerHTML = ''; }
}
function renderVoiceMode() {
  const el = document.getElementById('voice-fullscreen');
  if (!el || !VoiceMode.isOpen) return;
  const savedPageScroll = el.scrollTop || 0;
  const pageWasAtBottom = el.scrollHeight > el.clientHeight + 1 && el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  const previousHistoryList = el.querySelector('.voice-history-list');
  const savedHistoryScroll = previousHistoryList ? previousHistoryList.scrollTop : 0;
  const historyWasAtBottom = !previousHistoryList || previousHistoryList.scrollHeight - previousHistoryList.scrollTop - previousHistoryList.clientHeight < 24;
  if (VoiceMode.srSupported === null) VoiceMode.srSupported = speechRecognitionSupported();
  const orbState = VoiceMode.isSpeaking ? 'speaking' : VoiceMode.isThinking ? 'thinking' : VoiceMode.isListening ? 'listening' : 'idle';
  const stateLabel = { idle: 'Idle', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' }[orbState];
  const statusText = VoiceMode.noticeText || (VoiceMode.isSpeaking ? 'Sahaara is speaking…'
    : VoiceMode.isThinking ? 'Sahaara is preparing a reply…'
    : VoiceMode.isListening ? 'Listening… speak now'
    : (!VoiceMode.srSupported ? 'Voice input is not supported here — type below'
    : VoiceMode.micDenied ? 'Microphone unavailable — type below'
    : 'Tap the orb to start'));
  let waveBars = '';
  for (let i = 0; i < 24; i++) waveBars += '<div class="voice-wave-bar ' + ((VoiceMode.isListening || VoiceMode.isSpeaking) ? 'active' : '') + '" style="animation-delay:' + (i * 0.08).toFixed(2) + 's"></div>';
  const recentTurns = VoiceMode.conversationHistory.slice(-12);
  const historyHtml = recentTurns.map(function(item) {
    const isUser = item.role === 'user';
    const text = String(item.text || '');
    const stamp = item.time ? new Date(item.time) : null;
    const timeLabel = stamp && !isNaN(stamp.getTime()) ? stamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    return '<article class="voice-history-item ' + (isUser ? 'from-user' : 'from-assistant') + '"><div class="voice-history-meta"><span>' + (isUser ? '🎤 You' : '✨ Sahaara') + '</span>' + (timeLabel ? '<time>' + esc(timeLabel) + '</time>' : '') + '</div><div class="vh-bot">' + esc(text.slice(0, 260)) + (text.length > 260 ? '…' : '') + '</div></article>';
  }).join('');
  const historyContent = historyHtml || '<div class="voice-history-empty">Your voice messages and replies will appear here.</div>';
  const dbBadgeHtml = '<span class="voice-db-badge ' + esc(VoiceMode.dbStatus || 'checking') + '" role="status"><span class="voice-db-dot" aria-hidden="true"></span>' + esc(voiceDatabaseStatusLabel()) + '</span>';
  const transcriptHtml = VoiceMode.currentTranscript
    ? '<div class="user-said" aria-live="polite">“' + esc(VoiceMode.currentTranscript) + '”</div>'
    : '<div class="status-text" aria-live="polite">' + esc(statusText) + '</div>';
  const lastBot = VoiceMode.conversationHistory.filter(function(item) { return item.role === 'bot'; }).pop();
  const responseText = VoiceMode.replyMessage && VoiceMode.replyMessage.text ? VoiceMode.replyMessage.text : (lastBot && VoiceMode.isSpeaking ? lastBot.text : '');
  const responseHtml = responseText ? '<div class="ai-response" aria-live="polite">' + esc(String(responseText).slice(0, 420)) + (String(responseText).length > 420 ? '…' : '') + '</div>' : '';
  let langSelector = '<select class="input voice-language-select" onchange="setAILanguage(this.value)" title="Language" aria-label="Language">';
  Object.keys(LANGUAGES).forEach(function(code) {
    langSelector += '<option value="' + esc(code) + '"' + (AI.language === code ? ' selected' : '') + ' style="color:#000">' + LANGUAGES[code].flag + ' ' + esc(LANGUAGES[code].native) + '</option>';
  });
  langSelector += '</select>';
  const emergencyHtml = VoiceMode.emergencyCard
    ? '<div class="voice-emergency-card" role="alert"><strong>' + esc(VoiceMode.emergencyCard.title) + '</strong><p>' + esc(VoiceMode.emergencyCard.message) + '</p>' +
      (VoiceMode.emergencyCard.support ? '<p>' + esc(VoiceMode.emergencyCard.support) + '</p>' : '') +
      '<a href="tel:112">☎ ' + esc(VoiceMode.emergencyCard.callLabel) + '</a></div>' : '';
  el.innerHTML = '<div class="voice-header"><h3>✨ Sahaara <span class="vbadge">Voice AI</span>' +
    (AI_CONFIG.LLM_ENDPOINT && AI.llmVerified ? ' <span class="vbadge" style="background:rgba(45,212,191,.18);color:#99f6e4">Smart AI</span>' : '') + '</h3>' +
    '<div class="row gap2 voice-header-actions">' + langSelector + dbBadgeHtml + '<button class="voice-close-btn" onclick="closeVoiceMode()" aria-label="Close voice mode">' + ic('x', 20) + '</button></div></div>' +
    '<div class="voice-mode-label">VOICE CONVERSATION MODE</div>' +
    '<div class="voice-orb-container ' + orbState + '" id="voice-orb-wrap">' +
    '<div class="voice-orb-glow ' + orbState + '"></div>' +
    '<div class="voice-orb-canvas" id="voice-orb-3d" onclick="voiceOrbTap()" role="button" tabindex="0" aria-label="' + esc(statusText) + '" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();voiceOrbTap()}"></div>' +
    '<div class="voice-audio-ring r1"></div><div class="voice-audio-ring r2"></div><div class="voice-audio-ring r3"></div>' +
    '<div class="voice-orb-label">' + esc(statusText) + '</div>' +
    '</div>' +
    '<div class="voice-state-label state-' + orbState + '" aria-live="polite">State: ' + stateLabel + '</div>' +
    '<div class="voice-wave-bars" id="voice-wave-bars" aria-hidden="true">' + waveBars + '</div>' +
    '<div class="voice-transcript">' + transcriptHtml + responseHtml + '</div>' + emergencyHtml +
    '<div class="voice-controls">' +
    '<button class="voice-btn-mute" onclick="toggleVoiceMute()" aria-pressed="' + VoiceMode.muted + '" title="' + (VoiceMode.muted ? 'Unmute AI voice' : 'Mute AI voice') + '">' + ic(VoiceMode.muted ? 'mic-off' : 'volume-2', 20) + '</button>' +
    '<button class="voice-btn-end" onclick="closeVoiceMode()" title="End conversation" aria-label="End voice conversation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
    '<button class="voice-btn-mute" onclick="toggleAutoListen()" aria-pressed="' + VoiceMode.autoListen + '" title="' + (VoiceMode.autoListen ? 'Disable auto-listen' : 'Enable auto-listen') + '">' + ic(VoiceMode.autoListen ? 'mic' : 'mic-off', 20) + '</button>' +
    '</div>' +
    '<div class="voice-text-fallback"><input type="text" id="voice-text-input" class="voice-text-input" placeholder="' + (VoiceMode.srSupported ? 'Prefer typing? Ask Sahaara here…' : 'Voice input is unavailable — type your question here…') + '" onkeydown="if(event.key===\'Enter\'){event.preventDefault();sendVoiceTextInput()}">' +
    '<button class="voice-text-send" onclick="sendVoiceTextInput()" aria-label="Send typed message">' + ic('send', 16) + '</button></div>' +
    '<div class="voice-transcript-note">Saved as text on this device and in Sahaara chat history. CareTrack does not retain raw audio.</div>' +
    '<section class="voice-history" id="voice-history" aria-label="Saved voice transcript history"><div class="voice-history-head"><div><h4>Recent turns</h4><span>Text only · stored locally</span></div><span class="voice-history-count" title="Recent messages shown">' + Math.min(12, VoiceMode.conversationHistory.length) + '</span></div><div class="voice-history-list">' + historyContent + '</div></section>';
  el.scrollTop = pageWasAtBottom ? el.scrollHeight : savedPageScroll;
  const currentHistoryList = el.querySelector('.voice-history-list');
  if (currentHistoryList) currentHistoryList.scrollTop = historyWasAtBottom ? currentHistoryList.scrollHeight : Math.min(savedHistoryScroll, Math.max(0, currentHistoryList.scrollHeight - currentHistoryList.clientHeight));
  _initVoice3DOrb(orbState);
  _animateVoiceWaveBars();
  const fab = document.getElementById('voice-fab');
  if (fab) fab.classList.add('active');
}
function detectVoiceRecognitionLanguage(text) {
  const value = String(text || '');
  if (/[\u0900-\u097F]/.test(value)) return 'hi-IN';
  const lower = value.toLowerCase();
  const hinglishHints = /\b(haan|han|nahi|nahin|kya|kaise|kyun|kyu|mujhe|mera|meri|hai|hain|ho|kar|karo|batao|accha|achha|theek|bhai|yaar|chahiye|matlab|abhi|kal|aaj|ka|ki|ke)\b/;
  if (hinglishHints.test(lower)) return 'hi-IN';
  if (/[\u0B80-\u0BFF]/.test(value)) return 'ta-IN';
  if (/[\u0C00-\u0C7F]/.test(value)) return 'te-IN';
  if (/[\u0C80-\u0CFF]/.test(value)) return 'kn-IN';
  if (/[\u0D00-\u0D7F]/.test(value)) return 'ml-IN';
  if (/[\u0980-\u09FF]/.test(value)) return 'bn-IN';
  if (/[\u0A00-\u0A7F]/.test(value)) return 'pa-IN';
  return 'en-IN';
}
function startVoiceListening(options) {
  options = options || {};
  if (!VoiceMode.isOpen) return;
  if (options.automatic) {
    if (VoiceMode.userStopped || !VoiceMode.autoListen || VoiceMode.pending || VoiceMode.isThinking || VoiceMode.isSpeaking || VoiceMode.micDenied) return;
  } else {
    if (VoiceMode.isSpeaking || VoiceMode.isThinking || VoiceMode.pending) {
      cancelVoicePlayback('voice-barge-in', true);
      VoiceMode.pending = false; VoiceMode.isThinking = false; VoiceMode.emergencyActive = false; VoiceMode.emergencyCard = null;
    }
    VoiceMode.userStopped = false;
  }
  if (VoiceMode.isListening) return;
  VoiceMode.noticeText = ''; VoiceMode.currentTranscript = ''; VoiceMode.recognitionFinalBuffer = ''; VoiceMode.lastProcessedText = '';
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    VoiceMode.srSupported = false;
    voiceFeedback('unsupported', false);
    return;
  }
  VoiceMode.srSupported = true;
  if (!VoiceMode.recognition) {
    VoiceMode.recognition = new Recognition();
    VoiceMode.recognition.continuous = true; VoiceMode.recognition.interimResults = true; VoiceMode.recognition.maxAlternatives = 1;
    VoiceMode.recognition.onresult = function(event) {
      if (!VoiceMode.isOpen || VoiceMode.pending || VoiceMode.isSpeaking) return;
      let interim = ''; let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]; const transcript = result && result[0] ? result[0].transcript : '';
        if (result && result.isFinal) finalText += transcript;
        else interim += transcript;
      }
      if (finalText.trim()) {
        const chunk = finalText.trim();
        if (chunk !== VoiceMode.lastProcessedText) {
          VoiceMode.recognitionFinalBuffer = (VoiceMode.recognitionFinalBuffer + ' ' + chunk).trim();
          VoiceMode.lastProcessedText = chunk;
        }
      }
      VoiceMode.currentTranscript = (VoiceMode.recognitionFinalBuffer + ' ' + interim).trim();
      if (VoiceMode.voice3dOrb && VoiceMode.voice3dOrb.pulseFromVoice) VoiceMode.voice3dOrb.pulseFromVoice();
      VoiceMode.noticeText = '';
      updateVoiceTranscriptOnly();
      if (VoiceMode.silenceTimer) clearTimeout(VoiceMode.silenceTimer);
      if (VoiceMode.currentTranscript) {
        VoiceMode.silenceTimer = setTimeout(function() {
          const spoken = (VoiceMode.recognitionFinalBuffer || VoiceMode.currentTranscript).trim();
          VoiceMode.recognitionFinalBuffer = ''; VoiceMode.currentTranscript = ''; VoiceMode.silenceTimer = null;
          if (spoken && VoiceMode.isOpen && !VoiceMode.pending) { VoiceMode.detectedSpeechLang = detectVoiceRecognitionLanguage(spoken); if (VoiceMode.recognition) VoiceMode.recognition.lang = VoiceMode.detectedSpeechLang; processVoiceInput(spoken); }
        }, finalText.trim() ? 720 : 1150);
      }
    };
    VoiceMode.recognition.onerror = function(event) {
      const error = event && event.error || 'unknown';
      if (error === 'aborted') return;
      if (window.CTBackend) { try { window.CTBackend.logEvent('recognition_error', { error: error, lang: (VoiceMode.recognition && VoiceMode.recognition.lang) || null }); } catch (e) {} }
      if (error === 'no-speech') { voiceFeedback('noSpeech', true); return; }
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        VoiceMode.micDenied = true; VoiceMode.userStopped = true; voiceFeedback('micDenied', false); return;
      }
      if (error === 'audio-capture') { VoiceMode.micDenied = true; VoiceMode.userStopped = true; voiceFeedback('audioCapture', false); return; }
      if (error === 'network') { VoiceMode.userStopped = true; voiceFeedback('network', false); return; }
      VoiceMode.userStopped = true; voiceFeedback('generic', false);
    };
    VoiceMode.recognition.onend = function() {
      VoiceMode.isListening = false;
      if (!VoiceMode.isOpen) return;
      if (VoiceMode.currentTranscript && !VoiceMode.silenceTimer && !VoiceMode.pending && !VoiceMode.isSpeaking) {
        VoiceMode.silenceTimer = setTimeout(function() {
          const spoken = (VoiceMode.recognitionFinalBuffer || VoiceMode.currentTranscript).trim();
          VoiceMode.recognitionFinalBuffer = ''; VoiceMode.currentTranscript = ''; VoiceMode.silenceTimer = null;
          if (spoken && !VoiceMode.pending) processVoiceInput(spoken);
        }, 450);
      }
      if (VoiceMode.autoListen && !VoiceMode.userStopped && !VoiceMode.micDenied && !VoiceMode.pending && !VoiceMode.isSpeaking && !VoiceMode.isThinking && !VoiceMode.currentTranscript) {
        if (VoiceMode.restartTimer) clearTimeout(VoiceMode.restartTimer);
        VoiceMode.restartTimer = setTimeout(function() { VoiceMode.restartTimer = null; startVoiceListening({ automatic: true }); }, 320);
      }
      renderVoiceMode();
    };
  }
  VoiceMode.recognition.lang = VoiceMode.detectedSpeechLang || (LANGUAGES[AI.language] && LANGUAGES[AI.language].speechCode) || (String(navigator.language || '').toLowerCase().startsWith('hi') ? 'hi-IN' : 'en-IN');
  const start = function(attempt) {
    if (!VoiceMode.isOpen || VoiceMode.userStopped && options.automatic) return;
    try {
      VoiceMode.recognition.start(); VoiceMode.isListening = true; VoiceMode.isSpeaking = false; VoiceMode.isThinking = false;
      renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('listening');
    } catch (error) {
      if (error && error.name === 'InvalidStateError' && attempt < 2) {
        VoiceMode.restartTimer = setTimeout(function() { VoiceMode.restartTimer = null; start(attempt + 1); }, 180);
      } else if (!(error && error.name === 'InvalidStateError')) {
        VoiceMode.isListening = false; voiceFeedback('generic', false);
      }
    }
  };
  if (VoiceMode.restartTimer) { clearTimeout(VoiceMode.restartTimer); VoiceMode.restartTimer = null; }
  start(0);
}
function voiceOrbTap() {
  if (VoiceMode.isSpeaking || VoiceMode.isThinking || VoiceMode.pending) { startVoiceListening(); return; }
  if (VoiceMode.isListening) { stopVoiceListening(); return; }
  startVoiceListening();
}
function stopVoiceListening() {
  VoiceMode.userStopped = true; VoiceMode.isListening = false; VoiceMode.currentTranscript = ''; VoiceMode.recognitionFinalBuffer = '';
  if (VoiceMode.silenceTimer) { clearTimeout(VoiceMode.silenceTimer); VoiceMode.silenceTimer = null; }
  if (VoiceMode.recognition) { try { VoiceMode.recognition.stop(); } catch (_) {} }
  if (VoiceMode.isOpen) renderVoiceMode();
  if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('idle');
}
function updateVoiceTranscriptOnly() {
  const root = document.querySelector('#voice-fullscreen .voice-transcript');
  if (!root) return;
  const caption = root.querySelector('.user-said');
  if (VoiceMode.currentTranscript) {
    if (caption) caption.textContent = '“' + VoiceMode.currentTranscript + '”';
    else {
      const status = root.querySelector('.status-text');
      if (status) { const node = document.createElement('div'); node.className = 'user-said'; node.setAttribute('aria-live', 'polite'); node.textContent = '“' + VoiceMode.currentTranscript + '”'; status.replaceWith(node); }
    }
  }
}
function updateVoiceAnswerOnly() {
  if (!VoiceMode.isOpen) return;
  const response = document.querySelector('#voice-fullscreen .ai-response');
  if (response && VoiceMode.replyMessage) response.textContent = String(VoiceMode.replyMessage.text || '').slice(0, 420);
  else if (VoiceMode.replyMessage && VoiceMode.replyMessage.text) renderVoiceMode();
}
function sendVoiceTextInput() {
  const input = document.getElementById('voice-text-input');
  if (!input) return;
  const text = input.value.trim(); if (!text) return;
  input.value = '';
  if (VoiceMode.isSpeaking || VoiceMode.pending) cancelVoicePlayback('voice-barge-in', true);
  if (VoiceMode.isListening && VoiceMode.recognition) { try { VoiceMode.recognition.stop(); } catch (_) {} }
  VoiceMode.pending = false; VoiceMode.isThinking = false; VoiceMode.isListening = false;
  processVoiceInput(text);
}
function voiceLocalText(key, values) {
  const all = {
    en: { confirm: 'I found {name} at {time}. Should I mark this self-care activity complete? Please say yes or no.', choose: 'I found more than one morning activity: {items}. Which one do you mean?', none: 'I do not see an unfinished morning activity scheduled today.', done: 'Okay, I marked {name} complete for today.', cancelled: 'Okay, I will not change your plan.', stop: 'Okay, I stopped. Tap the orb when you are ready to continue.', repeat: 'I will repeat my last answer.', slower: 'Sure. I will speak a little slower.', faster: 'Sure. I will speak a little faster.', language: 'Language changed to {name}.', nextNone: 'There are no upcoming activities left today.', noSpeech: 'I did not catch that. Please try speaking again.', micDenied: 'Microphone access is blocked. Please allow it in browser settings, or type below.', network: 'Voice recognition needs a network connection. You can type below.', audioCapture: 'I could not access a microphone. Please check the microphone, or type below.', unsupported: 'Voice recognition is not supported in this browser. You can type below.', generic: 'I could not start listening. Please try again or type below.', ack: 'Sure, let me check.' },
    hi: { confirm: 'आज {time} पर {name} तय है। क्या मैं इस गतिविधि को पूरा हुआ चिह्नित करूँ? हाँ या नहीं कहें।', choose: 'आज सुबह एक से अधिक गतिविधियाँ हैं: {items}। आप किसकी बात कर रहे हैं?', none: 'आज सुबह के लिए कोई अधूरी गतिविधि तय नहीं दिख रही।', done: 'ठीक है, मैंने {name} को आज पूरा चिह्नित कर दिया।', cancelled: 'ठीक है, मैं आपकी योजना में कोई बदलाव नहीं करूँगा।', stop: 'ठीक है, मैंने रोक दिया। जारी रखने के लिए ऑर्ब पर टैप करें।', repeat: 'मैं अपना पिछला जवाब दोहराता हूँ।', slower: 'ज़रूर, मैं थोड़ा धीरे बोलूँगा।', faster: 'ज़रूर, मैं थोड़ा तेज़ बोलूँगा।', language: 'भाषा {name} पर बदल दी गई है।', nextNone: 'आज के लिए कोई आगामी गतिविधि बाकी नहीं है।', noSpeech: 'मैं आपकी बात नहीं सुन पाया। कृपया फिर से बोलें।', micDenied: 'माइक्रोफ़ोन की अनुमति बंद है। ब्राउज़र सेटिंग में अनुमति दें या नीचे लिखें।', network: 'आवाज़ पहचानने के लिए इंटरनेट चाहिए। आप नीचे लिख सकते हैं।', audioCapture: 'माइक्रोफ़ोन उपलब्ध नहीं है। जाँचें या नीचे लिखें।', unsupported: 'इस ब्राउज़र में आवाज़ पहचान उपलब्ध नहीं है। नीचे लिखें।', generic: 'सुनना शुरू नहीं हो पाया। फिर कोशिश करें या नीचे लिखें।', ack: 'ज़रूर, मैं देखता हूँ।' },
    'hi-Latn': { confirm: 'Aaj {time} par {name} scheduled hai. Kya main is self-care activity ko complete mark kar doon? Haan ya nahi boliye.', choose: 'Aaj subah ek se zyada activities hain: {items}. Aap kiski baat kar rahe hain?', none: 'Aaj subah ke liye koi adhuri activity scheduled nahi dikh rahi.', done: 'Theek hai, maine {name} ko aaj complete mark kar diya.', cancelled: 'Theek hai, main aapke plan mein koi badlav nahi karunga.', stop: 'Theek hai, ruk gaya. Continue karne ke liye orb tap karein.', repeat: 'Main apna pichhla jawab dobara bolta hoon.', slower: 'Sure, ab main thoda dheere bolunga.', faster: 'Sure, ab main thoda tez bolunga.', language: 'Language {name} par change ho gayi hai.', nextNone: 'Aaj ke liye koi upcoming activity baaki nahi hai.', noSpeech: 'Main aapki baat samajh nahi paaya. Phir se boliye.', micDenied: 'Microphone permission band hai. Browser settings mein allow karein ya neeche type karein.', network: 'Voice recognition ke liye internet chahiye. Aap neeche type kar sakte hain.', audioCapture: 'Microphone access nahi mila. Check karein ya neeche type karein.', unsupported: 'Is browser mein voice recognition nahi hai. Neeche type karein.', generic: 'Listening shuru nahi ho paayi. Phir try karein ya type karein.', ack: 'Sure, main check karta hoon.' }
  };
  const table = all[AI.language] || all.en;
  let text = table[key] || all.en[key] || '';
  Object.keys(values || {}).forEach(function(name) { text = text.replace(new RegExp('\\{' + name + '\\}', 'g'), String(values[name])); });
  return text;
}
function voiceFeedback(key, autoResume) {
  if (!VoiceMode.isOpen) return;
  const message = voiceLocalText(key);
  VoiceMode.noticeText = message; VoiceMode.isListening = false; VoiceMode.isThinking = false; VoiceMode.userStopped = !autoResume;
  if (VoiceMode.recognition) { try { VoiceMode.recognition.stop(); } catch (_) {} }
  renderVoiceMode();
  const generation = ++VoiceMode.turnId;
  VoiceMode.isSpeaking = true; if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('speaking');
  speakVoiceMode(message, function() {
    if (!VoiceMode.isOpen || generation !== VoiceMode.turnId) return;
    VoiceMode.isSpeaking = false; VoiceMode.noticeText = '';
    if (autoResume && VoiceMode.autoListen) { VoiceMode.userStopped = false; setTimeout(function() { if (VoiceMode.isOpen) startVoiceListening({ automatic: true }); }, 500); }
    else { VoiceMode.userStopped = true; renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('idle'); }
  });
}
function voiceAffirmative(text) {
  return /^(yes|yeah|yep|sure|confirm|okay|ok|haan|ha|ji|theek|ठीक|हाँ|हां|जी|करो|ஆம்|சரி|అవును|ಹೌದು|അതെ|હા|হ্যাঁ|ਹਾਂ|جی|ہاں)(\s|$)/i.test(normalizeEmergencyText(text));
}
function voiceNegative(text) {
  return /^(no|nope|cancel|not now|nah|nahi|नहीं|नही|मत|வேண்டாம்|కాదు|ಇಲ್ಲ|ഇല്ല|ના|না|ਨਹੀਂ|نہیں)(\s|$)/i.test(normalizeEmergencyText(text));
}
function findLanguageInVoiceCommand(text) {
  const normalized = normalizeEmergencyText(text);
  const names = [
    ['hi', ['hindi','हिंदी','हिन्दी']], ['hi-Latn', ['hinglish','हिंग्लिश']], ['mr', ['marathi','मराठी']],
    ['bn', ['bengali','bangla','বাংলা']], ['ta', ['tamil','தமிழ்']], ['te', ['telugu','తెలుగు']],
    ['gu', ['gujarati','ગુજરાતી']], ['kn', ['kannada','ಕನ್ನಡ']], ['ml', ['malayalam','മലയാളം']],
    ['pa', ['punjabi','ਪੰਜਾਬੀ']], ['ur', ['urdu','اردو']], ['en', ['english','अंग्रेज़ी']]
  ];
  for (let i = 0; i < names.length; i++) {
    if (names[i][1].some(function(name) { return normalized.indexOf(normalizeEmergencyText(name)) >= 0; })) return names[i][0];
  }
  return null;
}
function getMorningOccurrences() {
  const today = todayStr();
  return getAllOccurrencesForDate(today).filter(function(occ) {
    if (timeToMinutes(occ.time) >= 12 * 60) return false;
    return getOccurrenceStatus(occ.prescriptionId, today, occ.time).status !== 'completed';
  });
}
function prepareVoiceCompletion(occ) {
  VoiceMode.pendingAction = { kind: 'confirmComplete', prescriptionId: occ.prescriptionId, date: occ.date, time: occ.time, name: occ.title };
  return voiceLocalText('confirm', { name: occ.title, time: formatTime12(occ.time) });
}
function runVoiceLocalCommand(text) {
  const q = normalizeEmergencyText(text);
  if (!q) return null;
  if (VoiceMode.pendingAction) {
    const action = VoiceMode.pendingAction;
    if (action.kind === 'confirmComplete') {
      if (voiceAffirmative(text)) {
        VoiceMode.pendingAction = null;
        completeOccurrence(action.prescriptionId, action.date, action.time);
        return voiceLocalText('done', { name: action.name });
      }
      if (voiceNegative(text)) { VoiceMode.pendingAction = null; return voiceLocalText('cancelled'); }
      VoiceMode.pendingAction = null;
    } else if (action.kind === 'chooseOccurrence') {
      const picked = action.options.find(function(occ, index) {
        return q.indexOf(normalizeEmergencyText(occ.title)) >= 0 || q.indexOf(String(index + 1)) >= 0 || q.indexOf(normalizeEmergencyText(formatTime12(occ.time))) >= 0;
      });
      VoiceMode.pendingAction = null;
      if (picked) return prepareVoiceCompletion(picked);
    }
  }
  const lang = findLanguageInVoiceCommand(q);
  if (lang && /(change|switch|set|language|भाषा|भाषा बदल|bhasha|भाषा बदलो)/i.test(q)) {
    setAILanguage(lang);
    return voiceLocalText('language', { name: LANGUAGES[lang].name });
  }
  if (/^(stop|रुको|बस|रुक जाओ|band karo|bas karo|थांब|நிறுத்து|ఆపు|ನಿಲ್ಲಿಸು|നിർത്തൂ|ਰੁਕੋ|رک جائیں)(\s|$)/i.test(q)) {
    VoiceMode.userStopped = true; VoiceMode.autoListen = false;
    return voiceLocalText('stop');
  }
  if (/(repeat that|repeat it|say that again|say it again|dobara bolo|phir se bolo|फिर से बोलो|दोहराओ|पुन्हा सांगा|আবার বলুন|மீண்டும் சொல்லு|మళ్లీ చెప్పు|ಮತ್ತೆ ಹೇಳು|വീണ്ടും പറയൂ|ਦੁਬਾਰਾ ਦੱਸੋ|دوبارہ کہیں)/i.test(q)) {
    const last = VoiceMode.conversationHistory.filter(function(item) { return item.role === 'bot' && item.text; }).pop();
    return { text: last ? String(last.text) : voiceLocalText('repeat'), repeat: true };
  }
  if (/(speak|talk|bol).*(slower|slow|dheere|धीरे|آہستہ|மெதுவாக|నెమ్మదిగా|ધીમે|ધીમું|ધીમા|ਹੌਲੀ)|\bslower\b/i.test(q)) {
    VoiceMode.speechRate = Math.max(0.72, (VoiceMode.speechRate || 0.94) - 0.12);
    return voiceLocalText('slower');
  }
  if (/(speak|talk|bol).*(faster|fast|tez|तेज़|जल्दी|تیز|வேகமாக|వేగంగా|ઝડપી|ਤੇਜ਼)|\bfaster\b/i.test(q)) {
    VoiceMode.speechRate = Math.min(1.16, (VoiceMode.speechRate || 0.94) + 0.12);
    return voiceLocalText('faster');
  }
  const markRequested = /(mark|complete|done|kar do|kar dena|पूरा|पूर्ण|कर दो|कर देना|करें)/i.test(q) && /(morning|subah|सुबह|प्रातः)/i.test(q) && /(dose|activity|task|prescription|goli|dawa|दवा|गोली|गतिविधि|काम)/i.test(q);
  if (markRequested) {
    const candidates = getMorningOccurrences();
    if (!candidates.length) return voiceLocalText('none');
    if (candidates.length === 1) return prepareVoiceCompletion(candidates[0]);
    VoiceMode.pendingAction = { kind: 'chooseOccurrence', options: candidates };
    const items = candidates.slice(0, 4).map(function(occ, index) { return (index + 1) + ', ' + occ.title + ' at ' + formatTime12(occ.time); }).join('; ');
    return voiceLocalText('choose', { items: items });
  }
  if (/(what.s next|what is next|next today|upcoming|aage kya|aage kaun|आगे क्या|अगला क्या|आज आगे)/i.test(q)) {
    const today = todayStr(); const minute = now().getHours() * 60 + now().getMinutes();
    const next = getAllOccurrencesForDate(today).filter(function(occ) {
      const status = getOccurrenceStatus(occ.prescriptionId, today, occ.time).status;
      return status === 'due' || (status === 'upcoming' && timeToMinutes(occ.time) >= minute);
    }).sort(function(a, b) { return timeToMinutes(a.time) - timeToMinutes(b.time); })[0];
    return next ? 'Your next scheduled activity is ' + next.title + ' at ' + formatTime12(next.time) + '.' : voiceLocalText('nextNone');
  }
  return null;
}
function playStandaloneVoiceText(text, autoResume) {
  if (!VoiceMode.isOpen) return;
  const generation = ++VoiceMode.turnId;
  VoiceMode.isThinking = false; VoiceMode.isSpeaking = true; VoiceMode.userStopped = !autoResume; VoiceMode.noticeText = '';
  if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('speaking');
  renderVoiceMode();
  speakVoiceMode(text, function() {
    if (!VoiceMode.isOpen || generation !== VoiceMode.turnId) return;
    VoiceMode.isSpeaking = false;
    if (autoResume && VoiceMode.autoListen) { VoiceMode.userStopped = false; setTimeout(function() { if (VoiceMode.isOpen) startVoiceListening({ automatic: true }); }, 550); }
    else { VoiceMode.userStopped = true; renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('idle'); }
  });
}
function finishVoiceAnswer() {
  if (!VoiceMode.isOpen || VoiceMode.pending || !VoiceMode.speechStreamDone || VoiceMode.speechPlaying || VoiceMode.speechQueue.length || VoiceMode.fillerActive) return;
  VoiceMode.isSpeaking = false; VoiceMode.isThinking = false; VoiceMode.noticeText = '';
  renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('idle');
  if (VoiceMode.autoListen && !VoiceMode.userStopped && !VoiceMode.emergencyActive) {
    setTimeout(function() { if (VoiceMode.isOpen && !VoiceMode.userStopped && !VoiceMode.isSpeaking && !VoiceMode.isThinking) startVoiceListening({ automatic: true }); }, 650);
  }
}
function playNextVoiceSentence() {
  if (!VoiceMode.isOpen || VoiceMode.fillerActive || VoiceMode.speechPlaying) return;
  if (!VoiceMode.speechQueue.length) {
    if (VoiceMode.speechStreamDone && !VoiceMode.pending) finishVoiceAnswer();
    else if (VoiceMode.pending && !VoiceMode.isSpeaking) { VoiceMode.isThinking = true; renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('thinking'); }
    return;
  }
  const sentence = VoiceMode.speechQueue.shift();
  const turn = VoiceMode.turnId;
  VoiceMode.speechPlaying = true; VoiceMode.isThinking = false; VoiceMode.isSpeaking = true;
  renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('speaking');
  speakVoiceMode(sentence, function() {
    if (!VoiceMode.isOpen || turn !== VoiceMode.turnId) return;
    VoiceMode.speechPlaying = false;
    if (VoiceMode.speechQueue.length) playNextVoiceSentence();
    else if (VoiceMode.speechStreamDone && !VoiceMode.pending) finishVoiceAnswer();
    else { VoiceMode.isSpeaking = false; VoiceMode.isThinking = true; renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('thinking'); }
  });
}
function enqueueVoiceSentence(text) {
  splitSpeechChunks(text, 220).forEach(function(part) { if (part) VoiceMode.speechQueue.push(part); });
  playNextVoiceSentence();
}
function drainVoiceSpeechBuffer(flush) {
  let buffer = VoiceMode.speechBuffer || '';
  while (buffer) {
    let end = -1;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer.charAt(i);
      if (/[.!?।]/.test(ch) && (i === buffer.length - 1 || /\s/.test(buffer.charAt(i + 1)))) { end = i + 1; break; }
    }
    if (end < 0 && buffer.length > 240) { const splitAt = buffer.lastIndexOf(' ', 220); if (splitAt > 80) end = splitAt; }
    if (end < 0 && flush) end = buffer.length;
    if (end < 0) break;
    const sentence = buffer.slice(0, end).trim(); buffer = buffer.slice(end).trimStart();
    if (sentence) enqueueVoiceSentence(sentence);
  }
  VoiceMode.speechBuffer = buffer;
}
function trackVoiceTranscriptDatabaseWrite(message, sessionId) {
  const sid = String(sessionId || AI.currentSessionId || 'default');
  writeVoiceTranscriptRecord(message, sid).then(function(saved) {
    if (String(AI.currentSessionId || 'default') !== sid) return;
    VoiceMode.dbStatus = saved ? 'ready' : 'fallback';
    updateVoiceDatabaseBadge();
  });
}
function persistVoiceUserTranscript(text) {
  const spokenText = String(text || '').trim();
  if (!spokenText) return null;
  const sessionId = String(AI.currentSessionId || 'default');
  const message = { id: uid(), role: 'user', text: spokenText, time: new Date().toISOString(), source: 'voice' };
  AI.messages.push(message);
  saveSessions();
  trackVoiceTranscriptDatabaseWrite(message, sessionId);
  if (AI.panelOpen || State.route === 'ai') refreshAIDisplay();
  return message;
}
function persistVoiceAssistantTranscript(userMessage, text, options) {
  options = options || {};
  const replyText = String(text || '').trim();
  if (!replyText) return null;
  const sessionId = String(AI.currentSessionId || 'default');
  const message = {
    id: options.id || uid(), role: 'bot', text: replyText, time: options.time || new Date().toISOString(),
    source: options.source || 'builtin', voiceMode: true,
    interrupted: !!options.interrupted, error: options.error || null
  };
  if (options.emergency) {
    message.emergency = true; message.emergencyData = options.emergencyData || null;
    message.selfHarm = !!options.selfHarm;
  }
  AI.messages.push(message);
  if (userMessage) {
    if (!options.emergency && !options.interrupted) pushAIContextPair(AI.conversationContext, userMessage.text, replyText);
    if (VoiceMode.isOpen) VoiceMode.context = AI.conversationContext.slice();
  }
  saveSessions();
  trackVoiceTranscriptDatabaseWrite(message, sessionId);
  if (AI.panelOpen || State.route === 'ai') refreshAIDisplay();
  return message;
}
function voiceEmergency(text, emergency, sessionUserMessage) {
  const copy = getEmergencyCopy(AI.language, emergency.kind === 'selfHarm', emergency.kind);
  VoiceMode.emergencyActive = true; VoiceMode.emergencyCard = copy; VoiceMode.pendingAction = null; VoiceMode.pending = false; VoiceMode.isThinking = false; VoiceMode.isListening = false; VoiceMode.userStopped = true;
  const reply = [copy.message, copy.support].filter(Boolean).join(' ');
  VoiceMode.conversationHistory.push({ role: 'bot', text: reply, source: 'builtin', emergency: true });
  persistVoiceAssistantTranscript(sessionUserMessage, reply, { source: 'builtin', emergency: true, emergencyData: copy, selfHarm: emergency.kind === 'selfHarm' });
  VoiceMode.replyMessage = null; renderVoiceMode();
  playStandaloneVoiceText(reply, false);
}
async function processVoiceInput(text) {
  text = String(text || '').trim();
  if (!text || !VoiceMode.isOpen) return;
  const urgentMatch = detectEmergency(text);
  if (VoiceMode.pending && !urgentMatch) return;
  if (AI.pending && !urgentMatch) { toast('Sahaara is still answering. Please wait a moment.'); return; }
  if (urgentMatch) {
    if (VoiceMode.pending || AI.pending) {
      cancelVoicePlayback('user-stop', true);
      AI.requestSeq++; AI.pending = false; AI.isThinking = false; AI.currentStreamMessageId = null;
      VoiceMode.pending = false;
    }
  }
  VoiceMode.processingTranscript = true; VoiceMode.pending = true; VoiceMode.isListening = false; VoiceMode.userStopped = true;
  VoiceMode.noticeText = ''; VoiceMode.currentTranscript = ''; VoiceMode.recognitionFinalBuffer = '';
  if (VoiceMode.silenceTimer) { clearTimeout(VoiceMode.silenceTimer); VoiceMode.silenceTimer = null; }
  if (VoiceMode.recognition) { try { VoiceMode.recognition.stop(); } catch (_) {} }
  VoiceMode.conversationHistory.push({ role: 'user', text: text });
  const sessionUserMessage = persistVoiceUserTranscript(text);
  const emergency = urgentMatch;
  if (emergency) { VoiceMode.pending = false; VoiceMode.processingTranscript = false; if (window.CTBackend) { try { window.CTBackend.logEmergency(text, emergency.kind, emergency.kind === 'selfHarm', 'voice'); } catch (e) {} } voiceEmergency(text, emergency, sessionUserMessage); return; }
  const localReply = runVoiceLocalCommand(text);
  if (localReply) {
    VoiceMode.pending = false; VoiceMode.processingTranscript = false;
    const reply = typeof localReply === 'string' ? localReply : localReply.text;
    VoiceMode.conversationHistory.push({ role: 'bot', text: reply, source: 'local' });
    persistVoiceAssistantTranscript(sessionUserMessage, reply, { source: 'local' });
    if (localReply && typeof localReply === 'object' && localReply.repeat === true) {
      const previous = VoiceMode.conversationHistory.filter(function(item) { return item.role === 'bot' && item.source !== 'local'; }).slice(-1)[0];
      playStandaloneVoiceText(previous ? previous.text : reply, VoiceMode.autoListen);
    } else playStandaloneVoiceText(reply, VoiceMode.autoListen);
    return;
  }
  AI.stopRequested = false;
  const turn = ++VoiceMode.turnId;
  VoiceMode.isThinking = true; VoiceMode.isSpeaking = false; VoiceMode.speechQueue = []; VoiceMode.speechBuffer = ''; VoiceMode.speechStreamDone = false; VoiceMode.speechPlaying = false; VoiceMode.fillerActive = false; VoiceMode.voiceFirstToken = false;
  const botMessage = { role: 'bot', text: '', source: 'streaming' };
  VoiceMode.replyMessage = botMessage; VoiceMode.conversationHistory.push(botMessage);
  renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('thinking');
  VoiceMode.fillerTimer = setTimeout(function() {
    VoiceMode.fillerTimer = null;
    if (!VoiceMode.isOpen || turn !== VoiceMode.turnId || !VoiceMode.pending || VoiceMode.voiceFirstToken) return;
    VoiceMode.fillerActive = true; VoiceMode.isThinking = false; VoiceMode.isSpeaking = true;
    renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('speaking');
    speakVoiceMode(voiceLocalText('ack'), function() {
      if (!VoiceMode.isOpen || turn !== VoiceMode.turnId) return;
      VoiceMode.fillerActive = false; VoiceMode.isSpeaking = false;
      if (VoiceMode.pending) { VoiceMode.isThinking = true; renderVoiceMode(); if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.setState('thinking'); }
      playNextVoiceSentence();
    });
  }, 1500);
  let gotToken = false;
  const onToken = function(chunk) {
    if (!VoiceMode.isOpen || turn !== VoiceMode.turnId || !chunk) return;
    gotToken = true; VoiceMode.voiceFirstToken = true;
    if (VoiceMode.fillerTimer) { clearTimeout(VoiceMode.fillerTimer); VoiceMode.fillerTimer = null; }
    botMessage.text += chunk; // Hold streamed text until the complete reply passes the safety guard.
  };
  const onReset = function() {
    if (turn !== VoiceMode.turnId) return;
    gotToken = false; botMessage.text = ''; VoiceMode.speechQueue = []; VoiceMode.speechBuffer = ''; VoiceMode.voiceFirstToken = false; updateVoiceAnswerOnly();
  };
  let result;
  try {
    result = await requestAIResponse(text, VoiceMode.context, { voiceMode: true, onToken: onToken, onReset: onReset });
  } catch (error) { result = { text: getSafeFallbackText(), source: 'builtin', error: (error && error.message) || 'Unexpected error' }; }
  if (!VoiceMode.isOpen || turn !== VoiceMode.turnId) return;
  if (VoiceMode.fillerTimer) { clearTimeout(VoiceMode.fillerTimer); VoiceMode.fillerTimer = null; }
  VoiceMode.pending = false; VoiceMode.processingTranscript = false; VoiceMode.userStopped = false;
  const safeResult = guardSahaaraOutput(result.text || botMessage.text || '');
  botMessage.text = safeResult.text; botMessage.source = result.source || 'builtin'; botMessage.error = result.error || null;
  if (safeResult.replaced) botMessage.safetyReplaced = true;
  VoiceMode.speechBuffer = ''; updateVoiceAnswerOnly();
  persistVoiceAssistantTranscript(sessionUserMessage, botMessage.text, { source: botMessage.source, error: botMessage.error, interrupted: !!result.cancelled });
  if (result.error) toast('AI service unavailable. This reply uses built-in guidance, not the AI provider.', true);
  if (botMessage.text) { VoiceMode.speechBuffer = ''; enqueueVoiceSentence(botMessage.text); }
  VoiceMode.speechStreamDone = true; drainVoiceSpeechBuffer(true);
  if (!VoiceMode.speechPlaying && !VoiceMode.fillerActive) {
    VoiceMode.isThinking = false;
    if (VoiceMode.speechQueue.length) playNextVoiceSentence(); else finishVoiceAnswer();
  }
  renderVoiceMode();
}
function speakVoiceMode(text, onEnd) {
  const finishOnce = (function() { let fired = false; return function() { if (fired) return; fired = true; if (typeof onEnd === 'function') onEnd(); }; })();
  const clean = cleanSpeechText(text);
  const callTurn = VoiceMode.turnId;
  const provider = typeof VoiceMode.ttsProvider === 'function' ? VoiceMode.ttsProvider : (typeof window.CareTrackCloudTTS === 'function' ? window.CareTrackCloudTTS : null);
  const browserAvailable = !!(VoiceMode.synthesis && typeof SpeechSynthesisUtterance !== 'undefined');
  if (!clean || VoiceMode.muted) { finishOnce(); return; }
  const isCurrent = function() { return VoiceMode.isOpen && VoiceMode.turnId === callTurn && !VoiceMode.muted; };
  const useBrowser = function() {
    if (!isCurrent()) return;
    if (!browserAvailable) { finishOnce(); return; }
    const chunks = splitSpeechChunks(clean, 220); let index = 0;
    if (!chunks.length) { finishOnce(); return; }
    try { VoiceMode.synthesis.cancel(); } catch (_) {}
    const speakNext = function() {
      if (!isCurrent()) return;
      if (index >= chunks.length) { finishOnce(); return; }
      let boundarySeen = false;
      const utterance = makeSpeechUtterance(chunks[index++], AI.language);
      const tuning = speechTuning(AI.language);
      utterance.rate = Math.max(0.72, Math.min(1.18, tuning.rate * (VoiceMode.speechRate || 0.94)));
      utterance.pitch = tuning.pitch;
      utterance.onboundary = function(event) {
        boundarySeen = true;
        if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.pulseFromSpeech(event && event.charLength ? Math.min(1, 0.32 + event.charLength / 18) : 0.58);
      };
      utterance.onstart = function() { if (VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.pulseFromSpeech(0.36); };
      const pulseTimer = setInterval(function() {
        if (isCurrent() && !boundarySeen && VoiceMode.isSpeaking && VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.pulseFromSpeech(0.3 + 0.36 * Math.max(0, Math.sin(performance.now() * 0.028)) * (0.7 + 0.3 * Math.sin(performance.now() * 0.0071)));
      }, 170);
      VoiceMode.ttsPulseTimers.push(pulseTimer);
      const releasePulse = function() { clearInterval(pulseTimer); VoiceMode.ttsPulseTimers = VoiceMode.ttsPulseTimers.filter(function(timer) { return timer !== pulseTimer; }); };
      utterance.onend = function() { releasePulse(); speakNext(); };
      utterance.onerror = function() { releasePulse(); if (isCurrent()) speakNext(); else finishOnce(); };
      try { VoiceMode.synthesis.speak(utterance); } catch (_) { releasePulse(); finishOnce(); }
    };
    speakNext();
  };
  if (!provider) { useBrowser(); return; }
  Promise.resolve().then(function() {
    return provider({ text: clean, language: AI.language, speechCode: (LANGUAGES[AI.language] && LANGUAGES[AI.language].speechCode) || 'en-IN' });
  }).then(function(result) {
    if (!isCurrent()) return;
    if (!result) { useBrowser(); return; }
    let src = ''; let blob = null;
    if (typeof result === 'string') src = result;
    else if (typeof Blob !== 'undefined' && result instanceof Blob) blob = result;
    else if (result.blob && typeof Blob !== 'undefined' && result.blob instanceof Blob) blob = result.blob;
    else src = result.url || result.audioUrl || '';
    if (blob) { VoiceMode.audioObjectUrl = URL.createObjectURL(blob); src = VoiceMode.audioObjectUrl; }
    if (!src || typeof Audio === 'undefined') { useBrowser(); return; }
    const audio = new Audio(src); VoiceMode.activeAudio = audio;
    const pulseTimer = setInterval(function() { if (isCurrent() && VoiceMode.isSpeaking && VoiceMode.voice3dOrb) VoiceMode.voice3dOrb.pulseFromSpeech(0.3 + 0.4 * Math.max(0, Math.sin(performance.now() * 0.026)) * (0.7 + 0.3 * Math.sin(performance.now() * 0.0063))); }, 150);
    VoiceMode.ttsPulseTimers.push(pulseTimer);
    const release = function() {
      clearInterval(pulseTimer); VoiceMode.ttsPulseTimers = VoiceMode.ttsPulseTimers.filter(function(timer) { return timer !== pulseTimer; }); if (VoiceMode.activeAudio === audio) VoiceMode.activeAudio = null;
      if (VoiceMode.audioObjectUrl) { try { URL.revokeObjectURL(VoiceMode.audioObjectUrl); } catch (_) {} VoiceMode.audioObjectUrl = null; }
    };
    audio.onended = function() { release(); if (isCurrent()) finishOnce(); };
    audio.onerror = function() { release(); if (isCurrent()) useBrowser(); };
    const playPromise = audio.play();
    if (playPromise && playPromise.catch) playPromise.catch(function() { try { audio.pause(); } catch (_) {} release(); if (isCurrent()) useBrowser(); });
  }).catch(function() { if (isCurrent()) useBrowser(); });
}
function toggleVoiceMute() {
  VoiceMode.muted = !VoiceMode.muted;
  if (VoiceMode.muted) {
    if (VoiceMode.fillerTimer) { clearTimeout(VoiceMode.fillerTimer); VoiceMode.fillerTimer = null; }
    if (VoiceMode.synthesis) { try { VoiceMode.synthesis.cancel(); } catch (_) {} }
    if (VoiceMode.activeAudio) { try { VoiceMode.activeAudio.pause(); } catch (_) {} VoiceMode.activeAudio = null; }
    (VoiceMode.ttsPulseTimers || []).forEach(function(timer) { clearInterval(timer); }); VoiceMode.ttsPulseTimers = [];
    if (VoiceMode.audioObjectUrl) { try { URL.revokeObjectURL(VoiceMode.audioObjectUrl); } catch (_) {} VoiceMode.audioObjectUrl = null; }
    VoiceMode.isSpeaking = false; VoiceMode.speechPlaying = false; VoiceMode.speechQueue = []; VoiceMode.speechBuffer = '';
    VoiceMode.fillerActive = false;
    if (VoiceMode.pending) { VoiceMode.isThinking = true; }
    else { VoiceMode.speechStreamDone = true; VoiceMode.isThinking = false; finishVoiceAnswer(); }
  }
  if (VoiceMode.isOpen) renderVoiceMode();
  toast(VoiceMode.muted ? 'AI voice muted' : 'AI voice enabled');
}
function toggleAutoListen() {
  VoiceMode.autoListen = !VoiceMode.autoListen;
  if (!VoiceMode.autoListen) {
    VoiceMode.userStopped = true;
    if (VoiceMode.isListening && VoiceMode.recognition) { try { VoiceMode.recognition.stop(); } catch (_) {} }
    VoiceMode.isListening = false;
  } else if (VoiceMode.isOpen && !VoiceMode.pending && !VoiceMode.isSpeaking) {
    VoiceMode.userStopped = false; startVoiceListening({ automatic: true });
  }
  if (VoiceMode.isOpen) renderVoiceMode();
  toast(VoiceMode.autoListen ? 'Auto-listen on — will keep listening' : 'Auto-listen off — tap the orb to speak');
}
if (VoiceMode.synthesis) {
  VoiceMode.synthesis.getVoices();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = function() {};
  }
}