/**
 * Sahaara AI / CareTrack — System Constants & SVG Icon Map
 */


const STORAGE_KEY = 'caretrack.v1';
const SETTINGS_KEY = 'caretrack.settings.v1';
const MEMSTORE = new Map();
let storageWarned = false;
let storageAvailable = true;
function storageNotice() {
  if (storageWarned) return;
  storageWarned = true;
  try { console.warn('CareTrack: localStorage unavailable. Data will not persist after reload.'); } catch(e) {}
}
const store = {
  get(k) {
    try {
      const v = window.localStorage.getItem(k);
      if (v !== null) return v;
    } catch(e) { storageNotice(); }
    return MEMSTORE.has(k) ? MEMSTORE.get(k) : null;
  },
  set(k, v) {
    MEMSTORE.set(k, String(v));
    try {
      window.localStorage.setItem(k, String(v));
      return true;
    } catch(e) {
      storageNotice();
      try {
        if (e && (e.name === 'QuotaExceededError' || e.code === 22))
          toast('Storage is full. Changes kept for this session only.', true);
      } catch(_) {}
      return false;
    }
  },
  remove(k) {
    MEMSTORE.delete(k);
    try { window.localStorage.removeItem(k); } catch(e) { storageNotice(); }
  },
  checkAvailable() {
    try {
      const t = '__ct_test__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return true;
    } catch(e) { return false; }
  }
};
storageAvailable = store.checkAvailable();
const ICONS = {
  'dashboard': '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  'calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  'clipboard-list': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  'bar-chart': '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  'user': '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8-.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  'x': '<path d="M18 6 6 18M6 6l12 12"/>',
  'check': '<path d="M20 6 9 17l-5-5"/>',
  'plus': '<path d="M12 5v14M5 12h14"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  'clock': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  'edit': '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  'trash': '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  'printer': '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  'alert-circle': '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  'undo': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  'play': '<path d="m6 4 14 8-14 8z"/>',
  'pause': '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  'skip': '<path d="m5 4 10 8-10 8z"/><line x1="19" y1="5" x2="19" y2="19"/>',
  'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  'activity': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  'heart-pulse': '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  'shield': '<path d="M20 13c0 5-3.5 7.5-7.7 9a.6.6 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/>',
  'sparkles': '<path d="M12 3l1.8 5.4a2.2 2.2 0 0 0 1.4 1.4L20.6 12l-5.4 1.8a2.2 2.2 0 0 0-1.4 1.4L12 20.6l-1.8-5.4a2.2 2.2 0 0 0-1.4-1.4L3.4 12l5.4-1.8a2.2 2.2 0 0 0 1.4-1.4z"/><path d="M19 2v4M21 4h-4"/><path d="M4 17v3M5.5 18.5h-3"/>',
  'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  'mic': '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  'mic-off': '<path d="M2 2l20 20M18.9 13.4A7 7 0 0 0 19 12v-2M5 10v2a7 7 0 0 0 12 5M12 19v3M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.7"/>',
  'send': '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  'volume-2': '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
};
const ic = (name, sz) => {
  const p = ICONS[name] || ICONS['info'];
  const s = sz ? ` style="width:${sz}px;height:${sz}px"` : '';
  return `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${s}>${p}</svg>`;
};

// ==========================================================================
// Sahaara AI — Internationalization (i18n) & Multilingual Engine
// ==========================================================================

const I18N = {
  hi: {
    // Navigation & Tabs
    "Wellbeing Overview": "स्वास्थ्य अवलोकन",
    "Mood Check-in": "मूड चेक-इन",
    "Daily Reflection": "दैनिक आत्म-चिंतन",
    "Private Journal": "निजी डायरी",
    "Mood Trends & Insights": "मूड रुझान एवं विश्लेषण",
    "Wellbeing Toolkit": "स्वास्थ्य टूलकिट",
    "Sahaara AI Assistant": "सहारा AI सहायक",
    "Today's Plan": "आज की योजना",
    "Self-Care Activities": "स्व-देखभाल गतिविधियाँ",
    "Reminders & Alerts": "अनुस्मारक और अलर्ट",
    "Reports": "स्वास्थ्य रिपोर्ट",
    "My Profile": "मेरी प्रोफ़ाइल",
    "Settings": "सेटिंग्स",
    "Overview": "अवलोकन",
    "Mood": "मूड",
    "Journal": "डायरी",
    "Insights": "विश्लेषण",
    "More": "अधिक",
    "All pages": "सभी पृष्ठ",

    // Header & Actions
    "Sign Out / Switch": "साइन आउट / बदलें",
    "Sign Out": "साइन आउट",
    "Language": "भाषा (Language)",
    "Select interface and voice language": "इंटरफ़ेस और आवाज़ की भाषा चुनें",

    // Dashboard
    "Hello": "नमस्ते",
    "Friend": "मित्र",
    "Start Today's Self-Care Plan": "आज की स्व-देखभाल योजना शुरू करें",
    "How have you been feeling?": "आज आप कैसा महसूस कर रहे हैं?",
    "A quick check-in can help you build a picture of your wellbeing over time.": "एक त्वरित चेक-इन आपको समय के साथ अपने स्वास्थ्य की स्पष्ट तस्वीर बनाने में मदद करता है।",
    "Check in again": "पुनः मूड जांचें",
    "Start mood check-in": "मूड चेक-इन शुरू करें",
    "Daily reflection": "दैनिक आत्म-चिंतन",
    "Open journal": "डायरी खोलें",
    "View insights": "विश्लेषण देखें",
    "Wellbeing toolkit": "स्वास्थ्य टूलकिट",
    "Today's Adherence": "आज का पालन (Adherence)",
    "Completed": "पूर्ण",
    "Pending (Upcoming / Due)": "लंबित (आगामी / बाकी)",
    "Pending": "लंबित",
    "Missed": "छूट गया",
    "Next Scheduled Activity": "अगली निर्धारित गतिविधि",
    "None remaining today.": "आज कोई अन्य गतिविधि शेष नहीं है।",
    "7-Day Adherence": "7-दिवसीय पालन दर",
    "Alerts": "अलर्ट",
    "View all →": "सभी देखें →",
    "Nothing scheduled today": "आज के लिए कुछ निर्धारित नहीं है",
    "Add self-care prescriptions to see your daily plan here.": "अपनी दैनिक योजना यहाँ देखने के लिए स्व-देखभाल परामर्श जोड़ें।",
    "Manage Prescriptions": "परामर्श प्रबंधित करें",

    // Today's Plan & Task Cards
    "Completed": "पूर्ण",
    "Skipped": "छोड़ा गया",
    "Missed": "छूट गया",
    "Due now": "अभी बाकी",
    "Upcoming": "आगामी",
    "Complete": "पूर्ण करें",
    "Skip": "छोड़ें",
    "Undo": "पूर्ववत करें",
    "Available at scheduled time": "निर्धारित समय पर उपलब्ध",
    "Prev": "पिछला",
    "Today": "आज",
    "Next": "अगला",
    "Nothing scheduled for this date": "इस तिथि के लिए कुछ भी निर्धारित नहीं है",
    "Check your prescriptions or adjust the date.": "अपने परामर्श देखें या तिथि समायोजित करें।",
    "Logged late": "देर से दर्ज",
    "Demo": "डेमो",
    "Simulated": "सिम्युलेटेड",

    // Categories
    "Diet & nutrition": "आहार एवं पोषण",
    "Diet plan check-in": "आहार योजना चेक-इन",
    "Physical activity": "शारीरिक गतिविधि (व्यायाम)",
    "Sleep routine": "नींद एवं विश्राम",
    "Hydration": "जल-आपूर्ति (Hydration)",
    "Stress management": "तनाव प्रबंधन",
    "Breathing / clinician-approved wellness": "श्वास व्यायाम / प्राणायाम",
    "Other non-pharmacological": "दवाई एवं अन्य परामर्श",

    // Wellbeing Suite
    "Daily wellbeing reflection": "दैनिक स्वास्थ्य चिंतन",
    "Private journal": "निजी डायरी",
    "Wellbeing toolkit": "स्वास्थ्य टूलकिट",
    "Write freely…": "स्वतंत्र रूप से लिखें…",
    "Save journal entry": "डायरी प्रविष्टि सहेजें",
    "Recent entries": "हाल की प्रविष्टियां",
    "Delete entry": "प्रविष्टि हटाएं",
    "Delete": "हटाएं",
    "Save reflection": "चिंतन सहेजें",

    // Clinician Mode
    "Clinician Review Mode": "चिकित्सक समीक्षा मोड (केवल-पठन)",
    "Clinician Read-Only: Patient records self-care logs": "चिकित्सक केवल-पठन: रोगी स्व-देखभाल लॉग दर्ज करता है",
    "View Patient's Daily Plan": "रोगी की दैनिक योजना देखें",
    "Review Patient Mood": "रोगी का मूड देखें",
    "Patient's Daily Self-Care Plan": "रोगी की दैनिक स्व-देखभाल योजना",
    "Patient Mood & Wellbeing Trends": "रोगी का मूड एवं स्वास्थ्य रुझान",
    "Patient Mood Log Summary": "रोगी का मूड लॉग सारांश",
    "Clinician read-only: Mood check-ins are recorded directly by the patient.": "चिकित्सक केवल-पठन: मूड चेक-इन सीधे रोगी द्वारा दर्ज किए जाते हैं।",
    "Total check-ins recorded": "कुल दर्ज चेक-इन",
    "Latest Mood Rating": "नवीनतम मूड रेटिंग",
    "Stress Level": "तनाव स्तर",
    "Reported Sleep": "दर्ज की गई नींद",
    "No check-ins recorded yet by patient.": "रोगी द्वारा अभी तक कोई चेक-इन दर्ज नहीं किया गया है।",
    "Viewing patient daily reflection scores in read-only mode.": "रोगी के दैनिक चिंतन स्कोर केवल-पठन मोड में देख रहे हैं।",
    "Patient Daily Reflection Review": "रोगी दैनिक आत्म-चिंतन समीक्षा",
    "Clinician read-only: Daily reflections are recorded by the patient to track self-perception across 5 wellness domains.": "चिकित्सक केवल-पठन: 5 स्वास्थ्य क्षेत्रों में आत्म-मूल्यांकन ट्रैक करने के लिए दैनिक चिंतन रोगी द्वारा दर्ज किया जाता है।",
    "Latest Assessment Submitted": "नवीनतम प्रस्तुत मूल्यांकन",
    "Average reflection score": "औसत चिंतन स्कोर",
    "No daily reflections saved by patient yet.": "रोगी द्वारा अभी तक कोई दैनिक चिंतन सहेजा नहीं गया है।",
    "Patient Private Journal (Clinician Review)": "रोगी की निजी डायरी (चिकित्सक समीक्षा)",
    "Review patient-shared personal reflections and logs.": "रोगी द्वारा साझा किए गए व्यक्तिगत चिंतन और लॉग की समीक्षा करें।",
    "Reading patient journal reflections in read-only mode. Clinicians cannot edit, write, or delete entries.": "रोगी की डायरी केवल-पठन मोड में पढ़ रहे हैं। चिकित्सक प्रविष्टियों को संपादित, लिख या हटा नहीं सकते हैं।",
    "Patient's Journal Entries": "रोगी की डायरी प्रविष्टियां",
    "View reflections": "चिंतन देखें",
    "Read journal": "डायरी पढ़ें",
    "Viewing patient self-care schedule and completion logs in read-only mode.": "रोगी की स्व-देखभाल अनुसूची और पूर्णता लॉग केवल-पठन मोड में देख रहे हैं।",
    "Viewing patient mood check-in history in read-only mode.": "रोगी के मूड चेक-इन इतिहास को केवल-पठन मोड में देख रहे हैं।",
    "Reviewing clinical self-care logs for patient": "रोगी के नैदानिक स्व-देखभाल लॉग की समीक्षा",
    "Logs are read-only.": "लॉग केवल-पठन हैं।",

    // Disclaimers
    "Demonstration prototype — not a medical record or medical advice.": "डेमो प्रोटोटाइप — यह कोई चिकित्सीय रिकॉर्ड या चिकित्सा सलाह नहीं है।",
    "If you feel unwell or have concerns, contact your healthcare provider or local emergency services.": "यदि आप अस्वस्थ महसूस करते हैं, तो अपने चिकित्सक या आपातकालीन सेवाओं से संपर्क करें।"
  }
};

function getLanguage() {
  if (typeof State !== 'undefined' && State.settings && State.settings.language) {
    return State.settings.language;
  }
  try {
    const s = localStorage.getItem('sahaara_lang');
    if (s) return s;
  } catch (_) {}
  return 'en';
}

function t(text) {
  if (!text) return '';
  const lang = getLanguage();
  if (lang === 'hi' && I18N.hi && I18N.hi[text]) {
    return I18N.hi[text];
  }
  return text;
}

function setLanguage(lang) {
  const target = (lang === 'hi' || lang === 'hi-IN') ? 'hi' : 'en';
  if (typeof State !== 'undefined') {
    if (!State.settings) State.settings = {};
    State.settings.language = target;
    if (typeof saveState === 'function') saveState();
  }
  try {
    if (typeof store !== 'undefined') store.set('sahaara_lang', target);
    localStorage.setItem('sahaara_lang', target);
  } catch (_) {}

  if (typeof AI !== 'undefined') {
    AI.language = target;
    AI.autoTranslate = (target !== 'en');
  }
  if (typeof VoiceMode !== 'undefined') {
    VoiceMode.preferredLang = (target === 'hi') ? 'hi-IN' : 'en-IN';
    if (VoiceMode.recognition) VoiceMode.recognition.lang = (target === 'hi') ? 'hi-IN' : 'en-IN';
  }
  if (typeof render === 'function') render();
  if (typeof toast === 'function') {
    toast(target === 'hi' ? 'भाषा बदलकर हिन्दी कर दी गई है।' : 'Language switched to English.');
  }
}

function toggleLanguage() {
  setLanguage(getLanguage() === 'hi' ? 'en' : 'hi');
}
