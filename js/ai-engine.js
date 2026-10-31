/**
 * Sahaara AI — Intelligent Clinical Assistant & Emergency SOS Suite
 */

const AI = {
  messages: [], panelOpen: false, isListening: false, isSpeaking: false, isThinking: false,
  pending: false, llmVerified: false, lastLLMError: null, micDenied: false, recognition: null,
  synthesis: window.speechSynthesis || null, voiceEnabled: true, conversations: [], language: 'en', autoTranslate: true,
  conversationContext: [], smartMode: true, sessions: [], currentSessionId: null, sessionsLoaded: false,
  drafts: { panel: '', full: '' }, activeController: null, requestSeq: 0, currentStreamMessageId: null,
  stopRequested: false, speechGeneration: 0,
};
var AI_SESS_KEY = 'caretrack.ai_sessions.v1';
function loadSessions() {
  try {
    var raw = store.get(AI_SESS_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.sessions)) {
        AI.sessions = data.sessions.filter(function(s) {
          return s && typeof s === 'object' && typeof s.id === 'string' && s.id;
        }).map(function(s) {
          if (!Array.isArray(s.messages)) s.messages = [];
          s.messages = s.messages.filter(function(m) {
            return m && typeof m === 'object' && typeof m.text === 'string' && (m.role === 'user' || m.role === 'bot');
          });
          if (!Array.isArray(s.context)) s.context = [];
          if (typeof s.title !== 'string') s.title = 'New Chat';
          return s;
        });
        AI.currentSessionId = data.currentSessionId || null;
      }
    }
  } catch(e) {
    console.warn('CareTrack: AI session storage was corrupt and has been reset.');
    AI.sessions = [];
    AI.currentSessionId = null;
  }
  AI.sessionsLoaded = true;
  if (AI.sessions.length === 0) createNewSession('New Chat', true);
  loadCurrentSession();
}
function saveSessions() {
  syncCurrentSession();
  try { store.set(AI_SESS_KEY, JSON.stringify({ sessions: AI.sessions, currentSessionId: AI.currentSessionId })); } catch(e) {}
  if (window.CTBackend) { try { window.CTBackend.pushSessions(AI.sessions, AI.currentSessionId); } catch (e) {} }
}
function syncCurrentSession() {
  if (!AI.currentSessionId) return;
  var sess = AI.sessions.find(function(s) { return s.id === AI.currentSessionId; });
  if (sess) {
    sess.messages = AI.messages.slice();
    sess.context = AI.conversationContext.slice();
    sess.updatedAt = new Date().toISOString();
    sess.messageCount = AI.messages.length;
    sess.language = AI.language;
    if (!sess.title || sess.title === 'New Chat') {
      var fu = AI.messages.find(function(m) { return m.role === 'user'; });
      if (fu) sess.title = fu.text.substring(0, 40).trim() || 'New Chat';
    }
  }
}
function loadCurrentSession() {
  if (!AI.currentSessionId) { AI.messages = []; AI.conversationContext = []; return; }
  var sess = AI.sessions.find(function(s) { return s.id === AI.currentSessionId; });
  if (sess) { AI.messages = sess.messages || []; AI.conversationContext = sess.context || []; if (sess.language) AI.language = sess.language; }
  else { AI.messages = []; AI.conversationContext = []; }
}
function createNewSession(title, setActive) {
  var sess = {
    id: 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
    title: title || 'New Chat',
    messages: [],
    context: [],
    language: AI.language,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
  };
  AI.sessions.unshift(sess);
  if (setActive !== false) { AI.currentSessionId = sess.id; AI.messages = []; AI.conversationContext = []; }
  saveSessions();
  if (setActive !== false && VoiceMode.isOpen) { VoiceMode.context = []; initializeVoiceTranscriptHistory(); renderVoiceMode(); }
  return sess;
}
function switchSession(sid) {
  syncCurrentSession();
  AI.currentSessionId = sid;
  loadCurrentSession();
  saveSessions();
  refreshAIDisplay();
  if (VoiceMode.isOpen) { VoiceMode.context = AI.conversationContext.slice(); initializeVoiceTranscriptHistory(); renderVoiceMode(); }
}
function deleteSession(sid) {
  const deletingActive = AI.currentSessionId === sid;
  deleteVoiceTranscriptSession(sid);
  if (window.CTBackend) { try { window.CTBackend.deleteSession(sid); } catch (e) {} }
  AI.sessions = AI.sessions.filter(function(s) { return s.id !== sid; });
  if (deletingActive) {
    if (AI.sessions.length > 0) { AI.currentSessionId = AI.sessions[0].id; loadCurrentSession(); }
    else createNewSession('New Chat', true);
  }
  saveSessions();
  refreshAIDisplay();
  if (deletingActive && VoiceMode.isOpen) { VoiceMode.context = AI.conversationContext.slice(); initializeVoiceTranscriptHistory(); renderVoiceMode(); }
}
function sessDate(sess) {
  var d = new Date(sess.updatedAt || sess.createdAt); var now = new Date(); var diff = now - d;
  if (diff < 60000) return 'now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const AI_CONFIG = {
  LLM_ENDPOINT: '/api/chat',
  LLM_MODEL: 'chatgpt',
  MAX_CONTEXT_TURNS: 10,
  MAX_CONTEXT_TOKENS: 4200,
  TEMPERATURE: 0.45,
  REQUEST_TIMEOUT_MS: 30000,
  TRANSLATE_ENDPOINT: '',
};
const LANGUAGES = {
  'en':    { name: 'English',    native: 'English',    speechCode: 'en-IN', flag: '🇬🇧' },
  'hi':    { name: 'Hindi',      native: 'हिन्दी',      speechCode: 'hi-IN', flag: '🇮🇳' },
  'hi-Latn': { name: 'Hinglish', native: 'Hinglish',   speechCode: 'en-IN', flag: '🇮🇳' },
  'mr':    { name: 'Marathi',    native: 'मराठी',      speechCode: 'mr-IN', flag: '🇮🇳' },
  'bn':    { name: 'Bengali',    native: 'বাংলা',      speechCode: 'bn-IN', flag: '🇮🇳' },
  'ta':    { name: 'Tamil',      native: 'தமிழ்',      speechCode: 'ta-IN', flag: '🇮🇳' },
  'te':    { name: 'Telugu',     native: 'తెలుగు',     speechCode: 'te-IN', flag: '🇮🇳' },
  'gu':    { name: 'Gujarati',   native: 'ગુજરાતી',    speechCode: 'gu-IN', flag: '🇮🇳' },
  'kn':    { name: 'Kannada',    native: 'ಕನ್ನಡ',      speechCode: 'kn-IN', flag: '🇮🇳' },
  'ml':    { name: 'Malayalam',  native: 'മലയാളം',    speechCode: 'ml-IN', flag: '🇮🇳' },
  'pa':    { name: 'Punjabi',    native: 'ਪੰਜਾਬੀ',     speechCode: 'pa-IN', flag: '🇮🇳' },
  'ur':    { name: 'Urdu',       native: 'اردو',       speechCode: 'ur-IN', flag: '🇮🇳' },
};
const TRANSLATIONS = {
  'hi': {
    "Hello": "नमस्ते",
    "Good morning": "सुप्रभात",
    "Good afternoon": "नमस्कार",
    "Good evening": "शुभ संध्या",
    "How can I help you today?": "आज मैं आपकी कैसे मदद कर सकता हूँ?",
    "I'm Sahaara": "मैं सहारा हूँ",
    "your self-care plan": "आपकी आत्म-देखभाल योजना",
    "patient guidance assistant": "रोगी मार्गदर्शन सहायक",
    "Today's plan": "आज की योजना",
    "completed": "पूर्ण",
    "missed": "छूट गया",
    "skipped": "छोड़ दिया",
    "upcoming": "आगामी",
    "due now": "अभी बाकी",
    "adherence": "पालन",
    "prescription": "परामर्श",
    "diet": "आहार",
    "exercise": "व्यायाम",
    "physical activity": "शारीरिक गतिविधि",
    "sleep": "नींद",
    "hydration": "जल-आपूर्ति",
    "stress management": "तनाव प्रबंधन",
    "breathing": "श्वास",
    "Well done!": "बहुत अच्छा!",
    "Take care": "अपना ख्याल रखें",
    "You're welcome": "कोई बात नहीं",
    "Remember": "याद रखें",
    "your healthcare provider": "आपके चिकित्सक",
    "Would you like help": "क्या आप मदद चाहेंगे",
    "Great job": "बहुत बढ़िया",
    "Don't worry": "चिंता न करें",
    "Let me help": "मैं मदद करता हूँ",
    "self-care": "आत्म-देखभाल",
    "activities": "गतिविधियाँ",
    "progress": "प्रगति",
    "task": "कार्य",
    "report": "रिपोर्ट",
  },
  'ta': {
    "Hello": "வணக்கம்",
    "Good morning": "காலை வணக்கம்",
    "completed": "முடிந்தது",
    "missed": "தவறவிட்டது",
    "self-care": "சுய பராமரிப்பு",
    "Today's plan": "இன்றைய திட்டம்",
    "diet": "உணவு",
    "exercise": "உடற்பயிற்சி",
    "sleep": "தூக்கம்",
    "Take care": "கவனித்துக் கொள்ளுங்கள்",
  },
  'te': {
    "Hello": "నమస్కారం",
    "Good morning": "శుభోదయం",
    "completed": "పూర్తయింది",
    "missed": "మిస్ అయింది",
    "self-care": "స్వీయ సంరక్షణ",
    "Today's plan": "నేటి ప్రణాళిక",
    "diet": "ఆహారం",
    "exercise": "వ్యాయామం",
    "sleep": "నిద్ర",
    "Take care": "జాగ్రత్తగా ఉండండి",
  },
  'bn': {
    "Hello": "নমস্কার",
    "Good morning": "সুপ্রভাত",
    "completed": "সম্পন্ন",
    "missed": "মিস হয়েছে",
    "self-care": "আত্ম-যত্ন",
    "Today's plan": "আজকের পরিকল্পনা",
    "diet": "খাদ্য",
    "exercise": "ব্যায়াম",
    "sleep": "ঘুম",
    "Take care": "যত্ন নিন",
  },
};
function translateText(text, targetLang) {
  if (!targetLang || targetLang === 'en' || !AI.autoTranslate) return text;
  const dict = TRANSLATIONS[targetLang];
  if (!dict) return text;
  let result = text;
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (result.includes(key)) {
      result = result.replace(new RegExp(escapeRegex(key), 'gi'), dict[key]);
    }
  }
  return result;
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
async function translateOnline(text, targetLang) {
  if (!AI_CONFIG.TRANSLATE_ENDPOINT) return null;
  try {
    const resp = await fetch(AI_CONFIG.TRANSLATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source: 'en', target: targetLang })
    });
    if (resp.ok) {
      const data = await resp.json();
      return data.text || null;
    }
  } catch(e) { return null; }
  return null;
}
function toggleAIPanel() {
  AI.panelOpen = !AI.panelOpen;
  const panel = document.getElementById('ai-panel');
  if (!panel) return;
  const isMobile = window.innerWidth <= 640;
  panel.className = 'ai-panel ' + (isMobile ? 'mobile' : 'desktop') + (AI.panelOpen ? ' open' : ' closed');
  if (AI.panelOpen) {
    renderAIPanel();
    if (AI.messages.length === 0) {
      AI.messages.push({
        id: uid(),
        role: 'bot',
        text: getGreeting(),
        time: new Date().toISOString(),
        source: 'builtin'
      });
      saveSessions();
      renderAIPanel();
    }
    restoreAIDrafts(); // bring back anything the user had typed before closing
    setTimeout(() => {
      const inp = document.getElementById('ai-input-panel');
      if (inp) inp.focus();
    }, 80);
  } else {
    if (AI.isListening && AI.recognition) { try { AI.recognition.abort(); } catch(e) {} }
    AI.isListening = false;
    if (AI.synthesis && AI.isSpeaking) { try { AI.synthesis.cancel(); } catch(e) {} AI.isSpeaking = false; }
  }
}
function closeAIPanel() {
  if (!AI.panelOpen) return;
  captureAIDrafts(); // remember half-typed text so reopening restores it
  AI.panelOpen = false;
  const panel = document.getElementById('ai-panel');
  if (panel) {
    panel.className = 'ai-panel ' + (window.innerWidth <= 640 ? 'mobile' : 'desktop') + ' closed';
  }
  if (AI.isListening && AI.recognition) { try { AI.recognition.abort(); } catch(e) {} }
  AI.isListening = false;
  if (AI.synthesis && AI.isSpeaking) { try { AI.synthesis.cancel(); } catch(e) {} AI.isSpeaking = false; }
}
window.addEventListener('resize', function() {
  const panel = document.getElementById('ai-panel');
  if (panel && AI.panelOpen) {
    const isMobile = window.innerWidth <= 640;
    panel.classList.toggle('mobile', isMobile);
    panel.classList.toggle('desktop', !isMobile);
  }
});
function renderAIPanel() {
  const panel = document.getElementById('ai-panel');
  if (!panel) return;
  const previous = document.getElementById('ai-msgs-panel');
  const oldTop = previous ? previous.scrollTop : 0;
  const nearBottom = !previous || previous.scrollHeight - previous.scrollTop - previous.clientHeight < 110;
  panel.innerHTML = renderAIChatUI('panel');
  restoreChatScroll('ai-msgs-panel', nearBottom, oldTop);
}
function renderAIPage() {
  return `
  <div class="page-h"><div><h1>${ic('sparkles')} Sahaara AI Assistant</h1><p class="muted">Your personal patient guidance assistant — voice-enabled</p></div></div><div class="banner brand mb16">
    ${ic('info', 16)}
    <div><strong>About Sahaara:</strong> An AI guidance assistant designed to help patients understand and manage their self-care plans. Sahaara can answer questions about your prescriptions, help you navigate the app, and provide self-care guidance. <em>Sahaara is not a substitute for professional medical advice.</em></div></div><div class="ai-full-chat" id="ai-full-chat">
    ${renderAIChatInner('full')}
  </div>`;
}
function renderAIChatUI(mode) {
  const suffix = mode === 'panel' ? '-panel' : '-full';
  return renderAIChatInner(mode);
}
function renderSessionsSidebar(mode) {
  var items = AI.sessions.map(function(s) {
    var isActive = s.id === AI.currentSessionId;
    return '<div class="sess-item' + (isActive ? ' active' : '') + '" role="button" tabindex="0" aria-current="' + isActive + '" onclick="switchSession(\'' + s.id + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();switchSession(\'' + s.id + '\')}" title="' + esc(s.title || 'New Chat') + '">' +
      '<span class="sess-icon">' + (s.messages && s.messages.length > 0 ? '💬' : ic('sparkles', 14)) + '</span>' +
      '<div style="flex:1;min-width:0"><div class="sess-title">' + esc(s.title || 'New Chat') + '</div>' +
      '<div class="sess-meta">' + sessDate(s) + ' · ' + (s.messageCount || 0) + ' msgs</div></div>' +
      '<span class="sess-del" onclick="event.stopPropagation();deleteSession(\'' + s.id + '\')" title="Delete">✕</span>' +
      '</div>';
  }).join('');
  return '<div class="ai-sessions">' +
    '<div class="ai-sessions-hdr"><h4>Conversations</h4>' +
    '<button class="btn btn-sm btn-p" style="height:26px;min-height:26px;padding:0 8px;font-size:11px" onclick="newChatSession()" title="New chat">+ New</button></div>' +
    '<div class="ai-sessions-list">' + items + '</div>' +
    '</div>';
}
function newChatSession() {
  var sess = createNewSession('New Chat', true);
  AI.messages = [{ id: uid(), role: 'bot', text: getGreeting(), time: new Date().toISOString() }];
  saveSessions();
  refreshAIDisplay();
}
function renderAIChatInner(mode) {
  var statusClass = AI.isListening ? 'listening' : AI.isThinking ? 'thinking' : AI.isSpeaking ? 'speaking' : '';
  var idleStatus = AI_CONFIG.LLM_ENDPOINT && AI.llmVerified
    ? 'Smart AI connected'
    : 'Clinical Guidance Active';
  var statusText = AI.isListening ? 'Listening...' : AI.isThinking ? 'Thinking...' : AI.isSpeaking ? 'Speaking...' : idleStatus;
  var statusDot = statusClass ? '<span class="dot"></span>' : '<span class="dot" style="background:var(--ok-text)"></span>';
  var langOptions = Object.keys(LANGUAGES).map(function(code) {
    var lang = LANGUAGES[code];
    return '<option value="' + esc(code) + '"' + (AI.language === code ? ' selected' : '') + '>' + lang.flag + ' ' + esc(lang.native) + '</option>';
  }).join('');
  var quickChips = getQuickReplyChips();
  var sidebar = mode === 'full' ? renderSessionsSidebar(mode) : '';
  var quickHtml = quickChips.map(function(c) {
    var encoded = encodeURIComponent(c).replace(/'/g, '%27');
    return '<button class="ai-quick-chip" onclick="sendAIQuickEncoded(\'' + encoded + '\')">' + esc(c) + '</button>';
  }).join('');
  return '<div class="ai-chat-layout">' + sidebar + '<div class="ai-chat-main">' +
    '<div class="ai-header"><div class="ai-title"><div class="ai-avatar">' + ic('sparkles', 20) + '</div><div>' +
    '<h3>Sahaara ' + (AI.llmVerified
      ? '<span class="chip ok" style="font-size:9px;margin-left:4px">Smart AI</span>'
      : '<span class="chip ok" style="font-size:9px;margin-left:4px">Active</span>') + '</h3>' +
    '<div class="ai-status ' + statusClass + '">' + statusDot + ' ' + esc(statusText) + '</div>' +
    '</div></div><div class="row gap2">' +
    (mode === 'full' ? '' : '<button class="btn btn-sm btn-g btn-ic" style="height:32px;min-height:32px;width:32px" onclick="newChatSession()" title="New chat" aria-label="New chat">' + ic('plus', 16) + '</button>') +
    '<select class="input" style="width:auto;max-width:96px;min-height:32px;height:32px;font-size:11px;padding:2px 6px;border-radius:8px;cursor:pointer" onchange="setAILanguage(this.value)" title="Language" aria-label="Language">' + langOptions + '</select>' +
    '<button class="btn btn-sm btn-g btn-ic" style="height:32px;min-height:32px;width:32px" onclick="toggleAIVoice()" title="' + (AI.voiceEnabled ? 'Mute voice' : 'Enable voice') + '" aria-label="' + (AI.voiceEnabled ? 'Mute voice' : 'Enable voice') + '">' + ic(AI.voiceEnabled ? 'volume-2' : 'mic-off', 16) + '</button>' +
    (mode === 'full' ? '' : '<button class="btn btn-sm btn-g btn-ic" style="height:32px;min-height:32px;width:32px" onclick="closeAIPanel()" aria-label="Close" title="Close">' + ic('x', 16) + '</button>') +
    '</div></div>' +
    '<div class="ai-quick-actions" aria-label="Suggested questions">' + quickHtml + '</div>' +
    '<div class="ai-messages" id="ai-msgs-' + (mode === 'panel' ? 'panel' : 'full') + '" aria-live="polite">' +
    AI.messages.map(function(m) { return renderAIMessage(m); }).join('') +
    (AI.isThinking
      ? '<div class="ai-msg bot ai-thinking-indicator" aria-live="polite"><div class="msg-avatar">' + ic('sparkles', 16) + '</div><div class="msg-body"><div class="ai-typing" role="status" aria-label="Sahaara is thinking"><span></span><span></span><span></span></div><div class="meta">Sahaara is thinking…</div></div></div>'
      : '') +
    '</div>' +
    (AI.pending ? '<div class="ai-compose-tools"><button class="ai-stop-btn" onclick="stopAIGeneration()" aria-label="Stop generating">Stop generating</button></div>' : '') +
    '<div class="ai-compose">' +
    '<button class="mic-btn ' + (AI.isListening ? 'recording' : '') + '" onclick="toggleVoiceInput()" title="' + (AI.isListening ? 'Stop listening' : 'Speak') + '" aria-label="' + (AI.isListening ? 'Stop listening' : 'Start voice input') + '">' + ic('mic', 18) + '</button>' +
    '<div class="input-wrap"><textarea id="ai-input-' + (mode === 'panel' ? 'panel' : 'full') + '" placeholder="' + (AI.isThinking ? 'Sahaara is responding…' : (AI.language === 'hi' ? 'सहारा से कुछ भी पूछें...' : 'Ask Sahaara anything...')) + '" rows="1" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendAIMessage(\'' + mode + '\')}" oninput="autoGrow(this)"></textarea></div>' +
    '<button class="send-btn" onclick="sendAIMessage(\'' + mode + '\')" aria-label="Send message" ' + (AI.pending ? 'disabled title="Waiting for the current response"' : '') + '>' + ic('send', 18) + '</button>' +
    '</div></div></div>';
}
function renderAIMessage(m) {
  const time = new Date(m.time);
  const timeStr = isNaN(time.getTime()) ? '' : time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const avatar = m.role === 'bot' ? ic('sparkles', 16) : '👤';
  let srcLabel = '';
  if (m.role === 'bot') {
    if (m.error) srcLabel = ' · Built-in fallback (backend unavailable)';
    else if (m.source === 'llm') srcLabel = ' · AI';
    else if (m.source === 'builtin') srcLabel = ' · Offline guidance';
    else if (m.source === 'local') srcLabel = ' · Local voice command';
    if (m.voiceMode) srcLabel += ' · Voice reply';
    if (m.interrupted) srcLabel += ' · stopped';
  } else if (m.source === 'voice') {
    srcLabel = ' · Voice transcript';
  }
  const titleAttr = (m.role === 'bot' && m.error) ? ' title="' + esc(m.error) + '"' : '';
  const messageBody = m.emergency
    ? renderEmergencyCard(m.emergencyData || getEmergencyCopy(AI.language, !!m.selfHarm))
    : renderMarkdownLite(m.text || '');
  const streamId = m.streaming ? ' id="ai-stream-' + esc(m.id) + '"' : '';
  const actions = m.role === 'bot' && !m.emergency
    ? '<div class="ai-msg-actions"><button type="button" onclick="copyAIMessage(\'' + esc(m.id) + '\')" aria-label="Copy message" title="Copy message">Copy</button>' +
      (m.error ? '<button type="button" onclick="retryAIMessage(\'' + esc(m.id) + '\')" aria-label="Retry response">Retry</button>' : '') + '</div>'
    : '';
  const bubbleClass = m.emergency ? 'bubble emergency-bubble' : 'bubble';
  return '<div class="ai-msg ' + (m.role === 'bot' ? 'bot' : 'user') + '" data-msg-id="' + esc(m.id || '') + '">' +
    '<div class="msg-avatar" aria-hidden="true">' + avatar + '</div><div class="msg-body">' +
    '<div class="' + bubbleClass + '"' + streamId + titleAttr + '>' + messageBody + '</div>' + actions +
    '<div class="meta">' + esc(timeStr) + esc(srcLabel) + '</div></div></div>';
}
function renderMarkdownLite(text) {
  const source = esc(String(text == null ? '' : text).replace(/\u0000/g, ''));
  const lines = source.replace(/\r/g, '').split('\n');
  let out = '', listType = '', paragraph = [], quote = [], code = null;
  const inline = function(s) {
    const keep = [];
    const stash = function(html) { keep.push(html); return '\u0000' + (keep.length - 1) + '\u0000'; };
    s = s.replace(/`([^`]+)`/g, function(_, c) { return stash('<code>' + c + '</code>'); });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)/g, function(_, label, url) {
      return stash('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
    });
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    return s.replace(/\u0000(\d+)\u0000/g, function(_, i) { return keep[+i]; });
  };
  const flushParagraph = function() {
    if (paragraph.length) { out += '<p>' + inline(paragraph.join('<br>')) + '</p>'; paragraph = []; }
  };
  const flushQuote = function() {
    if (quote.length) { out += '<blockquote>' + inline(quote.join('<br>')) + '</blockquote>'; quote = []; }
  };
  const closeList = function() { if (listType) { out += '</' + listType + '>'; listType = ''; } };
  const flushAll = function() { flushParagraph(); flushQuote(); closeList(); };
  lines.forEach(function(line) {
    if (code !== null) {
      if (/^\s*```/.test(line)) { out += '<pre><code>' + code.join('\n') + '</code></pre>'; code = null; }
      else code.push(line);
      return;
    }
    if (/^\s*```/.test(line)) { flushAll(); code = []; return; }
    const heading = line.match(/^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/);
    const quoted = line.match(/^\s*&gt;\s?(.*)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    const numbered = line.match(/^\s*(\d+)[.)]\s+(.+)$/);
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushAll(); out += '<hr>'; }
    else if (heading) { flushAll(); out += '<div class="md-h md-h' + heading[1].length + '">' + inline(heading[2]) + '</div>'; }
    else if (quoted) { flushParagraph(); closeList(); quote.push(quoted[1]); }
    else if (bullet || numbered) {
      flushParagraph(); flushQuote();
      const nextType = numbered ? 'ol' : 'ul';
      if (listType !== nextType) {
        closeList();
        out += '<' + nextType + (numbered && numbered[1] !== '1' ? ' start="' + (parseInt(numbered[1], 10) || 1) + '"' : '') + '>';
        listType = nextType;
      }
      out += '<li>' + inline(numbered ? numbered[2] : bullet[1]) + '</li>';
    } else if (!line.trim()) { flushAll(); }
    else { flushQuote(); closeList(); paragraph.push(line); }
  });
  if (code !== null) out += '<pre><code>' + code.join('\n') + '</code></pre>'; // unfinished block while streaming
  flushAll();
  return out || '<span></span>';
}
function renderEmergencyCard(copy) {
  const title = copy && copy.title ? copy.title : 'Possible emergency';
  const message = copy && copy.message ? copy.message : 'Please call 112 in India now.';
  const support = copy && copy.support ? copy.support : '';
  const callLabel = copy && copy.callLabel ? copy.callLabel : 'Call 112';
  return '<div class="ai-emergency-card" role="alert"><strong>' + esc(title) + '</strong><p>' + esc(message) + '</p>' +
    (support ? '<p class="emergency-support">' + esc(support) + '</p>' : '') +
    '<a class="ai-emergency-call" href="tel:112" aria-label="' + esc(callLabel) + '">☎ ' + esc(callLabel) + '</a></div>';
}
function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}
function restoreChatScroll(id, wasAtBottom, oldTop) {
  const el = document.getElementById(id);
  if (!el) return;
  if (wasAtBottom) el.scrollTop = el.scrollHeight;
  else el.scrollTop = Math.min(oldTop || 0, Math.max(0, el.scrollHeight - el.clientHeight));
}
function scrollAIMessages(id, force) {
  requestAnimationFrame(function() {
    const el = document.getElementById(id);
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 110;
    if (force || nearBottom) el.scrollTop = el.scrollHeight;
  });
}
function sendAIQuick(text) { sendAIUserText(text); }
function sendAIQuickEncoded(encoded) {
  try { sendAIUserText(decodeURIComponent(String(encoded || ''))); }
  catch (_) { sendAIUserText(String(encoded || '')); }
}
function sendAIMessage(mode) {
  const inputId = 'ai-input-' + (mode === 'panel' ? 'panel' : 'full');
  const input = document.getElementById(inputId);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  AI.drafts[mode === 'panel' ? 'panel' : 'full'] = '';
  sendAIUserText(text);
}
async function sendAIUserText(text) {
  text = String(text || '').trim();
  if (!text) return;
  const emergency = detectEmergency(text);
  if (emergency) {
    AI.requestSeq++;
    if (AI.activeController) { try { AI.activeController.abort('user-stop'); } catch (_) {} }
    const interrupted = AI.currentStreamMessageId && AI.messages.find(function(message) { return message.id === AI.currentStreamMessageId; });
    if (interrupted) {
      interrupted.streaming = false; interrupted.interrupted = true;
      if (!String(interrupted.text || '').trim()) AI.messages = AI.messages.filter(function(message) { return message.id !== interrupted.id; });
    }
    AI.currentStreamMessageId = null;
    AI.pending = false; AI.isThinking = false; AI.stopRequested = false;
    const copy = getEmergencyCopy(AI.language, emergency.kind === 'selfHarm', emergency.kind);
    AI.messages.push({ id: uid(), role: 'user', text: text, time: new Date().toISOString() });
    AI.messages.push({ id: uid(), role: 'bot', text: [copy.message, copy.support].filter(Boolean).join(' '), time: new Date().toISOString(), source: 'builtin', emergency: true, emergencyData: copy, selfHarm: emergency.kind === 'selfHarm' });
    saveSessions(); refreshAIDisplay(); scrollAIMessages(AI.panelOpen ? 'ai-msgs-panel' : 'ai-msgs-full', true);
    if (AI.voiceEnabled && !VoiceMode.isOpen) speakAI([copy.message, copy.support].filter(Boolean).join(' '));
    return;
  }
  if (AI.pending || (VoiceMode.isOpen && VoiceMode.pending)) {
    toast('Sahaara is still working on your last message — one moment.');
    return;
  }
  const userMsg = { id: uid(), role: 'user', text: text, time: new Date().toISOString() };
  AI.messages.push(userMsg);
  return runAIChatRequest(text, userMsg);
}
async function runAIChatRequest(text, userMsg) {
  const requestId = ++AI.requestSeq;
  const botMsg = { id: uid(), role: 'bot', text: '', time: new Date().toISOString(), source: 'streaming', streaming: true };
  AI.messages.push(botMsg);
  AI.pending = true; AI.isThinking = true; AI.stopRequested = false; AI.currentStreamMessageId = botMsg.id;
  saveSessions(); refreshAIDisplay(); scrollAIMessages(AI.panelOpen ? 'ai-msgs-panel' : 'ai-msgs-full', true);
  const onToken = function(chunk) {
    if (requestId !== AI.requestSeq || !chunk) return;
    botMsg.text += chunk;
    updateStreamingMessage(botMsg);
  };
  const onReset = function() {
    if (requestId !== AI.requestSeq) return;
    botMsg.text = '';
    updateStreamingMessage(botMsg);
  };
  let res;
  try {
    res = await requestAIResponse(text, AI.conversationContext, { onToken: onToken, onReset: onReset });
  } catch (e) {
    res = { text: getSafeFallbackText(), source: 'builtin', error: (e && e.message) || 'Unexpected error' };
  }
  if (requestId !== AI.requestSeq) return;
  AI.pending = false; AI.isThinking = false; AI.lastLLMError = res.error || null; AI.currentStreamMessageId = null; AI.stopRequested = false;
  botMsg.text = res.text || botMsg.text || '';
  botMsg.streaming = false;
  botMsg.source = res.source || 'builtin';
  botMsg.error = res.error || null;
  botMsg.interrupted = !!res.cancelled;
  if (res.cancelled && !botMsg.text) AI.messages = AI.messages.filter(function(m) { return m.id !== botMsg.id; });
  saveSessions(); refreshAIDisplay();
  if (res.error && res.source !== 'builtin') toast('AI service unavailable — showing built-in guidance instead.', true);
  if (res.cancelled) return;
  if (AI.voiceEnabled && !VoiceMode.isOpen) speakAI(botMsg.text);
}
function stopAIGeneration() {
  if (!AI.pending) return;
  AI.stopRequested = true;
  if (AI.activeController) { try { AI.activeController.abort('user-stop'); } catch (_) {} }
  toast('Stopped generating.');
}
function updateStreamingMessage(message) {
  const nodes = ['ai-msgs-panel', 'ai-msgs-full'];
  nodes.forEach(function(id) {
    const root = document.getElementById(id);
    const bubble = document.getElementById('ai-stream-' + message.id);
    if (!root || !bubble || !root.contains(bubble)) return;
    const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 110;
    bubble.innerHTML = renderMarkdownLite(message.text);
    if (nearBottom) root.scrollTop = root.scrollHeight;
  });
}
function refreshAIDisplay() {
  captureAIDrafts();
  if (AI.panelOpen) renderAIPanel();
  const fullChat = document.getElementById('ai-full-chat');
  if (fullChat && State.route === 'ai') {
    const previous = document.getElementById('ai-msgs-full');
    const oldTop = previous ? previous.scrollTop : 0;
    const nearBottom = !previous || previous.scrollHeight - previous.scrollTop - previous.clientHeight < 110;
    fullChat.innerHTML = renderAIChatInner('full');
    restoreChatScroll('ai-msgs-full', nearBottom, oldTop);
  }
  restoreAIDrafts();
}
function captureAIDrafts() {
  ['panel', 'full'].forEach(m => {
    const el = document.getElementById('ai-input-' + m);
    if (el) AI.drafts[m] = el.value;
  });
}
function restoreAIDrafts() {
  ['panel', 'full'].forEach(m => {
    const el = document.getElementById('ai-input-' + m);
    if (el && AI.drafts[m]) { el.value = AI.drafts[m]; autoGrow(el); }
  });
}
function getGreeting() {
  const hour = new Date().getHours();
  let timeGreet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  if (State.profile) {
    const name = (State.profile && State.profile.name) ? State.profile.name.split(' ')[0] : 'there';
    return `${timeGreet}, ${name}! I'm Sahaara, your self-care guidance assistant. I'm here to help you understand your self-care plan, track your progress, and answer any questions about your daily health routines. How can I help you today?`;
  }
  return `${timeGreet}! I'm Sahaara, your self-care guidance assistant. I'm here to help you understand your self-care plan and manage your daily health routines. I notice you haven't set up your profile yet — would you like help getting started?`;
}
function getAIPlanContext() {
  const current = now();
  const today = todayStr(current);
  const occurrences = getAllOccurrencesForDate(today);
  const byStatus = { taken: [], missed: [], due: [], upcoming: [], skipped: [] };
  const schedule = occurrences.map(function(occ) {
    const state = getOccurrenceStatus(occ.prescriptionId, occ.date, occ.time);
    const item = { name: occ.title, category: getCategoryInfo(occ.category).label, time: formatTime12(occ.time), status: state.status };
    if (state.status === 'completed') byStatus.taken.push(item);
    else if (state.status === 'missed') byStatus.missed.push(item);
    else if (state.status === 'due') byStatus.due.push(item);
    else if (state.status === 'skipped') byStatus.skipped.push(item);
    else byStatus.upcoming.push(item);
    return item;
  });
  const week = calcDetailedAdherence(addDays(today, -6), today);
  const todayStats = calcDetailedAdherence(today, today);
  const active = State.prescriptions.filter(function(rx) {
    return rx && rx.active !== false && (!rx.deactivatedOn || rx.deactivatedOn > today) && (!rx.endDate || rx.endDate >= today);
  }).map(function(rx) {
    return { name: String(rx.title || '').slice(0, 100), category: getCategoryInfo(rx.category).label, frequency: rx.frequency, times: (rx.times || []).map(formatTime12) };
  });
  const hour = current.getHours();
  const context = {
    date: today,
    localTime: current.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    timeOfDay: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night',
    language: LANGUAGES[AI.language] ? LANGUAGES[AI.language].name : 'English',
    todaySchedule: schedule.slice(0, 36),
    scheduleOmitted: Math.max(0, schedule.length - 36),
    doses: {
      taken: byStatus.taken.map(function(item) { return item.name + ' @ ' + item.time; }),
      missed: byStatus.missed.map(function(item) { return item.name + ' @ ' + item.time; }),
      due: byStatus.due.map(function(item) { return item.name + ' @ ' + item.time; }),
      upcoming: byStatus.upcoming.map(function(item) { return item.name + ' @ ' + item.time; }),
      skipped: byStatus.skipped.map(function(item) { return item.name + ' @ ' + item.time; }),
    },
    adherence: { todayPercent: todayStats.pct, todayCompleted: todayStats.completed, todayScheduled: todayStats.scheduled, last7DaysPercent: week.pct, last7DaysCompleted: week.completed, last7DaysScheduled: week.scheduled, last7DaysMissed: week.missed, last7DaysSkipped: week.skipped },
    activePrescriptions: active.slice(0, 36),
    prescriptionsOmitted: Math.max(0, active.length - 36),
  };
  const includeProfile = !!(State.settings && State.settings.sendProfileContext) && !!State.profile;
  if (includeProfile) {
    context.profile = {
      name: String(State.profile.name || '').slice(0, 80),
      condition: String(State.profile.condition || '').slice(0, 120),
      age: Number.isFinite(State.profile.age) ? State.profile.age : null,
    };
  }
  return context;
}
function estimateContextTokens(text) {
  const value = String(text || '');
  const ascii = (value.match(/[\x00-\x7F]/g) || []).length;
  const other = value.length - ascii;
  return Math.ceil(ascii * 0.26 + other * 0.78);
}
function summarizeContextTurns(turns, previous) {
  const clips = [];
  (turns || []).forEach(function(turn) {
    if (!turn || turn.role === 'summary') return;
    const text = String(turn.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const clipped = text.length > 78 ? text.slice(0, 75) + '…' : text;
    clips.push((turn.role === 'user' ? 'User asked ' : 'Sahaara replied ') + '“' + clipped + '”');
  });
  let line = [previous, clips.slice(-8).join('; ')].filter(Boolean).join(' Previously: ');
  if (line.length > 520) line = line.slice(-517).replace(/^.*?\s/, '') + '…';
  return line ? 'Earlier conversation summary: ' + line : '';
}
function clipTextToTokens(text, tokens) {
  const source = String(text || '');
  const allowed = Math.max(0, Math.floor(Number(tokens) || 0));
  if (!allowed) return '';
  if (estimateContextTokens(source) <= allowed) return source;
  const chars = Math.max(24, Math.floor(allowed * 3.2));
  return source.slice(0, Math.max(8, chars - 18)) + ' [shortened]';
}
function trimContext(ctxArray, tokenBudget) {
  if (!Array.isArray(ctxArray)) return [];
  const prior = ctxArray.find(function(item) { return item && item.role === 'summary'; });
  let summary = prior ? String(prior.text || '') : '';
  let items = ctxArray.filter(function(item) { return item && item.role !== 'summary' && (item.role === 'user' || item.role === 'bot' || item.role === 'assistant'); })
    .map(function(item) { return { role: item.role === 'assistant' ? 'bot' : item.role, text: String(item.text || '') }; });
  const maxTurns = Math.max(2, (AI_CONFIG.MAX_CONTEXT_TURNS || 10) * 2);
  const budget = Math.max(120, Number(tokenBudget) || Math.max(500, (AI_CONFIG.MAX_CONTEXT_TOKENS || 4200) - 1100));
  const total = function() { return estimateContextTokens(summary) + items.reduce(function(n, item) { return n + estimateContextTokens(item.text) + 4; }, 0); };
  const dropped = [];
  while (items.length > maxTurns || (items.length > 2 && total() > budget)) dropped.push.apply(dropped, items.splice(0, Math.min(2, items.length)));
  if (dropped.length) summary = summarizeContextTurns(dropped, summary);
  if (summary.length > 420) summary = summary.slice(-417) + '…';
  while (total() > budget && items.length > 2) {
    const old = items.splice(0, 2);
    summary = summarizeContextTurns(old, summary);
    if (summary.length > 360) summary = summary.slice(-357) + '…';
  }
  if (items.length) {
    const overhead = items.length * 4;
    const available = Math.max(24, budget - overhead);
    const summaryTokens = Math.min(80, Math.floor(available * 0.2));
    summary = clipTextToTokens(summary, summaryTokens);
    let remaining = Math.max(24, available - estimateContextTokens(summary));
    if (items.length === 2) {
      const firstBudget = Math.max(16, Math.floor(remaining * 0.42));
      const secondBudget = Math.max(16, remaining - firstBudget);
      items[0].text = clipTextToTokens(items[0].text, firstBudget);
      items[1].text = clipTextToTokens(items[1].text, secondBudget);
    } else {
      items[0].text = clipTextToTokens(items[0].text, remaining);
    }
  }
  ctxArray.splice(0, ctxArray.length);
  if (summary) ctxArray.push({ role: 'summary', text: summary });
  items.forEach(function(item) { ctxArray.push(item); });
  return ctxArray;
}
const EMERGENCY_PHRASES = {
  selfHarm: [
    'suicidal thoughts','suicide','want to kill myself','i want to die','end my life','hurt myself','self harm','self-harm','kill myself',
    'आत्महत्या','खुद को मार','मर जाना चाहता','मर जाना चाहती','जीने का मन नहीं','खुद को नुकसान','आत्महत्या के विचार','aatmahatya','khud ko maar','mar jana chahta','mar jana chahti','jeene ka man nahi','khud ko nuksan','khudkushi','marna chahta hoon','marna chahti hoon',
    'आत्महत्या करायची','जगण्याची इच्छा नाही','আত্মহত্যা','বাঁচতে চাই না','தற்கொலை','வாழ விருப்பமில்லை','ఆత్మహత్య','బతకాలని లేదు','આત્મહત્યા','જીવવું નથી','ಆತ್ಮಹತ್ಯೆ','ಬದುಕಲು ಇಷ್ಟವಿಲ್ಲ','ആത്മഹത്യ','ജീവിക്കേണ്ടെന്ന്','ਖੁਦਕੁਸ਼ੀ','ਜੀਣ ਦਾ ਮਨ ਨਹੀਂ','خودکشی','جینے کا دل نہیں'
  ],
  chestPain: [
    'chest pain','pain in my chest','tightness in my chest','chest pressure','heart attack','severe chest discomfort','सीने में दर्द','छाती में दर्द','seene mein dard','seene me dard','chhati mein dard','chhati me dard','छातीत दुखणे','छातीत वेदना','বুকে ব্যথা','বুক ব্যথা','மார்பு வலி','நெஞ்சு வலி','ఛాతి నొప్పి','గుండె నొప్పి','છાતીમાં દુખાવો','ಎದೆ ನೋವು','നെഞ്ചുവേദന','ਛਾਤੀ ਵਿੱਚ ਦਰਦ','سینے میں درد'
  ],
  breathing: [
    'cannot breathe','cant breathe','can t breathe','difficulty breathing','shortness of breath','trouble breathing','gasping for air','सांस नहीं आ रही','सांस नहीं ले पा रहा','सांस लेने में दिक्कत','saans nahi aa rahi','saans nahi le pa raha','saans lene mein dikkat','श्वास घेण्यास त्रास','श्वास घेता येत नाही','শ্বাস নিতে কষ্ট','শ্বাস নিতে পারছি না','மூச்சு விட முடியவில்லை','மூச்சுத்திணறல்','ఊపిరి పీల్చుకోలేక','శ్వాస తీసుకోవడంలో ఇబ్బంది','શ્વાસ લેવામાં તકલીફ','ಉಸಿರಾಡಲು ಆಗುತ್ತಿಲ್ಲ','ശ്വസിക്കാൻ കഴിയുന്നില്ല','ਸਾਹ ਨਹੀਂ ਆ ਰਿਹਾ','سانس نہیں آ رہی'
  ],
  fainting: [
    'fainting','fainted','feel faint','going to faint','passing out','passed out','lost consciousness','unconscious','बेहोश','बेहोशी','चक्कर खाकर गिर','behosh','behoshi','होश खो','बेशुद्ध','শ্বাস হারানো','অজ্ঞান','மயக்கம்','நினைவிழப்பு','స్పృహ తప్పు','మూర్ఛ','બેભાન','મૂર્છા','ಪ್ರಜ್ಞೆ ತಪ್ಪು','ബോധംകെട്ട്','ബോധം നഷ്ടപ്പെട്ടു','ਬੇਹੋਸ਼','ہوش کھو','بے ہوش'
  ],
  overdose: [
    'overdose','took too many pills','took too much medicine','too many tablets','took an extra dose','extra dose','accidental overdose','अधिक दवा खा','बहुत सारी गोलियां','ज्यादा दवा ले ली','दवा की ज्यादा मात्रा','zyada dawa le li','bahut sari goli','zyada goliyan kha','dawai ka overdose','औषधांचा जास्त डोस','ওভারডোজ','বেশি ওষুধ খেয়েছি','அதிக மாத்திரை','அளவுக்கு அதிகமான மருந்து','అధిక మోతాదు','ఎక్కువ మాత్రలు','ઓવરડોઝ','વધુ દવા','ಮಿತಿಮೀರಿದ ಔಷಧಿ','കൂടുതൽ മരുന്ന് കഴിച്ചു','ਦਵਾਈ ਦੀ ਵੱਧ ਮਾਤਰਾ','زیادہ دوا کھا لی','دوائی کی زیادہ مقدار'
  ],
  bleeding: [
    'severe bleeding','heavy bleeding','bleeding heavily','bleeding wont stop','bleeding won t stop','cannot stop bleeding','uncontrolled bleeding','बहुत खून बह','खून बंद नहीं हो रहा','खून नहीं रुक रहा','तेज रक्तस्राव','bahut khoon beh','khoon band nahi ho raha','khoon nahi ruk raha','खूप रक्तस्त्राव','রক্তপাত বন্ধ হচ্ছে না','প্রচুর রক্তপাত','খুব বেশি রক্তপাত','அதிக ரத்தப்போக்கு','இரத்தம் நிற்கவில்லை','తీవ్రమైన రక్తస్రావం','రక్తం ఆగడం లేదు','ભારે રક્તસ્ત્રાવ','લોહી બંધ થતું નથી','ತೀವ್ರ ರಕ್ತಸ್ರಾವ','രക്തസ്രാവം നിൽക്കുന്നില്ല','ਬਹੁਤ ਖੂਨ ਵਗਣਾ','خون بہنا بند نہیں','شدید خون بہنا'
  ],
  stroke: [
    'stroke','face drooping','face is drooping','weakness on one side','one sided weakness','sudden numbness on one side','cannot speak suddenly','slurred speech','sudden confusion','चेहरा टेढ़ा','एक तरफ कमजोरी','बोलने में अचानक दिक्कत','चेहरा लटक','stroke ke lakshan','chehra tedha','ek taraf kamzori','अर्धांगवायू','चेहरा वाकणे','একপাশ দুর্বল','মুখ বেঁকে','பக்கவாதம்','முகம் சாய்வு','ఒకవైపు బలహీనత','ముఖం వాలిపోవడం','સ્ટ્રોક','ચહેરો વાંકું','ಪಾರ್ಶ್ವವಾಯು','ಮುಖ ವಾಲಿಕೆ','പക്ഷാഘാതം','മുഖം കോടുക','ਸਟ੍ਰੋਕ','ਚਿਹਰਾ ਟੇਢਾ','فالج','چہرہ ٹیڑھا'
  ]
};
function normalizeEmergencyText(text) {
  let value = String(text || '').toLowerCase().normalize ? String(text || '').toLowerCase().normalize('NFKC') : String(text || '').toLowerCase();
  try { value = value.replace(/(\p{L})['’´](\p{L})/gu, '$1$2'); } catch (_) {}
  try { value = value.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
  catch (_) { value = value.replace(/[.,!?;:()"“”'’]/g, ' ').replace(/\s+/g, ' ').trim(); }
  return value;
}
const EMERGENCY_NEGATIONS = ['no','not','dont','cant','wont','isnt','arent','wasnt','werent','hasnt','havent','didnt','doesnt','never','without'];
function emergencyNegated(text, index) {
  const before = String(text).slice(0, index).trim().split(/\s+/).filter(Boolean);
  return before.slice(-3).some(w => EMERGENCY_NEGATIONS.includes(w));
}
function detectEmergency(text) {
  const normalized = normalizeEmergencyText(text);
  if (!normalized) return null;
  const tokens = normalized.split(/\s+/);
  const matchGroup = list => list.some(phrase => {
    const candidate = normalizeEmergencyText(phrase);
    return candidate && (' ' + normalized + ' ').includes(' ' + candidate + ' ');
  });
  const selfHarmExtra = ["don't want to live", 'do not want to live', 'no point in living', 'better off dead', 'end it all', 'ending it all', 'hurting myself', "can't go on", 'cannot go on', 'jeene ka mann nahi', 'mar jaun', 'मर जाऊँ', 'जीने का मन नहीं'];
  if (matchGroup(EMERGENCY_PHRASES.selfHarm.concat(selfHarmExtra))) return { kind: 'selfHarm' };
  if (/(\bforgot\b|\bmissed\b|\bshould i\b|\bcan i\b).{0,45}\b(extra dose|double dose)\b/.test(normalized)) return null;
  const pastOrThird = /\b(last year|years ago|my father|my mother|my friend|my grandmother|my grandfather|heard about)\b/.test(normalized);
  const categories = ['chestPain', 'breathing', 'fainting', 'overdose', 'bleeding', 'stroke'];
  const extra = {
    overdose: ['took a few extra tablets','swallowed all my pills','took too many','double dose by mistake','मुझे गलती से दोहरी खुराक हो गई','ज्यादा गोलियां खा ली','zyada goliyan kha li','galti se double dose'],
    chestPain: [],
  };
  const symptomMatch = list => list.concat(extra[list === EMERGENCY_PHRASES.overdose ? 'overdose' : ''] || []).some(phrase => {
    const candidate = normalizeEmergencyText(phrase); if (!candidate) return false;
    const padded = ' ' + normalized + ' ', needle = ' ' + candidate + ' ';
    const at = padded.indexOf(needle); if (at < 0) return false;
    if (emergencyNegated(padded, at)) return false;
    return true;
  });
  if (/\bstroke\b/.test(normalized)) {
    const strokeIdiomatic = /\bstroke of (luck|genius|inspiration|brilliance|fortune|midnight)\b|\bheat stroke\b|\bsun stroke\b/.test(normalized);
    const strokeQualifier = normalized.match(/(face droop|facial droop|slurred speech|one side weakness|one-sided weakness|sudden numbness|had a stroke|having a stroke|stroke symptoms)/);
    if (!strokeIdiomatic && strokeQualifier && !emergencyNegated(normalized, strokeQualifier.index) && !pastOrThird) return { kind: 'stroke' };
  }
  const strokeSpecific = (EMERGENCY_PHRASES.stroke || []).filter(p => normalizeEmergencyText(p) !== 'stroke');
  for (const key of categories) {
    const list = key === 'stroke' ? strokeSpecific : EMERGENCY_PHRASES[key];
    if (!pastOrThird && symptomMatch(list)) return { kind: key };
  }
  const glucose = normalized.match(/(?:sugar|glucose)\s*(?:is|of|at|:)?\s*(\d{2,3})/);
  if (!pastOrThird && ((glucose && (+glucose[1] < 70 || +glucose[1] > 400)) || (/\b(low sugar|sugar low|hypoglyc).{0,50}\b(sweating|shaky|confused|drowsy)\b/.test(normalized)))) return { kind: 'bloodSugar' };
  return null;
}
const EMERGENCY_COPY = {
  en: { title: 'This may be an emergency', message: 'Please call 112 in India now, or go to the nearest emergency department. Do not wait for an AI reply.', support: 'You deserve support and do not have to face this alone. Ask someone you trust to stay with you; if you may be in immediate danger, call 112 now.', callLabel: 'Call 112' },
  hi: { title: 'यह आपात स्थिति हो सकती है', message: 'कृपया अभी भारत में 112 पर कॉल करें या निकटतम आपातकालीन विभाग जाएँ। AI के उत्तर की प्रतीक्षा न करें।', support: 'आपको अकेले इसका सामना नहीं करना है। किसी भरोसेमंद व्यक्ति को अपने साथ रहने के लिए कहें; तत्काल खतरा हो तो अभी 112 पर कॉल करें।', callLabel: '112 पर कॉल करें' },
  'hi-Latn': { title: 'Yeh emergency ho sakti hai', message: 'Kripya abhi India mein 112 par call karein ya nearest emergency department jaayein. AI reply ka wait na karein.', support: 'Aapko isse akele nahi guzarna hai. Kisi bharosemand vyakti ko apne paas bulayein; turant khatra ho to abhi 112 call karein.', callLabel: '112 par call karein' },
  mr: { title: 'ही आपत्कालीन स्थिती असू शकते', message: 'कृपया आत्ताच भारतात 112 वर कॉल करा किंवा जवळच्या आपत्कालीन विभागात जा. AI उत्तराची वाट पाहू नका.', support: 'तुम्हाला हे एकट्याने सहन करण्याची गरज नाही. विश्वासू व्यक्तीला जवळ बोलवा; तातडीचा धोका असल्यास 112 वर कॉल करा.', callLabel: '112 वर कॉल करा' },
  bn: { title: 'এটি জরুরি অবস্থা হতে পারে', message: 'দয়া করে এখনই ভারতে 112 নম্বরে কল করুন অথবা নিকটতম জরুরি বিভাগে যান। AI উত্তরের জন্য অপেক্ষা করবেন না।', support: 'আপনাকে একা থাকতে হবে না। বিশ্বাসের কাউকে পাশে থাকতে বলুন; তাৎক্ষণিক বিপদ থাকলে এখনই 112-এ কল করুন।', callLabel: '112-এ কল করুন' },
  ta: { title: 'இது அவசரநிலையாக இருக்கலாம்', message: 'இந்தியாவில் உடனே 112-ஐ அழைக்கவும் அல்லது அருகிலுள்ள அவசர சிகிச்சைப் பிரிவுக்குச் செல்லவும். AI பதிலுக்காகக் காத்திருக்க வேண்டாம்.', support: 'நீங்கள் இதைத் தனியாகச் சமாளிக்க வேண்டியதில்லை. நம்பகமான ஒருவரை அருகில் இருக்கச் சொல்லுங்கள்; உடனடி ஆபத்து இருந்தால் 112-ஐ அழைக்கவும்.', callLabel: '112-ஐ அழைக்கவும்' },
  te: { title: 'ఇది అత్యవసర పరిస్థితి కావచ్చు', message: 'దయచేసి భారతదేశంలో ఇప్పుడే 112కు కాల్ చేయండి లేదా సమీప అత్యవసర విభాగానికి వెళ్లండి. AI సమాధానం కోసం వేచి ఉండకండి.', support: 'మీరు ఒంటరిగా ఎదుర్కోవాల్సిన అవసరం లేదు. నమ్మకమైన వ్యక్తిని మీతో ఉండమని అడగండి; తక్షణ ప్రమాదం ఉంటే 112కు కాల్ చేయండి.', callLabel: '112కు కాల్ చేయండి' },
  gu: { title: 'આ કટોકટી હોઈ શકે છે', message: 'કૃપા કરીને ભારતમાં હમણાં 112 પર કૉલ કરો અથવા નજીકના ઇમરજન્સી વિભાગમાં જાઓ. AI જવાબની રાહ ન જુઓ.', support: 'તમારે આ એકલા સહન કરવાની જરૂર નથી. વિશ્વાસુ વ્યક્તિને તમારી સાથે રહેવા કહો; તાત્કાલિક જોખમ હોય તો 112 પર કૉલ કરો.', callLabel: '112 પર કૉલ કરો' },
  kn: { title: 'ಇದು ತುರ್ತು ಪರಿಸ್ಥಿತಿಯಾಗಿರಬಹುದು', message: 'ದಯವಿಟ್ಟು ಭಾರತದಲ್ಲಿ ಈಗಲೇ 112ಕ್ಕೆ ಕರೆ ಮಾಡಿ ಅಥವಾ ಹತ್ತಿರದ ತುರ್ತು ಚಿಕಿತ್ಸಾ ವಿಭಾಗಕ್ಕೆ ಹೋಗಿ. AI ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯಬೇಡಿ.', support: 'ನೀವು ಇದನ್ನು ಒಬ್ಬರೇ ಎದುರಿಸಬೇಕಾಗಿಲ್ಲ. ನಂಬಿಕೆಯ ವ್ಯಕ್ತಿಯನ್ನು ನಿಮ್ಮ ಜೊತೆ ಇರಲು ಕೇಳಿ; ತಕ್ಷಣದ ಅಪಾಯವಿದ್ದರೆ 112ಕ್ಕೆ ಕರೆ ಮಾಡಿ.', callLabel: '112ಕ್ಕೆ ಕರೆ ಮಾಡಿ' },
  ml: { title: 'ഇത് അടിയന്തരാവസ്ഥയായിരിക്കാം', message: 'ദയവായി ഇന്ത്യയിൽ ഇപ്പോൾ 112-ൽ വിളിക്കുകയോ അടുത്തുള്ള അത്യാഹിത വിഭാഗത്തിലേക്ക് പോകുകയോ ചെയ്യുക. AI മറുപടിക്കായി കാത്തിരിക്കരുത്.', support: 'ഇത് ഒറ്റയ്ക്ക് നേരിടേണ്ടതില്ല. വിശ്വസിക്കുന്ന ഒരാളോട് കൂടെയിരിക്കാൻ പറയുക; ഉടൻ അപകടമുണ്ടെങ്കിൽ 112-ൽ വിളിക്കുക.', callLabel: '112-ൽ വിളിക്കുക' },
  pa: { title: 'ਇਹ ਐਮਰਜੈਂਸੀ ਹੋ ਸਕਦੀ ਹੈ', message: 'ਕਿਰਪਾ ਕਰਕੇ ਭਾਰਤ ਵਿੱਚ ਹੁਣੇ 112 ਤੇ ਕਾਲ ਕਰੋ ਜਾਂ ਨੇੜਲੇ ਐਮਰਜੈਂਸੀ ਵਿਭਾਗ ਜਾਓ। AI ਜਵਾਬ ਦੀ ਉਡੀਕ ਨਾ ਕਰੋ।', support: 'ਤੁਹਾਨੂੰ ਇਹ ਇਕੱਲੇ ਸਹਿਣ ਦੀ ਲੋੜ ਨਹੀਂ। ਕਿਸੇ ਭਰੋਸੇਯੋਗ ਵਿਅਕਤੀ ਨੂੰ ਨਾਲ ਰਹਿਣ ਲਈ ਕਹੋ; ਤੁਰੰਤ ਖ਼ਤਰਾ ਹੋਵੇ ਤਾਂ 112 ਤੇ ਕਾਲ ਕਰੋ।', callLabel: '112 ਤੇ ਕਾਲ ਕਰੋ' },
  ur: { title: 'یہ ہنگامی حالت ہو سکتی ہے', message: 'براہِ کرم بھارت میں ابھی 112 پر کال کریں یا قریبی ایمرجنسی شعبے میں جائیں۔ AI کے جواب کا انتظار نہ کریں۔', support: 'آپ کو یہ اکیلے برداشت کرنے کی ضرورت نہیں۔ کسی قابلِ اعتماد شخص کو اپنے ساتھ رہنے کو کہیں؛ فوری خطرہ ہو تو 112 پر کال کریں۔', callLabel: '112 پر کال کریں' }
};
function getEmergencyCopy(language, isSelfHarm, kind) {
  const base = EMERGENCY_COPY[language] || EMERGENCY_COPY.en;
  if (kind === 'bloodSugar') return { title: 'This may be a blood sugar emergency', message: 'Call 112 now. If you are awake and able to swallow, take a sugar source only as directed in your care team’s plan. Do not wait for the AI.', support: '', callLabel: base.callLabel };
  const support = isSelfHarm ? base.support + ' You can also call Tele-MANAS at 14416 now.' : '';
  return { title: base.title, message: base.message, support: support, callLabel: base.callLabel };
}
function buildLLMMessages(input, ctxArray, options) {
  options = options || {};
  const planContext = getAIPlanContext();
  const lang = LANGUAGES[AI.language] || LANGUAGES.en;
  const voiceInstruction = options.voiceMode
    ? '\nVOICE MODE: Keep the answer to at most 2–3 short sentences. No lists, Markdown, or emojis. Say numbers and times naturally. End with a brief follow-up prompt only when it is genuinely useful.'
    : '';
  const systemPrompt = 'You are Sahaara, CareTrack’s warm, brief self-care guidance assistant. You are NOT a doctor or medical professional. Answer from the user’s actual CareTrack plan data first; treat the compact plan context below as the source of truth. Never invent prescriptions, medicines, doses, schedules, completed tasks, or clinical facts. Never diagnose or recommend treatment. Do not tell anyone to start/stop/switch/change a dose or advise what to do after a missed dose. If asked for diagnosis or clinical medication advice, politely decline and direct them to their prescriber/care team. You may restate an existing CareTrack plan entry exactly as recorded (name, category, scheduled time), but never infer a dose or give clinical instructions. You may offer only general, low-risk self-care tips and remind the user to follow their clinician’s plan. Be warm, actionable, and concise: 2–4 sentences by default. Ask at most one clarifying question. If a needed plan detail is absent, say so rather than guessing. For emergencies in India, tell the user to call 112 immediately; do not delay with questions. Reply fully in ' + lang.name + (AI.language === 'hi-Latn' ? ' using a natural Roman-script Hindi-English mix (Hinglish), never Devanagari.' : '.') + ' Do not disclose profile details unless they appear in the provided context.\n\nCOMPACT CARETRACK CONTEXT (JSON): ' + JSON.stringify(planContext) + voiceInstruction;
  const messages = [{ role: 'system', content: systemPrompt }];
  const totalTokenBudget = AI_CONFIG.MAX_CONTEXT_TOKENS || 4200;
  const systemTokens = estimateContextTokens(systemPrompt);
  const inputTokens = Math.max(180, totalTokenBudget - systemTokens - 420);
  const currentInput = clipTextToTokens(String(input || ''), inputTokens);
  const available = Math.max(120, totalTokenBudget - systemTokens - estimateContextTokens(currentInput) - 100);
  trimContext(ctxArray || [], available);
  (ctxArray || []).forEach(function(msg) {
    if (!msg) return;
    if (msg.role === 'summary') messages.push({ role: 'system', content: String(msg.text || '') });
    else if (msg.role === 'user' || msg.role === 'bot' || msg.role === 'assistant') {
      messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: String(msg.text || '') });
    }
  });
  messages.push({ role: 'user', content: currentInput });
  return messages.filter(function(m) { return m && (m.role === 'user' || m.role === 'assistant' || m.role === 'system'); })
    .map(function(m) { return { role: m.role, content: String(m.content || '') }; });
}
function extractLLMReply(data) {
  if (!data) return '';
  if (typeof data.reply === 'string') return data.reply;
  if (Array.isArray(data.choices) && data.choices[0]) return data.choices[0].message?.content || data.choices[0].text || '';
  if (Array.isArray(data.candidates) && data.candidates[0]) return data.candidates[0].content?.parts?.[0]?.text || '';
  if (typeof data.response === 'string') return data.response;
  if (typeof data.text === 'string') return data.text;
  return '';
}
function extractLLMDelta(data) {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object') return '';
  if (Array.isArray(data.choices) && data.choices[0]) {
    const choice = data.choices[0];
    return (choice.delta && (choice.delta.content || choice.delta.text)) || (choice.message && choice.message.content) || choice.text || '';
  }
  if (typeof data.delta === 'string') return data.delta;
  if (typeof data.token === 'string') return data.token;
  if (typeof data.content === 'string' && data.type !== 'done') return data.content;
  if (typeof data.reply === 'string') return data.reply;
  if (typeof data.text === 'string') return data.text;
  return '';
}
async function sahaaraPlanText() {
  try {
    let c = (typeof getAIPlanContext === 'function') ? getAIPlanContext() : null;
    if (c && typeof c.then === 'function') c = await c;
    if (!c) return '';
    return typeof c === 'string' ? c.slice(0, 3000) : JSON.stringify(c).slice(0, 3000);
  } catch (e) { return ''; }
}
async function callLLM(messages, endpointOverride, options) {
  options = options || {};
  const endpoint = String(endpointOverride || AI_CONFIG.LLM_ENDPOINT || '').trim();
  if (AI.backendProxyUnavailable && endpoint === '/api/chat' && !endpointOverride) {
    return { ok: false, offline: true, error: null };
  }
  if (!endpoint) return { ok: false, offline: true, error: null };
  if (typeof AbortController === 'undefined') return { ok: false, error: 'This browser does not support cancellable AI requests.' };
  const isStaticHost = typeof window !== 'undefined' && (window.location.protocol === 'file:' || (typeof window.location.hostname === 'string' && (window.location.hostname.endsWith('github.io') || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')));
  if (isStaticHost && endpoint === '/api/chat' && !AI.llmVerified) {
    AI.backendProxyUnavailable = true;
    return { ok: false, offline: true, error: null };
  }
  const controller = new AbortController();
  let timer = setTimeout(function() { try { controller.abort(); } catch (_) {} }, options.voiceMode ? 2000 : (AI_CONFIG.REQUEST_TIMEOUT_MS || 30000));
  if (!endpointOverride) AI.activeController = controller;
  let accumulated = '';
  let didStream = false;
  const emit = function(chunk) {
    if (!chunk) return;
    const token = String(chunk);
    accumulated += token;
    didStream = true;
    if (options.voiceMode && timer) { clearTimeout(timer); timer = null; }
    if (typeof options.onToken === 'function') options.onToken(token);
  };
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/x-ndjson, application/json' },
      body: JSON.stringify({ model: AI_CONFIG.LLM_MODEL, messages: messages, temperature: AI_CONFIG.TEMPERATURE, stream: true, voice: !!options.voiceMode, lang: (AI.language || 'en'), plan: await sahaaraPlanText(), sessionId: (AI.currentSessionId || null) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      if (endpoint === '/api/chat') {
        AI.backendProxyUnavailable = true;
        AI.llmVerified = false;
        return { ok: false, offline: true, error: null };
      }
      let detail = '';
      try {
        const err = await response.json();
        detail = (err && err.error && (err.error.message || err.error)) || err.message || '';
      } catch (_) {}
      return { ok: false, error: 'AI service error (HTTP ' + response.status + ')' + (detail ? ': ' + String(detail) : '') };
    }
    const contentType = (response.headers && response.headers.get('content-type') || '').toLowerCase();
    const readerAvailable = response.body && typeof response.body.getReader === 'function';
    const isEventStream = contentType.indexOf('text/event-stream') >= 0;
    const isLineStream = contentType.indexOf('ndjson') >= 0 || contentType.indexOf('stream+json') >= 0;
    const isPlainStream = contentType.indexOf('text/plain') >= 0;
    if (readerAvailable && (isEventStream || isLineStream || isPlainStream)) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let doneSignal = false;
      const handleLine = function(line) {
        let value = String(line || '').trim();
        if (!value || value.indexOf(':') === 0) return;
        if (isEventStream && value.indexOf('data:') !== 0 && value.indexOf('data ') !== 0) return;
        if (value.indexOf('data:') === 0) value = value.slice(5).trim();
        else if (value.indexOf('data ') === 0) value = value.slice(5).trim();
        if (!value) return;
        if (value === '[DONE]') { doneSignal = true; return; }
        try {
          const parsed = JSON.parse(value);
          if (parsed && (parsed.type === 'done' || parsed.done === true)) {
            const finalReply = extractLLMReply(parsed);
            if (!didStream && finalReply) emit(finalReply);
            doneSignal = true;
            return;
          }
          const delta = extractLLMDelta(parsed);
          if (delta) emit(delta);
        } catch (_) {
          if (isEventStream || isLineStream) emit(value);
        }
      };
      if (isPlainStream) {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          if (part.value) emit(decoder.decode(part.value, { stream: true }));
        }
        const tail = decoder.decode();
        if (tail) emit(tail);
      } else {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          pending += decoder.decode(part.value, { stream: true });
          const lines = pending.split(/\r?\n/);
          pending = lines.pop() || '';
          lines.forEach(handleLine);
          if (doneSignal) { try { await reader.cancel(); } catch (_) {} break; }
        }
        pending += decoder.decode();
        if (pending.trim()) handleLine(pending);
      }
      const reply = accumulated.trim();
      if (!reply) return { ok: false, error: 'AI service returned an empty or unrecognized streamed response.' };
      return { ok: true, reply: reply, streamed: true };
    }
    let data;
    try {
      data = await response.json();
    } catch (_) {
      try {
        const raw = await response.text();
        if (raw && raw.trim()) data = { reply: raw.trim() };
      } catch (_) {}
    }
    const reply = String(extractLLMReply(data) || '').trim();
    if (!reply) return { ok: false, error: 'AI service returned an empty or unrecognized response.' };
    if (typeof options.onToken === 'function') {
      const pieces = reply.match(/\S+\s*/g) || [reply];
      for (let i = 0; i < pieces.length; i++) {
        if (controller.signal.aborted || AI.stopRequested) break;
        emit(pieces[i]);
        if (i < pieces.length - 1) await new Promise(function(resolve) { setTimeout(resolve, 16); });
      }
      if (AI.stopRequested || (controller.signal.aborted && controller.signal.reason === 'user-stop')) return { ok: false, cancelled: true, reply: accumulated.trim(), error: null };
    }
    return { ok: true, reply: reply, streamed: false };
  } catch (error) {
    const manuallyCancelled = !!(AI.stopRequested || (controller.signal && (controller.signal.reason === 'user-stop' || controller.signal.reason === 'voice-barge-in' || controller.signal.reason === 'voice-close')) || (options.voiceMode && (!VoiceMode.isOpen || !VoiceMode.pending)));
    if (manuallyCancelled) return { ok: false, cancelled: true, reply: accumulated.trim(), error: null };
    if (error && error.name === 'AbortError') return { ok: false, error: 'AI request timed out after ' + Math.round((AI_CONFIG.REQUEST_TIMEOUT_MS || 30000) / 1000) + ' seconds.' };
    return { ok: false, error: 'Could not reach AI service: ' + ((error && error.message) || 'network error'), reply: accumulated.trim() };
  } finally {
    clearTimeout(timer);
    if (!endpointOverride && AI.activeController === controller) AI.activeController = null;
  }
}
function pushAIContextPair(ctxArray, input, reply) {
  if (!Array.isArray(ctxArray)) return;
  ctxArray.push({ role: 'user', text: String(input || '') });
  ctxArray.push({ role: 'bot', text: String(reply || '') });
  trimContext(ctxArray);
}
function makeVoiceStyleFallback(text) {
  const plain = cleanSpeechText(text);
  const sentences = (plain.match(/[^.!?।]+[.!?।]?/g) || [plain]).map(function(sentence) { return sentence.trim(); }).filter(Boolean);
  let result = sentences.slice(0, 3).join(' ');
  if (result.length > 360) result = result.slice(0, 357).replace(/\s+\S*$/, '') + '…';
  return result || 'I could not find that detail in your CareTrack plan. Please check the plan or ask your care team if it is a clinical question.';
}
function guardSahaaraOutput(text) {
  const value = String(text || '').trim();
  if (!value) return { text: 'I could not get a complete answer. Please try again, or contact your care team for health questions.', replaced: true };
  const unsafe = /\b(double your dose|increase your dose|decrease your dose|change your dose|take (?:an extra|another|more) dose|stop taking|start taking|skip (?:your )?(?:medicine|medication|tablet|dose)|you have [a-z -]+(?:disease|disorder|syndrome)|you are diagnosed with)\b/i;
  if (unsafe.test(value)) return { text: 'I can’t advise you to start, stop, skip, or change medication or doses. Please contact your prescribing clinician or pharmacist for guidance.', replaced: true };
  return { text: value, replaced: false };
}
async function requestAIResponse(input, ctxArray, options) {
  options = options || {};
  ctxArray = Array.isArray(ctxArray) ? ctxArray : [];
  const out = { text: '', source: 'builtin', error: null, cancelled: false };
  const urgent = detectEmergency(input);
  if (urgent) {
    const copy = getEmergencyCopy(AI.language, urgent.kind === 'selfHarm', urgent.kind);
    out.text = [copy.message, copy.support].filter(Boolean).join(' ');
    if (window.CTBackend) { try { window.CTBackend.logEmergency(input, urgent.kind, urgent.kind === 'selfHarm', options.voiceMode ? 'voice' : 'chat'); } catch (e) {} }
    return out;
  }
  if (AI_CONFIG.LLM_ENDPOINT && !AI.backendProxyUnavailable) {
    const result = await callLLM(buildLLMMessages(input, ctxArray, options), null, options);
    if (result.ok) {
      AI.llmVerified = true;
      const guarded = guardSahaaraOutput(result.reply);
      out.text = options.voiceMode ? cleanSpeechText(guarded.text) : guarded.text;
      out.safetyReplaced = guarded.replaced;
      out.source = 'llm';
      pushAIContextPair(ctxArray, input, out.text);
      return out;
    }
    if (result.cancelled) {
      out.text = result.reply || '';
      out.source = 'llm';
      out.cancelled = true;
      if (out.text) pushAIContextPair(ctxArray, input, out.text);
      return out;
    }
    if (!result.offline && result.error) {
      console.warn('Sahaara: backend unavailable, using clinical engine.', result.error);
    }
    if (typeof options.onReset === 'function') options.onReset();
  }
  out.text = sahaaraRoute(input, options, ctxArray);
  out.source = 'builtin';
  out.error = null;
  if (AI.language !== 'en' && AI.autoTranslate) {
    try {
      const translated = await translateOnline(out.text, AI.language);
      out.text = translated || translateText(out.text, AI.language);
    } catch (_) { out.text = translateText(out.text, AI.language); }
  }
  if (options.voiceMode) out.text = makeVoiceStyleFallback(out.text);
  if (typeof options.onToken === 'function') {
    const pieces = out.text.match(/\S+\s*/g) || [out.text];
    let emitted = '';
    for (let i = 0; i < pieces.length; i++) {
      if (AI.stopRequested) { out.text = emitted; out.cancelled = true; out.error = null; break; }
      options.onToken(pieces[i]); emitted += pieces[i];
      if (i < pieces.length - 1) await new Promise(function(resolve) { setTimeout(resolve, 18); });
    }
  }
  if (out.cancelled) { if (out.text) pushAIContextPair(ctxArray, input, out.text); return out; }
  pushAIContextPair(ctxArray, input, out.text);
  return out;
}
function getQuickReplyChips() {
  const day = todayStr();
  const schedule = getAllOccurrencesForDate(day);
  const remaining = schedule.filter(function(item) {
    const state = getOccurrenceStatus(item.prescriptionId, item.date, item.time).status;
    return state === 'due' || state === 'upcoming';
  }).length;
  const activePlan = State.prescriptions.some(function(rx) {
    return rx && rx.active !== false && (!rx.deactivatedOn || rx.deactivatedOn > day) && (!rx.endDate || rx.endDate >= day);
  });
  const week = activePlan ? calcDetailedAdherence(addDays(day, -6), day) : { pct: null };
  if (AI.language === 'hi') {
    return [remaining ? 'आज कौन-सी गतिविधियाँ बाकी हैं?' : 'आज की योजना क्या है?', 'मेरी प्रगति क्यों बदली?', 'आज आगे क्या है?', activePlan ? 'मेरी योजनाएँ दिखाएँ' : 'गतिविधि कैसे जोड़ें?'];
  }
  if (AI.language === 'hi-Latn') {
    return [remaining ? 'Aaj kaun si activities baaki hain?' : 'Aaj ka plan kya hai?', 'Meri adherence kyun badli?', 'Aaj next kya hai?', activePlan ? 'Mera care plan dikhao' : 'Activity kaise add karun?'];
  }
  return [remaining ? 'Which activities are left today?' : 'What is my plan today?', week.pct !== null && week.pct < 80 ? 'Why did my adherence drop?' : 'How is my adherence this week?', 'What is next today?', activePlan ? 'Show my active care plan' : 'How do I add an activity?'];
}
function copyAIMessage(id) {
  const message = AI.messages.find(function(item) { return item.id === id; });
  if (!message) return;
  const text = String(message.text || '');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() { toast('Message copied'); }).catch(function() { copyTextFallback(text); });
  } else copyTextFallback(text);
}
function copyTextFallback(text) {
  const area = document.createElement('textarea');
  area.value = text; area.setAttribute('readonly', '');
  area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.appendChild(area); area.select();
  try { document.execCommand('copy'); toast('Message copied'); } catch (_) { toast('Could not copy message', true); }
  area.remove();
}
async function retryAIMessage(id) {
  if (AI.pending) return;
  const index = AI.messages.findIndex(function(message) { return message.id === id; });
  if (index < 0 || !AI.messages[index].error) return;
  let userIndex = index - 1;
  while (userIndex >= 0 && AI.messages[userIndex].role !== 'user') userIndex--;
  if (userIndex < 0) return;
  const user = AI.messages[userIndex];
  AI.messages.splice(index, 1);
  for (let i = AI.conversationContext.length - 1; i >= 0; i--) {
    if (AI.conversationContext[i].role === 'summary') continue;
    if (AI.conversationContext[i].role === 'bot' && i > 0 && AI.conversationContext[i - 1].role === 'user' && AI.conversationContext[i - 1].text === user.text) {
      AI.conversationContext.splice(i - 1, 2);
    }
    break;
  }
  await runAIChatRequest(user.text, user);
}
function getSafeFallbackText() {
  return "I'm having trouble responding right now — both the AI service and my built-in guidance engine hit an unexpected error. Please try again in a moment.\n\nIf you are having a medical emergency, stop using this app and call your local emergency number (112 in India) immediately.";
}
function fuzzyDistance(a, b, limit) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const row = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) row[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    let min = row[0];
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp; if (row[j] < min) min = row[j];
    }
    if (min > limit) return limit + 1;
  }
  return row[b.length];
}
function intentWords(text) {
  return normalizeEmergencyText(text).split(/\s+/).filter(function(word) { return word.length > 1; });
}
function fuzzyHasToken(words, candidate) {
  return words.some(function(word) {
    if (word === candidate) return true;
    if (Math.min(word.length, candidate.length) < 4) return false;
    const limit = Math.max(word.length, candidate.length) >= 8 ? 2 : 1;
    return fuzzyDistance(word, candidate, limit) <= limit;
  });
}
function getTodayLeftSummary() {
  const today = todayStr();
  const occurrences = getAllOccurrencesForDate(today);
  const pending = occurrences.filter(function(occ) {
    const status = getOccurrenceStatus(occ.prescriptionId, today, occ.time).status;
    return status === 'due' || status === 'upcoming';
  });
  if (!pending.length) return occurrences.length
    ? 'There are no scheduled activities left today. Your scheduled items are completed, missed, or skipped.'
    : 'I do not see any self-care activities scheduled for today in your plan.';
  const lines = pending.slice(0, 5).map(function(occ) { return occ.title + ' at ' + formatTime12(occ.time); });
  return 'You have ' + pending.length + (pending.length === 1 ? ' scheduled activity' : ' scheduled activities') + ' left today: ' + lines.join('; ') + (pending.length > lines.length ? '; and ' + (pending.length - lines.length) + ' more' : '') + '.';
}
function getAdherenceWhySummary() {
  const today = todayStr();
  const stats = calcDetailedAdherence(addDays(today, -6), today);
  if (stats.pct === null) return 'There is not enough completed schedule data to calculate a 7-day adherence percentage yet. Add activities to your plan and track them in CareTrack.';
  const causes = [];
  if (stats.missed) causes.push(stats.missed + ' missed');
  if (stats.skipped) causes.push(stats.skipped + ' skipped');
  const main = causes.length ? 'The tracker shows ' + causes.join(' and ') + ' scheduled activit' + (stats.missed + stats.skipped === 1 ? 'y' : 'ies') + ' this week.' : 'The tracker does not show missed or skipped activities this week.';
  return 'Your 7-day adherence is ' + stats.pct + '% (' + stats.completed + ' of ' + stats.scheduled + ' scheduled activities completed). ' + main + ' The tracker cannot tell why an activity was missed; was timing or effort a challenge?';
}
function getCompactBuiltinAnswer(intent, query) {
  if (intent === 'left') return getTodayLeftSummary();
  if (intent === 'plan') return getTodaysPlanResponse();
  if (intent === 'adherence') return getAdherenceWhySummary();
  if (intent === 'prescriptions') {
    const today = todayStr();
    const active = State.prescriptions.filter(function(rx) { return rx.active !== false && (!rx.deactivatedOn || rx.deactivatedOn > today) && (!rx.endDate || rx.endDate >= today); });
    if (!active.length) return 'I do not see any active self-care prescriptions in CareTrack. You can add one from My Prescriptions or ask me how to get started.';
    return 'Your active self-care prescriptions are: ' + active.slice(0, 8).map(function(rx) { return String(rx.title || 'Activity') + ' (' + getCategoryInfo(rx.category).label + ')'; }).join('; ') + (active.length > 8 ? '; and ' + (active.length - 8) + ' more' : '') + '.';
  }
  if (intent === 'missed') {
    const today = todayStr();
    const list = getAllOccurrencesForDate(today).filter(function(occ) { return getOccurrenceStatus(occ.prescriptionId, today, occ.time).status === 'missed'; });
    if (!list.length) return 'I do not see any missed activities for today. You can still review the last 7 days in Progress and Reports.';
    return 'Today, the tracker marks these activities missed: ' + list.slice(0, 5).map(function(occ) { return occ.title + ' at ' + formatTime12(occ.time); }).join('; ') + '. If you are unsure what to do about a missed medication, contact your prescriber; CareTrack activities are not medication instructions.';
  }
  if (intent === 'next') {
    const today = todayStr(); const minute = now().getHours() * 60 + now().getMinutes();
    const next = getAllOccurrencesForDate(today).filter(function(occ) {
      const status = getOccurrenceStatus(occ.prescriptionId, today, occ.time).status;
      return status === 'due' || (status === 'upcoming' && timeToMinutes(occ.time) >= minute);
    }).sort(function(a, b) { return timeToMinutes(a.time) - timeToMinutes(b.time); })[0];
    return next ? 'Your next scheduled self-care activity is ' + next.title + ' at ' + formatTime12(next.time) + '.' : 'There are no upcoming scheduled activities left today.';
  }
  if (intent === 'medication') return 'I can’t advise on medicines, diagnose a condition, or change a dose. Please check with your prescribing doctor or care team; I can help explain the self-care activities already listed in CareTrack.';
  if (intent === 'activity' || intent === 'diet' || intent === 'sleep' || intent === 'hydration' || intent === 'stress' || intent === 'breathing' || intent === 'app' || intent === 'completion' || intent === 'skip' || intent === 'identity') {
    const canonical = {
      activity: 'exercise guidance', diet: 'diet guidance', sleep: 'sleep guidance', hydration: 'hydration guidance', stress: 'stress guidance', breathing: 'breathing guidance',
      app: 'how to use the app', completion: 'how do i mark a task complete', skip: 'how do i skip a task', identity: 'who are you'
    }[intent];
    return getBuiltInResponseLegacy(canonical || query);
  }
  return null;
}
var SAHAARA_INTENTS = [
['plan_today','what is my plan today','today plan|today schedule|what do i have today|what are my activities today|read my plan|tell me my routine|aaj ka plan|aaj ka schedule|aaj kya karna hai|my day plan|what is on my list today|read out what i need to do today|what do i need to do today|list todays activities|batao aaj kya karna hai'],
['left_today','what is left today','what is left|what s left today|anything pending|what do i still have to do|remaining tasks|kya baaki hai|aaj kya baaki hai|what else today|tasks remaining today|how many activities left|still pending|what must i finish today|what do i need to complete|what is still to do today'],
['next_item','what is next','what is next|whats next|next activity|what should i do next|what comes next|upcoming activity|agla kaam kya hai|ab kya karna hai|next task|what s coming up|do next|which activity do i do after this|what do i do now'],
['after_next','after that','after that|and then|what after that|what comes after|then what|uske baad kya|and after this'],
['adherence','how is my adherence','how am i doing|how is my progress|my progress|am i on track|adherence|my score|kaisa chal raha hai|meri progress kaisi hai|how well am i following my plan|show my stats|completion rate|how is my week going|am i doing okay|how am i doing this week|doing well this week|am i doing well'],
['best_day','which day was my best day','best day|which day did i do best|my best day this week|top day|sabse accha din|best performance day|strongest day'],
['worst_day','which was my worst day','worst day|hardest day|toughest day|which day did i do badly|weakest day|sabse kharab din|lowest day'],
['compare_week','compare this week with last week','compare this week with last week|am i better than last week|versus last week|week over week|improved from last week|pichle hafte se compare|last week comparison|how was last week compared'],
['summary_day','summarize my day','summarize my day|recap my day|how was my day|day summary|overview of today|aaj ka summary|give me a recap|how did today go'],
['focus','what should i focus on today','what should i focus on|priority today|what is most important today|what to prioritize|where should i start|sabse zaroori kya hai|what do i do first|where do i begin|where to start today|what should i start with|pehle kya karun'],
['why_missed','why did i miss things','why did i miss|what did i miss|why am i behind|why is my score low|kya miss hua|what did i skip|why low adherence|what went wrong|what are the things i missed|what have i missed|which activities did i miss'],
['tomorrow','what about tomorrow plan','tomorrow plan|tomorrow s schedule|what about tomorrow|how about tomorrow|kal ka plan|kal kya hai|what do i have tomorrow|plan for tomorrow|kal ka schedule|kal ka plan batao|tomorrow s tasks|next day plan'],
['tips_sleep','tips for better sleep i cant sleep','sleep tips|i cant sleep|trouble sleeping|better sleep|insomnia|neend nahi aa rahi|neend ke liye tips|how to sleep better|help me sleep|sleep advice|i dont sleep well|sleeping badly|poor sleep|waking up at night|cant fall asleep'],
['tips_water','tips for drinking water','water tips|how much water|how to stay hydrated|hydration advice|paani kitna peena chahiye|drink more water|hydration tips|am i drinking enough water'],
['tips_diet','diet tips','diet tips|healthy eating advice|nutrition tips|food advice|khane ke tips|how should i eat|healthy diet|eating habits|diet advice'],
['tips_stress','tips to reduce stress','reduce stress|stress tips|how to relax|calm down tips|tanav kam kaise karein|manage stress|i feel stressed|relaxation advice|stress relief|ideas to manage tension|ways to handle pressure|how to stay calm|mind is racing|overthinking help'],
['tips_breathing','teach me a breathing exercise','breathing exercise|teach me breathing|pranayama|saans ka exercise|deep breathing|breathing technique|guide my breathing|calm breathing'],
['tips_exercise','exercise tips','exercise tips|workout advice|how to exercise|walking tips|what exercise should i do|vyayam kaise karein|move more|activity advice|physical activity tips|what exercise suits me|which exercise is good for me|best exercise for me'],
['what_eat','what should i eat for dinner','what should i eat|what to eat for dinner|lunch ideas|breakfast ideas|snack ideas|aaj kya khana chahiye|meal suggestion|what can i have for dinner|healthy snack'],
['sweets','can i eat sweets','can i eat sweets|is dessert ok|can i have chocolate|mithai kha sakta hu|can i eat cake|sugar craving|can i have sweets|a piece of cake|can i have ice cream|can i eat something sweet|sweet craving|meetha khana hai'],
['dizzy','i feel dizzy','i feel dizzy|feeling lightheaded|chakkar aa rahe hain|room is spinning|i am dizzy|dizziness'],
['headache','i have a headache','i have a headache|my head hurts|sir dard|head is paining|migraine|headache help'],
['fever_vomit','i have fever and vomiting','i have fever|feeling nauseous|i vomited|bukhar hai|loose motion|stomach upset|feeling sick|nausea'],
['tired','i feel tired','i feel tired|no energy|i am exhausted|feeling weak|thakan lag rahi hai|fatigue|so sleepy all day'],
['sad','i feel sad and hopeless','i feel sad|i am depressed|feeling low|feeling lonely|mann udaas hai|i feel hopeless|i am upset|feeling down|i want to cry'],
['anxious','i feel anxious','i feel anxious|i am worried|panic feeling|ghabrahat ho rahi hai|feeling nervous|too much tension|anxiety help|i am scared'],
['med_question','should i take my medicine now','should i take my medicine|can i skip my dose|can i stop my medicine|double dose|extra tablet|dawa le lu kya|i forgot my dose what do i do|how much should i take|goli kab leni chahiye'],
['how_mark','how do i mark a task complete','how do i mark complete|how to tick off a task|how to finish an activity|task complete kaise karein|how do i mark done|how to complete activity'],
['how_add','how do i add an activity','how to add activity|add a new task|create a reminder|how do i add a prescription|naya activity kaise add karein|add a walk|set up a new reminder'],
['how_delete','delete my prescription','delete prescription|remove an activity|how to delete task|deactivate prescription|activity hatao|remove a reminder'],
['how_skip','how do i skip','how to skip an activity|skip a task|can i skip this|skip kaise karein'],
['who_are_you','who are you','who are you|what is your name|what are you|tum kaun ho|introduce yourself|are you sahaara|tell me about yourself'],
['are_doctor','are you a doctor','are you a doctor|are you a nurse|are you human|are you a real person|kya aap doctor hain|are you a medical professional|are you a physician|are you a medical expert|do you have medical training'],
['how_are_you','how are you','how are you|how do you do|kaise ho|aap kaise hain|how is it going|whats up|how are you doing'],
['what_can_do','what can you do','what can you do|how can you help me|what are your features|help me|kya kya kar sakte ho|what do you do|list your abilities|what can i ask you'],
['joke','tell me a joke','tell me a joke|make me laugh|say something funny|joke sunao|crack a joke|i want a joke'],
['motivate','motivate me','motivate me|encourage me|inspire me|i feel lazy|himmat do|cheer me up|give me motivation'],
['my_name','what is my name','what is my name|who am i|do you know my name|mera naam kya hai|say my name'],
['my_doctor','who is my doctor','who is my doctor|my doctor name|who is my care team|mere doctor kaun hain|my clinician|which doctor am i seeing'],
['active_plan','show my active care plan','show my care plan|my active plan|show my prescriptions|mera care plan dikhao|what activities do i have|list my prescriptions|what is in my plan|which medicines are active'],
['weather','what is the weather','what is the weather|will it rain|todays temperature|mausam kaisa hai|latest news|cricket score|stock price'],
['thanks','thank you','thank you|thanks|thanks a lot|shukriya|dhanyavaad|thank you so much|great thanks'],
['hello','hello','hello|hi|hey|namaste|good morning|good evening|hi sahaara|hey there']
];
var SAHAARA_INTENTS_HI = [
['plan_today','आज का प्लान क्या है','आज का प्लान|मेरा आज का प्लान|आज क्या करना है|आज का शेड्यूल|आज की योजना|आज मुझे क्या करना है|मेरा आज का शेड्यूल'],
['left_today','आज क्या बाकी है','आज क्या बाकी है|क्या बाकी है|कितना बाकी है|आज का कुछ बाकी है|अभी क्या पूरा करना है|आज क्या-क्या बचा है|क्या बचा है'],
['next_item','अगला काम क्या है','अगला काम|अगला कार्य|अब क्या करना है|आगे क्या है|अगली गतिविधि|अगला क्या है|अब क्या करूं'],
['adherence','मेरी प्रगति कैसी है','मेरी प्रगति कैसी है|प्रगति कैसी है|मैं कैसा कर रहा हूं|मेरा स्कोर क्या है|मैं ठीक चल रहा हूं|मेरी प्रगति बताओ|इस हफ्ते मेरा हाल'],
['tomorrow','कल का प्लान','कल का प्लान|कल क्या है|कल का शेड्यूल|कल मुझे क्या करना है|कल की योजना'],
['tips_sleep','नींद के लिए सुझाव','नींद नहीं आती|नींद के लिए टिप्स|अच्छी नींद कैसे लें|नींद के लिए सुझाव|रात को नींद नहीं आती|नींद के उपाय'],
['tips_water','पानी पीने के सुझाव','पानी कितना पीना चाहिए|पानी पीने के टिप्स|पानी के सुझाव|पानी कैसे पीएं|हाइड्रेशन के उपाय'],
['tips_stress','तनाव कम करने के उपाय','तनाव कम कैसे करें|तनाव के उपाय|मन शांत कैसे करें|बहुत तनाव है|आराम के उपाय'],
['tips_breathing','सांस का व्यायाम','सांस का व्यायाम|प्राणायाम सिखाओ|गहरी सांस कैसे लें|सांस लेने का तरीका|सांस की एक्सरसाइज'],
['tips_diet','खान-पान के सुझाव','खान पान के सुझाव|क्या खाना चाहिए|खाने के टिप्स|स्वस्थ आहार|पोषण के टिप्स|डाइट के सुझाव'],
['tips_exercise','व्यायाम के सुझाव','व्यायाम के सुझाव|कौन सा व्यायाम करूं|वॉक कैसे करें|एक्सरसाइज के टिप्स|शारीरिक गतिविधि के सुझाव'],
['headache','सिरदर्द','सिरदर्द है|सिर दर्द हो रहा है|मेरे सिर में दर्द है|सिरदर्द हो रहा है|माइग्रेन'],
['dizzy','चक्कर आना','चक्कर आ रहे हैं|मुझे चक्कर आ रहे हैं|चक्कर आ रहा है|सिर घूम रहा है'],
['sad','उदासी','मन उदास है|मुझे उदासी लग रही है|बहुत अकेला महसूस|मैं निराश हूं|मन भारी है|रोने का मन कर रहा है'],
['anxious','घबराहट','घबराहट हो रही है|मुझे डर लग रहा है|बेचैनी हो रही है|चिंता हो रही है|मुझे घबराहट है'],
['med_question','दवा का सवाल','दवा अभी लूं क्या|दवा छोड़ सकता हूं|दवा बंद कर दूं|गोली कब लेनी चाहिए|दवा दोबारा लूं|भूल गया दवा'],
['how_mark','काम पूरा कैसे करें','काम पूरा कैसे करें|टास्क पूरा कैसे करें|कैसे मार्क करूं|गतिविधि पूरी कैसे करें'],
['hello','नमस्ते','नमस्ते|नमस्कार|हैलो|सुप्रभात|शुभ संध्या'],
['thanks','धन्यवाद','धन्यवाद|शुक्रिया|बहुत बहुत धन्यवाद|थैंक्यू|आभार'],
['who_are_you','आप कौन हैं','आप कौन हैं|तुम कौन हो|आपका नाम क्या है|आप क्या हैं'],
['how_are_you','आप कैसे हैं','आप कैसे हैं|कैसे हो|तुम कैसे हो|आप कैसी हैं|सब ठीक है'],
['joke','मज़ाक सुनाओ','मजाक सुनाओ|कोई जोक सुनाओ|मुझे हंसाओ|कुछ मज़ेदार बताओ'],
['motivate','प्रेरणा दो','मुझे प्रेरणा दो|हिम्मत दो|मेरा हौसला बढ़ाओ|मुझे आलस आ रहा है'],
['my_name','मेरा नाम','मेरा नाम क्या है|मुझे मेरा नाम बताओ'],
['weather','मौसम','आज मौसम कैसा है|बारिश होगी क्या|मौसम का हाल'],
];
var SM_STOP = {the:1,a:1,an:1,is:1,my:1,me:1,i:1,to:1,of:1,for:1,please:1,can:1,could:1,would:1,do:1,does:1,it:1,on:1,in:1,at:1,and:1,tell:1,give:1,show:1,about:1,this:1,that:1,s:1,t:1,m:1,what:1,am:1,with:1,some:1,hai:1,ka:1,ki:1,ke:1,mujhe:1};
var SM_IDX = null, SM_LOGKEY = 'sahaara_unmatched_v1';
function smStem(w) { return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w; }
function smTok(s) {
  const all = normalizeEmergencyText(String(s || '')).split(/\s+/).filter(Boolean).map(smStem);
  const c = all.filter(function(w) { return !SM_STOP[w]; });
  return c.length ? c : all;
}
function smEd1(a, b) {
  if (a === b) return true; if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}
function smBuildIndex() {
  SM_IDX = SAHAARA_INTENTS.map(function(r) { return { id: r[0], canon: r[1], ex: r[2].split('|').map(smTok).filter(function(t) { return t.length; }) }; });
}
function sahaaraMatchIntent(input) {
  try {
    if (/[\u0900-\u097F]/.test(String(input||'')) && /(प्लान|शेड्यूल|योजना)/.test(String(input)) && !/कल/.test(String(input))) return smBestOf(SAHAARA_INTENTS_HI.filter(function(r){return r[0]==='plan_today';}).map(function(r){return {id:r[0],canon:r[1],ex:r[2].split('|').map(smTok).filter(function(t){return t.length;})};}), input);
    if (/[\u0900-\u097F]/.test(String(input||''))) return smBestOf(SAHAARA_INTENTS_HI.map(function(r){return {id:r[0],canon:r[1],ex:r[2].split('|').map(smTok).filter(function(t){return t.length;})};}), input);
    if (!SM_IDX) smBuildIndex();
    return smBestOf(SM_IDX, input);
  } catch (e) { return null; }
}
function smBestOf(idx, input) {
  try {
    const q = smTok(input); if (!q.length) return null;
    let best = null, second = 0;
    idx.forEach(function(it) {
      let top = 0;
      it.ex.forEach(function(e) {
        let ov = 0; e.forEach(function(w) { if (q.some(function(x) { return smEd1(x, w); })) ov++; });
        let sc = 2 * ov / (q.length + e.length);
        if (ov === e.length && e.length >= 2) sc = Math.max(sc, 0.62);
        if (sc > top) top = sc;
      });
      if (!best || top > best.score) { second = best ? best.score : 0; best = { id: it.id, canon: it.canon, score: top }; } else if (top > second) second = top;
    });
    if (best && best.score >= 0.5 && (best.score - second >= 0.08 || best.score >= 0.8)) return best;
    return null;
  } catch (e) { return null; }
}
function sahaaraLogUnmatched(text) {
  try { const l = JSON.parse(localStorage.getItem(SM_LOGKEY) || '[]'); l.push({ q: String(text).slice(0, 160), t: Date.now() }); localStorage.setItem(SM_LOGKEY, JSON.stringify(l.slice(-200))); } catch (e) {}
  if (window.CTBackend) { try { window.CTBackend.logUnmatched(text); } catch (e) {} }
}
function sahaaraUnmatched() { try { return JSON.parse(localStorage.getItem(SM_LOGKEY) || '[]'); } catch (e) { return []; } }
var SAHAARA_HI_ANSWERS = {
  plan_today: function(c){ return c.pending.length ? 'आज आपके '+c.pending.length+' काम बाकी हैं: '+c.list+'।' : 'आज के लिए सब हो गया है। बहुत अच्छा!'; },
  left_today: function(c){ return c.pending.length ? 'अभी '+c.pending.length+' काम बाकी हैं: '+c.list+'।' : 'आज कुछ बाकी नहीं है।'; },
  next_item: function(c){ return c.pending.length ? 'अगला काम '+c.pending[0].title+' है, समय '+formatTime12(c.pending[0].time)+' पर।' : 'अभी कोई अगला काम नहीं है।'; },
  adherence: function(c){ return c.week.pct!==null ? 'पिछले 7 दिनों में आपने '+c.week.scheduled+' में से '+c.week.completed+' काम पूरे किए, यानी '+c.week.pct+' प्रतिशत।' : 'अभी आपका डेटा पर्याप्त नहीं है।'; },
  tomorrow: function(c){ return c.tomorrowCount ? 'कल आपके '+c.tomorrowCount+' काम हैं।' : 'कल के लिए अभी कुछ तय नहीं है।'; },
  tips_sleep: function(){ return 'सोने और उठने का समय रोज़ एक जैसा रखें। सोने से आधा घंटा पहले स्क्रीन से दूर रहें। अगर नींद की समस्या कुछ हफ्तों से है, तो अपनी केयर टीम को बताएं।'; },
  tips_water: function(){ return 'दिन भर थोड़ा-थोड़ा पानी पिएं। अगर आपकी केयर टीम ने पानी की सीमा बताई है, तो उसी का पालन करें।'; },
  tips_stress: function(){ return 'चार गिनती तक धीरे सांस लें और छह गिनती तक छोड़ें। थोड़ी देर टहलें या किसी भरोसेमंद व्यक्ति से बात करें।'; },
  tips_breathing: function(){ return 'आराम से बैठें, चार गिनती तक नाक से सांस लें और छह गिनती तक धीरे छोड़ें। दो मिनट दोहराएं।'; },
  tips_diet: function(){ return 'थाली में आधी सब्ज़ियां रखें और घर का बना खाना चुनें। बड़े बदलाव से पहले अपनी केयर टीम से पूछें।'; },
  tips_exercise: function(){ return 'दस मिनट की हल्की सैर से शुरू करें और धीरे-धीरे बढ़ाएं। जितना आपके डॉक्टर ने बताया है, उतना ही करें।'; },
  headache: function(){ return 'आराम से किसी शांत जगह पर लेटें और पानी पिएं। अगर दर्द अचानक और बहुत तेज़ है, या कमज़ोरी या बोलने में परेशानी है, तो तुरंत 112 पर कॉल करें।'; },
  dizzy: function(){ return 'बैठ जाएं या लेट जाएं और पानी पिएं। अगर बेहोशी, भ्रम या सीने में दर्द है, तो तुरंत 112 पर कॉल करें।'; },
  sad: function(){ return 'मुझे खेद है कि आप ऐसा महसूस कर रहे हैं। क्या आज कोई बात है जो आपको सबसे ज़्यादा परेशान कर रही है? अगर आप खुद को असुरक्षित महसूस करें, तो 112 या टेले-मानस 14416 पर कॉल करें।'; },
  anxious: function(){ return 'चार गिनती तक सांस लें और छह गिनती तक छोड़ें, कुछ बार दोहराएं। क्या आप चाहेंगे कि मैं आपको सांस का अभ्यास बताऊं?'; },
  med_question: function(){ return 'दवा लेने, छोड़ने या बदलने के बारे में मैं सलाह नहीं दे सकता। कृपया अपने डॉक्टर या फार्मासिस्ट से पूछें। मैं आपकी योजना में जो लिखा है वह बता सकता हूं।'; },
  how_mark: function(){ return 'आज की योजना खोलें और काम के आगे पूरा करें दबाएं। वॉइस मोड में आप कह सकते हैं: मेरा सुबह का काम पूरा करो।'; },
  hello: function(){ return 'नमस्ते! मैं आपकी देखभाल में मदद के लिए हूं। आज आपका कैसा दिन जा रहा है?'; },
  thanks: function(){ return 'आपका स्वागत है! कुछ और चाहिए तो बताइए।'; },
  who_are_you: function(){ return 'मैं साहारा हूं, आपकी देखभाल योजना में सहायता करने वाला एआई साथी। मैं डॉक्टर नहीं हूं।'; },
  how_are_you: function(){ return 'मैं ठीक हूं, धन्यवाद। आप आज कैसा महसूस कर रहे हैं?'; },
  joke: function(){ return 'आपने पानी की बोतल से पूछा कि आप कैसी हैं? उसने कहा, मैं हमेशा हाइड्रेटेड हूं!'; },
  motivate: function(){ return 'हर छोटा कदम मायने रखता है। बस अगला छोटा कदम उठाइए, आप बहुत अच्छा कर रहे हैं।'; },
  my_name: function(){ return State.profile && State.profile.name ? 'आपका नाम '+State.profile.name+' है।' : 'मेरे पास अभी आपका नाम नहीं है। आप इसे प्रोफ़ाइल में जोड़ सकते हैं।'; },
  weather: function(){ return 'मैं मौसम की लाइव जानकारी नहीं दे सकता। क्या मैं आपकी आज की योजना बताऊं?'; }
};
function sahaaraHiAnswer(id) {
  try {
    const today=todayStr(); const all=smOcc(today); const pending=smPending(today);
    const ctx={ pending: pending, list: smList(pending), week: calcDetailedAdherence(addDays(today,-6), today), tomorrowCount: getAllOccurrencesForDate(addDays(today,1)).length };
    const fn=SAHAARA_HI_ANSWERS[id]; return fn ? fn(ctx) : null;
  } catch (e) { return null; }
}
function sahaaraRoute(input, options, ctxArray) {
  if (/[\u0900-\u097F]/.test(String(input||''))) { if (/[\u0900-\u097F]/.test(String(input||'')) && /(मेरा|मुझे|मेरी)/.test(String(input)) && /(दवा|गोली)/.test(String(input)) && /(लूं|छोड़|बंद|दोबारा|भूल)/.test(String(input))) return SAHAARA_HI_ANSWERS.med_question(); const hh=sahaaraMatchIntent(input); const t=hh?sahaaraHiAnswer(hh.id):null; if (t) return t; sahaaraLogUnmatched(input); return 'मुझे ठीक से समझ नहीं आया। आप पूछ सकते हैं: आज का प्लान क्या है, मेरी प्रगति कैसी है, या नींद के लिए सुझाव।'; }
  const medRisk = /\b(dose|tablet|pill|medicine|medication|metformin|insulin|dawa|goli)\b/i.test(input) && /\b(should|can i|stop|skip|double|extra|forgot|missed|how much|le lu)\b/i.test(input);
  const hit = medRisk ? null : sahaaraMatchIntent(input);
  const q = hit ? hit.canon : input;
  let text = smartAnswer(q, options, ctxArray);
  if (!text) text = getBuiltInResponse(q);
  if (!hit && /^I'm Sahaara — an AI guidance/.test(String(text || '')) && !/\b(who|name|introduce|yourself|what are you|tum kaun)\b/i.test(input)) { sahaaraLogUnmatched(input); return smFallback(input); }
  const generic = /^(I'm not sure I fully understood|That's an interesting question|I want to make sure I help you)/.test(String(text || ''));
  if (generic) { if (!hit) sahaaraLogUnmatched(input); return smFallback(input); }
  return text;
}
var SM = { vi: {}, topic: null };
function smPick(key, arr) { SM.vi[key] = ((SM.vi[key] || 0) + 1) % arr.length; return arr[SM.vi[key]]; }
function smName() { return State.profile && State.profile.name ? String(State.profile.name).split(' ')[0] : ''; }
function smOcc(date) {
  return getAllOccurrencesForDate(date).map(function(o) { return { o: o, st: getOccurrenceStatus(o.prescriptionId, o.date || date, o.time).status }; });
}
function smPending(date) {
  return smOcc(date).filter(function(x) { return x.st === 'due' || x.st === 'upcoming'; }).map(function(x) { return x.o; }).sort(function(a, b) { return timeToMinutes(a.time) - timeToMinutes(b.time); });
}
function smList(items) { return items.slice(0, 3).map(function(o) { return o.title + ' at ' + formatTime12(o.time); }).join(', then '); }
function smWeek(offset) { const t = todayStr(); return calcDetailedAdherence(addDays(t, -6 - offset), addDays(t, -offset)); }
function smDays() {
  const t = todayStr(); const out = [];
  for (let i = 0; i < 7; i++) { const d = addDays(t, -i); const s = calcDetailedAdherence(d, d); if (s && s.pct !== null && s.scheduled) out.push({ d: d, pct: s.pct, s: s }); }
  return out;
}
function smDayName(d) { try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }); } catch (_) { return d; } }
var SM_TIPS = {
  diet: [['Eat at regular times and keep portions balanced.', 'Fill half your plate with vegetables.', 'Follow the meal plan from your care team.'], ['Choose home-cooked whole foods over packaged snacks.', 'Keep sweet drinks and fried food occasional.', 'Ask your care team before making big diet changes.']],
  water: [['Sip water steadily through the day instead of all at once.', 'Keep a bottle near you as a reminder.', 'Your care team may set a specific fluid limit, so follow that first.'], ['Drink a glass after you wake up and with each meal.', 'Pale yellow urine is a good sign you are hydrated.', 'If you have been told to limit fluids, stay within that limit.']],
  sleep: [['Go to bed and wake up at the same time every day.', 'Keep screens away for the last half hour.', 'Keep the room dark, cool and quiet.'], ['Avoid tea, coffee and heavy meals late at night.', 'Try slow breathing or gentle stretching in bed.', 'If sleep trouble lasts for weeks, mention it to your care team.']],
  stress: [['Take five slow breaths, in through the nose for four counts and out for six.', 'Step away from screens for a short walk.', 'Talk to someone you trust.'], ['Write down what is worrying you, then pick one small step.', 'Gentle stretching or music can settle the mind.', 'If worry stays heavy, tell your care team.']],
  breathing: [['Sit comfortably and breathe in slowly through your nose for four counts.', 'Breathe out gently for six counts.', 'Repeat for two minutes and stop if you feel dizzy.'], ['Rest one hand on your belly and feel it rise as you inhale.', 'Let the breath out slowly like a sigh.', 'Do it daily at the same time so it becomes a habit.']],
  exercise: [['Start with a ten minute walk and build up slowly.', 'Stay at the activity level your clinician approved.', 'Rest if you feel pain or dizziness.'], ['Regular light movement matters more than hard workouts.', 'Warm up for a few minutes first.', 'Carry water and stop if you feel unwell.']]
};
function smTips(key, voice) {
  const set = smPick('tips_' + key, SM_TIPS[key]); SM.topic = { k: 'tips', key: key, set: set, shown: 0 };
  const n = voice ? 2 : 3; SM.topic.shown = n;
  return (voice ? '' : 'Here are some ideas. ') + set.slice(0, n).join(' ') + (voice ? ' Want more?' : '');
}
function smMedRefusal() {
  return smPick('med', ['I cannot advise on doses or whether to take, skip or stop a medicine. Please ask your doctor or pharmacist; I can tell you what is scheduled in your plan.', 'That is a question for your prescribing doctor, not me, because I cannot change or judge doses. I can tell you what your plan lists and when.', 'I am not able to guide medicine decisions safely. Your doctor or pharmacist can answer this properly; I can read out your scheduled activities if that helps.']);
}
function smFallback(q) {
  const t = SM.topic && SM.topic.k ? ' We were just talking about ' + ({ adherence: 'your progress', left: 'what is left today', next: 'your next activity', plan: 'your plan', tips: 'self-care tips' }[SM.topic.k] || 'your plan') + '.' : '';
  return smPick('fb', ['I did not quite get that.' + t + ' I can tell you what is left today, how your week went, or give a quick tip on sleep, food, water or stress. Which one?', 'Hmm, I am not sure what you mean. Try asking things like "what is next", "how was my week", or "tips for better sleep".', 'I may have missed that. You can ask me about today\'s plan, your best day this week, or simple self-care advice. What would help?']);
}
function smFixFallback(text, input) {
  if (/^(I'm not sure I fully understood|That's an interesting question|I want to make sure I help you)/.test(String(text || ''))) return smFallback(input);
  return text;
}
function smartAnswer(input, options, ctxArray) {
  try {
    if (AI.language !== 'en' && AI.language !== 'hi-Latn') return null;
    const raw = String(input || ''); const q = normalizeEmergencyText(raw); if (!q) return null;
    const voice = !!(options && options.voiceMode); const today = todayStr(); const has = function(re) { return re.test(q); };
    const name = smName();
    const m = q.match(/(\d+(?:\.\d+)?)\s*(plus|minus|times|multiplied by|divided by|into|x)\s*(\d+(?:\.\d+)?)/);
    if (m) { const a = parseFloat(m[1]), b = parseFloat(m[3]); const r = { plus: a + b, minus: a - b, times: a * b, 'multiplied by': a * b, into: a * b, x: a * b, 'divided by': b ? a / b : NaN }[m[2]]; if (isFinite(r)) return smPick('math', ['That is ' + (Math.round(r * 100) / 100) + '. Anything about your plan I can help with?', (Math.round(r * 100) / 100) + '. Quick maths done, now back to your self-care whenever you like.']); }
    if (has(/\b(metformin|insulin|glimepiride|tablet|tablets|pill|pills|dose|dosage|medicine|medication|dawa|dawai|goli|goliyan)\b/) && has(/\b(should i|can i|could i|may i|is it ok|okay|stop|double|extra|skip|how much|how many|kitni|kitna|le lu|bhool|forgot|missed)\b/) && !has(/\b(mark|complete|done|remind|when|left|next|schedule)\b/)) return smMedRefusal();
    const T = SM.topic;
    if (T && has(/^(and )?(after that|then what|what else|what after|and then|next one)\b|\bafter that\b/) && (T.k === 'left' || T.k === 'next' || T.k === 'plan')) {
      const p = smPending(today); return p.length > 1 ? 'After ' + p[0].title + ', you have ' + smList(p.slice(1)) + '.' : 'Nothing else is scheduled after that today.';
    }
    if (T && has(/^(tell me more|more|go on|continue|explain|why|elaborate|more tips|give me more|another)\b/)) {
      if (T.k === 'tips') { const rest = T.set.slice(T.shown); T.shown = T.set.length; return rest.length ? rest.join(' ') : 'That is all I have on this for now. Your care team can personalise it further.'; }
      if (T.k === 'adherence') { const days = smDays().sort(function(a, b) { return a.pct - b.pct; }); return days.length ? 'Your toughest day was ' + smDayName(days[0].d) + ' at ' + days[0].pct + ' percent' + (days[0].s.missed ? ', with ' + days[0].s.missed + ' missed' : '') + '. Linking activities to a daily habit, like after breakfast, usually helps.' : 'There is not enough data yet to break it down.'; }
    }
    if (T && T.k === 'adherence' && has(/\b(what can i do|how (can|do) i (improve|fix)|improve it|do about it|get better)\b/)) return smPick('imp', ['Pick the one activity you miss most and attach it to something you already do daily, like after breakfast. Small steady wins beat big plans.', 'Try one reminder at a fixed time for your most missed activity, and celebrate each day you finish everything.']);
    if (has(/\b(how about|what about|and)\b.*\btomorrow\b|\btomorrow\b.*\b(plan|schedule)\b|\btomorrow s plan\b/)) { const l = getAllOccurrencesForDate(addDays(today, 1)).slice().sort(function(a, b) { return timeToMinutes(a.time) - timeToMinutes(b.time); }); SM.topic = { k: 'plan' }; return l.length ? 'Tomorrow you have ' + l.length + (l.length === 1 ? ' activity' : ' activities') + ': ' + smList(l) + (l.length > 3 ? ', and more' : '') + '.' : 'Nothing is scheduled for tomorrow yet.'; }
    if (has(/\b(what is my name|who am i|my name)\b/)) return name ? 'Your name is ' + name + (State.profile.name.indexOf(' ') > 0 ? ', full name ' + State.profile.name : '') + '.' : 'I do not have your name yet. You can add it in your Profile.';
    if (has(/\b(who is my doctor|my doctor|my clinician|my care team)\b/) && has(/\b(who|name)\b/)) return State.profile && State.profile.clinician ? 'Your clinician on file is ' + State.profile.clinician + '.' : 'I do not see a clinician in your profile. You can add one there.';
    if (has(/\b(are you (a )?(real )?(doctor|nurse|human|person))\b/)) return smPick('doc', ['No, I am an AI guide, not a doctor or nurse. I can explain your self-care plan, but medical decisions belong to your care team.', 'I am an AI, not a medical professional. Think of me as a helpful companion for your daily routine.']);
    if (has(/\b(how are you|how r you|kaise ho|kaisi ho|how do you do)\b/)) return smPick('hay', ['I am doing well, thank you for asking' + (name ? ', ' + name : '') + '. How are you feeling today?', 'All good here and ready to help. How is your day going so far?']);
    if (has(/\b(what can you do|what do you do|help me|how can you help)\b/) && !has(/\b(sleep|stress|diet)\b/)) return 'I can tell you what is left today, what is next, how your week is going, and give simple tips on food, water, sleep, stress and movement. In voice mode I can also mark a morning activity done.';
    if (has(/\b(who are you|your name|what are you)\b/)) return smPick('who', ['I am Sahaara, your self-care guide in CareTrack. I help you follow your plan, but I am not a doctor.', 'Sahaara here, an AI companion for your daily self-care routine. For medical decisions, your care team is the right place.']);
    if (has(/\b(joke|funny|make me laugh)\b/)) return smPick('joke', ['Why did the apple stay healthy? Because it kept the doctor away, and it never skipped a check-in.', 'What did the water bottle say to the walker? Let us stay hydrated together.', 'I tried to tell a joke about sleep, but it put me to bed early.']);
    if (has(/\b(motivate|motivation|encourage|inspire|cheer me)\b|\bfeeling lazy\b/)) { const s = calcDetailedAdherence(today, today); return smPick('mot', ['Every small check-in counts' + (s && s.scheduled ? ', and you have done ' + s.completed + ' of ' + s.scheduled + ' today' : '') + '. One more step and you are on a roll.', 'You do not need a perfect day, only the next small step. Want me to tell you what is next?', 'Showing up for your routine is already a win' + (name ? ', ' + name : '') + '. Keep going gently.']); }
    if (has(/\b(weather|temperature|rain|news|cricket|score)\b/)) return 'I cannot check live things like weather or news. I can help with your plan and self-care though. Want to hear what is next?';
    if (has(/\bhow (do|can|to)\b.*\b(mark|complete|tick|finish)\b|\bmark.*\b(complete|done)\b.*\bhow\b/) && !has(/\b(my morning|my evening)\b/)) return voice ? 'Say "mark my morning activity complete", or tap Complete on Today\'s Plan.' : 'Open Today\'s Plan and tap Complete beside the activity. In voice mode you can also say "mark my morning activity complete".';
    if (has(/\bhow (do|can|to)\b.*\b(add|create|new|set up)\b.*\b(activity|task|prescription|reminder|walk)\b|\badd (a|an|my)?\s*(walk|activity|task|reminder)/)) return 'Open My Prescriptions and tap Add. Choose the activity, days and times and save. I cannot add one by voice yet.';
    if (has(/\b(delete|remove|deactivate)\b.*\b(prescription|activity|task)\b/)) return 'I will not delete anything by voice. Open My Prescriptions, pick the item and choose Deactivate, so nothing is removed by accident.';
    if (has(/\bhow (do|can|to)\b.*\bskip\b/)) return 'On Today\'s Plan tap Skip beside the activity. Skipped items show in your reports.';
    if (has(/\b(best|strongest|top)\s+day\b|\bwhich day.*\b(best|most)\b/)) { const d = smDays().sort(function(a, b) { return b.pct - a.pct; }); SM.topic = { k: 'adherence' }; return d.length ? 'Your best day this week was ' + smDayName(d[0].d) + ' at ' + d[0].pct + ' percent.' : 'There is not enough data yet to pick a best day.'; }
    if (has(/\b(worst|hardest|toughest|weakest)\s+day\b/)) { const d = smDays().sort(function(a, b) { return a.pct - b.pct; }); SM.topic = { k: 'adherence' }; return d.length ? 'Your toughest day was ' + smDayName(d[0].d) + ' at ' + d[0].pct + ' percent.' : 'There is not enough data yet.'; }
    if (has(/\b(compare|versus|vs|than last week|better than|last week)\b/)) { const a = smWeek(0), b = smWeek(7); SM.topic = { k: 'adherence' }; if (a.pct === null) return 'There is not enough data for this week yet.'; if (b.pct === null) return 'This week you are at ' + a.pct + ' percent. I have no data from last week to compare.'; const diff = a.pct - b.pct; return 'This week you are at ' + a.pct + ' percent against ' + b.pct + ' last week, ' + (diff > 0 ? 'up ' + diff + ' points. Nice progress.' : diff < 0 ? 'down ' + Math.abs(diff) + ' points. A small reset can fix that.' : 'about the same.'); }
    if (has(/\b(summar(y|ize|ise)|recap|overview)\b.*\b(day|today)\b|\bhow (was|is) my day\b/)) { const all = smOcc(today); const c = all.filter(function(x) { return x.st === 'completed'; }).length; const ms = all.filter(function(x) { return x.st === 'missed'; }).length; const p = smPending(today); SM.topic = { k: 'plan' }; if (!all.length) return 'Nothing is scheduled today.'; return 'So far today you finished ' + c + ' of ' + all.length + (ms ? ', missed ' + ms : '') + (p.length ? '. Next is ' + p[0].title + ' at ' + formatTime12(p[0].time) + '.' : '. Nothing is left for today.'); }
    if (has(/\b(what should i (focus|do first|prioriti[sz]e)|focus on|priority today)\b/)) { const all = smOcc(today); const missed = all.filter(function(x) { return x.st === 'missed' || x.st === 'due'; }); const p = smPending(today); SM.topic = { k: 'next' }; if (missed.length) return 'Start with ' + missed[0].o.title + ', which is waiting from ' + formatTime12(missed[0].o.time) + '. Then ' + (p[0] && p[0].title !== missed[0].o.title ? p[0].title + ' at ' + formatTime12(p[0].time) : 'you are nearly done') + '.'; return p.length ? 'You are on track. Your next focus is ' + p[0].title + ' at ' + formatTime12(p[0].time) + '.' : 'Everything for today is handled. Rest well.'; }
    if (has(/\b(why|how come)\b.*\b(miss|missed|skipped|behind|low)\b|\bwhat did i miss\b/)) { const all = smOcc(today).filter(function(x) { return x.st === 'missed'; }); const w = smWeek(0); SM.topic = { k: 'adherence' }; return (all.length ? 'Today the tracker marks ' + all.slice(0, 3).map(function(x) { return x.o.title; }).join(', ') + ' as missed. ' : 'Nothing is missed so far today. ') + (w.pct !== null ? 'Over 7 days you completed ' + w.completed + ' of ' + w.scheduled + '. ' : '') + 'I cannot know why, but was timing the hard part?'; }
    if (voice && has(/\b(plan|schedule|routine)\b/) && has(/\b(today|aaj|my|read|tell)\b/) && !has(/\b(tomorrow|week|add|delete)\b/)) { const all = smOcc(today); const c = all.filter(function(x) { return x.st === 'completed'; }).length; const p = smPending(today); SM.topic = { k: 'plan' }; if (!all.length) return 'You have nothing scheduled today.'; return 'You have ' + all.length + ' activities today and finished ' + c + '. ' + (p.length ? 'Still ahead: ' + smList(p) + '.' : 'Nothing is left, well done.'); }
    if (has(/\b(sad|hopeless|depressed|lonely|low mood|feel down|crying|upset)\b|\bnot feeling (good|okay)\b/)) return smPick('sad', ['I am sorry you are feeling this way' + (name ? ', ' + name : '') + '. You are not alone. What has been weighing on you most today? If you ever feel unsafe, please call 112 or Tele-MANAS on 14416.', 'That sounds heavy, and I am glad you said it. Would talking to someone you trust, or your care team, feel possible today? If you feel unsafe, call 112 or Tele-MANAS 14416.']);
    if (has(/\b(anxious|anxiety|panic|worried|nervous|tense)\b/)) return smPick('anx', ['That sounds uncomfortable. Try a slow breath in for four and out for six, a few times. Would you like a short breathing guide?', 'Anxiety can feel big. Let us slow down together: feel your feet on the floor and breathe out longer than you breathe in. Shall I walk you through it?']);
    if (has(/\b(dizzy|dizziness|lightheaded|light headed|chakkar)\b/)) return 'Please sit or lie down and sip some water. If you have diabetes, check your sugar if you can. If you faint, feel confused, or have chest pain or breathing trouble, call 112 now. Otherwise let your care team know.';
    if (has(/\b(headache|head ache|migraine|sir dard)\b/)) return 'I am sorry you have a headache. Rest in a quiet place and drink some water. I cannot suggest medicines. Call 112 if it is sudden and severe, or comes with weakness, speech trouble or confusion, and tell your care team if it keeps returning.';
    if (has(/\b(fever|vomit|vomiting|nausea|diarrh|loose motion|bukhar)\b/)) return 'That sounds unpleasant. Rest and sip fluids in small amounts. I cannot diagnose or suggest medicines, so please contact your care team today, and call 112 if you cannot keep fluids down, feel very weak, or are confused.';
    if (has(/\b(tired|fatigue|exhausted|no energy|weak)\b/) && !has(/\bnot\b/)) return 'Feeling worn out happens. Check that you have eaten, had water and slept enough. If it is new, severe or lasting, tell your care team.';
    if (has(/\b(sweet|sweets|sugar|dessert|mithai|chocolate|cake)\b/) && has(/\b(can i|may i|eat|have|allowed)\b/)) return 'A small portion after a meal is usually easier on the body than on an empty stomach, but I cannot set limits for your condition. Please follow your care team\'s meal plan and ask them what suits you.';
    if (has(/\b(what should i eat|what to eat|dinner|lunch|breakfast|snack)\b/)) return smPick('eat', ['Think a balanced plate: vegetables, some protein, and whole grains in modest portions. Please stay within your own meal plan from your care team.', 'Keep it simple and home-cooked: dal or lean protein, vegetables and a small portion of roti or rice. Check your care team\'s plan for anything restricted.']);
    if (has(/\b(why)\b.*\b(exercise|walking|movement|activity)\b|\b(is walking|does walking)\b/)) return 'Regular light movement helps your heart, mood, sleep and energy. Stay at the level your clinician approved and build up slowly.';
    const kw = [['sleep', /\b(sleep|insomnia|neend|bedtime|cant sleep|can t sleep)\b/], ['water', /\b(water|hydrat|paani|pani|thirst)\b/], ['stress', /\b(stress|tension|tanav|relax|calm)\b/], ['breathing', /\b(breathing|breath|pranayama|saans)\b/], ['diet', /\b(diet|nutrition|khana|food tips|healthy food)\b/], ['exercise', /\b(exercise|workout|walk|walking|vyayam)\b/]];
    for (let i = 0; i < kw.length; i++) if (has(kw[i][1]) && has(/\b(tip|tips|advice|help|how|better|improve|should|can|suggest|do)\b|\?$/) && !has(/\bmy plan\b/)) { if (voice || kw[i][0] === 'sleep' && has(/\b(cant|can t|trouble|unable)\b/)) return smTips(kw[i][0], voice); break; }
    if (has(/\b(aaj ka plan|aaj ki yojana|aaj kya karna)\b/)) { const p = smPending(today); SM.topic = { k: 'plan' }; return p.length ? 'Aaj aapke paas ' + p.length + ' activities baaki hain: ' + smList(p) + '.' : 'Aaj ke liye sab ho gaya, bahut accha.'; }
    if (has(/\b(kya baaki|baaki hai|kitna baaki)\b/)) { const p = smPending(today); SM.topic = { k: 'left' }; return p.length ? 'Abhi ' + p.length + ' activities baaki hain: ' + smList(p) + '.' : 'Aaj kuch baaki nahi hai.'; }
    if (has(/\b(care plan|meri plan|mera plan|active plan)\b/) || has(/\b(show|dikhao)\b.*\b(plan|prescriptions?)\b/)) { const act = State.prescriptions.filter(function(r) { return r && r.active !== false && (!r.endDate || r.endDate >= today); }); SM.topic = { k: 'plan' }; return act.length ? 'You have ' + act.length + ' active activities, such as ' + act.slice(0, 3).map(function(r) { return r.title; }).join(', ') + '.' : 'You have no active activities yet. Open My Prescriptions to add one.'; }
    if (has(/\b(next|upcoming)\b/)) SM.topic = { k: 'next' }; else if (has(/\b(left|remaining|baaki)\b/)) SM.topic = { k: 'left' }; else if (has(/\badherence|progress\b/)) SM.topic = { k: 'adherence' };
    return null;
  } catch (e) { return null; }
}
function getBuiltInResponse(input) {
  const q = String(input || '').trim();
  const emergency = detectEmergency(q);
  if (emergency) {
    const copy = getEmergencyCopy(AI.language, emergency.kind === 'selfHarm', emergency.kind);
    return [copy.message, copy.support].filter(Boolean).join(' ');
  }
  const words = intentWords(q);
  const normalized = normalizeEmergencyText(q);
  const intents = [
    { key: 'selfHarm', exact: ['suicidal thoughts', 'want to kill myself', 'end my life'], terms: ['suicide', 'kill', 'life'], answer: 'medication' },
    { key: 'medication', exact: ['change my dose', 'change dose', 'medication dose', 'what dose should i take'], terms: ['medication', 'medicine', 'dosage', 'dose', 'tablet', 'pill', 'drug', 'diagnosis'], need: 1 },
    { key: 'left', exact: ['which doses are left today', 'what is left today', 'what is left to do'], terms: ['left', 'remaining', 'doses', 'today'], need: 2 },
    { key: 'next', exact: ['what is next', 'what is next today', 'what comes next', 'upcoming activity'], terms: ['next', 'upcoming', 'coming'], need: 1 },
    { key: 'adherence', exact: ['how is my adherence', 'why did my adherence drop', 'my adherence'], terms: ['adherence', 'progress', 'drop', 'completion', 'completed'], need: 1 },
    { key: 'missed', exact: ['what did i miss', 'missed activities', 'what have i missed'], terms: ['missed', 'skipped'], need: 1 },
    { key: 'prescriptions', exact: ['my prescriptions', 'active prescriptions', 'my care plan'], terms: ['prescription', 'prescriptions'], need: 1 },
    { key: 'plan', exact: ['today plan', 'plan for today', 'what should i do today', 'schedule today'], terms: ['plan', 'schedule', 'today', 'activities', 'tasks'], need: 2 },
    { key: 'diet', exact: ['healthy food', 'diet tips', 'nutrition advice'], terms: ['diet', 'nutrition', 'food', 'meal'], need: 1 },
    { key: 'activity', exact: ['exercise tips', 'physical activity', 'walking'], terms: ['exercise', 'activity', 'walk', 'workout'], need: 1 },
    { key: 'sleep', exact: ['sleep better', 'sleep routine'], terms: ['sleep', 'insomnia', 'bedtime'], need: 1 },
    { key: 'hydration', exact: ['drink water', 'water intake'], terms: ['water', 'hydration', 'hydrate'], need: 1 },
    { key: 'stress', exact: ['stress management', 'help me relax'], terms: ['stress', 'relax', 'anxiety', 'calm'], need: 1 },
    { key: 'breathing', exact: ['breathing exercise', 'deep breathing'], terms: ['breathing', 'breath', 'pranayama'], need: 1 },
    { key: 'completion', exact: ['mark as done', 'mark this complete', 'how to complete'], terms: ['complete', 'done', 'finished'], need: 1 },
    { key: 'skip', exact: ['skip this task', 'how to skip'], terms: ['skip', 'skipped'], need: 1 },
    { key: 'app', exact: ['how to use this app', 'help me navigate'], terms: ['navigate', 'app', 'howto'], need: 1 },
    { key: 'identity', exact: ['who are you', 'what are you'], terms: ['sahaara', 'who', 'identity'], need: 2 },
  ];
  const found = [];
  intents.forEach(function(intent, index) {
    let score = 0;
    if (intent.exact.some(function(phrase) { return normalized.indexOf(normalizeEmergencyText(phrase)) >= 0; })) score = 10;
    else {
      const hits = intent.terms.filter(function(term) { return fuzzyHasToken(words, term); }).length;
      if (hits >= (intent.need || 1)) score = 3 + hits;
    }
    if (score) found.push({ key: intent.key, score: score, index: index });
  });
  found.sort(function(a, b) { return b.score - a.score || a.index - b.index; });
  const selected = [];
  if (found.length) {
    const best = found[0];
    selected.push(best.key === 'selfHarm' ? 'medication' : best.key);
  }
  if (!selected.length) return getBuiltInResponseLegacy(q);
  const answers = selected.map(function(intent) { return getCompactBuiltinAnswer(intent, q); }).filter(Boolean);
  if (!answers.length) return getBuiltInResponseLegacy(q);
  const combined = answers.join(' ');
  return combined.length > 1050 ? combined.slice(0, 1045).replace(/\s+\S*$/, '') + '…' : combined;
}
function getBuiltInResponseLegacy(input) {
  const q = String(input || '').toLowerCase().trim();
  if (isAboutIdentity(q)) {
    return getIdentityResponse();
  }
  if (matchesAny(q, ["today's plan", "today plan", "plan for today", "what should i do today", "my tasks today", "today's tasks", "what's scheduled today", "what do i do today", "what should i do now"])) {
    return getTodaysPlanResponse();
  }
  if (matchesAny(q, ["adherence", "progress", "how am i doing", "my progress", "how is my progress", "my stats", "my report", "report", "how many completed", "completion rate"])) {
    return getAdherenceResponse();
  }
  if (matchesAny(q, ["my prescriptions", "my self-care", "what are my prescriptions", "show my prescriptions", "list prescriptions", "my plan", "my self-care plan", "self-care plan"])) {
    return getPrescriptionsResponse();
  }
  if (matchesAny(q, ["missed", "what did i miss", "what i missed", "missed tasks", "didn't do"])) {
    return getMissedResponse();
  }
  if (matchesAny(q, ["upcoming", "next task", "what's next", "what is next", "coming up"])) {
    return getNextTaskResponse();
  }
  if (matchesAny(q, ["diet", "nutrition", "food", "meal", "eating", "eat healthy", "dietary"])) {
    return getDietGuidance();
  }
  if (matchesAny(q, ["exercise", "physical activity", "walk", "walking", "workout", "activity", "move", "exercise routine"])) {
    return getActivityGuidance();
  }
  if (matchesAny(q, ["sleep", "insomnia", "bedtime", "sleep routine", "rest", "couldn't sleep", "sleep better"])) {
    return getSleepGuidance();
  }
  if (matchesAny(q, ["water", "hydrat", "drink", "dehydration", "fluid"])) {
    return getHydrationGuidance();
  }
  if (matchesAny(q, ["stress", "relax", "relaxation", "anxiety", "calm", "overwhelm", "tension", "stress management"])) {
    return getStressGuidance();
  }
  if (matchesAny(q, ["breath", "breathing", "deep breath", "breathing exercise", "pranayama"])) {
    return getBreathingGuidance();
  }
  if (matchesAny(q, ["how to use", "how do i", "help me navigate", "how does this work", "how to complete", "how to skip", "how to add", "where is", "navigate", "app help", "help with the app", "guide me"])) {
    return getAppNavigationHelp();
  }
  if (matchesAny(q, ["complete", "mark done", "mark as done", "i did it", "done", "finished"])) {
    return "To mark a task as complete:\n\n1. Go to \"Today's Plan\"\n2. Find the task you've done\n3. Click the green \"Complete\" button\n\nYou can also undo a completion if you marked it by mistake. Would you like me to help with anything else?";
  }
  if (matchesAny(q, ["skip", "can't do", "don't want to", "not feeling"])) {
    return "It's perfectly okay to skip a task sometimes. Here's how:\n\n1. Go to \"Today's Plan\"\n2. Click \"Skip\" on the task\n3. Optionally select a reason (like \"Not feeling well\" or \"Advised to rest\")\n\nSkipping doesn't mean failure — self-care is about being kind to yourself. Is there something else I can help with?";
  }
  if (matchesAny(q, ["hello", "hi", "hey", "good morning", "good afternoon", "good evening", "namaste", "hlo", "pranam", "namaskar", "kaise ho", "kem cho", "suprabhat"])) {
    const name = State.profile ? State.profile.name.split(' ')[0] : 'there';
    if (AI.language === 'hi') {
      return `नमस्ते, ${name}! 👋 आपसे बात करके अच्छा लगा। मैं आपकी आत्म-देखभाल योजना और दैनिक स्वास्थ्य गतिविधियों में मदद करने के लिए यहाँ हूँ। आप क्या जानना चाहेंगे?`;
    }
    return `Hello, ${name}! 👋 Great to hear from you. I'm here to help with your self-care plan and daily health routines. What would you like to know about?`;
  }
  if (matchesAny(q, ["thank", "thanks", "thank you", "shukriya", "dhanyavad"])) {
    return "You're welcome! Remember, I'm always here when you need guidance with your self-care plan. Take care of yourself! 💚";
  }
  if (matchesAny(q, ["bye", "goodbye", "see you", "good night"])) {
    const name = State.profile ? State.profile.name.split(' ')[0] : 'there';
    return `Take care, ${name}! Remember to follow your self-care plan, and don't hesitate to reach out if you need any guidance. Stay well! 💚`;
  }
  if (matchesAny(q, ["time", "what time", "current time"])) {
    return `The current time is ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}. ${getUpcomingHint()}`;
  }
  if (matchesAny(q, ["date", "what date", "today's date", "what day"])) {
    return `Today is ${formatDate(todayStr())}. You have ${getAllOccurrencesForDate(todayStr()).length} self-care activities scheduled for today.`;
  }
  if (matchesAny(q, ["doctor", "physician", "clinician", "medical advice", "diagnosis", "medicine", "medication", "drug", "prescription medicine", "pill", "tablet", "dosage"])) {
    return "I appreciate you asking, but I want to be transparent — I'm a self-care guidance assistant, not a medical professional. For any questions about medications, diagnosis, treatment, or clinical decisions, please contact your healthcare provider directly.\n\nI can help you with:\n• Understanding your self-care plan\n• Tracking your daily activities\n• General self-care guidance\n• Navigating this app\n\nWould you like help with any of these?";
  }
  if (matchesAny(q, ["emergency", "urgent", "severe pain", "can't breathe", "chest pain", "emergency help"])) {
    return "⚠️ If you're experiencing a medical emergency, please contact emergency services immediately.\n\n• Emergency: Call 112 (India) or your local emergency number\n• Your healthcare provider's contact should be in your profile\n\nI'm a self-care guidance tool and cannot handle emergencies. Please seek professional medical help right away.";
  }
  return getFallbackResponse(q);
}
function isAboutIdentity(q) {
  return matchesAny(q, [
    "who are you", "what are you", "tell me about you", "tell me something about you",
    "about yourself", "your name", "what is your name", "introduce yourself",
    "what do you do", "what can you do", "your purpose", "your role",
    "are you a doctor", "are you a real person", "are you real",
    "are you a bot", "are you ai", "are you artificial",
    "hey sahaara tell me", "hey sahaara who", "hey sahaara what",
    "sahaara tell me about", "sahaara who are", "sahaara what are",
    "your identity", "what kind of ai", "how were you made",
    "what is sahaara", "sahaara meaning", "why are you called",
    "tum kaun ho", "kaun ho", "tumhare baare mein", "apne baare mein batao",
    "aap kaun hain", "sahaara kaun hai", "tum kya ho", "aap kya hain",
    "apna parichay do", "tumhara naam", "aapka naam", "kya kaam karte ho",
  ]);
}
function getIdentityResponse() {
  if (AI.language === 'hi') {
    return "मैं सहारा हूँ — मरीज़ों के लिए बनाया गया एक AI मार्गदर्शन सहायक। मेरा काम है आपको आपकी आत्म-देखभाल योजना समझने में मदद करना, आपकी दैनिक गतिविधियों को ट्रैक करना, और आत्म-देखभाल पर मार्गदर्शन देना।\n\nमैं डॉक्टर या चिकित्सक नहीं हूँ। मैं चिकित्सा सलाह, निदान या उपचार नहीं देता। किसी भी चिकित्सा समस्या के लिए कृपया अपने चिकित्सक से संपर्क करें।\n\nबताइए, आज मैं आपकी कैसे मदद कर सकता हूँ?";
  }
  const responses = [
    "I'm Sahaara — an AI guidance assistant designed specifically for patients. My role is to help you understand and manage your self-care prescriptions, track your daily health activities, and provide guidance on your self-care routines.\n\nI'm here as a supportive guide on your self-care journey. I can explain your prescribed activities, help you stay on track, and answer questions about your daily wellness plan.\n\nImportant: I am NOT a doctor or medical professional. I don't provide medical advice, diagnosis, or treatment. Always consult your healthcare provider for clinical decisions.\n\nHow can I guide you today?",
    "I'm Sahaara, your patient guidance AI! 🌟\n\nMy purpose is simple — to help you navigate your self-care plan with confidence. I can:\n\n• Explain your daily self-care prescriptions\n• Help you track your adherence\n• Provide guidance on nutrition, activity, sleep, hydration, and stress management\n• Help you navigate this app\n• Answer questions about your self-care routines\n\nWhat I don't do:\n• Give medical advice or diagnosis\n• Replace your healthcare provider\n• Handle emergencies\n\nThink of me as a friendly guide who helps you stay on top of your self-care plan. What would you like to know?",
    "Hello! I'm Sahaara — and I'm glad you asked about me. 😊\n\nI'm an AI guidance assistant built to support patients in managing their self-care prescriptions. I'm like a knowledgeable guide who helps you understand what activities your care team has recommended, keeps you informed about your progress, and guides you through your daily wellness routines.\n\nMy knowledge covers self-care topics like diet, physical activity, sleep hygiene, hydration, stress management, and breathing exercises — all in the context of YOUR personal care plan.\n\nRemember: I guide, I don't diagnose. For any medical concerns, your healthcare provider is always the best resource. What can I help you with?"
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}
function getTodaysPlanResponse() {
  if (!State.profile) {
    return "I'd love to show you today's plan, but you haven't set up your profile yet! Let's get started:\n\n1. Go to \"Patient Profile\" to add your details\n2. Then go to \"My Self-Care Prescriptions\" to add activities, or load a demo plan from Settings\n\nWould you like me to guide you through setup?";
  }
  const today = todayStr();
  const occs = getAllOccurrencesForDate(today);
  if (occs.length === 0) {
    return `You have no self-care activities scheduled for today (${formatDate(today)}). This could mean:\n\n• No prescriptions are active for today\n• Today is a rest day for some activities\n• You might want to add new prescriptions\n\nWould you like to add some self-care activities, or check your prescriptions?`;
  }
  let completed = 0, pending = 0, missed = 0, due = 0;
  const tasks = [];
  for (const occ of occs) {
    const s = getOccurrenceStatus(occ.prescriptionId, occ.date, occ.time);
    if (s.status === 'completed') { completed++; tasks.push(`✅ ${occ.title} (${formatTime12(occ.time)}) — Done`); }
    else if (s.status === 'missed') { missed++; tasks.push(`❌ ${occ.title} (${formatTime12(occ.time)}) — Missed`); }
    else if (s.status === 'due') { due++; tasks.push(`⏰ ${occ.title} (${formatTime12(occ.time)}) — DUE NOW`); }
    else { pending++; tasks.push(`🔵 ${occ.title} (${formatTime12(occ.time)}) — Upcoming`); }
  }
  const total = occs.length;
  const pct = total > 0 ? Math.round(completed / total * 100) : 0;
  return `Here's your plan for today (${formatDate(today)}):\n\n📊 Progress: ${completed}/${total} completed (${pct}%)\n${missed > 0 ? `❗ ${missed} missed\n` : ''}${due > 0 ? `⏰ ${due} due now\n` : ''}\n${tasks.join('\n')}\n\n${missed > 0 ? '💡 Remember: Even missed tasks can still be completed — just go to Today\'s Plan and tap Complete!' : ''}\n${due > 0 ? '⚡ You have tasks that are due right now. Head to Today\'s Plan to complete them!' : ''}\n\nHow would you like to proceed?`;
}
function getAdherenceResponse() {
  if (!State.profile || State.prescriptions.length === 0) {
    return "You don't have any adherence data yet! Start by:\n1. Setting up your profile\n2. Adding self-care prescriptions\n3. Completing your daily activities\n\nWould you like help getting started?";
  }
  const today = todayStr();
  const todayStats = calcDetailedAdherence(today, today);
  const weekStats = calcDetailedAdherence(addDays(today, -6), today);
  let response = `📊 Here's your adherence overview:\n\n`;
  response += `📅 Today: ${todayStats.pct !== null ? todayStats.pct + '%' : 'No data yet'} (${todayStats.completed}/${todayStats.scheduled} completed)\n`;
  response += `📆 This week: ${weekStats.pct !== null ? weekStats.pct + '%' : 'No data yet'} (${weekStats.completed}/${weekStats.scheduled} completed)\n`;
  if (weekStats.missed > 0) {
    response += `\n❗ ${weekStats.missed} missed activities this week.\n`;
  }
  if (weekStats.skipped > 0) {
    response += `⏭️ ${weekStats.skipped} skipped activities this week.\n`;
  }
  if (weekStats.pct !== null) {
    if (weekStats.pct >= 80) {
      response += `\n🌟 Excellent! You're doing great with your self-care routine! Keep it up!`;
    } else if (weekStats.pct >= 60) {
      response += `\n💪 Good effort! You're making solid progress. A few more completed activities could push you even higher!`;
    } else if (weekStats.pct >= 40) {
      response += `\n📈 You're on your way! Try focusing on completing the most important activities first. Every small step counts.`;
    } else {
      response += `\n🤗 Don't worry — every day is a fresh start. Would you like help prioritizing your activities, or reviewing your plan with simpler goals?`;
    }
  }
  response += `\n\nGo to "Progress & Reports" for detailed charts and export options. Want to know more about any specific category?`;
  return response;
}
function getPrescriptionsResponse() {
  if (!State.profile) return "You haven't set up your profile yet. Go to \"Patient Profile\" to get started, then add your self-care prescriptions!";
  if (State.prescriptions.length === 0) return "You don't have any self-care prescriptions yet. You can:\n\n1. Go to \"My Self-Care Prescriptions\" to add one\n2. Or visit \"Settings\" → \"Load Demo Patient\" to see a sample plan\n\nWould you like guidance on adding a prescription?";
  const active = State.prescriptions.filter(r => r.active && (!r.deactivatedOn || r.deactivatedOn > todayStr()));
  const inactive = State.prescriptions.filter(r => !r.active || (r.deactivatedOn && r.deactivatedOn <= todayStr()));
  let response = `📋 You have ${active.length} active self-care prescription${active.length !== 1 ? 's' : ''}:\n\n`;
  for (const rx of active) {
    const cat = getCategoryInfo(rx.category);
    response += `${cat.icon} ${rx.title}\n   ${cat.label} · ${(rx.times || []).map(formatTime12).join(', ')} · ${rx.frequency}\n\n`;
  }
  if (inactive.length > 0) {
    response += `\n⏸️ You also have ${inactive.length} inactive prescription${inactive.length !== 1 ? 's' : ''} (deactivated or ended).`;
  }
  response += `\n\nWould you like to add, edit, or learn more about any of these?`;
  return response;
}
function getMissedResponse() {
  const today = todayStr();
  const sevenDaysAgo = addDays(today, -6);
  const stats = calcDetailedAdherence(sevenDaysAgo, today);
  if (stats.missed === 0) {
    return "Great news! You haven't missed any activities in the last 7 days! 🎉 You're staying on track with your self-care plan.";
  }
  let response = `You've missed ${stats.missed} activit${stats.missed !== 1 ? 'ies' : 'y'} in the last 7 days.\n\n`;
  response += `Here's what I'd suggest:\n\n`;
  response += `1. 📋 Review your plan — are the activities realistic for your schedule?\n`;
  response += `2. 🎯 Prioritize — focus on the most important activities first\n`;
  response += `3. 💬 Talk to your care team — if activities feel too difficult, your clinician might adjust them\n`;
  response += `4. 🔄 Even missed tasks can be completed late — go to Today's Plan to catch up\n\n`;
  response += `Remember: missing activities is normal and okay. What matters is getting back on track. Would you like help reviewing your plan?`;
  return response;
}
function getNextTaskResponse() {
  const today = todayStr();
  const occs = getAllOccurrencesForDate(today);
  const n = now();
  const nowMin = n.getHours() * 60 + n.getMinutes();
  let next = null;
  for (const occ of occs) {
    const s = getOccurrenceStatus(occ.prescriptionId, occ.date, occ.time);
    if (s.status === 'due' || (s.status === 'upcoming' && timeToMinutes(occ.time) >= nowMin)) {
      if (!next || timeToMinutes(occ.time) < timeToMinutes(next.time)) {
        next = occ;
      }
    }
  }
  if (!next) {
    return "You have no upcoming tasks for today! 🎉 Either you've completed everything, or there's nothing more scheduled. Great job staying on top of your self-care.";
  }
  const cat = getCategoryInfo(next.category);
  return `Your next activity is:\n\n${cat.icon} ${next.title}\n⏰ At ${formatTime12(next.time)}\n📂 ${cat.label}\n${next.instructions ? '📝 ' + next.instructions : ''}\n\nHead to \"Today's Plan\" when it's time to complete it!`;
}
function getUpcomingHint() {
  const today = todayStr();
  const occs = getAllOccurrencesForDate(today);
  const n = now();
  const nowMin = n.getHours() * 60 + n.getMinutes();
  const upcoming = occs.filter(o => timeToMinutes(o.time) >= nowMin && !getRecordForOccurrence(o.prescriptionId, o.date, o.time));
  if (upcoming.length === 0) return "No more activities remaining for today.";
  return `You have ${upcoming.length} upcoming activit${upcoming.length !== 1 ? 'ies' : 'y'} today.`;
}
function getDietGuidance() {
  return `🍽️ Diet & Nutrition Guidance:\n\nGood nutrition is a cornerstone of self-care, especially for chronic disease management. Here are some general principles:\n\n• Follow the meal plan your clinician has recommended for your condition\n• Eat regular, balanced meals at consistent times\n• Include a variety of foods — vegetables, whole grains, lean proteins, healthy fats\n• Be mindful of portion sizes\n• Stay consistent with your meal timing\n\nImportant: Every person's dietary needs are different based on their condition. Your care team should personalize your nutrition plan.\n\nI can help you track your meal-related self-care activities in your prescription plan. Would you like to add or review a diet-related prescription?`;
}
function getActivityGuidance() {
  return `🏃 Physical Activity Guidance:\n\nRegular physical activity is important for managing chronic conditions. General principles:\n\n• Follow the activity level approved by your clinician\n• Start slowly and build up gradually\n• Consistency matters more than intensity\n• Listen to your body — rest when needed\n• Activities like walking, gentle stretching, and light exercises are often recommended\n\n⚠️ Important: Always follow your clinician's guidance on the type and intensity of physical activity appropriate for your condition. Never push through pain.\n\nWould you like help adding or reviewing an activity prescription in your plan?`;
}
function getSleepGuidance() {
  return `🌙 Sleep Routine Guidance:\n\nQuality sleep is essential for recovery and overall health. General tips:\n\n• Try to go to bed and wake up at the same time each day\n• Create a calming bedtime routine\n• Keep your sleeping environment comfortable, dark, and cool\n• Avoid heavy meals, caffeine, and screens close to bedtime\n• Follow any sleep hygiene practices your care team has recommended\n\n💡 A consistent sleep routine can significantly improve your energy levels and overall well-being.\n\nWould you like to add a sleep routine check-in to your self-care plan?`;
}
function getHydrationGuidance() {
  return `💧 Hydration Guidance:\n\nStaying properly hydrated is important for your body's functions. General advice:\n\n• Follow your care team's guidance on fluid intake\n• Spread your fluid intake throughout the day\n• Keep track of your hydration as part of your daily routine\n• Some conditions may require specific fluid limits — always follow your clinician's advice\n• Setting regular hydration reminders can help build the habit\n\n⚠️ Fluid needs vary significantly by condition. Some conditions require careful fluid management, so always follow your healthcare provider's specific guidance.\n\nWould you like to set up hydration reminders in your self-care plan?`;
}
function getStressGuidance() {
  return `🧘 Stress Management Guidance:\n\nManaging stress is an important part of self-care for chronic conditions. Some approaches:\n\n• Practice relaxation techniques regularly (even a few minutes helps)\n• Deep breathing exercises can help in moments of tension\n• Gentle physical activity can reduce stress\n• Maintaining a routine provides stability\n• Stay connected with supportive people in your life\n• Follow any stress-management techniques your care team has recommended\n\n💡 Remember: It's normal to feel stressed when managing a chronic condition. Acknowledging it and taking steps to manage it is a sign of strength, not weakness.\n\nWould you like help adding a stress-management activity to your plan?`;
}
function getBreathingGuidance() {
  return `🫁 Breathing Exercise Guidance:\n\nBreathing exercises can support relaxation and overall wellness. General principles:\n\n• Follow the specific breathing techniques approved by your clinician\n• Practice in a comfortable, quiet space\n• Start with shorter sessions and build up\n• Consistency is more important than duration\n• If you feel dizzy or uncomfortable, stop and rest\n\nSome common approaches your clinician might recommend:\n• Slow, deep belly breathing\n• Box breathing (inhale-hold-exhale-hold)\n• Alternate nostril breathing\n• Guided breathing exercises\n\n⚠️ Always use techniques that your clinician has approved for your specific condition.\n\nWould you like to add a breathing exercise to your daily self-care plan?`;
}
function getAppNavigationHelp() {
  return `📱 Here's how to navigate CareTrack:\n\n🏠 Dashboard — Your overview: today's progress, counts, alerts, and charts\n📅 Today's Plan — Your daily tasks with Complete/Skip buttons. Use the date picker to view different days.\n📋 My Prescriptions — Add, edit, or deactivate your self-care activities\n🔔 Alerts — View reminders for due, missed, and weekly summaries\n📊 Reports — Track adherence with charts, filter data, and export CSV or print\n✨ Sahaara AI (me!) — Ask me anything about your self-care plan\n👤 Profile — Set up your patient information\n⚙️ Settings — Demo mode, grace period, data management, and self-tests\n\n💡 Quick tips:\n• Tap the floating ✨ button anytime to chat with me\n• Use Complete/Skip on Today's Plan to track activities\n• Missed tasks can still be completed later!\n• The grace period (in Settings) controls when tasks become "missed"\n\nWhat would you like to explore?`;
}
function getFallbackResponse(q) {
  const responses = [
    `I want to make sure I help you with the right thing. I can assist with:\n\n• Your self-care plan and daily activities\n• Understanding your adherence and progress\n• Guidance on diet, activity, sleep, hydration, stress, and breathing\n• How to use this app\n• General self-care knowledge\n\nCould you rephrase your question, or choose one of the quick action buttons above?`,
    `That's an interesting question! While I might not have a specific answer for that, I'm great at helping with self-care guidance. Try asking me about:\n\n• "What's my plan for today?"\n• "How is my adherence?"\n• "Tell me about self-care"\n• "Help me navigate the app"\n\nOr tap one of the quick action chips above! 😊`,
    `I'm not sure I fully understood that. As a patient guidance AI, I focus on helping you with your self-care plan and daily wellness activities. Could you try:\n\n• Asking about your prescriptions or daily plan\n• Asking about your progress and adherence\n• Asking for self-care tips in any category\n• Asking how to use this app\n\nI'm here to help! 💚`
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}
function matchesAny(q, keywords) {
  if (keywords.some(k => q.includes(k))) return true;
  for (const kw of keywords) {
    const kwWords = kw.split(/\s+/);
    let matched = 0;
    for (const w of kwWords) {
      if (w.length > 2 && q.includes(w)) matched++;
    }
    if (kwWords.length > 0 && matched / kwWords.length >= 0.6) return true;
  }
  return false;
}
function getAIResponse(input) {
  return getBuiltInResponse(input);
}
async function getAIResponseAsync(input, ctxArray) {
  const res = await requestAIResponse(input, ctxArray || AI.conversationContext);
  return res.text;
}
function setAILanguage(lang) {
  if (!LANGUAGES[lang]) lang = 'en';
  AI.language = lang;
  if (AI.recognition) AI.recognition.lang = LANGUAGES[lang].speechCode || 'en-IN';
  if (VoiceMode.recognition) VoiceMode.recognition.lang = LANGUAGES[lang].speechCode || 'en-IN';
  if (AI.sessionsLoaded) saveSessions();
  refreshAIDisplay();
  if (VoiceMode.isOpen) renderVoiceMode();
  toast('Language set to ' + (LANGUAGES[lang].name || 'English'));
}
function toggleAutoTranslate() {
  AI.autoTranslate = !AI.autoTranslate;
  refreshAIDisplay();
  if (VoiceMode.isOpen) renderVoiceMode();
  toast(AI.autoTranslate ? 'Auto-translate ON' : 'Auto-translate OFF');
}
function toggleProfileSharing() {
  State.settings.sendProfileContext = !State.settings.sendProfileContext;
  saveState();
  render();
  toast(State.settings.sendProfileContext
    ? 'Profile summary will be included in AI requests.'
    : 'Profile details will NOT be sent to the AI service.');
}
function saveAIConfig() {
  const endpointEl = document.getElementById('llm-endpoint');
  const modelEl = document.getElementById('llm-model');
  if (!endpointEl) return;
  const endpoint = endpointEl.value.trim();
  if (endpoint && !/^(https?:\/\/|\/)/.test(endpoint)) {
    setAIConfigStatus('danger', 'Invalid endpoint. Use a URL starting with https:// or a path like /api/chat.');
    return;
  }
  if (endpoint && endpoint.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(endpoint)) {
    setAIConfigStatus('danger', 'Plain http:// is only allowed for localhost. Use https:// for any other host.');
    return;
  }
  AI_CONFIG.LLM_ENDPOINT = endpoint;
  AI_CONFIG.LLM_MODEL = modelEl ? modelEl.value : 'chatgpt';
  AI.llmVerified = false; // configuration changed — must be re-verified
  State.settings.llmEndpoint = AI_CONFIG.LLM_ENDPOINT;
  State.settings.llmModel = AI_CONFIG.LLM_MODEL;
  delete State.settings.llmApiKey;
  saveState();
  if (AI_CONFIG.LLM_ENDPOINT) {
    setAIConfigStatus('info', 'Configuration saved. Nothing has been verified yet — click "Test Connection" to check the AI service. Until a test succeeds, Sahaara answers with the built-in guidance engine and any failed AI call is labeled as a fallback.');
  } else {
    setAIConfigStatus('brand', 'Using the built-in offline guidance engine. No network calls are made.');
  }
  refreshAIDisplay();
  toast('AI configuration saved');
}
AI_CONFIG.LLM_VERIFIED_RESET = function () { AI.llmVerified = false; };
function setAIConfigStatus(kind, msg) {
  const status = document.getElementById('ai-config-status');
  if (status) status.innerHTML = `<div class="banner ${kind} mt8">${ic('info', 16)}<span>${esc(msg)}</span></div>`;
}
async function testAIConnection() {
  const endpoint = (document.getElementById('llm-endpoint') || {}).value;
  const ep = (endpoint !== undefined ? endpoint : AI_CONFIG.LLM_ENDPOINT).trim();
  if (!ep) {
    setAIConfigStatus('info', 'No endpoint configured — Sahaara is using the built-in offline guidance engine (this is fully functional, just not an external AI).');
    return;
  }
  const btn = document.getElementById('ai-test-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
  setAIConfigStatus('info', `Testing connection to ${ep} …`);
  const res = await callLLM([{ role: 'user', content: 'Connection test. Reply with the single word: OK' }], ep);
  if (btn) { btn.disabled = false; btn.textContent = 'Test Connection'; }
  if (res.ok) {
    AI.llmVerified = true;
    setAIConfigStatus('ok', 'Connection verified — the AI service replied successfully. Sahaara will now use it for chat and voice answers.');
  } else {
    AI.llmVerified = false;
    setAIConfigStatus('danger', 'Connection failed: ' + res.error + ' — Sahaara will keep using the built-in guidance engine. Make sure the Sahaara Node.js server is running, OPENAI_API_KEY is set, and the endpoint is /api/chat.');
  }
  refreshAIDisplay();
}
function cleanSpeechText(text) {
  let value = String(text == null ? '' : text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/\b(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?)?/gi, function(_, hour, minute, suffix) {
      const h = String(Number(hour));
      const meridiem = suffix ? ' ' + suffix.replace(/\./g, '').toUpperCase() : '';
      return minute === '00' ? h + meridiem : h + ' ' + (minute[0] === '0' ? 'oh ' + String(Number(minute)) : String(Number(minute))) + meridiem;
    })
    .replace(/\r?\n+/g, '. ')
    .replace(/[•●▪◦→←⇒⇢]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, ' ');
  try { value = value.replace(/\p{Extended_Pictographic}/gu, ' '); } catch (_) {}
  try { value = value.replace(/[^\p{L}\p{M}\p{N}\p{P}\p{Z}]/gu, ' '); }
  catch (_) { value = value.replace(/[\u{1F300}-\u{1FAFF}]/gu, ' '); }
  value = value.replace(/[*_`#~|<>]/g, ' ').replace(/\s+/g, ' ').replace(/\uFE0E|\uFE0F/g, '').replace(/:\.$/, '.').replace(/\s+([,.;!?।])/g, '$1').trim();
  return value;
}
function splitSpeechChunks(text, maxLength) {
  const max = Math.max(90, Number(maxLength) || 230);
  const cleaned = cleanSpeechText(text);
  if (!cleaned) return [];
  const sentences = cleaned.match(/[^.!?।]+[.!?।]?/g) || [cleaned];
  const chunks = [];
  let current = '';
  sentences.forEach(function(raw) {
    const sentence = raw.trim();
    if (!sentence) return;
    if ((current + ' ' + sentence).trim().length <= max) {
      current = (current + ' ' + sentence).trim();
      return;
    }
    if (current) { chunks.push(current); current = ''; }
    if (sentence.length <= max) { current = sentence; return; }
    const words = sentence.split(/\s+/);
    let part = '';
    words.forEach(function(word) {
      if ((part + ' ' + word).trim().length > max && part) { chunks.push(part); part = ''; }
      part = (part + ' ' + word).trim();
    });
    if (part) { chunks.push(part); part = ''; }
  });
  if (current) chunks.push(current);
  return chunks;
}
function speechTuning(language) {
  const settings = {
    en: [0.97, 1.02], hi: [0.91, 1.08], 'hi-Latn': [0.95, 1.04], mr: [0.92, 1.06],
    bn: [0.92, 1.05], ta: [0.90, 1.04], te: [0.92, 1.04], gu: [0.92, 1.05],
    kn: [0.91, 1.04], ml: [0.91, 1.04], pa: [0.93, 1.05], ur: [0.92, 1.04]
  };
  const picked = settings[language] || settings.en;
  return { rate: picked[0], pitch: picked[1] };
}
function chooseBestSpeechVoice(synthesis, language) {
  if (!synthesis || typeof synthesis.getVoices !== 'function') return null;
  const voices = synthesis.getVoices() || [];
  if (!voices.length) return null;
  const speechCode = (LANGUAGES[language] && LANGUAGES[language].speechCode || 'en-IN').toLowerCase();
  const base = speechCode.split('-')[0];
  const ranked = voices.map(function(voice, index) {
    const lang = String(voice.lang || '').toLowerCase();
    const name = String(voice.name || '');
    const lcName = name.toLowerCase();
    let score = 0;
    if (lang === speechCode) score += 120;
    else if (lang.indexOf(base + '-') === 0 || lang === base) score += 90;
    else if (base === 'en' && lang.indexOf('en-') === 0) score += 45;
    else score -= 50;
    if (/neural|google|natural|premium|enhanced/.test(lcName)) score += 32;
    if (/female|woman|zira|samantha|heera|veena|lekha/.test(lcName)) score += 12;
    if (voice.default) score += 2;
    return { voice: voice, score: score, name: name.toLowerCase(), index: index };
  }).filter(function(item) { return item.score >= 0; });
  ranked.sort(function(a, b) { return b.score - a.score || a.name.localeCompare(b.name) || a.index - b.index; });
  return ranked.length ? ranked[0].voice : null;
}
function makeSpeechUtterance(text, language, onBoundary) {
  const utterance = new SpeechSynthesisUtterance(cleanSpeechText(text));
  const tuning = speechTuning(language);
  utterance.rate = tuning.rate;
  utterance.pitch = tuning.pitch;
  utterance.volume = 1;
  utterance.lang = (LANGUAGES[language] && LANGUAGES[language].speechCode) || 'en-IN';
  const voice = chooseBestSpeechVoice(window.speechSynthesis, language);
  if (voice) utterance.voice = voice;
  if (typeof onBoundary === 'function') utterance.onboundary = onBoundary;
  return utterance;
}
function updateAIStatusUI() {
  const statusEl = document.querySelector('.ai-status');
  if (statusEl) {
    const statusClass = AI.isListening ? 'listening' : AI.isThinking ? 'thinking' : AI.isSpeaking ? 'speaking' : '';
    const idleStatus = AI.llmVerified ? 'Smart AI connected' : 'Clinical Guidance Active';
    const statusText = AI.isListening ? 'Listening...' : AI.isThinking ? 'Thinking...' : AI.isSpeaking ? 'Speaking...' : idleStatus;
    const statusDot = statusClass ? '<span class="dot"></span>' : '<span class="dot" style="background:var(--ok-text)"></span>';
    statusEl.className = 'ai-status ' + statusClass;
    statusEl.innerHTML = statusDot + ' ' + esc(statusText);
  }
}
function speakAI(text) {
  if (!AI.voiceEnabled || !AI.synthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
  if (typeof VoiceMode !== 'undefined' && (VoiceMode.isOpen || VoiceMode.isSpeaking)) return;
  stopAISpeech(false);
  const chunks = splitSpeechChunks(text, 240);
  if (!chunks.length) return;
  const generation = AI.speechGeneration = (AI.speechGeneration || 0) + 1;
  let index = 0;
  const finish = function() {
    if (generation !== AI.speechGeneration) return;
    AI.isSpeaking = false;
    updateAIStatusUI();
  };
  const playNext = function() {
    if (generation !== AI.speechGeneration) return;
    if (index >= chunks.length) { finish(); return; }
    const utterance = makeSpeechUtterance(chunks[index++], AI.language);
    utterance.onstart = function() {
      if (generation === AI.speechGeneration) {
        AI.isSpeaking = true;
        updateAIStatusUI();
      }
    };
    utterance.onend = playNext;
    utterance.onerror = playNext;
    try { AI.synthesis.speak(utterance); } catch (_) { finish(); }
  };
  AI.isSpeaking = true;
  updateAIStatusUI();
  playNext();
}
function stopAISpeech(refresh) {
  AI.speechGeneration = (AI.speechGeneration || 0) + 1;
  if (AI.synthesis) { try { AI.synthesis.cancel(); } catch (_) {} }
  AI.isSpeaking = false;
  if (refresh !== false) refreshAIDisplay();
}
function toggleAIVoice() {
  AI.voiceEnabled = !AI.voiceEnabled;
  if (!AI.voiceEnabled) stopAISpeech(false);
  refreshAIDisplay();
  toast(AI.voiceEnabled ? 'Voice output enabled' : 'Voice output muted');
}
function speechRecognitionSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = LANGUAGES[AI.language]?.speechCode || 'en-IN';
  recognition.maxAlternatives = 1;
  let finalHandled = false; // guards against duplicate final processing
  recognition.onresult = (event) => {
    let interim = '';
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += t;
      else interim += t;
    }
    const inputEl = document.getElementById(AI.panelOpen ? 'ai-input-panel' : 'ai-input-full');
    if (finalText) {
      if (finalHandled) return; // never process the same final twice
      finalHandled = true;
      AI.isListening = false;
      if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
      refreshAIDisplay();
      const text = finalText.trim();
      setTimeout(() => {
        finalHandled = false;
        if (text) sendAIUserText(text);
      }, 300);
    } else if (inputEl) {
      inputEl.value = interim;
      autoGrow(inputEl);
    }
  };
  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    AI.isListening = false;
    refreshAIDisplay();
    switch (event.error) {
      case 'not-allowed':
      case 'service-not-allowed':
        AI.micDenied = true;
        toast('Microphone access denied. You can still type your question in the text box.', true);
        break;
      case 'audio-capture':
        toast('No microphone was detected. You can still type your question.', true);
        break;
      case 'no-speech':
        toast('No speech detected. Tap the mic and try again.');
        break;
      case 'network':
        toast('Speech recognition needs a network connection. Try typing instead.', true);
        break;
      case 'aborted':
        break; // user-initiated — silent
      default:
        toast('Voice input error (' + event.error + '). You can type instead.', true);
    }
  };
  recognition.onend = () => {
    AI.isListening = false;
    refreshAIDisplay();
  };
  return recognition;
}
function toggleVoiceInput() {
  if (AI.isListening) {
    if (AI.recognition) {
      try { AI.recognition.stop(); } catch(e) {}
    }
    AI.isListening = false;
    refreshAIDisplay();
    return;
  }
  if (!speechRecognitionSupported()) {
    toast('Voice input is not supported in this browser (try Chrome or Edge). The text box works everywhere.', true);
    return;
  }
  if (AI.pending) {
    toast('Wait for the current response to finish before speaking.');
    return;
  }
  if (!AI.recognition) {
    AI.recognition = initSpeechRecognition();
  }
  if (!AI.recognition) {
    toast('Could not initialize voice input. Please type instead.', true);
    return;
  }
  AI.recognition.lang = LANGUAGES[AI.language]?.speechCode || 'en-IN';
  try {
    AI.isListening = true;
    refreshAIDisplay();
    AI.recognition.start();
    toast('🎤 Listening... speak now');
  } catch(e) {
    if (e && e.name === 'InvalidStateError') {
      return;
    }
    AI.isListening = false;
    refreshAIDisplay();
    toast('Could not start voice input. Please try again or type your question.', true);
  }
}
if (AI.synthesis) {
  AI.synthesis.getVoices(); // Trigger voice loading
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = () => {}; // Voices loaded
  }
}
const NOISE_GLSL = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;
const VOICE_ORB_VERTEX = `
${NOISE_GLSL}
uniform float uTime; uniform float uNoiseScale; uniform float uNoiseStrength; uniform float uPulse;
uniform float uAudioLevel; uniform float uAudioBass; uniform float uAudioTreble; uniform float uBurst; uniform float uIntro; uniform float uOut;
varying vec3 vNormal; varying vec3 vWorldPos; varying float vDisplacement; varying float vNoise; varying vec3 vPos;
void main(){
  vec3 pos = position; vec3 norm = normal;
  float n1 = snoise(pos * uNoiseScale + uTime * 0.35);
  float n2 = snoise(pos * uNoiseScale * 2.1 - uTime * 0.55) * 0.5;
  float n3 = snoise(pos * uNoiseScale * 0.6 + uTime * 0.18) * 0.7;
  float noise = n1 + n2 + n3;
  float audioDisplace = uAudioBass * 0.12 + uAudioTreble * abs(snoise(pos * 3.5 + uTime * 2.0)) * 0.18;
  float breath = sin(uTime * 1.3) * uPulse * 0.06 + sin(uTime*2.7 + pos.y*2.0) * uPulse * 0.02;
  float wave = sin(length(pos.xy) * 7.0 - uTime * 5.0 + pos.z * 3.0) * uOut * (0.018 + uAudioLevel * 0.05);
  float burst = uBurst * 0.07 * snoise(pos * 4.0 + uTime * 3.0);
  float intro = (1.0 - uIntro) * 0.35 * snoise(pos * 5.0 + uTime * 2.0);
  float displacement = noise * uNoiseStrength + audioDisplace + breath + wave + burst + intro;
  pos += norm * displacement;
  vDisplacement = displacement; vNoise = noise; vPos = position;
  vNormal = normalMatrix * norm;
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;
const VOICE_ORB_FRAGMENT = `
uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC;
uniform float uGlowIntensity; uniform float uFresnelPower; uniform float uTime;
uniform float uFlow; uniform float uScan; uniform float uBurst; uniform float uIntro; uniform float uAudioLevel;
varying vec3 vNormal; varying vec3 vWorldPos; varying float vDisplacement; varying float vNoise; varying vec3 vPos;
vec3 spectrum(float t){
  vec3 c1=vec3(0.22,0.52,1.00); // blue
  vec3 c2=vec3(0.52,0.30,1.00); // violet
  vec3 c3=vec3(0.98,0.36,0.78); // magenta
  vec3 c4=vec3(1.00,0.62,0.42); // coral
  vec3 c5=vec3(0.22,0.90,0.93); // aqua
  t=fract(t);
  if(t<0.25) return mix(c1,c2,t*4.0);
  if(t<0.5)  return mix(c2,c3,(t-0.25)*4.0);
  if(t<0.75) return mix(c3,c4,(t-0.5)*4.0);
  return mix(c4,c5,(t-0.75)*4.0);
}
void main(){
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 n = normalize(vNormal);
  float ndv = max(dot(n, viewDir), 0.0);
  float fresnel = pow(1.0 - ndv, uFresnelPower);
  float hueT = vPos.y*0.35 + vPos.x*0.22 + vNoise*0.45 + uTime*(0.035 + uFlow*0.05);
  vec3 hue = spectrum(hueT);
  vec3 hue2 = spectrum(hueT + 0.33);
  vec3 body = mix(hue, hue2, 0.5 + 0.5*sin(vNoise*2.2 + uTime*0.6));
  body = mix(uColorA*0.55, body, 0.55 + 0.25*smoothstep(-0.2,0.6,vDisplacement));
  float ripple = sin(vNoise*6.0 + uTime*(1.4+uFlow*1.6)) * 0.5 + 0.5;
  body += hue2 * smoothstep(0.7,1.0,ripple) * 0.22 * (0.6+uFlow*0.4);
  vec3 rim = mix(hue, vec3(1.0), 0.25);
  vec3 col = body + rim * fresnel * (0.62*uGlowIntensity);
  vec3 lightDir = normalize(vec3(-0.45, 0.65, 0.6));
  float spec = pow(max(dot(reflect(-viewDir, n), lightDir), 0.0), 36.0);
  col += vec3(1.0,0.97,1.0) * spec * 0.18;
  float softbox = pow(max(dot(n, normalize(vec3(-0.62,0.72,0.35))),0.0), 5.0);
  float edgeLight = pow(1.0-ndv, 1.35);
  col += vec3(0.72,0.86,1.0) * softbox * 0.11;
  col += spectrum(hueT+0.12) * edgeLight * 0.12;
  float flowT = uTime*(0.7+uFlow*1.6);
  float bands = sin(vPos.y*11.0 - flowT*2.0 + vNoise*3.0) * sin(vPos.x*7.0 + flowT*1.3);
  bands = smoothstep(0.55,1.0,bands);
  col += spectrum(hueT+0.5) * bands * (0.12 + uFlow*0.18 + uAudioLevel*0.35);
  float scanY = sin(uTime*1.1)*0.95;
  float scan = exp(-pow((vPos.y-scanY)*8.0,2.0));
  col += spectrum(hueT+0.25) * scan * 0.32 * uScan;
  col += vec3(1.0) * uBurst * 0.2 * fresnel;
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453)-0.5)*0.012;
  gl_FragColor = vec4(col, (0.92*uIntro + 0.08));
}
`;
const PARTICLE_VERTEX = `
attribute float aSize; attribute float aPhase;
uniform float uTime; uniform float uRadius; uniform float uParticleStrength;
uniform float uShellScale; uniform float uShellSpeed; uniform float uThink; uniform float uPull; uniform float uOut; uniform float uBurst; uniform float uIntro; uniform float uAudioLevel;
varying float vAlpha;
void main(){
  float angle = aPhase * 6.2831853 + uTime * 0.3 * uShellSpeed * (1.0 + uThink * 1.4);
  float r = (uRadius * uShellScale + sin(uTime * 1.5 + aPhase * 10.0) * 0.08);
  r *= 1.0 - uPull * 0.16 * (0.5 + 0.5 * sin(uTime * 2.4 + aPhase * 20.0));
  r += uOut * sin(uTime * 5.0 - aPhase * 30.0) * 0.07 * (0.4 + uAudioLevel * 2.0) + uBurst * 0.25;
  r *= mix(0.2, 1.0, uIntro);
  vec3 pos = vec3(cos(angle) * r, sin(aPhase * 3.14159) * 0.4 * uShellScale + sin(uTime + aPhase * 5.0) * 0.2, sin(angle) * r);
  float comet = pow(0.5 + 0.5 * sin(angle * 1.0 - uTime * 4.0), 7.0);
  vAlpha = (0.4 + sin(uTime * 2.0 + aPhase * 8.0) * 0.3) * uParticleStrength * (1.0 + uThink * comet * 2.2) * uIntro;
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = aSize * (200.0 / -mvPos.z) * (1.0 + uThink * comet * 0.8);
  gl_Position = projectionMatrix * mvPos;
}
`;
const PARTICLE_FRAGMENT = `
uniform vec3 uParticleColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - vec2(0.5));
  if(d > 0.5) discard;
  gl_FragColor = vec4(uParticleColor, smoothstep(0.5, 0.0, d) * vAlpha);
}
`;
function ctPrefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; }
}
function ctWebGLAvailable() {
  try { const canvas = document.createElement('canvas'); return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl')); }
  catch (_) { return false; }
}
class Voice3DOrb {
  constructor(container) {
    this.container = container; this.disposed = false; this.failed = false; this.state = 'idle';
    this.reducedMotion = ctPrefersReducedMotion(); this._rafId = null; this._onResize = null; this._paused = false;
    this.audioCtx = null; this.analyser = null; this.audioData = null; this.micStream = null;
    this.speechEnvelope = 0; this.speechTarget = 0; this.rippleStrength = 0; this.rippleOrigin = new (typeof THREE !== 'undefined' ? THREE.Vector2 : function(){})();
    this.pointerX = 0; this.pointerY = 0; this.pointerTX = 0; this.pointerTY = 0; this.scale = 1; this.scaleVelocity = 0; this.scaleTarget = 1; this.voiceBump = 0; this.burst = 0; this.intro = 0; this.shells = [];
    this.stateTargets = {
      idle: { flow: 0.25, scan: 0.0, think: 0.0, pull: 0.0, out: 0.0, noiseScale: 1.3, noiseStrength: 0.12, pulse: 0.5, glow: 1.0, fresnel: 2.2, radius: 1.15, particles: 0.3, motion: 0.16, scale: 1.0, a: '#527cff', b: '#c06bff', c: '#35e4e9', p: '#e8f8ff' },
      listening: { flow: 0.8, scan: 0.0, think: 0.0, pull: 1.0, out: 0.0, noiseScale: 2.1, noiseStrength: 0.28, pulse: 1.2, glow: 1.6, fresnel: 1.8, radius: 1.25, particles: 0.9, motion: 0.68, scale: 1.03, a: '#438dff', b: '#ed69d5', c: '#38e4ee', p: '#fff0ff' },
      thinking: { flow: 1.0, scan: 1.0, think: 1.0, pull: 0.0, out: 0.0, noiseScale: 1.8, noiseStrength: 0.22, pulse: 1.5, glow: 1.4, fresnel: 2.0, radius: 1.2, particles: 0.6, motion: 0.78, scale: 1.025, a: '#7768ff', b: '#f17ed2', c: '#ffb77c', p: '#fff2d7' },
      speaking: { flow: 0.9, scan: 0.0, think: 0.0, pull: 0.0, out: 1.0, noiseScale: 1.6, noiseStrength: 0.25, pulse: 1.0, glow: 1.8, fresnel: 1.9, radius: 1.22, particles: 0.75, motion: 0.52, scale: 1.025, a: '#35dce8', b: '#a66aff', c: '#ff83bf', p: '#e8ffff' }
    };
    if (window.__CT_THREE_FAILED__ || typeof THREE === 'undefined' || !ctWebGLAvailable()) { this._setupFallback(); return; }
    this._setup();
  }
  _setupFallback() {
    this.failed = true; this.uniforms = null; this.stateTargets = this.stateTargets || {};
    try {
      this.container.innerHTML = '<div class="voice-orb-fallback idle" aria-hidden="true"><span>' + ic('sparkles', 36) + '</span></div>';
      if (this.reducedMotion) this.container.querySelector('.voice-orb-fallback').style.animation = 'none';
    } catch (_) {}
    console.warn('CareTrack: WebGL/Three.js unavailable — using the CSS fallback orb.');
  }
  _setup() {
    try {
      const size = this._targetSize();
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(size, size, false); this.renderer.setClearColor(0x000000, 0);
      this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%'; this.renderer.domElement.style.display = 'block'; this.renderer.domElement.style.borderRadius = '50%';
      this.container.appendChild(this.renderer.domElement);
    } catch (error) {
      this._setupFallback(); console.warn('CareTrack: WebGL renderer failed — using CSS fallback.', error); return;
    }
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); this.camera.position.set(0, 0, 3.4);
    this.orbGroup = new THREE.Group(); this.scene.add(this.orbGroup);
    const lowMemory = Number(navigator.deviceMemory || 8) <= 4 || (window.innerWidth <= 480 && (window.devicePixelRatio || 1) > 2);
    this.segmentCount = lowMemory ? 64 : 96; this.particleCount = lowMemory ? 84 : 140; this._slowFrames = 0; this._fastFrames = 0; this._lastFrame = 0; this.qualityLevel = lowMemory ? 1 : 2; this.maxQuality = this.qualityLevel;
    this.uniforms = {
      uTime: { value: 0 }, uNoiseScale: { value: 1.3 }, uNoiseStrength: { value: 0.12 }, uPulse: { value: 0.5 }, uMotion: { value: 0.16 },
      uAudioLevel: { value: 0 }, uAudioBass: { value: 0 }, uAudioTreble: { value: 0 }, uColorA: { value: new THREE.Color('#527cff') }, uColorB: { value: new THREE.Color('#c06bff') },
      uColorC: { value: new THREE.Color('#438dff') }, uGlowIntensity: { value: 0.68 }, uFresnelPower: { value: 2.2 }, uRadius: { value: 1.15 },
      uParticleStrength: { value: 0.3 }, uParticleColor: { value: new THREE.Color('#e8f8ff') }, uRipple: { value: 0 }, uRippleOrigin: { value: new THREE.Vector2(0, 0) },
      uFlow: { value: 0.25 }, uScan: { value: 0 }, uThink: { value: 0 }, uPull: { value: 0 }, uOut: { value: 0 }, uBurst: { value: 0 }, uIntro: { value: 0 }
    };
    this._uniformTargets = {
      uNoiseScale: 1.3, uNoiseStrength: 0.12, uPulse: 0.5, uMotion: 0.16, uGlowIntensity: 0.68, uFresnelPower: 2.2, uRadius: 1.15, uParticleStrength: 0.3, uFlow: 0.25, uScan: 0, uThink: 0, uPull: 0, uOut: 0,
      uColorA: new THREE.Color('#527cff'), uColorB: new THREE.Color('#c06bff'), uColorC: new THREE.Color('#35e4e9'), uParticleColor: new THREE.Color('#e8f8ff')
    };
    this.orbMaterial = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VOICE_ORB_VERTEX, fragmentShader: VOICE_ORB_FRAGMENT, transparent: true });
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(1, this.segmentCount, this.segmentCount), this.orbMaterial); this.orbGroup.add(this.orb);
    const innerMaterial = new THREE.MeshBasicMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.18 });
    this.innerGlow = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 32), innerMaterial); this.orbGroup.add(this.innerGlow);
    this._setupParticles();
    this._onResize = () => {
      if (this.disposed || this.failed || !this.renderer || !this.container.isConnected) return;
      const newSize = this._targetSize(); this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); this.renderer.setSize(newSize, newSize, false);
      this.camera.aspect = 1; this.camera.updateProjectionMatrix();
    };
    this._onPointerMove = (event) => {
      if (this.reducedMotion || this.disposed) return;
      const rect = this.container.getBoundingClientRect();
      this.pointerTX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
      this.pointerTY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
    };
    this._onPointerLeave = () => { this.pointerTX = 0; this.pointerTY = 0; };
    this._onPointerDown = (event) => {
      if (this.reducedMotion || this.disposed) return;
      const rect = this.container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = -((event.clientY - rect.top) / rect.height - 0.5) * 2;
      this.triggerRipple(x, y);
    };
    this._onVisibility = () => {
      if (document.hidden) this._pauseLoop();
      else if (!this.reducedMotion) { this._paused = false; this._lastFrame = performance.now(); this._loop(); }
      else this.renderOnce();
    };
    window.addEventListener('resize', this._onResize);
    this.container.addEventListener('pointermove', this._onPointerMove, { passive: true });
    this.container.addEventListener('pointerleave', this._onPointerLeave, { passive: true });
    this.container.addEventListener('pointerdown', this._onPointerDown, { passive: true });
    document.addEventListener('visibilitychange', this._onVisibility);
    this._startTime = performance.now(); this._lastFrame = this._startTime;
    if (this.reducedMotion) this.renderOnce(); else if (!document.hidden) this._loop();
  }
  _targetSize() {
    const width = this.container && this.container.clientWidth ? this.container.clientWidth : 320;
    return Math.max(160, Math.min(360, width));
  }
  _setupParticles() {
    (this.shells || []).forEach((p) => { this.orbGroup.remove(p); p.geometry.dispose(); p.material.dispose(); });
    this.shells = [];
    const total = this.particleCount || 140;
    const defs = [ { s: 1.0, v: 1.0, tilt: 0, n: 0.5 }, { s: 1.22, v: -0.7, tilt: 0.55, n: 0.3 }, { s: 0.86, v: 1.5, tilt: -0.7, n: 0.2 } ];
    defs.forEach((d, idx) => {
      const count = Math.max(12, Math.floor(total * d.n));
      const sizes = new Float32Array(count), phases = new Float32Array(count);
      for (let i = 0; i < count; i++) { phases[i] = i / count; sizes[i] = 2 + Math.random() * 4; }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
      g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1)); g.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      const u = this.uniforms;
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: u.uTime, uRadius: u.uRadius, uParticleStrength: u.uParticleStrength, uParticleColor: u.uParticleColor, uThink: u.uThink, uPull: u.uPull, uOut: u.uOut, uBurst: u.uBurst, uIntro: u.uIntro, uAudioLevel: u.uAudioLevel, uShellScale: { value: d.s }, uShellSpeed: { value: d.v } },
        vertexShader: PARTICLE_VERTEX, fragmentShader: PARTICLE_FRAGMENT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      const pts = new THREE.Points(g, m); pts.rotation.z = d.tilt; pts.userData.tilt = d.tilt; pts.userData.dir = d.v;
      this.orbGroup.add(pts); this.shells.push(pts);
    });
    this.particles = this.shells[0];
  }
  _lowerQuality() {
    if (this.disposed || this.qualityLevel <= 0) return;
    this.qualityLevel--;
    this.segmentCount = this.qualityLevel === 1 ? 48 : 36;
    this.particleCount = this.qualityLevel === 1 ? 64 : 36;
    if (this.orb) { const old = this.orb.geometry; this.orb.geometry = new THREE.SphereGeometry(1, this.segmentCount, this.segmentCount); old.dispose(); }
    this._setupParticles();
    if (this.renderer && this.renderer.setPixelRatio) this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.qualityLevel === 0 ? 1.25 : 1.5));
  }
  _raiseQuality() {
    if (this.disposed || !this.orb) return;
    this.qualityLevel++; this.segmentCount = this.qualityLevel >= 2 ? 96 : 64; this.particleCount = this.qualityLevel >= 2 ? 140 : 84;
    const old = this.orb.geometry; this.orb.geometry = new THREE.SphereGeometry(1, this.segmentCount, this.segmentCount); old.dispose(); this._setupParticles();
  }
  _adaptQuality(frameMs) {
    if (frameMs > 200) return;
    if (this._fastFrames > 240 && this.qualityLevel < (this.maxQuality || 2)) { this._fastFrames = 0; this._raiseQuality(); }
    if (frameMs > 22) { this._slowFrames++; this._fastFrames = 0; }
    else if (frameMs < 15) { this._fastFrames++; this._slowFrames = Math.max(0, this._slowFrames - 1); }
    if (this._slowFrames >= 36 && this.qualityLevel > 0) { this._slowFrames = 0; this._lowerQuality(); }
  }
  renderOnce() {
    if (this.disposed || this.failed || !this.renderer) return;
    try { this.renderer.render(this.scene, this.camera); } catch (_) {}
  }
  setState(newState) {
    if (this.disposed || !this.stateTargets[newState]) return;
    const changed = this.state !== newState; this.state = newState;
    const target = this.stateTargets[newState];
    if (changed && !this.failed && !this.reducedMotion) { this.burst = 1; this.scaleVelocity += 0.55; this.rippleStrength = Math.max(this.rippleStrength, 0.8); }
    if (this.failed) {
      const fallback = this.container && this.container.querySelector('.voice-orb-fallback');
      if (fallback) { fallback.className = 'voice-orb-fallback ' + newState; if (this.reducedMotion) fallback.style.animation = 'none'; }
      const fallbackGlow = this.container && this.container.parentElement && this.container.parentElement.querySelector('.voice-orb-glow');
      if (fallbackGlow) { fallbackGlow.classList.remove('idle','listening','thinking','speaking'); fallbackGlow.classList.add(newState); }
      return;
    }
    this.scaleTarget = target.scale;
    const targets = this._uniformTargets;
    targets.uNoiseScale = target.noiseScale; targets.uNoiseStrength = target.noiseStrength; targets.uPulse = target.pulse; targets.uMotion = target.motion;
    targets.uGlowIntensity = target.glow; targets.uFresnelPower = target.fresnel; targets.uRadius = target.radius; targets.uParticleStrength = target.particles; targets.uFlow = target.flow; targets.uScan = target.scan; targets.uThink = target.think; targets.uPull = target.pull; targets.uOut = target.out;
    targets.uColorA.set(target.a); targets.uColorB.set(target.b); targets.uColorC.set(target.c); targets.uParticleColor.set(target.p);
    if (this.reducedMotion && this.uniforms) {
      Object.keys(targets).forEach((key) => {
        const targetValue = targets[key];
        if (!this.uniforms[key]) return;
        if (this.uniforms[key].value && this.uniforms[key].value.isColor) this.uniforms[key].value.copy(targetValue);
        else this.uniforms[key].value = targetValue;
      });
      this.scale = this.scaleTarget; this.scaleVelocity = 0;
      if (this.orbGroup) this.orbGroup.scale.setScalar(this.scale);
      if (this.innerGlow && this.uniforms.uColorB) this.innerGlow.material.color.copy(this.uniforms.uColorB.value);
      this.renderOnce();
    }
    const glowEl = this.container && this.container.parentElement && this.container.parentElement.querySelector('.voice-orb-glow');
    if (glowEl) { glowEl.classList.remove('idle','listening','thinking','speaking'); glowEl.classList.add(newState); }
  }
  triggerRipple(x, y) {
    if (this.reducedMotion || this.failed || !this.uniforms) return;
    this.uniforms.uRippleOrigin.value.set(Math.max(-1, Math.min(1, x || 0)), Math.max(-1, Math.min(1, y || 0)));
    this.rippleStrength = 1;
  }
  pulseFromVoice() {
    if (this.disposed || this.failed || this.reducedMotion) return;
    this.voiceBump = 1; this.rippleStrength = Math.max(this.rippleStrength, 0.5);
  }
  pulseFromSpeech(weight) {
    if (this.disposed || this.failed || this.reducedMotion) return;
    const pulse = Math.max(0.28, Math.min(1, Number(weight) || 0.55));
    this.speechTarget = Math.max(this.speechTarget, pulse);
    this.rippleStrength = Math.max(this.rippleStrength, pulse * 0.45);
  }
  async enableAudioReactivity() {
    try {
      if (this.audioCtx || this.disposed || this.failed || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const context = new Ctx(); this.audioCtx = context;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.disposed || this.state !== 'listening') { stream.getTracks().forEach(function(track) { track.stop(); }); try { context.close(); } catch (_) {} if (this.audioCtx === context) this.audioCtx = null; return; }
      this.micStream = stream;
      const source = this.audioCtx.createMediaStreamSource(stream); this.analyser = this.audioCtx.createAnalyser(); this.analyser.fftSize = 256; this.analyser.smoothingTimeConstant = 0.78;
      source.connect(this.analyser); this.audioData = new Uint8Array(this.analyser.frequencyBinCount);
      if (this.audioCtx.state === 'suspended') { try { await this.audioCtx.resume(); } catch (_) {} }
    } catch (error) { console.warn('Mic analysis unavailable; orb continues without analyser:', error && error.name || error); }
  }
  disableAudioReactivity() {
    if (this.micStream) { this.micStream.getTracks().forEach(function(track) { track.stop(); }); this.micStream = null; }
    const context = this.audioCtx; this.audioCtx = null; this.analyser = null; this.audioData = null;
    if (context) { try { const closing = context.close(); if (closing && closing.catch) closing.catch(function() {}); } catch (_) {} }
    if (this.uniforms) { this.uniforms.uAudioLevel.value = 0; this.uniforms.uAudioBass.value = 0; this.uniforms.uAudioTreble.value = 0; }
  }
  _updateAudio(dt) {
    if (!this.uniforms) return;
    if (this.state === 'listening' && !(this.analyser && this.audioData)) {
      this.voiceBump *= Math.exp(-dt * 3.2); const lvl = 0.03 + this.voiceBump * 0.5; const k = 1 - Math.exp(-dt * 9);
      this.uniforms.uAudioLevel.value += (lvl - this.uniforms.uAudioLevel.value) * k; this.uniforms.uAudioBass.value += (lvl * 0.7 - this.uniforms.uAudioBass.value) * k; this.uniforms.uAudioTreble.value += (lvl * 0.9 - this.uniforms.uAudioTreble.value) * k;
    } else if (this.state === 'listening' && this.analyser && this.audioData) {
      this.analyser.getByteFrequencyData(this.audioData);
      const data = this.audioData; const len = data.length; let sum = 0, bass = 0, treble = 0;
      for (let i = 0; i < len; i++) { sum += data[i]; if (i < len * 0.25) bass += data[i]; if (i >= len * 0.75) treble += data[i]; }
      const level = sum / len / 255; bass = bass / Math.max(1, Math.floor(len * 0.25)) / 255; treble = treble / Math.max(1, len - Math.floor(len * 0.75)) / 255;
      const a = 1 - Math.exp(-dt * 8);
      this.uniforms.uAudioLevel.value += (level - this.uniforms.uAudioLevel.value) * a;
      this.uniforms.uAudioBass.value += (bass - this.uniforms.uAudioBass.value) * a;
      this.uniforms.uAudioTreble.value += (treble - this.uniforms.uAudioTreble.value) * a;
    } else if (this.state === 'speaking') {
      this.speechTarget *= Math.exp(-dt * 7.5); this.speechEnvelope += (this.speechTarget - this.speechEnvelope) * (1 - Math.exp(-dt * 13));
      const subtle = 0.018 + 0.018 * (0.5 + 0.5 * Math.sin(performance.now() * 0.0061));
      const level = Math.max(subtle, this.speechEnvelope * 0.74);
      this.uniforms.uAudioLevel.value += (level - this.uniforms.uAudioLevel.value) * (1 - Math.exp(-dt * 9));
      this.uniforms.uAudioBass.value += (this.speechEnvelope * 0.58 - this.uniforms.uAudioBass.value) * (1 - Math.exp(-dt * 7));
      this.uniforms.uAudioTreble.value += (this.speechEnvelope * 0.78 - this.uniforms.uAudioTreble.value) * (1 - Math.exp(-dt * 11));
    } else {
      const relax = 1 - Math.exp(-dt * 4.5);
      this.uniforms.uAudioLevel.value += (0 - this.uniforms.uAudioLevel.value) * relax;
      this.uniforms.uAudioBass.value += (0 - this.uniforms.uAudioBass.value) * relax;
      this.uniforms.uAudioTreble.value += (0 - this.uniforms.uAudioTreble.value) * relax;
      this.speechTarget = 0; this.speechEnvelope *= Math.exp(-dt * 6);
    }
    this.uniforms.uRipple.value = this.rippleStrength;
    this.rippleStrength *= Math.exp(-dt * 2.5);
  }
  _pauseLoop() {
    this._paused = true;
    if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
  }
  _loop() {
    if (this.disposed || this.failed || this.reducedMotion || document.hidden || this._paused) return;
    this._rafId = requestAnimationFrame((stamp) => {
      this._rafId = null;
      if (this.disposed || this._paused || document.hidden) return;
      const elapsed = stamp - (this._lastFrame || stamp); this._lastFrame = stamp;
      const dt = Math.max(0.001, Math.min(0.05, elapsed / 1000)); this._adaptQuality(elapsed);
      const t = (stamp - this._startTime) / 1000; this.uniforms.uTime.value = t;
      const smooth = 1 - Math.exp(-dt * 3.6); const target = this._uniformTargets;
      ['uNoiseScale','uNoiseStrength','uPulse','uMotion','uGlowIntensity','uFresnelPower','uRadius','uParticleStrength','uFlow','uScan','uThink','uPull','uOut'].forEach((key) => { this.uniforms[key].value += (target[key] - this.uniforms[key].value) * smooth; });
      ['uColorA','uColorB','uColorC','uParticleColor'].forEach((key) => this.uniforms[key].value.lerp(target[key], smooth));
      if (this.innerGlow) this.innerGlow.material.color.copy(this.uniforms.uColorB.value);
      this._updateAudio(dt);
      this.burst *= Math.exp(-dt * 3.0); this.uniforms.uBurst.value = this.burst;
      this.intro = Math.min(1, this.intro + dt / 1.5); this.uniforms.uIntro.value = this.intro;
      const ie = 1 - Math.pow(1 - this.intro, 3); const introScale = 0.35 + 0.65 * ie + Math.sin(this.intro * Math.PI) * 0.06;
      this.pointerX += (this.pointerTX - this.pointerX) * (1 - Math.exp(-dt * 4)); this.pointerY += (this.pointerTY - this.pointerY) * (1 - Math.exp(-dt * 4));
      const spring = (this.scaleTarget - this.scale) * 30 - this.scaleVelocity * 8; this.scaleVelocity += spring * dt; this.scale += this.scaleVelocity * dt;
      const rate = this.state === 'thinking' ? 0.35 : this.state === 'listening' ? 0.22 : this.state === 'speaking' ? 0.28 : 0.12;
      const breath = Math.sin(t * (this.state === 'thinking' ? 2.8 : this.state === 'speaking' ? 4.0 : 1.8)) * (0.004 + this.uniforms.uMotion.value * 0.006);
      const audioScale = this.uniforms.uAudioLevel.value * 0.045 + this.rippleStrength * 0.018;
      this.orbGroup.scale.setScalar((this.scale + breath + audioScale) * introScale);
      this.orbGroup.rotation.y += dt * rate;
      this.orbGroup.rotation.x = this.pointerY * 0.11 + Math.sin(t * 0.3) * 0.15;
      this.orbGroup.rotation.z = -this.pointerX * 0.12 + Math.sin(t * 0.19) * 0.025;
      if (this.innerGlow) {
        this.innerGlow.rotation.y = -t * 0.1;
        this.innerGlow.rotation.x = Math.sin(t * 0.32) * 0.08;
        this.innerGlow.scale.setScalar(1 + this.uniforms.uAudioLevel.value * 0.06 + Math.sin(t * 1.35) * 0.012);
        this.innerGlow.material.opacity = 0.17 + Math.min(0.07, this.uniforms.uGlowIntensity.value * 0.018 + this.uniforms.uAudioLevel.value * 0.04);
      }
      if (this.shells && this.shells.length) { this.shells.forEach((p, i) => { p.rotation.y += dt * 0.05 * p.userData.dir * (this.state === 'thinking' ? 3 : 1); p.rotation.z = p.userData.tilt + Math.sin(t * (0.21 + i * 0.07)) * 0.12; if (i) p.rotation.x = Math.sin(t * 0.3 + i) * 0.18; }); }
      if (this.particles) {
        this.particles.rotation.y += dt * (this.state === 'thinking' ? 0.16 : this.state === 'listening' ? 0.12 : this.state === 'speaking' ? 0.14 : 0.045);
        this.particles.rotation.x = Math.sin(t * 0.28) * 0.055;
      }
      try { this.renderer.render(this.scene, this.camera); } catch (_) {}
      this._loop();
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true; this._pauseLoop();
    if (this._onResize) { window.removeEventListener('resize', this._onResize); this._onResize = null; }
    if (this._onPointerMove && this.container) this.container.removeEventListener('pointermove', this._onPointerMove);
    if (this._onPointerLeave && this.container) this.container.removeEventListener('pointerleave', this._onPointerLeave);
    if (this._onPointerDown && this.container) this.container.removeEventListener('pointerdown', this._onPointerDown);
    if (this._onVisibility) { document.removeEventListener('visibilitychange', this._onVisibility); this._onVisibility = null; }
    this.disableAudioReactivity();
    if (this.scene) this.scene.traverse(function(object) {
      if (object.geometry && object.geometry.dispose) object.geometry.dispose();
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(function(material) { if (material && material.dispose) material.dispose(); });
    });
    if (this.renderer) { try { this.renderer.dispose(); if (this.renderer.forceContextLoss) this.renderer.forceContextLoss(); } catch (_) {} if (this.renderer.domElement && this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement); this.renderer = null; }
    if (this.failed && this.container) { try { this.container.innerHTML = ''; } catch (_) {} }
    this.scene = null; this.orb = this.innerGlow = this.particles = null;
  }
}

var emergencyOpen = false;
function openEmergencyModal() {
  var root = document.getElementById('emergency-modal-root');
  if (!root) return;
  emergencyOpen = true;
  renderEmergencyMenu();
}
function closeEmergencyModal() {
  emergencyOpen = false;
  var root = document.getElementById('emergency-modal-root');
  if (root) root.innerHTML = '';
}
function emDemoStrip(text) {
  return '<div class="em-demo-strip"><strong>DEMONSTRATION</strong> — ' + esc(text || 'CareTrack is a prototype. It cannot dispatch ambulances, send SMS, place calls by itself, or share your location. Nothing has been sent anywhere.') + '</div>';
}
function renderEmergencyMenu() {
  var root = document.getElementById('emergency-modal-root');
  if (!root) return;
  var hasContact = !!(State.profile && State.profile.emergencyContactPhone);
  root.innerHTML = '<div class="em-overlay" onclick="if(event.target===this)closeEmergencyModal()">' +
    '<div class="em-box"><div class="em-hdr"><h2>🚨 Emergency SOS</h2><p>Real emergency numbers and your saved contact</p></div><div class="em-body">' +
    emDemoStrip() +
    '<div class="em-act" onclick="openEmergencyNumbers()"><div class="em-ico" style="background:var(--danger-bg);color:var(--danger-text)">🆘</div><div><div class="em-t">Call 112 / 108 — Emergency & Ambulance</div><div class="em-d">Opens your phone dialer with the real emergency number. This is the fastest way to get real help.</div></div><span class="em-free">REAL</span></div>' +
    '<div class="em-act" onclick="callEmergencyContact()"><div class="em-ico" style="background:var(--warn-bg);color:var(--warn-text)">📞</div><div><div class="em-t">Call Emergency Contact</div><div class="em-d">' + (hasContact ? 'Dial your saved contact: ' + esc(State.profile.emergencyContactName || 'Emergency contact') : 'No contact saved yet — add one in My Profile') + '</div></div><span class="em-free">REAL</span></div>' +
    '<div class="em-act" onclick="openFindHospitals()"><div class="em-ico" style="background:var(--info-bg);color:var(--info-text)">🗺️</div><div><div class="em-t">Find Hospitals Near Me (Google Maps)</div><div class="em-d">Optionally share your location with Google Maps to list nearby hospitals. Only if you tap it.</div></div><span class="em-free">REAL</span></div>' +
    '<button class="em-close-btn" onclick="closeEmergencyModal()">Cancel</button></div></div></div>';
}
function openEmergencyNumbers() {
  var root = document.getElementById('emergency-modal-root');
  if (!root) return;
  root.innerHTML = '<div class="em-overlay" onclick="if(event.target===this)closeEmergencyModal()"><div class="em-box"><div class="em-hdr"><h2>🆘 Real Emergency Numbers</h2><p>Tap a number — your phone\'s dialer will open</p></div><div class="em-body">' +
    emDemoStrip('CareTrack does not place calls or dispatch anything itself. Tapping a number below opens YOUR phone\'s dialer; you still press the call button.') +
    '<div class="em-call-box"><div class="em-pulse">🆘</div><h3 style="font-size:18px;margin-bottom:8px">In a medical emergency, call now:</h3></div>' +
    '<a class="em-act" href="tel:112" style="text-decoration:none"><div class="em-ico" style="background:var(--danger-bg);color:var(--danger-text)">📞</div><div><div class="em-t">112 — National Emergency (India)</div><div class="em-d">Police · Fire · Ambulance — works on any phone</div></div></a>' +
    '<a class="em-act" href="tel:108" style="text-decoration:none"><div class="em-ico" style="background:var(--danger-bg);color:var(--danger-text)">🚑</div><div><div class="em-t">108 — Ambulance (India)</div><div class="em-d">Free emergency ambulance service</div></div></a>' +
    '<a class="em-act" href="tel:102" style="text-decoration:none"><div class="em-ico" style="background:var(--info-bg);color:var(--info-text)">🚑</div><div><div class="em-t">102 — Ambulance (alternate)</div><div class="em-d">Maternal/child & general ambulance in many states</div></div></a>' +
    '<p class="xs" style="margin-top:10px">Outside India, use your country\'s emergency number (e.g. 911, 999, 112 in the EU).</p>' +
    '<button class="em-close-btn" onclick="renderEmergencyMenu()">← Back</button></div></div></div>';
}
function callEmergencyContact() {
  var root = document.getElementById('emergency-modal-root');
  if (!root) return;
  var p = State.profile;
  var name = p && p.emergencyContactName ? p.emergencyContactName : '';
  var phone = p && p.emergencyContactPhone ? p.emergencyContactPhone : '';
  if (!phone) {
    root.innerHTML = '<div class="em-overlay" onclick="if(event.target===this)closeEmergencyModal()"><div class="em-box"><div class="em-hdr"><h2>📞 Emergency Contact</h2><p>No contact saved yet</p></div><div class="em-body">' +
      emDemoStrip('No SMS or calls are sent by this app. Save a real contact so you can dial it in one tap here.') +
      '<p class="muted">Go to <strong>My Profile</strong> and fill in "Emergency contact" (name + phone). Then this screen will show a one-tap dial button for them.</p>' +
      '<button class="em-close-btn" onclick="closeEmergencyModal();navigate(\'profile\')">Open My Profile</button>' +
      '<button class="em-close-btn" style="background:transparent" onclick="renderEmergencyMenu()">← Back</button></div></div></div>';
    return;
  }
  root.innerHTML = '<div class="em-overlay" onclick="if(event.target===this)closeEmergencyModal()"><div class="em-box"><div class="em-hdr"><h2>📞 Emergency Contact</h2><p>Dial your saved contact</p></div><div class="em-body">' +
    emDemoStrip('The app does not send anything by itself — the button opens your phone\'s dialer with the number ready.') +
    '<div class="em-hosp" style="margin-top:12px"><div><div class="em-hn">👤 ' + esc(name || 'Emergency contact') + '</div><div class="em-hd">' + esc(phone) + '</div></div></div>' +
    '<a class="em-act" href="tel:' + esc(phone.replace(/[^0-9+]/g, '')) + '" style="text-decoration:none"><div class="em-ico" style="background:var(--ok-bg);color:var(--ok-text)">📞</div><div><div class="em-t">Call now</div><div class="em-d">Opens your phone dialer</div></div></a>' +
    '<button class="em-close-btn" onclick="renderEmergencyMenu()">← Back</button></div></div></div>';
}
function openFindHospitals() {
  var root = document.getElementById('emergency-modal-root');
  if (!root) return;
  root.innerHTML = '<div class="em-overlay" onclick="if(event.target===this)closeEmergencyModal()"><div class="em-box"><div class="em-hdr"><h2>🗺️ Find Hospitals Near Me</h2><p>Uses Google Maps — only with your permission</p></div><div class="em-body">' +
    emDemoStrip('This does not contact any hospital. It opens Google Maps in a new tab so YOU can see real nearby hospitals.') +
    '<p class="muted mt8">If you continue, your browser will ask for location permission. Your coordinates are used only to build the Google Maps link — they are not stored or sent anywhere else by CareTrack.</p>' +
    '<button class="btn btn-p w100 mt16" onclick="doFindHospitals()">Allow location & open Google Maps</button>' +
    '<button class="em-close-btn" onclick="doFindHospitalsNoLocation()">Search "hospitals near me" without location</button>' +
    '<button class="em-close-btn" style="background:transparent" onclick="renderEmergencyMenu()">← Back</button></div></div></div>';
}
function doFindHospitals() {
  if (!navigator.geolocation) {
    toast('Geolocation is not available in this browser. Opening a general Maps search instead.');
    doFindHospitalsNoLocation();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude.toFixed(5), lng = pos.coords.longitude.toFixed(5);
      window.open('https://www.google.com/maps/search/hospitals+near/' + lat + ',' + lng, '_blank', 'noopener');
      toast('Opened Google Maps with hospitals near your location.');
    },
    function(err) {
      var msg = err && err.code === 1 ? 'Location permission denied.' : 'Could not get your location.';
      toast(msg + ' Opening a general Maps search instead.', true);
      doFindHospitalsNoLocation();
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}
function doFindHospitalsNoLocation() {
  window.open('https://www.google.com/maps/search/hospitals+near+me', '_blank', 'noopener');
}
function callNationalEmergency() {
  openEmergencyNumbers();
}