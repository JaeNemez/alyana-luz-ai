/* Alyana Luz · Bible AI — app.js (full file)
   - Same layout (uses existing index.html IDs)
   - Keeps color scheme in index.html (no CSS changes here)
   - Adds Listen for Chat + Bible (passage)
   - Voices limited to: Karen (en-AU) + Paulina (es-MX)
   - Slower speech rate, correct lang/voice to prevent “mixing”
   - Devotional: guided user sections + Save + Streak (NO listen/stop)
   - Daily Prayer: starters shown under each ACTS section + Save + Streak
   - UI instructions switch fully by language (no mixed language)
   - Bible “Version” dropdown (UI only until backend supports multiple versions)
*/

(() => {
  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);

  const LS = {
    chatCurrent: "alyana_chat_current_v3",
    chatSaved: "alyana_chat_saved_v3",
    profile: "alyana_profile_v1",
    settings: "alyana_settings_v2",
    devStreak: "alyana_dev_streak_v1",
    prayStreak: "alyana_pray_streak_v1",
    devDraft: "alyana_dev_draft_v1",
    prayDraft: "alyana_pray_draft_v1",
  };

  const todayKey = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const yesterdayKey = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const safeJSON = (txt) => {
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  };

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const nowLabel = () => {
    const d = new Date();
    return d.toLocaleString();
  };

  // -----------------------------
  // i18n (UI text)
  // -----------------------------
  const I18N = {
    en: {
      langName: "English",
      tabChat: "Chat",
      tabBible: "Read Bible",
      tabDev: "Devotional",
      tabPrayer: "Daily Prayer",

      chatTitle: "Chat",
      chatSub: "Saved chats are stored on this device (localStorage).",
      chatPlaceholder: "Ask for a prayer, verse, or ‘verses about forgiveness’...",
      send: "Send",
      new: "New",
      save: "Save",
      listenLast: "Listen",
      stop: "Stop",

      bibleTitle: "Read Bible",
      bibleNote: "Choose a book/chapter and load a passage. Use Listen on the passage.",
      loadChapter: "Load chapter",
      loadPassage: "Load passage",
      startVerse: "Start verse (optional)",
      endVerse: "End verse (optional)",
      selectBook: "Select a book and chapter.",
      listen: "Listen",
      versionLabel: "Bible version",

      devTitle: "Devotional",
      devHint:
        "Alyana will generate scripture + a short explanation. Then you fill in your sections and save to build your streak.",
      devGenerate: "Generate",
      devStreak: "Devotional streak",
      devSave: "Save devotional",
      devScripture: "Scripture",
      devExplain: "Short explanation",
      devReflection: "Reflection / Insight",
      devApplication: "Application",
      devPrayer: "Prayer",
      devChallenge: "Closing prompt / challenge",
      devFocus: "One-day spiritual focus",
      devYour: "Your",
      devWriteHere: "Write here...",
      devExReflection:
        "Example: I notice I’ve been anxious about outcomes. Today I’ll surrender control to God and choose trust.",
      devExApplication:
        "Example: I will reach out to one person today with encouragement and speak life instead of criticism.",
      devExPrayer:
        "Example: Lord, guide my heart today. Help me obey quickly and love deeply. Strengthen me to walk in Your peace.",
      devExChallenge:
        "Example: For the next 24 hours, whenever you feel stress, pause and pray one sentence: “Jesus, I trust You.”",
      devExFocus:
        "Example: Practice gratitude—write down 5 blessings before bed and thank God for each one.",

      prayTitle: "Daily Prayer Starters (ACTS)",
      prayHint:
        "Alyana gives short ACTS starters. You write your own prayer in each section and save to build your streak.",
      prayGenerate: "Generate",
      prayStreak: "Prayer streak",
      praySave: "Save prayer",
      prayListenStarters: "Listen starters",
      prayAdoration: "Adoration",
      prayConfession: "Confession",
      prayThanksgiving: "Thanksgiving",
      praySupplication: "Supplication",
      prayYourAdoration: "Your Adoration",
      prayYourConfession: "Your Confession",
      prayYourThanksgiving: "Your Thanksgiving",
      prayYourSupplication: "Your Supplication",
      prayWriteAdoration: "Write your adoration here...",
      prayWriteConfession: "Write your confession here...",
      prayWriteThanksgiving: "Write your thanksgiving here...",
      prayWriteSupplication: "Write your supplication here...",

      savedChatsTitle: "Saved Chats",
      savedChatsSub: "Load or delete any saved chat.",
      noSaved: "No saved chats yet.",
      load: "Load",
      del: "Delete",

      accountChecking: "Account: checking...",
      accountActive: (email) => `Account: active (${email})`,
      accountInactive: "Account: inactive",
      accountError: "Account: error",
      requestFailed: (code) => `Request failed (${code})`,
    },

    es: {
      langName: "Español",
      tabChat: "Chat",
      tabBible: "Leer Biblia",
      tabDev: "Devocional",
      tabPrayer: "Oración diaria",

      chatTitle: "Chat",
      chatSub: "Los chats guardados se almacenan en este dispositivo (localStorage).",
      chatPlaceholder: "Pide una oración, un versículo, o ‘versículos sobre el perdón’...",
      send: "Enviar",
      new: "Nuevo",
      save: "Guardar",
      listenLast: "Escuchar",
      stop: "Detener",

      bibleTitle: "Leer Biblia",
      bibleNote:
        "Elige un libro/capítulo y carga un pasaje. Usa Escuchar en el pasaje.",
      loadChapter: "Cargar capítulo",
      loadPassage: "Cargar pasaje",
      startVerse: "Verso inicial (opcional)",
      endVerse: "Verso final (opcional)",
      selectBook: "Selecciona un libro y capítulo.",
      listen: "Escuchar",
      versionLabel: "Versión bíblica",

      devTitle: "Devocional",
      devHint:
        "Alyana genera Escritura + una explicación breve. Luego tú completas tus secciones y guardas para tu racha.",
      devGenerate: "Generar",
      devStreak: "Racha de devocional",
      devSave: "Guardar devocional",
      devScripture: "Escritura",
      devExplain: "Explicación breve",
      devReflection: "Reflexión / Insight",
      devApplication: "Aplicación",
      devPrayer: "Oración",
      devChallenge: "Cierre / desafío",
      devFocus: "Enfoque espiritual de un día",
      devYour: "Tu",
      devWriteHere: "Escribe aquí...",
      devExReflection:
        "Ejemplo: He estado ansioso por los resultados. Hoy entrego el control a Dios y elijo confiar.",
      devExApplication:
        "Ejemplo: Hoy escribiré a una persona para animarla y hablaré vida en vez de crítica.",
      devExPrayer:
        "Ejemplo: Señor, guía mi corazón hoy. Ayúdame a obedecer rápido y amar profundamente. Fortaléceme para caminar en Tu paz.",
      devExChallenge:
        "Ejemplo: Por las próximas 24 horas, cuando sientas estrés, pausa y ora una frase: “Jesús, confío en Ti.”",
      devExFocus:
        "Ejemplo: Practica gratitud—escribe 5 bendiciones antes de dormir y dale gracias a Dios por cada una.",

      prayTitle: "Guía de oración diaria (ACTS)",
      prayHint:
        "Alyana da ejemplos cortos ACTS. Tú escribes tu propia oración en cada sección y guardas para tu racha.",
      prayGenerate: "Generar",
      prayStreak: "Racha de oración",
      praySave: "Guardar oración",
      prayListenStarters: "Escuchar ejemplos",
      prayAdoration: "Adoración",
      prayConfession: "Confesión",
      prayThanksgiving: "Acción de gracias",
      praySupplication: "Súplica",
      prayYourAdoration: "Tu Adoración",
      prayYourConfession: "Tu Confesión",
      prayYourThanksgiving: "Tu Acción de gracias",
      prayYourSupplication: "Tu Súplica",
      prayWriteAdoration: "Escribe tu adoración aquí...",
      prayWriteConfession: "Escribe tu confesión aquí...",
      prayWriteThanksgiving: "Escribe tu acción de gracias aquí...",
      prayWriteSupplication: "Escribe tu súplica aquí...",

      savedChatsTitle: "Chats guardados",
      savedChatsSub: "Carga o elimina cualquier chat guardado.",
      noSaved: "Aún no hay chats guardados.",
      load: "Cargar",
      del: "Eliminar",

      accountChecking: "Cuenta: verificando...",
      accountActive: (email) => `Cuenta: activa (${email})`,
      accountInactive: "Cuenta: inactiva",
      accountError: "Cuenta: error",
      requestFailed: (code) => `Solicitud falló (${code})`,
    },
  };

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    tab: "chat",
    me: { logged_in: false, active: false, email: null },

    chat: {
      messages: [], // {role:'user'|'assistant', content:string, ts:number}
      inFlight: false,
    },

    bible: {
      books: [],
      chapters: [],
      passage: { reference: "", text: "" },
      version: "default",
    },

    devotional: {
      lang: "en",
      generated: null, // {scripture, brief_explanation}
      // user fields
      reflection: "",
      application: "",
      prayer: "",
      challenge: "",
      focus: "",
    },

    prayer: {
      lang: "en",
      starters: null, // {example_adoration,...}
      // user fields
      adoration: "",
      confession: "",
      thanksgiving: "",
      supplication: "",
    },

    // shared speech
    speech: {
      voicesLoaded: false,
      voices: [],
      selectedVoiceKey: "karen-en-AU", // default
      rate: 0.85, // slower
      pitch: 1.0,
    },

    settings: {
      uiLang: "en", // drives UI strings + default voice
      voiceKey: "karen-en-AU",
      bibleVersion: "default",
    },

    profile: {
      name: null,
    },
  };

  // -----------------------------
  // DOM refs (from your index.html)
  // -----------------------------
  const dom = {
    // tabs/views
    tabs: Array.from(document.querySelectorAll(".tab")),
    viewChat: $("view-chat"),
    viewBible: $("view-bible"),
    viewDev: $("view-devotional"),
    viewPrayer: $("view-prayer"),

    // top buttons
    btnSupport: $("btnSupport"),
    btnBilling: $("btnBilling"),
    accountPill: $("accountPill"),

    // chat
    messages: $("messages"),
    chatInput: $("chatInput"),
    sendBtn: $("sendBtn"),
    newBtn: $("newBtn"),
    saveBtn: $("saveBtn"),
    chatStatus: $("chatStatus"),

    // bible
    bookSelect: $("bookSelect"),
    chapterSelect: $("chapterSelect"),
    loadChapterBtn: $("loadChapterBtn"),
    startVerse: $("startVerse"),
    endVerse: $("endVerse"),
    loadPassageBtn: $("loadPassageBtn"),
    bibleOut: $("bibleOut"),

    // devotional
    devLang: $("devLang"),
    devBtn: $("devBtn"),
    devOut: $("devOut"),

    // prayer
    prayLang: $("prayLang"),
    prayBtn: $("prayBtn"),
    prayOut: $("prayOut"),

    // saved chats
    savedList: $("savedList"),
  };

  // -----------------------------
  // Load persisted
  // -----------------------------
  function loadPersisted() {
    // settings
    const s = safeJSON(localStorage.getItem(LS.settings) || "");
    if (s && typeof s === "object") {
      state.settings = {
        ...state.settings,
        ...s,
      };
    }
    state.settings.uiLang = state.settings.uiLang === "es" ? "es" : "en";
    state.settings.voiceKey = state.settings.voiceKey || "karen-en-AU";
    state.settings.bibleVersion = state.settings.bibleVersion || "default";

    state.speech.selectedVoiceKey = state.settings.voiceKey;
    state.bible.version = state.settings.bibleVersion;

    // profile
    const p = safeJSON(localStorage.getItem(LS.profile) || "");
    if (p && typeof p === "object") state.profile = { ...state.profile, ...p };

    // chat current
    const c = safeJSON(localStorage.getItem(LS.chatCurrent) || "");
    if (c && Array.isArray(c.messages)) {
      state.chat.messages = c.messages;
    }

    // devotional draft
    const dd = safeJSON(localStorage.getItem(LS.devDraft) || "");
    if (dd && typeof dd === "object") {
      Object.assign(state.devotional, dd);
      state.devotional.lang = state.devotional.lang === "es" ? "es" : "en";
    }

    // prayer draft
    const pd = safeJSON(localStorage.getItem(LS.prayDraft) || "");
    if (pd && typeof pd === "object") {
      Object.assign(state.prayer, pd);
      state.prayer.lang = state.prayer.lang === "es" ? "es" : "en";
    }
  }

  function saveSettings() {
    localStorage.setItem(
      LS.settings,
      JSON.stringify({
        uiLang: state.settings.uiLang,
        voiceKey: state.speech.selectedVoiceKey,
        bibleVersion: state.bible.version,
      })
    );
  }

  function saveProfile() {
    localStorage.setItem(LS.profile, JSON.stringify(state.profile));
  }

  function saveChatCurrent() {
    localStorage.setItem(LS.chatCurrent, JSON.stringify({ messages: state.chat.messages }));
  }

  function saveDevDraft() {
    localStorage.setItem(
      LS.devDraft,
      JSON.stringify({
        lang: state.devotional.lang,
        generated: state.devotional.generated,
        reflection: state.devotional.reflection,
        application: state.devotional.application,
        prayer: state.devotional.prayer,
        challenge: state.devotional.challenge,
        focus: state.devotional.focus,
      })
    );
  }

  function savePrayDraft() {
    localStorage.setItem(
      LS.prayDraft,
      JSON.stringify({
        lang: state.prayer.lang,
        starters: state.prayer.starters,
        adoration: state.prayer.adoration,
        confession: state.prayer.confession,
        thanksgiving: state.prayer.thanksgiving,
        supplication: state.prayer.supplication,
      })
    );
  }

  // -----------------------------
  // Streaks
  // -----------------------------
  function getStreak(key) {
    const v = safeJSON(localStorage.getItem(key) || "");
    if (!v || typeof v !== "object") return { count: 0, lastSaved: null };
    return {
      count: Number(v.count || 0),
      lastSaved: v.lastSaved || null,
    };
  }

  function bumpStreak(key) {
    const cur = getStreak(key);
    const t = todayKey();
    const y = yesterdayKey();

    // already saved today
    if (cur.lastSaved === t) return cur;

    let next = { ...cur };

    if (cur.lastSaved === y) next.count = (cur.count || 0) + 1;
    else next.count = 1;

    next.lastSaved = t;
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  }

  // -----------------------------
  // Speech (TTS)
  // -----------------------------
  function voiceKeyToSpec(key) {
    if (key === "paulina-es-MX") {
      return { nameHint: "Paulina", lang: "es-MX" };
    }
    // default Karen en-AU
    return { nameHint: "Karen", lang: "en-AU" };
  }

  function loadVoices() {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) return resolve([]);

      const tryGet = () => {
        const voices = synth.getVoices() || [];
        if (voices.length) return resolve(voices);
        return null;
      };

      const immediate = tryGet();
      if (immediate) return;

      synth.onvoiceschanged = () => {
        const voices = synth.getVoices() || [];
        resolve(voices);
      };

      // final fallback
      setTimeout(() => resolve(synth.getVoices() || []), 800);
    });
  }

  function pickVoiceForKey(voices, key) {
    const spec = voiceKeyToSpec(key);
    const byName = voices.find((v) => (v.name || "").toLowerCase().includes(spec.nameHint.toLowerCase()));
    if (byName) return byName;

    // fallback by lang prefix
    const byLang = voices.find((v) => (v.lang || "").toLowerCase().startsWith(spec.lang.toLowerCase().slice(0, 2)));
    if (byLang) return byLang;

    return voices[0] || null;
  }

  function stopSpeaking() {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
  }

  function speakText(text, voiceKey) {
    stopSpeaking();

    const synth = window.speechSynthesis;
    if (!synth) return;

    const utter = new SpeechSynthesisUtterance(String(text || "").trim());
    const spec = voiceKeyToSpec(voiceKey);

    utter.lang = spec.lang; // critical: prevents language mixing
    utter.rate = state.speech.rate; // slower
    utter.pitch = state.speech.pitch;

    const v = pickVoiceForKey(state.speech.voices, voiceKey);
    if (v) utter.voice = v;

    synth.speak(utter);
  }

  // -----------------------------
  // Network
  // -----------------------------
  async function apiJSON(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function refreshMe() {
    try {
      const me = await apiJSON("/me");
      state.me = me || state.me;

      const t = I18N[state.settings.uiLang];
      if (me?.logged_in && me?.active) {
        dom.accountPill.textContent = t.accountActive(me.email || "");
        dom.accountPill.classList.remove("danger");
        dom.accountPill.classList.add("ok");
      } else if (me?.logged_in && !me?.active) {
        dom.accountPill.textContent = t.accountInactive;
        dom.accountPill.classList.remove("ok");
        dom.accountPill.classList.add("danger");
      } else {
        dom.accountPill.textContent = t.accountInactive;
        dom.accountPill.classList.remove("ok");
        dom.accountPill.classList.add("danger");
      }
    } catch {
      const t = I18N[state.settings.uiLang];
      dom.accountPill.textContent = t.accountError;
      dom.accountPill.classList.remove("ok");
      dom.accountPill.classList.add("danger");
    }
  }

  // -----------------------------
  // Chat “memory” (local profile + history)
  // -----------------------------
  function extractAndStoreProfileFromUserText(text) {
    const s = String(text || "").trim();

    // English: "my name is Jader"
    let m = s.match(/\bmy\s+name\s+is\s+([a-zA-ZÀ-ÿ' -]{2,40})\b/i);
    if (m && m[1]) {
      state.profile.name = m[1].trim();
      saveProfile();
      return;
    }

    // Spanish: "me llamo Jader" / "mi nombre es Jader"
    m = s.match(/\b(mi\s+nombre\s+es|me\s+llamo)\s+([a-zA-ZÀ-ÿ' -]{2,40})\b/i);
    if (m && m[2]) {
      state.profile.name = m[2].trim();
      saveProfile();
      return;
    }
  }

  function buildHistoryForBackend() {
    // backend uses last ~16; we can send more but keep reasonable
    const msgs = state.chat.messages.slice(-24).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return msgs;
  }

  function buildProfilePreamble() {
    const parts = [];
    if (state.profile.name) parts.push(`User name: ${state.profile.name}`);
    if (!parts.length) return "";
    return `\n\nUser profile (important): ${parts.join(" · ")}\n`;
  }

  async function sendChat() {
    if (state.chat.inFlight) return;

    const prompt = (dom.chatInput.value || "").trim();
    if (!prompt) return;

    extractAndStoreProfileFromUserText(prompt);

    state.chat.messages.push({ role: "user", content: prompt, ts: Date.now() });
    dom.chatInput.value = "";
    renderChat();
    saveChatCurrent();

    state.chat.inFlight = true;
    renderChatStatus("");

    const endpoint = state.me?.active ? "/premium/chat" : "/chat";
    const body = {
      prompt: prompt + buildProfilePreamble(),
      history: buildHistoryForBackend(),
    };

    try {
      const data = await apiJSON(endpoint, { method: "POST", body: JSON.stringify(body) });
      const msg = data?.message || data?.json || "…";
      state.chat.messages.push({ role: "assistant", content: String(msg), ts: Date.now() });
      renderChat();
      saveChatCurrent();
    } catch (e) {
      const t = I18N[state.settings.uiLang];
      const code = e?.status || 0;
      state.chat.messages.push({
        role: "assistant",
        content: `${t.requestFailed(code || "error")}`,
        ts: Date.now(),
      });
      renderChat();
      saveChatCurrent();
    } finally {
      state.chat.inFlight = false;
    }
  }

  function newChat() {
    state.chat.messages = [];
    renderChat();
    saveChatCurrent();
  }

  function saveChatToList() {
    const saved = safeJSON(localStorage.getItem(LS.chatSaved) || "") || [];
    const title =
      (state.profile.name ? `${state.profile.name} · ` : "") + `Chat · ${nowLabel()}`;

    saved.unshift({
      id: `c_${Date.now()}`,
      title,
      createdAt: Date.now(),
      messages: state.chat.messages,
    });

    localStorage.setItem(LS.chatSaved, JSON.stringify(saved.slice(0, 50)));
    renderSavedChats();
  }

  function renderChatStatus(msg) {
    dom.chatStatus.textContent = msg || "";
  }

  function renderChat() {
    const t = I18N[state.settings.uiLang];

    // render messages
    dom.messages.innerHTML = "";
    for (const m of state.chat.messages) {
      const row = document.createElement("div");
      row.className = `msg-row ${m.role === "user" ? "me" : "bot"}`;

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = m.content;

      // Add Listen button on assistant bubbles (small)
      if (m.role === "assistant") {
        const meta = document.createElement("div");
        meta.className = "meta";

        const btnListen = document.createElement("button");
        btnListen.className = "btn";
        btnListen.style.padding = "6px 10px";
        btnListen.style.borderRadius = "10px";
        btnListen.textContent = t.listenLast;
        btnListen.onclick = () => {
          // use current UI language voice
          speakText(m.content, state.speech.selectedVoiceKey);
        };

        const btnStop = document.createElement("button");
        btnStop.className = "btn";
        btnStop.style.padding = "6px 10px";
        btnStop.style.borderRadius = "10px";
        btnStop.style.marginLeft = "8px";
        btnStop.textContent = t.stop;
        btnStop.onclick = () => stopSpeaking();

        meta.appendChild(btnListen);
        meta.appendChild(btnStop);
        bubble.appendChild(meta);
      }

      row.appendChild(bubble);
      dom.messages.appendChild(row);
    }

    // scroll to bottom
    dom.messages.scrollTop = dom.messages.scrollHeight;

    // set placeholder/buttons
    dom.chatInput.placeholder = t.chatPlaceholder;
    dom.sendBtn.textContent = t.send;
    dom.newBtn.textContent = t.new;
    dom.saveBtn.textContent = t.save;
  }

  function renderSavedChats() {
    const t = I18N[state.settings.uiLang];
    const saved = safeJSON(localStorage.getItem(LS.chatSaved) || "") || [];

    dom.savedList.innerHTML = "";
    if (!saved.length) {
      const p = document.createElement("div");
      p.className = "muted";
      p.textContent = t.noSaved;
      dom.savedList.appendChild(p);
      return;
    }

    for (const item of saved) {
      const wrap = document.createElement("div");
      wrap.className = "saved-item";

      const left = document.createElement("div");
      const name = document.createElement("div");
      name.className = "name";
      name.textContent = item.title || "Saved chat";
      const small = document.createElement("div");
      small.className = "small";
      small.textContent = new Date(item.createdAt || Date.now()).toLocaleString();
      left.appendChild(name);
      left.appendChild(small);

      const actions = document.createElement("div");
      actions.className = "actions";

      const btnLoad = document.createElement("button");
      btnLoad.className = "btn";
      btnLoad.textContent = t.load;
      btnLoad.onclick = () => {
        state.chat.messages = Array.isArray(item.messages) ? item.messages : [];
        saveChatCurrent();
        renderChat();
        setTab("chat");
      };

      const btnDel = document.createElement("button");
      btnDel.className = "btn";
      btnDel.textContent = t.del;
      btnDel.onclick = () => {
        const next = saved.filter((x) => x.id !== item.id);
        localStorage.setItem(LS.chatSaved, JSON.stringify(next));
        renderSavedChats();
      };

      actions.appendChild(btnLoad);
      actions.appendChild(btnDel);

      wrap.appendChild(left);
      wrap.appendChild(actions);
      dom.savedList.appendChild(wrap);
    }
  }

  // -----------------------------
  // Bible
  // -----------------------------
  async function loadBooks() {
    try {
      const data = await apiJSON("/bible/books");
      state.bible.books = data?.books || [];
      renderBibleSelectors();
    } catch {
      // show error in bibleOut
      dom.bibleOut.innerHTML = `<div class="danger">Bible API error.</div>`;
    }
  }

  async function loadChaptersForSelectedBook() {
    const bookVal = dom.bookSelect.value;
    if (!bookVal) return;
    try {
      const data = await apiJSON(`/bible/chapters?book=${encodeURIComponent(bookVal)}`);
      state.bible.chapters = data?.chapters || [];
      renderBibleSelectors();
    } catch {
      state.bible.chapters = [];
      renderBibleSelectors();
    }
  }

  async function loadChapter() {
    const bookVal = dom.bookSelect.value;
    const chapVal = dom.chapterSelect.value;
    if (!bookVal || !chapVal) return;

    try {
      const data = await apiJSON(
        `/bible/passage?book=${encodeURIComponent(bookVal)}&chapter=${encodeURIComponent(
          chapVal
        )}&full_chapter=true`
      );
      state.bible.passage = { reference: data.reference || "", text: data.text || "" };
      renderBiblePassage();
    } catch (e) {
      dom.bibleOut.innerHTML = `<div class="danger">Request failed.</div>`;
    }
  }

  async function loadPassage() {
    const bookVal = dom.bookSelect.value;
    const chapVal = dom.chapterSelect.value;
    if (!bookVal || !chapVal) return;

    const s = (dom.startVerse.value || "").trim();
    const en = (dom.endVerse.value || "").trim();
    const start = s ? Number(s) : 1;
    const end = en ? Number(en) : start;

    const qs = new URLSearchParams();
    qs.set("book", bookVal);
    qs.set("chapter", chapVal);
    qs.set("full_chapter", "false");
    qs.set("start", String(isFinite(start) ? start : 1));
    qs.set("end", String(isFinite(end) ? end : (isFinite(start) ? start : 1)));

    try {
      const data = await apiJSON(`/bible/passage?${qs.toString()}`);
      state.bible.passage = { reference: data.reference || "", text: data.text || "" };
      renderBiblePassage();
    } catch {
      dom.bibleOut.innerHTML = `<div class="danger">Request failed.</div>`;
    }
  }

  function renderBibleSelectors() {
    const t = I18N[state.settings.uiLang];

    // book options
    dom.bookSelect.innerHTML = "";
    for (const b of state.bible.books) {
      const opt = document.createElement("option");
      opt.value = String(b.id); // backend accepts id as book param
      opt.textContent = b.name;
      dom.bookSelect.appendChild(opt);
    }

    // chapters
    dom.chapterSelect.innerHTML = "";
    const chs = state.bible.chapters.length ? state.bible.chapters : [1];
    for (const c of chs) {
      const opt = document.createElement("option");
      opt.value = String(c);
      opt.textContent = `Chapter ${c}`;
      dom.chapterSelect.appendChild(opt);
    }

    // buttons/placeholders
    dom.loadChapterBtn.textContent = t.loadChapter;
    dom.loadPassageBtn.textContent = t.loadPassage;
    dom.startVerse.placeholder = t.startVerse;
    dom.endVerse.placeholder = t.endVerse;

    // if no passage yet, show note
    if (!state.bible.passage?.text) {
      dom.bibleOut.innerHTML = `<div class="muted">${escapeHtml(t.selectBook)}</div>`;
    }
  }

  function renderBiblePassage() {
    const t = I18N[state.settings.uiLang];
    const ref = state.bible.passage.reference || "";
    const txt = state.bible.passage.text || "";

    dom.bibleOut.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <div style="font-weight:800; font-size:16px;">${escapeHtml(ref)}</div>
        <div style="display:flex; gap:8px;">
          <button class="btn primary" id="bibleListenBtn">${escapeHtml(t.listen)}</button>
          <button class="btn" id="bibleStopBtn">${escapeHtml(t.stop)}</button>
        </div>
      </div>
      <div style="margin-top:10px; white-space:pre-wrap; line-height:1.45;">${escapeHtml(txt)}</div>
    `;

    $("bibleListenBtn").onclick = () => {
      speakText(`${ref}. ${txt}`, state.speech.selectedVoiceKey);
    };
    $("bibleStopBtn").onclick = () => stopSpeaking();
  }

  // Adds Bible Version dropdown + Voice dropdown above the views
  function ensureTopControls() {
    // Insert a controls row at top of main card (left column) inside current view area.
    // We will place it inside view-chat (top), and it will remain visible by tab switching.
    // (Index.html doesn’t have it—so we create it once.)
    if ($("alyanaTopControls")) return;

    const holder = document.createElement("div");
    holder.id = "alyanaTopControls";
    holder.className = "row";
    holder.style.marginTop = "10px";

    const langSel = document.createElement("select");
    langSel.id = "uiLangSelect";
    langSel.innerHTML = `
      <option value="en">${escapeHtml(I18N.en.langName)}</option>
      <option value="es">${escapeHtml(I18N.es.langName)}</option>
    `;
    langSel.value = state.settings.uiLang;

    const voiceSel = document.createElement("select");
    voiceSel.id = "voiceSelect";
    voiceSel.innerHTML = `
      <option value="karen-en-AU">Karen — en-AU</option>
      <option value="paulina-es-MX">Paulina — es-MX</option>
    `;
    // auto-pick voice by language unless user already chose
    voiceSel.value = state.speech.selectedVoiceKey || (state.settings.uiLang === "es" ? "paulina-es-MX" : "karen-en-AU");

    const versionSel = document.createElement("select");
    versionSel.id = "bibleVersionSelect";
    // UI only until backend supports multiple versions
    versionSel.innerHTML = `
      <option value="default">Default (current)</option>
      <option value="kjv">KJV (UI only)</option>
      <option value="nlt">NLT (UI only)</option>
      <option value="rvr60">RVR60 (UI only)</option>
    `;
    versionSel.value = state.bible.version || "default";

    holder.appendChild(langSel);
    holder.appendChild(voiceSel);
    holder.appendChild(versionSel);

    // put into each tab view top
    // We insert into view-chat just under the title/subtitle
    const chatView = dom.viewChat;
    const h2 = chatView.querySelector("h2");
    const after = h2?.nextElementSibling?.nextElementSibling; // after subtitle line
    if (after) chatView.insertBefore(holder, after);
    else chatView.insertBefore(holder, chatView.firstChild);

    // listeners
    langSel.onchange = () => {
      state.settings.uiLang = langSel.value === "es" ? "es" : "en";

      // auto-pick voice matching language
      const v = state.settings.uiLang === "es" ? "paulina-es-MX" : "karen-en-AU";
      state.speech.selectedVoiceKey = v;
      $("voiceSelect").value = v;

      saveSettings();
      applyLanguageToViews();
      renderAll();
    };

    voiceSel.onchange = () => {
      const v = voiceSel.value === "paulina-es-MX" ? "paulina-es-MX" : "karen-en-AU";
      state.speech.selectedVoiceKey = v;
      saveSettings();
    };

    versionSel.onchange = () => {
      state.bible.version = versionSel.value || "default";
      saveSettings();
      // (UI only right now)
    };
  }

  // -----------------------------
  // Devotional (guided UI)
  // -----------------------------
  async function generateDevotional() {
    const lang = state.devotional.lang;
    dom.devBtn.disabled = true;

    try {
      const data = await apiJSON("/devotional", {
        method: "POST",
        body: JSON.stringify({ lang }),
      });

      // backend returns {json: "<string>"}
      const obj = safeJSON(data?.json || "") || null;

      // If AI output isn't valid JSON, display raw
      if (!obj) {
        state.devotional.generated = { scripture: "", brief_explanation: String(data?.json || "") };
      } else {
        state.devotional.generated = {
          scripture: String(obj.scripture || ""),
          brief_explanation: String(obj.brief_explanation || ""),
        };
      }

      renderDevotional();
      saveDevDraft();
    } catch {
      renderDevotionalError();
    } finally {
      dom.devBtn.disabled = false;
    }
  }

  function renderDevotionalError() {
    const t = I18N[state.settings.uiLang];
    dom.devOut.innerHTML = `<div class="danger">${escapeHtml(t.requestFailed(503))}</div>`;
  }

  function renderDevotional() {
    const t = I18N[state.settings.uiLang];
    const lang = state.devotional.lang;

    const streak = getStreak(LS.devStreak);

    const gen = state.devotional.generated;
    const scripture = gen?.scripture ? escapeHtml(gen.scripture) : `<span class="muted">(${escapeHtml(t.devGenerate)}...)</span>`;
    const explain = gen?.brief_explanation ? escapeHtml(gen.brief_explanation) : "";

    dom.devOut.innerHTML = `
      <div class="muted" style="margin-bottom:10px;">${escapeHtml(t.devHint)}</div>

      <div class="pill" style="display:inline-block; margin-bottom:10px;">
        ${escapeHtml(t.devStreak)}: ${escapeHtml(String(streak.count || 0))}
      </div>

      <div class="card" style="background:rgba(0,0,0,.16); margin-top:10px;">
        <div style="font-weight:800; margin-bottom:6px;">${escapeHtml(t.devScripture)}</div>
        <div style="white-space:pre-wrap; line-height:1.45;">${scripture}</div>

        <div style="height:10px;"></div>
        <div style="font-weight:800; margin-bottom:6px;">${escapeHtml(t.devExplain)}</div>
        <div style="white-space:pre-wrap; line-height:1.45;">${explain || `<span class="muted">—</span>`}</div>
      </div>

      <div style="height:12px;"></div>

      <div style="font-weight:900; margin-top:6px;">${escapeHtml(t.devReflection)}</div>
      <div class="small">${escapeHtml(t.devExReflection)}</div>
      <textarea id="devReflection" placeholder="${escapeHtml(t.devWriteHere)}">${escapeHtml(state.devotional.reflection || "")}</textarea>

      <div style="font-weight:900; margin-top:12px;">${escapeHtml(t.devApplication)}</div>
      <div class="small">${escapeHtml(t.devExApplication)}</div>
      <textarea id="devApplication" placeholder="${escapeHtml(t.devWriteHere)}">${escapeHtml(state.devotional.application || "")}</textarea>

      <div style="font-weight:900; margin-top:12px;">${escapeHtml(t.devPrayer)}</div>
      <div class="small">${escapeHtml(t.devExPrayer)}</div>
      <textarea id="devPrayer" placeholder="${escapeHtml(t.devWriteHere)}">${escapeHtml(state.devotional.prayer || "")}</textarea>

      <div style="font-weight:900; margin-top:12px;">${escapeHtml(t.devChallenge)}</div>
      <div class="small">${escapeHtml(t.devExChallenge)}</div>
      <textarea id="devChallenge" placeholder="${escapeHtml(t.devWriteHere)}">${escapeHtml(state.devotional.challenge || "")}</textarea>

      <div style="font-weight:900; margin-top:12px;">${escapeHtml(t.devFocus)}</div>
      <div class="small">${escapeHtml(t.devExFocus)}</div>
      <textarea id="devFocus" placeholder="${escapeHtml(t.devWriteHere)}">${escapeHtml(state.devotional.focus || "")}</textarea>

      <div style="display:flex; gap:10px; margin-top:12px;">
        <button class="btn good" id="devSaveBtn">${escapeHtml(t.devSave)}</button>
      </div>
    `;

    // bind
    $("devReflection").oninput = (e) => {
      state.devotional.reflection = e.target.value;
      saveDevDraft();
    };
    $("devApplication").oninput = (e) => {
      state.devotional.application = e.target.value;
      saveDevDraft();
    };
    $("devPrayer").oninput = (e) => {
      state.devotional.prayer = e.target.value;
      saveDevDraft();
    };
    $("devChallenge").oninput = (e) => {
      state.devotional.challenge = e.target.value;
      saveDevDraft();
    };
    $("devFocus").oninput = (e) => {
      state.devotional.focus = e.target.value;
      saveDevDraft();
    };

    $("devSaveBtn").onclick = () => {
      // Require at least something written by user to count
      const hasUserWork =
        (state.devotional.reflection || "").trim() ||
        (state.devotional.application || "").trim() ||
        (state.devotional.prayer || "").trim() ||
        (state.devotional.challenge || "").trim() ||
        (state.devotional.focus || "").trim();

      if (!hasUserWork) return;

      bumpStreak(LS.devStreak);
      renderDevotional(); // refresh streak count
    };

    // Keep lang dropdown synced (from index.html)
    dom.devLang.value = lang;
    dom.devBtn.textContent = t.devGenerate;
  }

  // -----------------------------
  // Daily Prayer (ACTS) — starters under each section
  // -----------------------------
  async function generatePrayerStarters() {
    const lang = state.prayer.lang;
    dom.prayBtn.disabled = true;

    try {
      const data = await apiJSON("/daily_prayer", {
        method: "POST",
        body: JSON.stringify({ lang }),
      });

      const obj = safeJSON(data?.json || "") || null;
      if (!obj) {
        state.prayer.starters = null;
      } else {
        state.prayer.starters = {
          example_adoration: String(obj.example_adoration || ""),
          example_confession: String(obj.example_confession || ""),
          example_thanksgiving: String(obj.example_thanksgiving || ""),
          example_supplication: String(obj.example_supplication || ""),
        };
      }

      renderPrayer();
      savePrayDraft();
    } catch {
      renderPrayerError();
    } finally {
      dom.prayBtn.disabled = false;
    }
  }

  function renderPrayerError() {
    const t = I18N[state.settings.uiLang];
    dom.prayOut.innerHTML = `<div class="danger">${escapeHtml(t.requestFailed(503))}</div>`;
  }

  function renderPrayer() {
    const t = I18N[state.settings.uiLang];
    const lang = state.prayer.lang;
    const streak = getStreak(LS.prayStreak);
    const s = state.prayer.starters || {};

    const exA = s.example_adoration ? escapeHtml(s.example_adoration) : "";
    const exC = s.example_confession ? escapeHtml(s.example_confession) : "";
    const exT = s.example_thanksgiving ? escapeHtml(s.example_thanksgiving) : "";
    const exS = s.example_supplication ? escapeHtml(s.example_supplication) : "";

    dom.prayOut.innerHTML = `
      <div class="muted" style="margin-bottom:10px;">${escapeHtml(t.prayHint)}</div>

      <div class="pill" style="display:inline-block; margin-bottom:10px;">
        ${escapeHtml(t.prayStreak)}: ${escapeHtml(String(streak.count || 0))}
      </div>

      <div style="margin-top:10px; display:flex; flex-direction:column; gap:12px;">
        <div class="card" style="background:rgba(0,0,0,.16);">
          <div style="font-weight:900;">${escapeHtml(t.prayAdoration)}:</div>
          <div class="small" style="margin-top:4px;">${exA || `<span class="muted">—</span>`}</div>
        </div>
        <div>
          <div class="small" style="margin:6px 0 6px;">${escapeHtml(t.prayYourAdoration)}:</div>
          <textarea id="prayA" placeholder="${escapeHtml(t.prayWriteAdoration)}">${escapeHtml(state.prayer.adoration || "")}</textarea>
        </div>

        <div class="card" style="background:rgba(0,0,0,.16);">
          <div style="font-weight:900;">${escapeHtml(t.prayConfession)}:</div>
          <div class="small" style="margin-top:4px;">${exC || `<span class="muted">—</span>`}</div>
        </div>
        <div>
          <div class="small" style="margin:6px 0 6px;">${escapeHtml(t.prayYourConfession)}:</div>
          <textarea id="prayC" placeholder="${escapeHtml(t.prayWriteConfession)}">${escapeHtml(state.prayer.confession || "")}</textarea>
        </div>

        <div class="card" style="background:rgba(0,0,0,.16);">
          <div style="font-weight:900;">${escapeHtml(t.prayThanksgiving)}:</div>
          <div class="small" style="margin-top:4px;">${exT || `<span class="muted">—</span>`}</div>
        </div>
        <div>
          <div class="small" style="margin:6px 0 6px;">${escapeHtml(t.prayYourThanksgiving)}:</div>
          <textarea id="prayT" placeholder="${escapeHtml(t.prayWriteThanksgiving)}">${escapeHtml(state.prayer.thanksgiving || "")}</textarea>
        </div>

        <div class="card" style="background:rgba(0,0,0,.16);">
          <div style="font-weight:900;">${escapeHtml(t.praySupplication)}:</div>
          <div class="small" style="margin-top:4px;">${exS || `<span class="muted">—</span>`}</div>
        </div>
        <div>
          <div class="small" style="margin:6px 0 6px;">${escapeHtml(t.prayYourSupplication)}:</div>
          <textarea id="prayS" placeholder="${escapeHtml(t.prayWriteSupplication)}">${escapeHtml(state.prayer.supplication || "")}</textarea>
        </div>

        <div style="display:flex; gap:10px; margin-top:2px; flex-wrap:wrap;">
          <button class="btn good" id="praySaveBtn">${escapeHtml(t.praySave)}</button>
          <button class="btn primary" id="prayListenBtn">${escapeHtml(t.prayListenStarters)}</button>
          <button class="btn" id="prayStopBtn">${escapeHtml(t.stop)}</button>
        </div>
      </div>
    `;

    $("prayA").oninput = (e) => {
      state.prayer.adoration = e.target.value;
      savePrayDraft();
    };
    $("prayC").oninput = (e) => {
      state.prayer.confession = e.target.value;
      savePrayDraft();
    };
    $("prayT").oninput = (e) => {
      state.prayer.thanksgiving = e.target.value;
      savePrayDraft();
    };
    $("prayS").oninput = (e) => {
      state.prayer.supplication = e.target.value;
      savePrayDraft();
    };

    $("praySaveBtn").onclick = () => {
      const hasUserWork =
        (state.prayer.adoration || "").trim() ||
        (state.prayer.confession || "").trim() ||
        (state.prayer.thanksgiving || "").trim() ||
        (state.prayer.supplication || "").trim();

      if (!hasUserWork) return;

      bumpStreak(LS.prayStreak);
      renderPrayer();
    };

    $("prayListenBtn").onclick = () => {
      // Listen ONLY the starters (not the user's typed text)
      const parts = [];
      if (s.example_adoration) parts.push(`${t.prayAdoration}. ${s.example_adoration}`);
      if (s.example_confession) parts.push(`${t.prayConfession}. ${s.example_confession}`);
      if (s.example_thanksgiving) parts.push(`${t.prayThanksgiving}. ${s.example_thanksgiving}`);
      if (s.example_supplication) parts.push(`${t.praySupplication}. ${s.example_supplication}`);
      speakText(parts.join("  "), state.speech.selectedVoiceKey);
    };

    $("prayStopBtn").onclick = () => stopSpeaking();

    // sync dropdown + button label
    dom.prayLang.value = lang;
    dom.prayBtn.textContent = t.prayGenerate;
  }

  // -----------------------------
  // Tab/view switching + language application
  // -----------------------------
  function setTab(tab) {
    state.tab = tab;

    // tabs active
    dom.tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

    dom.viewChat.style.display = tab === "chat" ? "" : "none";
    dom.viewBible.style.display = tab === "bible" ? "" : "none";
    dom.viewDev.style.display = tab === "devotional" ? "" : "none";
    dom.viewPrayer.style.display = tab === "prayer" ? "" : "none";

    // make sure top controls exist and are visible in current tab too
    ensureTopControls();

    // move controls row into current view (so user always sees it)
    const controls = $("alyanaTopControls");
    if (controls) {
      const view =
        tab === "chat" ? dom.viewChat :
        tab === "bible" ? dom.viewBible :
        tab === "devotional" ? dom.viewDev :
        dom.viewPrayer;

      // insert after h2
      const h2 = view.querySelector("h2");
      if (h2) {
        const after = h2.nextElementSibling;
        view.insertBefore(controls, after);
      } else {
        view.insertBefore(controls, view.firstChild);
      }
    }
  }

  function applyLanguageToViews() {
    const t = I18N[state.settings.uiLang];

    // Account pill base text (until refreshed)
    dom.accountPill.textContent = t.accountChecking;

    // Dev/prayer language dropdowns stay as content language
    // But UI instructions/labels should follow uiLang
    renderChat();
    renderSavedChats();

    // Bible static labels
    dom.loadChapterBtn.textContent = t.loadChapter;
    dom.loadPassageBtn.textContent = t.loadPassage;
    dom.startVerse.placeholder = t.startVerse;
    dom.endVerse.placeholder = t.endVerse;

    // If passage exists, rerender to update Listen/Stop label text
    if (state.bible.passage?.text) renderBiblePassage();
    else dom.bibleOut.innerHTML = `<div class="muted">${escapeHtml(t.selectBook)}</div>`;

    // Dev/pray output re-render for translated UI
    renderDevotional();
    renderPrayer();
  }

  function renderAll() {
    applyLanguageToViews();
  }

  // -----------------------------
  // Wiring
  // -----------------------------
  function bindEvents() {
    // Tabs
    dom.tabs.forEach((b) => {
      b.addEventListener("click", () => setTab(b.dataset.tab));
    });

    // Chat
    dom.sendBtn.addEventListener("click", sendChat);
    dom.chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
    dom.newBtn.addEventListener("click", newChat);
    dom.saveBtn.addEventListener("click", saveChatToList);

    // Bible
    dom.bookSelect.addEventListener("change", loadChaptersForSelectedBook);
    dom.loadChapterBtn.addEventListener("click", loadChapter);
    dom.loadPassageBtn.addEventListener("click", loadPassage);

    // Devotional
    dom.devLang.addEventListener("change", () => {
      state.devotional.lang = dom.devLang.value === "es" ? "es" : "en";
      saveDevDraft();
      renderDevotional();
    });
    dom.devBtn.addEventListener("click", generateDevotional);

    // Prayer
    dom.prayLang.addEventListener("change", () => {
      state.prayer.lang = dom.prayLang.value === "es" ? "es" : "en";
      savePrayDraft();
      renderPrayer();
    });
    dom.prayBtn.addEventListener("click", generatePrayerStarters);

    // Billing/support
    dom.btnSupport.addEventListener("click", async () => {
      try {
        const data = await apiJSON("/stripe/create-checkout-session", {
          method: "POST",
          body: JSON.stringify({ email: state.me?.email || null }),
        });
        if (data?.url) window.location.href = data.url;
      } catch {
        // ignore
      }
    });

    dom.btnBilling.addEventListener("click", async () => {
      try {
        const data = await apiJSON("/stripe/create-portal-session", {
          method: "POST",
          body: JSON.stringify({ email: state.me?.email || null }),
        });
        if (data?.url) window.location.href = data.url;
      } catch {
        // ignore
      }
    });
  }

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    loadPersisted();
    bindEvents();

    // Voices: load + force only our two choices in UI
    state.speech.voices = await loadVoices();
    state.speech.voicesLoaded = true;

    // Auto set voice based on UI language (prevents mixing)
    state.speech.selectedVoiceKey = state.settings.uiLang === "es" ? "paulina-es-MX" : "karen-en-AU";
    state.settings.voiceKey = state.speech.selectedVoiceKey;
    saveSettings();

    // Top controls
    ensureTopControls();
    if ($("voiceSelect")) $("voiceSelect").value = state.speech.selectedVoiceKey;
    if ($("uiLangSelect")) $("uiLangSelect").value = state.settings.uiLang;
    if ($("bibleVersionSelect")) $("bibleVersionSelect").value = state.bible.version || "default";

    // Default tab
    setTab("chat");

    // Render
    renderChat();
    renderSavedChats();

    // Load account + bible
    await refreshMe();
    await loadBooks();
    await loadChaptersForSelectedBook();

    // Render devotional/prayer UIs
    renderDevotional();
    renderPrayer();
  }

  init();
})();










