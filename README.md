# 🩺 Sahaara AI — Modular Health & Wellbeing Architecture

[![Live Demo](https://img.shields.io/badge/Live%20Demo-binary--collector.github.io%2FSahaaraAI-0d9488?style=for-the-badge&logo=githubpages&logoColor=white)](https://binary-collector.github.io/SahaaraAI/)

[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](LICENSE)
[![Platform: Web](https://img.shields.io/badge/Platform-Web%20%7C%20PWA%20Ready-blue.svg)](https://binary-collector.github.io/SahaaraAI/)
[![WebGL](https://img.shields.io/badge/WebGL-Three.js%203D%20Orb-9cf.svg)](https://threejs.org/)
[![Speech](https://img.shields.io/badge/Speech-Web%20Speech%20API-purple.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
[![Responsive](https://img.shields.io/badge/Responsive-Desktop%20%7C%20Tablet%20%7C%20Android-green.svg)](https://binary-collector.github.io/SahaaraAI/)

> **Sahaara AI** is an advanced personal health, mental wellbeing, and prescription tracking ecosystem featuring conversational AI assistance, a real-time WebGL 3D Voice Orb, offline-first synchronization, and rapid Emergency SOS services.

🌐 **Live Website**: [https://binary-collector.github.io/SahaaraAI/](https://binary-collector.github.io/SahaaraAI/)

---

## ⚡ Dual Prototype Showcase Accounts (Patient & Doctor)

Fully configured dummy testing accounts are built directly into the system to demonstrate **every feature** of Sahaara AI immediately for both patient self-care and clinician monitoring:

### Quick Access Options:
- **1-Click Prototype Access**: Click either **`👤 Patient (1-Click)`** or **`🩺 Doctor (1-Click)`** on the Sign-In screen.
- **Manual Credentials**:
  - **👤 Patient Account**: `patient.prototype@sahaara.ai` (or `patient@sahaara.ai`) · `password123`
  - **🩺 Doctor Account**: `demo.prototype@sahaara.ai` (or `sarah.mitchell@sahaara.ai`) · `password123`

### What These Prototypes Demonstrate:
1. **Clinical Personas**:
   - **Patient Persona**: `Ananya Sharma`, Age 42, Patient ID `PAT-84920`, Condition: `Type 2 diabetes`, Clinician: `Dr. Rajesh Patel, MD`, Emergency Contact: `Vikram Sharma (Spouse)` at `+91 98765 43210`.
   - **Doctor Persona**: `Dr. Sarah Mitchell`, Age 34, Patient ID `CT-84920`, Cardiometabolic Specialist, Emergency Contact: `David Mitchell` at `+1 (555) 019-2834`.
2. **7 Multi-Category Prescriptions**:
   - 🌬️ **Breathing**: Morning Diaphragmatic Box Breathing (Pranayama) (`07:30`)
   - 🍏 **Diet**: Balanced Breakfast & Fasting Blood Sugar Log (`08:00`)
   - 💊 **Medication**: Metformin Hydrochloride 500mg (`08:30`, `19:30`)
   - 💧 **Hydration**: Hydration Target 250ml Water (`10:00`, `14:00`, `16:30`)
   - 🏃 **Activity**: Cardio Interval Walk & Movement Break (`18:00`)
   - 🧘 **Stress**: Evening Stress Decompression & Reflection (`20:30`)
   - 🌙 **Sleep**: Sleep Hygiene Wind-down & Screen Cutoff (`22:00`)
3. **Today's Plan Schedule**: Morning tasks marked completed with realistic timestamps; afternoon/evening tasks scheduled in pending states with dynamic progress bars.
4. **7-Day Adherence Records**: 6 days of historical logs generating a **93% Adherence Rate** that dynamically powers the adherence mini-bar charts and Reports screen.
5. **Wellbeing Suite**:
   - **Interactive Mood Chart**: 7 consecutive daily mood logs plotting the SVG mood line chart with ratings, emotion tags, sleep hours, stress ratings, and notes.
   - **Daily Reflections**: 3 recorded reflection assessments with wellbeing scores.
   - **Personal Health Journal**: 3 persona-specific reflection entries (patient diabetes journey vs clinician work-life self-care balance).
   - **Wellbeing Toolkit**: Breathing presets and 5-4-3-2-1 sensory grounding exercise.
6. **Conversational Sahaara AI Sessions**: Pre-seeded with 3 realistic dialogues:
   - *Session 1: Post-Meal Blood Sugar & Walking Strategy*
   - *Session 2: Stress Relief & 4-7-8 Breathing Guidance*
   - *Session 3: Emergency Safety Plan & Rapid SOS Overview*
7. **Emergency SOS System**: Saved spouse contact ready for 1-tap dial, nearby hospital Google Maps locator, and national emergency hotlines.
8. **↻ Prototype Data Reset**: In the **My Profile** screen, a **Reset Prototype Data** button allows testers to restore the clean prototype mock data at any time after making test edits.

---

## 🎙️ Resilient Voice AI & Fetch-Decode-Execute Clinical Engine

Sahaara AI incorporates an intelligent, offline-resilient conversational Voice Mode designed to overcome browser Web Speech API limitations (such as Chromium's cloud-speech network drops) with a complete clinical data engine:

### 1. 🛡️ Voice Recognition Network Resilience
- **Smart Model & Language Fallback**: When Chromium/browser speech recognition throws `event.error === 'network'` due to Google speech-server timeouts or firewall blocks on regional language tags (e.g. `en-IN`, `hi-Latn`), Sahaara does not terminate the session. It automatically retries with the universal `en-US` model and applies exponential backoff.
- **Zero-Lockout Architecture**: If browser cloud speech is completely blocked or offline, Sahaara keeps the 3D Orb and conversation active, smoothly transitioning to the interactive Voice Bar and local speech synthesis rather than blocking the user.
- **Offline Browser Speech Synthesis (TTS)**: Spoken voice responses utilize the browser's built-in `window.speechSynthesis` engine, which operates locally and completely offline without requiring cloud API connections.

### 2. ⚡ The Fetch - Decode - Execute Clinical Pipeline
When users speak or tap a command, the internal `SahaaraVoiceEngine` executes a 3-stage clinical pipeline:
- **STAGE 1 — FETCH**: Queries live reactive `State`:
  - Today's date and minute-by-minute scheduled occurrences (`getAllOccurrencesForDate()`).
  - Active self-care prescriptions with dosages and frequencies.
  - Real-time 7-day adherence metrics and active streak days (`calcDetailedAdherence()`).
  - Patient clinical profile, conditions, and saved Emergency SOS contact.
  - Recent 7-day mood check-in records (`State.moodHistory`).
- **STAGE 2 — DECODE**: Multilingual natural language intent parser recognizing:
  - **Task Completion** (*"I took my Metformin"*, *"Mark morning breathing done"*, *"Completed 20 minute walk"*, *"Maine subah ki dawai le li"*).
  - **Schedule & Next Queries** (*"What's my next activity?"*, *"What's on my plan today?"*, *"What tasks are left?"*, *"Agla task kya hai?"*).
  - **Adherence Reports** (*"How is my adherence?"*, *"What is my streak?"*, *"Am I on track?"*).
  - **Prescriptions List** (*"What medications am I taking?"*, *"Show my active care plan"*).
  - **Guided Breathing** (*"Start breathing exercise"*, *"Guide my breathing"*, *"Pranayama shuru karo"*).
  - **Mood Check-In** (*"Log my mood as calm"*, *"I feel great today"*, *"Feeling anxious"*).
  - **Emergency SOS** (*"Call emergency contact"*, *"Emergency SOS"*, *"Call doctor"*).
  - **Clinical Consultation** (*"Can I eat sweets?"*, *"Tips for better sleep"*, *"I feel dizzy"*).
- **STAGE 3 — EXECUTE**:
  - Automatically executes `completeOccurrence()` or mood recording on `State`.
  - Persists changes immediately via `saveState()`.
  - Triggers live reactive UI dashboard update via `render()`.
  - Animates the Three.js 3D WebGL Orb into `speaking` state with synchronized ripple pulses.
  - Speaks natural, compassionate audio feedback via speech synthesis.

### 3. 🔘 One-Touch Quick Voice Action Bar
Prominently integrated within the 3D WebGL Orb screen:
- 💊 **Mark Dose**: Instantly completes the active due medication or activity.
- 📋 **What's Next**: Fetches and speaks upcoming activities and remaining counts.
- 📊 **Adherence**: Reports live 7-day adherence percentage and streak.
- 🫁 **Breathing**: Guides the user through a rhythmic 4-4-4 box breathing sequence.
- 🧘 **Log Mood**: Logs a wellness check-in and responds with compassionate advice.
- 🆘 **SOS**: Activates the Emergency SOS protocol and 1-tap contact dialer.

---

## 📱 Responsive Optimizations (Desktop, Tablet & Android)

The application features a tailored **3-tier responsive architecture** optimized for desktop monitors, iPads / Android tablets, and Android smartphones:

### 1. 🖥️ Desktop Mode (`min-width: 1025px`)
- **Navigation**: Dedicated left sidebar (`260px`) with branding, icon navigation, theme switcher, and persistent user profile.
- **Main Container**: Centered layout (`max-width: 1200px`) with comfortable padding (`32px 40px`).
- **Grids**: 4-column KPI cards (`.g4`), 2-column charts & schedules (`.g2`), 3-column toolkit cards (`.g3`).
- **Modals**: Centered desktop dialogs (`max-width: 580px`, wide: `820px`) with smooth backdrop blur (`backdrop-filter: blur(4px)`).
- **Floating Controls**:
  - `ai-fab`: Bottom-right `28px` (60×60px)
  - `voice-fab`: Bottom-left `28px` (60×60px)
  - `emergency-fab`: Top-right `24px` (54×54px)
- **AI Drawer**: Desktop panel (`440×600px`) with smooth slide-over animation.

### 2. 📱 Tablet View (`641px - 1024px`, e.g., iPad, Galaxy Tab, Surface)
- **Navigation**: Sticky tablet header (`62px`) with bottom touch tab bar with touch padding.
- **Container**: Balanced width (`max-width: 900px`) with `24px` horizontal padding.
- **Grids**: Clean 2×2 layout for `.g4` KPI stat cards and 2 columns for `.g2` task lists.
- **Modals**: **Centered tablet dialogs** (`max-width: 580px`, centered with rounded corners), avoiding stretched phone bottom sheets on wide tablet displays.
- **FAB Positioning**: Elevated above the bottom tab bar (`bottom: calc(76px + env(safe-area-inset-bottom))`) with zero overlapping.

### 3. 🤖 Android & Mobile View (`max-width: 640px`, e.g., Samsung Galaxy, Pixel, OnePlus)
- **Dynamic Viewport (`100dvh`)**: Compensates for dynamic Android Chrome address bars and on-screen virtual keyboards.
- **Android Safe Areas**: Native integration with `env(safe-area-inset-top)` for notches/camera cutouts and `env(safe-area-inset-bottom)` for gesture navigation bars.
- **Collision-Free Floating Action Buttons**:
  - `ai-fab`: Elevated at `bottom: calc(70px + env(safe-area-inset-bottom)); right: 14px;`
  - `voice-fab`: Elevated at `bottom: calc(70px + env(safe-area-inset-bottom)); left: 14px;`
  - `emergency-fab`: Aligned into the mobile header at `top: calc(8px + env(safe-area-inset-top)); right: 54px;` alongside settings.
- **Mobile Bottom Sheets**: Modals transform into native bottom sheets with rounded top corners (`20px 20px 0 0`), drag handle indicators, and `overscroll-behavior: contain`.
- **Touch Optimization**: Minimum `44px` touch targets and `16px` minimum input font size to prevent unwanted Android browser auto-zoom on input focus.
- **Compact 2×2 KPI Grids**: All 4 dashboard stats fit on a single mobile screen without requiring scrolling.

---

## 📁 Modular Directory Structure

```
D:\NSP\SahaaraAI_App\
├── index.html                   # Production-ready entry point with modular linkages
├── README.md                    # System architecture and documentation
├── css/
│   ├── main.css                 # Design tokens, variables, typography, reset, grid layouts
│   ├── components.css           # 3-tier responsive components, cards, modals, tabs, forms, tables
│   ├── views.css                # Views styling: dashboard, mood check-in, journal, toolkit, reports, settings
│   ├── ai-assistant.css         # Sahaara AI chat drawer, 3D voice orb modal, emergency SOS styling
│   └── auth.css                 # Modern, accessible login & registration styling
└── js/
    ├── anime-compat.js          # Lightweight animation engine compatible with anime.js syntax
    ├── backend-sync.js          # CareTrack offline sync engine & API event synchronization
    ├── constants.js             # Navigation taxonomy, SVG icon dictionary, clinical categories
    ├── utils.js                 # Date/time helpers, safe escaping, toasts, modal state management
    ├── state.js                 # Reactive state store, persistence, prescriptions, adherence calculations
    ├── auth.js                  # Authentication engine & prototype showcase data generator
    ├── wellbeing.js             # Wellbeing features: Mood check-in, reflections, journal, toolkit
    ├── ai-engine.js             # Sahaara AI NLP intents, translations, emergency detection, SOS dialog
    ├── voice-mode.js            # Voice recognition, Three.js 3D Orb shaders, speech synthesis
    ├── views.js                 # Views renderers: Dashboard, Today, Prescriptions, Reports, Profile, Settings
    └── app.js                   # Application bootstrap, routing, intervals, auth gate, reasoning layer
```

---

## 🔐 Multi-User Authentication

In addition to the prototype account, users can create new private accounts using the **Create Account** tab. New accounts receive a fresh personal health record space, isolated in browser storage.

---

## 🚀 Running the Application

Double-click `index.html` directly in Windows Explorer or serve via any static HTTP server:

```powershell
# Using Python
python -m http.server 8000 --directory D:\NSP\SahaaraAI_App

# Using Node.js
npx serve D:\NSP\SahaaraAI_App
```

---

*Original monolithic file preserved untouched as backup at: `D:\NSP\SahaaraAI.html`*
