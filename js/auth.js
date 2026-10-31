/**
 * Sahaara AI — Authentication, Multi-User Sessions & Prototype Showcase Engine
 * Seamless Login, Registration, Session Storage & 1-Click Prototype Access
 */

const Auth = {
  USERS_KEY: 'sahaara_users_v1',
  SESSION_KEY: 'sahaara_active_session_v1',
  currentUser: null,
  activeTab: 'signin',

  init() {
    this.seedDefaultUsers();
    // Whenever this prototype is opened, always open on the login window
    this.currentUser = null;
    try {
      localStorage.removeItem(this.SESSION_KEY);
      sessionStorage.removeItem(this.SESSION_KEY);
    } catch (_) {}
  },

  seedDefaultUsers() {
    const existing = this.getUsers();
    const demoAccounts = [
      {
        id: 'usr_prototype_patient',
        name: 'Ananya Sharma',
        email: 'patient.prototype@sahaara.ai',
        password: 'password123',
        role: 'patient',
        emergencyContact: '+91 98765 43210',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr_patient_alias',
        name: 'Ananya Sharma',
        email: 'patient@sahaara.ai',
        password: 'password123',
        role: 'patient',
        emergencyContact: '+91 98765 43210',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr_prototype_demo',
        name: 'Dr. Sarah Mitchell',
        email: 'demo.prototype@sahaara.ai',
        password: 'password123',
        role: 'clinician',
        emergencyContact: '+1 (555) 019-2834',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr_demo_alias',
        name: 'Dr. Sarah Mitchell',
        email: 'sarah.mitchell@sahaara.ai',
        password: 'password123',
        role: 'clinician',
        emergencyContact: '+1 (555) 019-2834',
        createdAt: new Date().toISOString()
      }
    ];

    let changed = false;
    demoAccounts.forEach(demo => {
      if (!existing.some(u => u.email.toLowerCase() === demo.email.toLowerCase())) {
        existing.push(demo);
        changed = true;
      }
    });

    if (changed || existing.length === 0) {
      this.saveUsers(existing);
    }
  },

  getUsers() {
    try {
      const data = localStorage.getItem(this.USERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (_) {
      return [];
    }
  },

  saveUsers(users) {
    try {
      localStorage.setItem(this.USERS_KEY, JSON.stringify(users));
    } catch (_) {}
  },

  isAuthenticated() {
    return !!(this.currentUser && this.currentUser.email);
  },

  isPrototypeAccount() {
    if (!this.currentUser || !this.currentUser.email) return false;
    const em = this.currentUser.email.toLowerCase();
    return em === 'patient.prototype@sahaara.ai' ||
           em === 'patient@sahaara.ai' ||
           em === 'ananya.sharma@sahaara.ai' ||
           em === 'demo.prototype@sahaara.ai' ||
           em === 'sarah.mitchell@sahaara.ai';
  },

  isPatientPrototypeAccount() {
    if (!this.currentUser || !this.currentUser.email) return false;
    const em = this.currentUser.email.toLowerCase();
    return em === 'patient.prototype@sahaara.ai' ||
           em === 'patient@sahaara.ai' ||
           em === 'ananya.sharma@sahaara.ai';
  },

  login(email, password, isDemo) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const users = this.getUsers();
    let user = users.find(u => u.email.toLowerCase() === cleanEmail);

    const isPatientDemo = cleanEmail === 'patient.prototype@sahaara.ai' ||
                          cleanEmail === 'patient@sahaara.ai' ||
                          cleanEmail === 'ananya.sharma@sahaara.ai';
    const isDoctorDemo = cleanEmail === 'demo.prototype@sahaara.ai' ||
                         cleanEmail === 'sarah.mitchell@sahaara.ai';

    if (!user) {
      if (isDemo || isPatientDemo || isDoctorDemo) {
        const demoUser = isDoctorDemo ? {
          id: 'usr_prototype_demo',
          name: 'Dr. Sarah Mitchell',
          email: cleanEmail || 'demo.prototype@sahaara.ai',
          password: 'password123',
          role: 'clinician',
          emergencyContact: '+1 (555) 019-2834',
          createdAt: new Date().toISOString()
        } : {
          id: 'usr_prototype_patient',
          name: 'Ananya Sharma',
          email: cleanEmail || 'patient.prototype@sahaara.ai',
          password: 'password123',
          role: 'patient',
          emergencyContact: '+91 98765 43210',
          createdAt: new Date().toISOString()
        };
        users.push(demoUser);
        this.saveUsers(users);
        user = demoUser;
      } else {
        return { success: false, error: 'No account found with this email address.' };
      }
    }

    if (user.password !== password) {
      return { success: false, error: 'Incorrect password. Please try again.' };
    }

    this.currentUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || (isPatientDemo ? 'patient' : 'user'),
      emergencyContact: user.emergencyContact
    };

    try {
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(this.currentUser));
    } catch (_) {}

    return { success: true, user: this.currentUser };
  },

  register(name, email, password, confirmPassword, emergencyContact) {
    if (!name || name.trim().length < 2) {
      return { success: false, error: 'Please enter your full name (minimum 2 characters).' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters in length.' };
    }
    if (password !== confirmPassword) {
      return { success: false, error: 'Passwords do not match. Please verify.' };
    }

    const users = this.getUsers();
    if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      return { success: false, error: 'An account with this email address already exists. Please sign in.' };
    }

    const newUser = {
      id: 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password,
      emergencyContact: emergencyContact ? emergencyContact.trim() : '',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveUsers(users);

    this.currentUser = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      emergencyContact: newUser.emergencyContact
    };

    try {
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(this.currentUser));
    } catch (_) {}

    return { success: true, user: this.currentUser };
  },

  logout() {
    this.currentUser = null;
    if (typeof window !== 'undefined') window.__appStartedAfterAuth = false;
    try {
      localStorage.removeItem(this.SESSION_KEY);
      sessionStorage.removeItem(this.SESSION_KEY);
    } catch (_) {}
    if (typeof toast === 'function') {
      toast('Signed out successfully.');
    }
    this.renderAuthScreen();
  },

  quickPatientLogin() {
    const res = this.login('patient.prototype@sahaara.ai', 'password123', true);
    if (res.success) {
      this.loadPrototypeShowcaseData('patient');
      if (typeof toast === 'function') {
        toast('Welcome to Sahaara AI, Ananya! Patient Prototype loaded.');
      }
      this.closeAuthScreen();
      if (typeof window.startAppAfterAuth === 'function') {
        window.startAppAfterAuth();
      } else if (typeof render === 'function') {
        render();
      }
    }
  },

  quickDemoLogin(type) {
    if (type === 'doctor') {
      const res = this.login('demo.prototype@sahaara.ai', 'password123', true);
      if (res.success) {
        this.loadPrototypeShowcaseData('doctor');
        if (typeof toast === 'function') {
          toast('Welcome to Sahaara AI Showcase (Dr. Sarah Mitchell)!');
        }
        this.closeAuthScreen();
        if (typeof window.startAppAfterAuth === 'function') {
          window.startAppAfterAuth();
        } else if (typeof render === 'function') {
          render();
        }
      }
      return;
    }
    this.quickPatientLogin();
  },

  fillCredentials(email, password) {
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    if (emailEl) emailEl.value = email;
    if (passEl) passEl.value = password;
    if (typeof toast === 'function') {
      toast('Filled prototype credentials into form');
    }
  },

  /**
   * Generates rich, comprehensive mock prototype data demonstrating every feature
   * of Sahaara AI (Profile, Prescriptions, Records, Adherence, Moods, Journal, AI Sessions).
   * Supports both 'patient' (default) and 'doctor' showcase modes.
   */
  loadPrototypeShowcaseData(type) {
    function offsetDate(d) {
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      return dt.toISOString().slice(0, 10);
    }

    const today = (typeof todayStr === 'function') ? todayStr() : offsetDate(0);
    const nowIso = new Date().toISOString();

    const isDoctor = (type === 'doctor') ||
      (type !== 'patient' && this.currentUser && this.currentUser.email &&
       (this.currentUser.email.toLowerCase() === 'demo.prototype@sahaara.ai' ||
        this.currentUser.email.toLowerCase() === 'sarah.mitchell@sahaara.ai'));

    // 1. Profile Setup
    if (typeof State !== 'undefined') {
      if (isDoctor) {
        State.profile = {
          name: 'Dr. Sarah Mitchell',
          age: 34,
          patientId: 'CT-84920',
          condition: 'Type 2 diabetes',
          conditionDetail: '',
          clinician: 'Dr. Rajesh Patel, MD (Cardiometabolic Specialist)',
          emergencyContactName: 'David Mitchell (Spouse)',
          emergencyContactPhone: '+1 (555) 019-2834',
          reminderTimes: ['07:30', '08:00', '10:00', '14:00', '18:00', '20:30', '22:00'],
          isDemo: true
        };
      } else {
        // Patient Prototype Account
        State.profile = {
          name: 'Ananya Sharma',
          age: 42,
          patientId: 'PAT-84920',
          condition: 'Type 2 diabetes',
          conditionDetail: '',
          clinician: 'Dr. Rajesh Patel, MD (Cardiometabolic Specialist)',
          emergencyContactName: 'Vikram Sharma (Spouse)',
          emergencyContactPhone: '+91 98765 43210',
          reminderTimes: ['07:30', '08:00', '10:00', '14:00', '18:00', '20:30', '22:00'],
          isDemo: true
        };
      }

      // 2. Prescriptions covering every category
      State.prescriptions = [
        {
          id: 'rx_demo_breathing',
          title: isDoctor ? 'Morning Diaphragmatic Box Breathing' : 'Morning Diaphragmatic Box Breathing (Pranayama)',
          category: 'breathing',
          instructions: '4-4-4-4 box breathing sequence before breakfast to steady morning cortisol and ease autonomic balance.',
          frequency: 'daily',
          times: ['07:30'],
          days: [],
          startDate: offsetDate(-6),
          endDate: null,
          source: 'demo',
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
          deactivatedOn: null
        },
        {
          id: 'rx_demo_diet',
          title: 'Balanced Breakfast & Fasting Blood Sugar Log',
          category: 'diet',
          instructions: 'Record fasting blood glucose (target 80-110 mg/dL). Consume fiber and protein-rich low-GI breakfast.',
          frequency: 'daily',
          times: ['08:00'],
          days: [],
          startDate: offsetDate(-6),
          endDate: null,
          source: 'demo',
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
          deactivatedOn: null
        },
        {
          id: 'rx_demo_med',
          title: 'Metformin Hydrochloride (500mg)',
          category: 'other',
          instructions: 'Take 1 tablet orally with water immediately after breakfast and dinner as prescribed by Dr. Patel.',
          frequency: 'daily',
          times: ['08:30', '19:30'],
          days: [],
          startDate: offsetDate(-6),
          endDate: null,
          source: 'demo',
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
          deactivatedOn: null
        },
        {
          id: 'rx_demo_hydration',
          title: 'Hydration Intake Target (250ml Water)',
          category: 'hydration',
          instructions: 'Drink 1 glass of room-temperature water for cellular hydration and kidney metabolic clearance.',
          frequency: 'daily',
          times: ['10:00', '14:00', '16:30'],
          days: [],
          startDate: offsetDate(-6),
          endDate: null,
          source: 'demo',
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
          deactivatedOn: null
        },
        {
          id: 'rx_demo_walk',
          title: 'Cardio Interval Walk & Movement Break',
          category: 'activity',
          instructions: 'Brisk 20-minute post-work outdoor or treadmill walk to stimulate GLUT-4 glucose uptake.',
          frequency: 'daily',
          times: ['18:00'],
          days: [],
          startDate: offsetDate(-6),
          endDate: null,
          source: 'demo',
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
          deactivatedOn: null
        },
        {
          id: 'rx_demo_stress',
          title: 'Evening Stress Decompression & Reflection',
          category: 'stress',
          instructions: 'Check in with Sahaara AI or use the Wellbeing Toolkit for a 5-minute progressive body scan.',
          frequency: 'daily',
          times: ['20:30'],
          days: [],
          startDate: offsetDate(-6),
          endDate: null,
          source: 'demo',
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
          deactivatedOn: null
        },
        {
          id: 'rx_demo_sleep',
          title: 'Sleep Hygiene Wind-down & Screen Cutoff',
          category: 'sleep',
          instructions: 'Turn off digital screens, dim ambient lighting, and prepare for 7.5 to 8 hours of restorative sleep.',
          frequency: 'daily',
          times: ['22:00'],
          days: [],
          startDate: offsetDate(-6),
          endDate: null,
          source: 'demo',
          active: true,
          createdAt: nowIso,
          updatedAt: nowIso,
          deactivatedOn: null
        }
      ];

      // 3. Adherence Records across the past 7 days (yielding 92-94% adherence)
      const records = [];
      for (let d = -6; d < 0; d++) {
        const curDate = offsetDate(d);
        State.prescriptions.forEach(rx => {
          rx.times.forEach(t => {
            if (d === -3 && rx.category === 'activity') return; // slight realistic variance
            records.push({
              prescriptionId: rx.id,
              date: curDate,
              time: t,
              status: 'completed',
              recordedAt: curDate + 'T' + t + ':00.000Z',
              completedAt: curDate + 'T' + t + ':12.000Z'
            });
          });
        });
      }

      // Today completed morning items
      records.push({ prescriptionId: 'rx_demo_breathing', date: today, time: '07:30', status: 'completed', recordedAt: today + 'T07:35:00.000Z', completedAt: today + 'T07:35:00.000Z' });
      records.push({ prescriptionId: 'rx_demo_diet', date: today, time: '08:00', status: 'completed', recordedAt: today + 'T08:05:00.000Z', completedAt: today + 'T08:05:00.000Z' });
      records.push({ prescriptionId: 'rx_demo_med', date: today, time: '08:30', status: 'completed', recordedAt: today + 'T08:35:00.000Z', completedAt: today + 'T08:35:00.000Z' });
      records.push({ prescriptionId: 'rx_demo_hydration', date: today, time: '10:00', status: 'completed', recordedAt: today + 'T10:05:00.000Z', completedAt: today + 'T10:05:00.000Z' });
      records.push({ prescriptionId: 'rx_demo_hydration', date: today, time: '14:00', status: 'completed', recordedAt: today + 'T14:05:00.000Z', completedAt: today + 'T14:05:00.000Z' });

      State.records = records;

      // 4. Auto-Alerts
      State.alerts = [
        {
          id: 'alt_demo_1',
          type: 'upcoming',
          title: 'Upcoming: Cardio Interval Walk',
          message: 'Scheduled at 18:00 (Brisk 20-minute movement break). Keep up your great streak!',
          createdAt: nowIso,
          dismissed: false,
          relatedOccurrence: { prescriptionId: 'rx_demo_walk', date: today, time: '18:00' }
        },
        {
          id: 'alt_demo_2',
          type: 'streak',
          title: 'Achievement: 6-Day Adherence Streak!',
          message: 'Congratulations! You achieved a 93% adherence rate over the past week.',
          createdAt: nowIso,
          dismissed: false,
          relatedOccurrence: null
        }
      ];

      if (typeof saveState === 'function') {
        saveState();
      }
    }

    // 5. Wellbeing Suite Data (caretrack.wellbeing-monitor.v1)
    const monitorKey = 'caretrack.wellbeing-monitor.v1';
    const patientMoods = [
      { id: 'm_d6', mood: 3, emotion: 'Tired / Low Energy', stress: 6, sleep: 6.5, at: offsetDate(-6) + 'T08:15:00.000Z', note: 'Demanding workday. Fasting blood sugar was 122 mg/dL. Drank chamomile tea and rested.' },
      { id: 'm_d5', mood: 4, emotion: 'Calm', stress: 4, sleep: 7.0, at: offsetDate(-5) + 'T08:20:00.000Z', note: 'Morning pranayama set a calm, grounded tone for the day. Steady morning energy.' },
      { id: 'm_d4', mood: 4, emotion: 'Happy', stress: 3, sleep: 7.5, at: offsetDate(-4) + 'T19:00:00.000Z', note: 'Post-dinner walk with Vikram lowered glucose spike nicely. Feeling steady and positive.' },
      { id: 'm_d3', mood: 3, emotion: 'Stressed', stress: 7, sleep: 6.0, at: offsetDate(-3) + 'T14:30:00.000Z', note: 'Deadlines felt overwhelming today. Used Sahaara AI voice mode for 5 minutes of sensory grounding.' },
      { id: 'm_d2', mood: 5, emotion: 'Hopeful', stress: 2, sleep: 8.0, at: offsetDate(-2) + 'T09:00:00.000Z', note: 'Restful weekend morning. Energy is noticeably higher after consistent hydration.' },
      { id: 'm_d1', mood: 4, emotion: 'Good', stress: 3, sleep: 7.5, at: offsetDate(-1) + 'T20:45:00.000Z', note: 'Hit 2.5L water target and completed all medication and activity tasks today.' },
      { id: 'm_d0', mood: 4, emotion: 'Calm', stress: 3, sleep: 7.5, at: today + 'T08:10:00.000Z', note: 'Morning routine done. Fasting glucose at 98 mg/dL. Feeling centered and in control.' }
    ];

    const doctorMoods = [
      { id: 'm_d6', mood: 3, emotion: 'Mixed / unsure', stress: 6, sleep: 6.5, at: offsetDate(-6) + 'T08:15:00.000Z', note: 'Heavy shift at the clinic. A bit fatigued but managed morning breakfast.' },
      { id: 'm_d5', mood: 4, emotion: 'Calm', stress: 4, sleep: 7.0, at: offsetDate(-5) + 'T08:20:00.000Z', note: 'Morning box breathing really set a calm tone for the day.' },
      { id: 'm_d4', mood: 4, emotion: 'Happy', stress: 3, sleep: 7.5, at: offsetDate(-4) + 'T19:00:00.000Z', note: 'Post-dinner walk lowered glucose spike nicely. Feeling steady.' },
      { id: 'm_d3', mood: 3, emotion: 'Stressed', stress: 7, sleep: 6.0, at: offsetDate(-3) + 'T14:30:00.000Z', note: 'Challenging case review today. Took 5 minutes to ground with 5-4-3-2-1 technique.' },
      { id: 'm_d2', mood: 5, emotion: 'Hopeful', stress: 2, sleep: 8.0, at: offsetDate(-2) + 'T09:00:00.000Z', note: 'Restful weekend morning. Energy is noticeably higher.' },
      { id: 'm_d1', mood: 4, emotion: 'Good', stress: 3, sleep: 7.5, at: offsetDate(-1) + 'T20:45:00.000Z', note: 'Hit 2.5L water target and completed all tasks today.' },
      { id: 'm_d0', mood: 4, emotion: 'Calm', stress: 3, sleep: 7.5, at: today + 'T08:10:00.000Z', note: 'Morning routine done. Feeling ready and centered.' }
    ];

    const patientJournal = [
      {
        id: 'j_1',
        title: 'Living with Type 2 Diabetes: Transforming Anxiety into Daily Anchors',
        body: 'When Dr. Patel first confirmed my Type 2 diabetes diagnosis, I felt overwhelmed by strict meal rules and medication schedules. What turned things around for me was treating each habit as an act of self-care rather than a chore. Logging my fasting glucose and doing 5 minutes of morning box breathing before waking up the household centers my mind. Small daily anchors create sustainable health.',
        at: offsetDate(-4) + 'T21:15:00.000Z'
      },
      {
        id: 'j_2',
        title: 'How Scheduled Hydration Cured My Afternoon Fatigue',
        body: 'I used to reach for sugary snacks around 3pm whenever fatigue set in at work. Setting scheduled 250ml water reminders at 10am, 2pm, and 4:30pm in Sahaara AI completely changed my afternoons. Staying properly hydrated eliminated tension headaches, reduced cravings, and stabilized my blood sugar levels.',
        at: offsetDate(-2) + 'T16:00:00.000Z'
      },
      {
        id: 'j_3',
        title: 'Having Sahaara AI in My Corner',
        body: 'Managing a chronic condition can sometimes feel isolating. Whenever I feel stressed about high glucose readings or need a quick breathing reset, tapping the 3D Voice Orb and speaking with Sahaara AI gives me instant reassurance and practical clinical guidance. It feels like having a compassionate care companion right in my pocket.',
        at: today + 'T07:45:00.000Z'
      }
    ];

    const doctorJournal = [
      {
        id: 'j_1',
        title: 'Finding Balance Between Clinical Duties & Self-Care',
        body: 'As clinicians, we constantly counsel patients on consistency, yet finding time for our own wellbeing can feel challenging. Sticking to morning glucose checks and taking short walking breaks between patient rounds has noticeably stabilized my mid-day energy. Small daily anchors build lasting resilience.',
        at: offsetDate(-4) + 'T21:15:00.000Z'
      },
      {
        id: 'j_2',
        title: 'Noticeable Energy Boost from Consistent Hydration',
        body: 'Reaching 2.5L daily used to feel like a chore, but setting automatic check-ins at 10am, 2pm, and 4:30pm has made it effortless. Less afternoon brain fog, zero tension headaches, and much smoother blood pressure stability.',
        at: offsetDate(-2) + 'T16:00:00.000Z'
      },
      {
        id: 'j_3',
        title: 'Mindful Breathing as a Rapid Reset',
        body: 'Whenever tension peaks during high-stress hours, taking 4 cycles of diaphragmatic box breathing physically lowers my pulse rate. Sahaara AI\'s conversational voice guidance mode makes it effortless to practice anywhere without looking at a screen.',
        at: today + 'T07:45:00.000Z'
      }
    ];

    const dummyWellbeing = {
      moods: isDoctor ? doctorMoods : patientMoods,
      assessments: [
        { id: 'ass_1', score: 8, at: offsetDate(-5) + 'T21:00:00.000Z', note: 'Steady physical energy, excellent adherence, minimal stress triggers.' },
        { id: 'ass_2', score: 9, at: offsetDate(-2) + 'T21:00:00.000Z', note: 'Deep rest, positive mental state, great progress on weekly goals.' },
        { id: 'ass_3', score: 8, at: today + 'T08:30:00.000Z', note: 'Balanced morning reflection: clear focus, healthy breakfast logged.' }
      ],
      journal: isDoctor ? doctorJournal : patientJournal
    };

    try {
      localStorage.setItem(monitorKey, JSON.stringify(dummyWellbeing));
    } catch (_) {}

    // 6. Conversational Sahaara AI Sessions (caretrack.ai_sessions.v1)
    const aiSessKey = 'caretrack.ai_sessions.v1';
    const patientSessions = [
      {
        id: 'sess_prototype_1',
        title: 'Post-Meal Blood Sugar & Walking Strategy',
        createdAt: offsetDate(-2) + 'T13:45:00.000Z',
        updatedAt: offsetDate(-2) + 'T13:50:00.000Z',
        messageCount: 4,
        messages: [
          {
            id: 'msg_1_1',
            role: 'user',
            text: 'Hi Sahaara, my post-lunch blood sugar was slightly elevated at 142 mg/dL. Should I adjust my evening meal or go for a walk?',
            at: offsetDate(-2) + 'T13:45:00.000Z'
          },
          {
            id: 'msg_1_2',
            role: 'bot',
            text: 'Hello Ananya! A post-meal reading of 142 mg/dL is slightly above your baseline target, but does not call for any immediate medication changes.\n\nA gentle 15-to-20 minute brisk walk around 18:00 will stimulate GLUT-4 glucose transporters in your muscles independent of insulin, naturally lowering circulating blood sugar. For dinner, pairing leafy vegetables with lean protein will help buffer carbohydrate digestion. Make sure you hydrate with 250ml of water now.',
            at: offsetDate(-2) + 'T13:46:00.000Z'
          },
          {
            id: 'msg_1_3',
            role: 'user',
            text: 'Thanks! How long after dinner should I wait before walking?',
            at: offsetDate(-2) + 'T13:48:00.000Z'
          },
          {
            id: 'msg_1_4',
            role: 'bot',
            text: 'Starting about 30 to 45 minutes after you finish eating is ideal. That timing aligns with the peak postprandial glucose curve, helping blunt the spike most effectively without causing digestive discomfort.',
            at: offsetDate(-2) + 'T13:49:00.000Z'
          }
        ],
        context: []
      },
      {
        id: 'sess_prototype_2',
        title: 'Stress Relief & 4-7-8 Breathing Guidance',
        createdAt: offsetDate(-1) + 'T19:10:00.000Z',
        updatedAt: offsetDate(-1) + 'T19:15:00.000Z',
        messageCount: 3,
        messages: [
          {
            id: 'msg_2_1',
            role: 'user',
            text: 'I had a very demanding day at work and my stress levels are high. Can you guide me through a quick decompression exercise?',
            at: offsetDate(-1) + 'T19:10:00.000Z'
          },
          {
            id: 'msg_2_2',
            role: 'bot',
            text: 'I understand, Ananya. Work pressure takes a real toll on your wellbeing. Let\'s do a 4-7-8 breathing reset together right now:\n\n1. Drop your shoulders down and rest your hands gently on your lap.\n2. Inhale quietly through your nose for 4 seconds.\n3. Hold your breath gently for 7 seconds.\n4. Exhale completely through your mouth with a soft whoosh for 8 seconds.\n\nRepeat this for 4 breath cycles. Whenever you are ready, you can also tap the 3D Voice Orb floating button for hands-free audio guidance.',
            at: offsetDate(-1) + 'T19:11:00.000Z'
          },
          {
            id: 'msg_2_3',
            role: 'user',
            text: 'That immediately slowed my racing thoughts. Thank you Sahaara.',
            at: offsetDate(-1) + 'T19:14:00.000Z'
          }
        ],
        context: []
      },
      {
        id: 'sess_prototype_3',
        title: 'Emergency Safety Plan & Rapid SOS Overview',
        createdAt: today + 'T07:50:00.000Z',
        updatedAt: today + 'T07:55:00.000Z',
        messageCount: 2,
        messages: [
          {
            id: 'msg_3_1',
            role: 'user',
            text: 'Can you review my emergency profile and what happens if I tap Emergency SOS?',
            at: today + 'T07:50:00.000Z'
          },
          {
            id: 'msg_3_2',
            role: 'bot',
            text: 'Your emergency profile is fully configured, Ananya! Here is what is active:\n\n• Primary Contact: Vikram Sharma (Spouse) at +91 98765 43210 (1-tap direct dial ready).\n• Rapid Hospital Finder: Direct Google Maps emergency healthcare locator.\n• National Medical Emergency (108 / 911) & Mental Health Lifelines (14416 / 988) ready with single-tap calling.\n• On-Screen Clinical Summary: Type 2 diabetes is formatted for immediate viewing by paramedics.\n\nYou can access this anytime via the pulsing red Emergency SOS button in the bottom-right corner.',
            at: today + 'T07:51:00.000Z'
          }
        ],
        context: []
      }
    ];

    const doctorSessions = [
      {
        id: 'sess_prototype_1',
        title: 'Post-Meal Blood Sugar & Walking Strategy',
        createdAt: offsetDate(-2) + 'T13:45:00.000Z',
        updatedAt: offsetDate(-2) + 'T13:50:00.000Z',
        messageCount: 4,
        messages: [
          {
            id: 'msg_1_1',
            role: 'user',
            text: 'Hi Sahaara, my post-lunch blood sugar was slightly elevated at 145 mg/dL. Should I adjust my evening meal or go for a walk?',
            at: offsetDate(-2) + 'T13:45:00.000Z'
          },
          {
            id: 'msg_1_2',
            role: 'bot',
            text: 'Hello Dr. Mitchell! A post-meal reading of 145 mg/dL is slightly above your ideal baseline, but does not call for an immediate medication adjustment.\n\nA gentle 15-to-20 minute brisk walk around 18:00 will stimulate GLUT-4 glucose transporters in your muscles independent of insulin, naturally lowering circulating blood sugar. For dinner, pairing leafy greens with lean protein will help buffer carbohydrate digestion. Make sure you hydrate with 250ml of water now.',
            at: offsetDate(-2) + 'T13:46:00.000Z'
          },
          {
            id: 'msg_1_3',
            role: 'user',
            text: 'Thanks! How long after dinner should I wait before walking?',
            at: offsetDate(-2) + 'T13:48:00.000Z'
          },
          {
            id: 'msg_1_4',
            role: 'bot',
            text: 'Starting about 30 to 45 minutes after you finish eating is ideal. That timing aligns with the peak postprandial glucose curve, helping blunt the spike most effectively without causing digestive discomfort.',
            at: offsetDate(-2) + 'T13:49:00.000Z'
          }
        ],
        context: []
      },
      {
        id: 'sess_prototype_2',
        title: 'Stress Relief & 4-7-8 Breathing Guidance',
        createdAt: offsetDate(-1) + 'T19:10:00.000Z',
        updatedAt: offsetDate(-1) + 'T19:15:00.000Z',
        messageCount: 3,
        messages: [
          {
            id: 'msg_2_1',
            role: 'user',
            text: 'I had a very demanding shift today and my stress levels are high. Can you guide me through a quick decompression exercise?',
            at: offsetDate(-1) + 'T19:10:00.000Z'
          },
          {
            id: 'msg_2_2',
            role: 'bot',
            text: 'I understand, Sarah. High workloads take a real toll. Let\'s do a 4-7-8 breathing reset together right now:\n\n1. Drop your shoulders down and rest your hands gently on your lap.\n2. Inhale quietly through your nose for 4 seconds.\n3. Hold your breath gently for 7 seconds.\n4. Exhale completely through your mouth with a soft whoosh for 8 seconds.\n\nRepeat this for 4 breath cycles. Whenever you are ready, you can also tap the 3D Voice Orb floating button for hands-free audio guidance.',
            at: offsetDate(-1) + 'T19:11:00.000Z'
          },
          {
            id: 'msg_2_3',
            role: 'user',
            text: 'That immediately slowed my racing thoughts. Thank you Sahaara.',
            at: offsetDate(-1) + 'T19:14:00.000Z'
          }
        ],
        context: []
      },
      {
        id: 'sess_prototype_3',
        title: 'Emergency Safety Plan & Rapid SOS Overview',
        createdAt: today + 'T07:50:00.000Z',
        updatedAt: today + 'T07:55:00.000Z',
        messageCount: 2,
        messages: [
          {
            id: 'msg_3_1',
            role: 'user',
            text: 'Can you review my emergency profile and what happens if I tap Emergency SOS?',
            at: today + 'T07:50:00.000Z'
          },
          {
            id: 'msg_3_2',
            role: 'bot',
            text: 'Your emergency profile is fully configured! Here is what is active:\n\n• Primary Contact: David Mitchell (Spouse) at +1 (555) 019-2834 (1-tap direct dial ready).\n• Rapid Hospital Finder: Direct Google Maps emergency healthcare locator.\n• National Medical Emergency (108 / 911) & Mental Health Lifelines (14416 / 988) ready with single-tap calling.\n• On-Screen Clinical Summary: Type 2 diabetes is formatted for immediate viewing by paramedics.\n\nYou can access this anytime via the pulsing red Emergency SOS button in the bottom-right corner.',
            at: today + 'T07:51:00.000Z'
          }
        ],
        context: []
      }
    ];

    const dummySessions = isDoctor ? doctorSessions : patientSessions;

    try {
      localStorage.setItem(aiSessKey, JSON.stringify({ sessions: dummySessions, currentSessionId: 'sess_prototype_1' }));
    } catch (_) {}

    if (typeof loadSessions === 'function') {
      try { loadSessions(); } catch (_) {}
    }
  },

  syncWithState(state) {
    if (!this.currentUser) return;
    if (this.isPrototypeAccount()) {
      if (!state.prescriptions || state.prescriptions.length === 0) {
        this.loadPrototypeShowcaseData(this.isPatientPrototypeAccount() ? 'patient' : 'doctor');
        return;
      }
    }

    if (!state.profile) {
      state.profile = {
        name: this.currentUser.name || 'User',
        age: 30,
        condition: 'General Health & Wellbeing',
        clinician: '',
        reminderTimes: ['08:00', '18:00', '22:00'],
        emergencyContactName: this.currentUser.emergencyContact || '',
        emergencyContactPhone: '',
        isDemo: this.isPrototypeAccount()
      };
    } else {
      if (!state.profile.name) state.profile.name = this.currentUser.name;
      if (this.isPrototypeAccount()) {
        state.profile.isDemo = true;
      }
    }
  },

  switchTab(tab) {
    this.activeTab = tab;
    this.renderAuthScreen();
  },

  renderAuthScreen() {
    let container = document.getElementById('auth-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'auth-container';
      container.className = 'auth-container';
      document.body.prepend(container);
    }

    container.style.display = 'flex';
    const root = document.getElementById('root');
    if (root) root.style.display = 'none';

    // Hide FAB buttons while in auth screen
    const aiFab = document.getElementById('ai-fab');
    const voiceFab = document.getElementById('voice-fab');
    const emergencyFab = document.querySelector('.emergency-fab');
    if (aiFab) aiFab.style.display = 'none';
    if (voiceFab) voiceFab.style.display = 'none';
    if (emergencyFab) emergencyFab.style.display = 'none';

    const isSignIn = this.activeTab === 'signin';

    container.innerHTML = `
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-logo">🩺</div>
          <h1 class="auth-title">Sahaara AI</h1>
          <p class="auth-subtitle">Your Personal Health & Wellbeing Sanctuary</p>
        </div>

        <div class="auth-tabs" role="tablist">
          <button type="button" class="auth-tab ${isSignIn ? 'active' : ''}" onclick="Auth.switchTab('signin')">Sign In</button>
          <button type="button" class="auth-tab ${!isSignIn ? 'active' : ''}" onclick="Auth.switchTab('register')">Create Account</button>
        </div>

        <div id="auth-error-area"></div>

        ${isSignIn ? this.renderSignInHtml() : this.renderRegisterHtml()}

        <div class="auth-divider">PATIENT PROTOTYPE SHOWCASE</div>

        <div class="prototype-card">
          <button type="button" class="btn-demo-quick" onclick="Auth.quickPatientLogin()">
            ⚡ Explore Patient Prototype Account (1-Click)
          </button>
          <p class="prototype-card-desc">
            Preloaded for patient <strong>Ananya Sharma</strong> (Type 2 Diabetes) with 7-day adherence charts, prescriptions, mood trends, personal journal & AI sessions.
          </p>
          <div class="prototype-credentials-badge">
            <span class="cred-pill" onclick="Auth.fillCredentials('patient.prototype@sahaara.ai', 'password123')" title="Click to autofill into sign-in form">
              👤 <strong>Patient:</strong> <code>patient.prototype@sahaara.ai</code> · <code>password123</code>
            </span>
          </div>
        </div>
      </div>
    `;
  },

  renderSignInHtml() {
    return `
      <form class="auth-form" onsubmit="event.preventDefault(); Auth.handleLoginSubmit();">
        <div class="auth-field">
          <label for="auth-email">Email Address</label>
          <input type="email" id="auth-email" required value="patient.prototype@sahaara.ai" placeholder="patient.prototype@sahaara.ai" autocomplete="email" autofocus>
        </div>
        <div class="auth-field">
          <label for="auth-password">Password</label>
          <input type="password" id="auth-password" required value="password123" placeholder="••••••••" autocomplete="current-password">
        </div>
        <button type="submit" class="auth-btn-primary">
          Sign In to Sahaara AI
        </button>
      </form>
    `;
  },

  renderRegisterHtml() {
    return `
      <form class="auth-form" onsubmit="event.preventDefault(); Auth.handleRegisterSubmit();">
        <div class="auth-field">
          <label for="reg-name">Full Name *</label>
          <input type="text" id="reg-name" required placeholder="Ananya Sharma" autocomplete="name" autofocus>
        </div>
        <div class="auth-field">
          <label for="reg-email">Email Address *</label>
          <input type="email" id="reg-email" required placeholder="ananya@example.com" autocomplete="email">
        </div>
        <div class="auth-field">
          <label for="reg-password">Password (6+ characters) *</label>
          <input type="password" id="reg-password" required minlength="6" placeholder="••••••••" autocomplete="new-password">
        </div>
        <div class="auth-field">
          <label for="reg-confirm">Confirm Password *</label>
          <input type="password" id="reg-confirm" required minlength="6" placeholder="••••••••" autocomplete="new-password">
        </div>
        <div class="auth-field">
          <label for="reg-emergency">Emergency Contact Phone (Optional)</label>
          <input type="tel" id="reg-emergency" placeholder="+91 98765 43210" autocomplete="tel">
        </div>
        <button type="submit" class="auth-btn-primary">
          Create My Account
        </button>
      </form>
    `;
  },

  handleLoginSubmit() {
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-password');
    if (!emailEl || !passEl) return;

    const email = emailEl.value;
    const password = passEl.value;

    const res = this.login(email, password);
    if (!res.success) {
      this.showError(res.error);
      return;
    }

    if (this.isPrototypeAccount()) {
      this.loadPrototypeShowcaseData(this.isPatientPrototypeAccount() ? 'patient' : 'doctor');
    } else {
      if (typeof State !== 'undefined') {
        this.syncWithState(State);
      }
      if (typeof saveState === 'function') {
        saveState();
      }
    }

    if (typeof toast === 'function') {
      toast('Signed in successfully! Welcome back.');
    }
    this.closeAuthScreen();
    if (typeof window.startAppAfterAuth === 'function') {
      window.startAppAfterAuth();
    } else if (typeof render === 'function') {
      render();
    }
  },

  handleRegisterSubmit() {
    const nameEl = document.getElementById('reg-name');
    const emailEl = document.getElementById('reg-email');
    const passEl = document.getElementById('reg-password');
    const confirmEl = document.getElementById('reg-confirm');
    const emgEl = document.getElementById('reg-emergency');
    if (!nameEl || !emailEl || !passEl || !confirmEl) return;

    const name = nameEl.value;
    const email = emailEl.value;
    const password = passEl.value;
    const confirm = confirmEl.value;
    const emergency = emgEl ? emgEl.value : '';

    const res = this.register(name, email, password, confirm, emergency);
    if (!res.success) {
      this.showError(res.error);
      return;
    }

    if (typeof toast === 'function') {
      toast('Account created successfully! Welcome to Sahaara AI.');
    }
    if (typeof State !== 'undefined') {
      this.syncWithState(State);
    }
    if (typeof saveState === 'function') {
      saveState();
    }
    this.closeAuthScreen();
    if (typeof window.startAppAfterAuth === 'function') {
      window.startAppAfterAuth();
    } else if (typeof render === 'function') {
      render();
    }
  },

  showError(msg) {
    const area = document.getElementById('auth-error-area');
    if (area) {
      const safeMsg = (typeof esc === 'function') ? esc(msg) : msg;
      area.innerHTML = '<div class="auth-error-banner">⚠️ ' + safeMsg + '</div>';
    } else if (typeof toast === 'function') {
      toast(msg, true);
    }
  },

  closeAuthScreen() {
    const container = document.getElementById('auth-container');
    if (container) container.style.display = 'none';

    const root = document.getElementById('root');
    if (root) root.style.display = '';

    // Restore FAB buttons
    const aiFab = document.getElementById('ai-fab');
    const voiceFab = document.getElementById('voice-fab');
    const emergencyFab = document.querySelector('.emergency-fab');
    if (aiFab) aiFab.style.display = '';
    if (voiceFab) voiceFab.style.display = '';
    if (emergencyFab) emergencyFab.style.display = '';
  }
};
window.Auth = Auth;
