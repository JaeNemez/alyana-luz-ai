/* Alyana Luz · Bible AI */

(() => {
  "use strict";

  // ----------------------------
  // Helpers
  // ----------------------------
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const LS = {
    CHAT_SAVED: "alyana_saved_chats_v1",
    UI_LANG: "alyana_ui_lang_v1",
    UI_VOICE_KEY: "alyana_ui_voice_key_v1",
    DEV_STREAK: "alyana_dev_streak_v1",
    DEV_LAST_DATE: "alyana_dev_last_date_v1",
    PRAY_STREAK: "alyana_pray_streak_v1",
    PRAY_LAST_DATE: "alyana_pray_last_date_v1",
    DEV_USER_INPUTS: "alyana_dev_inputs_v1",
    PRAY_USER_INPUTS: "alyana_pray_inputs_v1",
    CHAT_DRAFT: "alyana_chat_draft_v1",
  };

  const todayISO = () => new Date().toISOString().slice(0, 10);

  function safeJSONParse(s, fallback = null) {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }

  function escapeHTML(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function apiFetch(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg =
        (data && (data.detail || data.message)) ||
        (typeof data?.raw === "string" ? data.raw : "") ||
        `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ----------------------------
  // i18n
  // ----------------------------
  const I18N = {
    en: {
      langLabel: "Language",
      voiceLabel: "Voice",
      bibleVersionLabel: "Bible version",
      versionUiOnly: "(UI only)",
      accountChecking: "Account: checking...",
      accountActive: (email) => `Account: active (${email})`,
      accountInactive: "Account: not active",
      accountError: "Account: error",
      savedChatsTitle: "Saved Chats",
      savedChatsHelp: "Load or delete any saved chat.",
      savedChatsEmpty: "No saved chats yet.",
      chatTitle: "Chat",
      chatHelp: "Saved chat logs are stored on this device (localStorage).",
      chatPlaceholder: "Ask for a prayer, verse, or ‘verses about forgiveness’...",
      send: "Send",
      newChat: "New",
      save: "Save",
      listenLast: "Listen last",
      stop: "Stop",
      readBibleTitle: "Read Bible",
      bibleHelp: "Voice & language apply to Listen in Bible + Chat.",
      loadChapter: "Load chapter",
      loadPassage: "Load passage",
      startVerse: "Start verse (optional)",
      endVerse: "End verse (optional)",
      selectBookChapter: "Select a book and chapter.",
      listen: "Listen",
      devotionalTitle: "Devotional",
      devotionalGenerate: "Generate",
      devotionalIntro:
        "Alyana generates scripture + a short explanation. Then you fill in your own sections and Save to build your streak.",
      devotionalStreak: (n) => `Devotional streak: ${n}`,
      reflection: "Reflection / Insight",
      application: "Application",
      prayer: "Prayer",
      challenge: "Closing prompt / challenge",
      focus: "One-day spiritual focus",
      yourReflection: "Your Reflection / Insight:",
      yourApplication: "Your Application:",
      yourPrayer: "Your Prayer:",
      yourChallenge: "Your Closing prompt / challenge:",
      yourFocus: "Your One-day spiritual focus:",
      example: "Example:",
      saveDevotional: "Save devotional",
      saved: "Saved.",
      dailyPrayerTitle: "Daily Prayer Starters (ACTS)",
      dailyPrayerIntro:
        "Alyana gives short ACTS starters. You write your own prayer in each section and Save to build your streak.",
      prayerStreak: (n) => `Prayer streak: ${n}`,
      adoration: "Adoration",
      confession: "Confession",
      thanksgiving: "Thanksgiving",
      supplication: "Supplication",
      yourAdoration: "Your Adoration:",
      yourConfession: "Your Confession:",
      yourThanksgiving: "Your Thanksgiving:",
      yourSupplication: "Your Supplication:",
      savePrayer: "Save prayer",
      listenStarters: "Listen starters",
      support: "Support Alyana Luz",
      billing: "Manage billing",
      noBibleText: "No passage loaded yet.",
      uiOnlyNote:
        "Note: Bible version is UI-only unless you add multiple versions on the backend later.",
    },
    es: {
      langLabel: "Idioma",
      voiceLabel: "Voz",
      bibleVersionLabel: "Versión",
      versionUiOnly: "(solo interfaz)",
      accountChecking: "Cuenta: verificando...",
      accountActive: (email) => `Cuenta: activa (${email})`,
      accountInactive: "Cuenta: no activa",
      accountError: "Cuenta: error",
      savedChatsTitle: "Chats guardados",
      savedChatsHelp: "Carga o elimina cualquier chat guardado.",
      savedChatsEmpty: "Aún no hay chats guardados.",
      chatTitle: "Chat",
      chatHelp: "Los chats guardados se guardan en este dispositivo (localStorage).",
      chatPlaceholder: "Pide una oración, un versículo, o ‘versículos sobre el perdón’...",
      send: "Enviar",
      newChat: "Nuevo",
      save: "Guardar",
      listenLast: "Escuchar último",
      stop: "Detener",
      readBibleTitle: "Leer Biblia",
      bibleHelp: "La voz y el idioma se aplican a Escuchar en Biblia + Chat.",
      loadChapter: "Cargar capítulo",
      loadPassage: "Cargar pasaje",
      startVerse: "Verso inicial (opcional)",
      endVerse: "Verso final (opcional)",
      selectBookChapter: "Selecciona un libro y capítulo.",
      listen: "Escuchar",
      devotionalTitle: "Devocional",
      devotionalGenerate: "Generar",
      devotionalIntro:
        "Alyana genera Escritura + una explicación breve. Luego tú completas tus secciones y Guardas para crear tu racha.",
      devotionalStreak: (n) => `Racha de devocional: ${n}`,
      reflection: "Reflexión / Insight",
      application: "Aplicación",
      prayer: "Oración",
      challenge: "Cierre / desafío",
      focus: "Enfoque espiritual de un día",
      yourReflection: "Tu Reflexión / Insight:",
      yourApplication: "Tu Aplicación:",
      yourPrayer: "Tu Oración:",
      yourChallenge: "Tu Cierre / desafío:",
      yourFocus: "Tu Enfoque espiritual de un día:",
      example: "Ejemplo:",
      saveDevotional: "Guardar devocional",
      saved: "Guardado.",
      dailyPrayerTitle: "Guía de oración diaria (ACTS)",
      dailyPrayerIntro:
        "Alyana da ejemplos cortos ACTS. Tú escribes tu oración en cada sección y Guardas para crear tu racha.",
      prayerStreak: (n) => `Racha de oración: ${n}`,
      adoration: "Adoración",
      confession: "Confesión",
      thanksgiving: "Acción de gracias",
      supplication: "Súplica",
      yourAdoration: "Tu Adoración:",
      yourConfession: "Tu Confesión:",
      yourThanksgiving: "Tu Acción de gracias:",
      yourSupplication: "Tu Súplica:",
      savePrayer: "Guardar oración",
      listenStarters: "Escuchar ejemplos",
      support: "Apoyar Alyana Luz",
      billing: "Administrar facturación",
      noBibleText: "Todavía no hay un pasaje cargado.",
      uiOnlyNote:
        "Nota: La versión de Biblia es solo interfaz, a menos que agregues varias versiones en el backend luego.",
    },
  };

  function normLang(l) {
    const s = String(l || "en").toLowerCase();
    return s.startsWith("es") ? "es" : "en";
  }

  function t(key) {
    const lang = state.uiLang;
    const pack = I18N[lang] || I18N.en;
    const v = pack[key];
    return typeof v === "function" ? v : v ?? I18N.en[key] ?? "";
  }

  // ----------------------------
  // Speech / Voices
  // ----------------------------
  const VOICE_PREFS = {
    en: { nameHint: "karen", langHint: "en-AU", label: "Karen — en-AU", key: "karen-en-au" },
    es: { nameHint: "paulina", langHint: "es-MX", label: "Paulina — es-MX", key: "paulina-es-mx" },
  };

  function getAllVoices() {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  function findVoiceFor(lang) {
    const voices = getAllVoices();
    const pref = VOICE_PREFS[lang];
    if (!voices.length || !pref) return null;

    // 1) Try by name hint
    const byName = voices.find((v) => String(v.name || "").toLowerCase().includes(pref.nameHint));
    if (byName) return byName;

    // 2) Try by lang hint
    const byLang = voices.find((v) => String(v.lang || "").toLowerCase() === pref.langHint.toLowerCase());
    if (byLang) return byLang;

    // 3) Any voice matching language prefix
    const prefix = lang === "es" ? "es" : "en";
    const any = voices.find((v) => String(v.lang || "").toLowerCase().startsWith(prefix));
    return any || voices[0] || null;
  }

  function stopSpeaking() {
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch {}
  }

  function speak(text) {
    stopSpeaking();
    const clean = String(text || "").trim();
    if (!clean) return;

    const lang = state.uiLang;
    const voice = state.voiceObj || findVoiceFor(lang);

    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang === "es" ? "es-MX" : "en-AU";

    // Slow down (you said both are talking too fast)
    u.rate = 0.9;
    u.pitch = 1.0;

    if (voice) u.voice = voice;

    try {
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.warn("Speech error:", e);
    }
  }

  // ----------------------------
  // State
  // ----------------------------
  const state = {
    uiLang: normLang(localStorage.getItem(LS.UI_LANG) || "en"),
    voiceKey: localStorage.getItem(LS.UI_VOICE_KEY) || "",
    voiceObj: null,

    me: null, // from /me
    active: false,
    email: null,

    chatHistory: [], // {role, content}
    chatMessages: [], // rendered messages
    lastBotText: "",
    bibleLastText: "",

    devGenerated: null,
  };

  // ----------------------------
  // UI: Global controls (language + voice)
  // ----------------------------
  function ensureGlobalControls() {
    // We add a compact row into Chat + Bible views (shared selection).
    // Daily Prayer/Devotional will read the same state.
    const chatView = $("view-chat");
    const bibleView = $("view-bible");

    if (!chatView || !bibleView) return;

    const makeRow = () => {
      const wrap = document.createElement("div");
      wrap.className = "row";
      wrap.style.marginTop = "10px";

      const langSel = document.createElement("select");
      langSel.id = "uiLangSel";
      langSel.innerHTML = `
        <option value="en">English</option>
        <option value="es">Español</option>
      `;
      langSel.value = state.uiLang;

      const voiceSel = document.createElement("select");
      voiceSel.id = "uiVoiceSel";

      const voiceNote = document.createElement("div");
      voiceNote.className = "small";
      voiceNote.id = "voiceNote";
      voiceNote.style.flex = "2";
      voiceNote.textContent = ""; // filled later

      wrap.appendChild(langSel);
      wrap.appendChild(voiceSel);

      // a spacer element that still respects "row > * { flex:1 }"
      wrap.appendChild(voiceNote);

      return wrap;
    };

    // Insert into Chat under title + help
    if (!$("uiLangSel")) {
      const h2 = qs("h2", chatView);
      const help = qs(".muted", chatView);
      const row = makeRow();

      // place after help text
      if (help && help.parentNode) {
        help.insertAdjacentElement("afterend", row);
      } else if (h2 && h2.parentNode) {
        h2.insertAdjacentElement("afterend", row);
      } else {
        chatView.prepend(row);
      }
    }

    // Insert into Bible under title
    if (!$("bibleVoiceRow")) {
      const bibleH2 = qs("h2", bibleView);
      const info = document.createElement("div");
      info.className = "small";
      info.id = "bibleVoiceRow";
      info.style.marginTop = "6px";
      info.textContent = I18N[state.uiLang].bibleHelp;

      if (bibleH2) bibleH2.insertAdjacentElement("afterend", info);
    }

    // Add Bible version dropdown (UI only)
    if (!$("bibleVersion")) {
      const rowTop = qs(".row", bibleView); // first row with selects/book/chapter
      if (rowTop) {
        const versionSel = document.createElement("select");
        versionSel.id = "bibleVersion";
        versionSel.innerHTML = `
          <option value="local">Default (local)</option>
          <option value="ui-nlt">NLT (UI only)</option>
        `;
        versionSel.value = "local";
        versionSel.title = I18N[state.uiLang].uiOnlyNote;
        rowTop.insertBefore(versionSel, rowTop.firstChild);
      }
    }

    // Add chat listen + stop buttons in composer
    const composer = qs(".composer", chatView);
    if (composer && !$("listenChatBtn")) {
      const listenBtn = document.createElement("button");
      listenBtn.className = "btn";
      listenBtn.id = "listenChatBtn";
      listenBtn.type = "button";
      listenBtn.textContent = I18N[state.uiLang].listenLast;

      const stopBtn = document.createElement("button");
      stopBtn.className = "btn";
      stopBtn.id = "stopChatBtn";
      stopBtn.type = "button";
      stopBtn.textContent = I18N[state.uiLang].stop;

      composer.appendChild(listenBtn);
      composer.appendChild(stopBtn);

      listenBtn.addEventListener("click", () => speak(state.lastBotText || ""));
      stopBtn.addEventListener("click", stopSpeaking);
    }

    // Wire global controls
    const uiLangSel = $("uiLangSel");
    const uiVoiceSel = $("uiVoiceSel");
    if (uiLangSel) {
      uiLangSel.addEventListener("change", () => {
        state.uiLang = normLang(uiLangSel.value);
        localStorage.setItem(LS.UI_LANG, state.uiLang);

        // auto pick the right voice
        const v = findVoiceFor(state.uiLang);
        state.voiceObj = v;
        state.voiceKey = VOICE_PREFS[state.uiLang].key;
        localStorage.setItem(LS.UI_VOICE_KEY, state.voiceKey);

        refreshTextsForLang();
        populateVoiceSelect();
      });
    }

    if (uiVoiceSel) {
      uiVoiceSel.addEventListener("change", () => {
        const key = uiVoiceSel.value || "";
        state.voiceKey = key;
        localStorage.setItem(LS.UI_VOICE_KEY, key);

        // map selection to actual voice object
        const voices = getAllVoices();
        if (key === VOICE_PREFS.en.key) state.voiceObj = findVoiceFor("en");
        else if (key === VOICE_PREFS.es.key) state.voiceObj = findVoiceFor("es");
        else {
          // best effort: try to match by name
          const v = voices.find((vv) => (vv.name || "").toLowerCase().includes(String(key).toLowerCase()));
          state.voiceObj = v || findVoiceFor(state.uiLang);
        }
      });
    }
  }

  function populateVoiceSelect() {
    const uiVoiceSel = $("uiVoiceSel");
    const note = $("voiceNote");
    if (!uiVoiceSel) return;

    // Only show your two voices; if not present on device, we still show them but mark unavailable.
    const voices = getAllVoices();
    const karen = voices.find((v) => (v.name || "").toLowerCase().includes("karen")) || null;
    const paulina = voices.find((v) => (v.name || "").toLowerCase().includes("paulina")) || null;

    const opts = [];
    opts.push({
      key: VOICE_PREFS.en.key,
      label: karen ? VOICE_PREFS.en.label : `${VOICE_PREFS.en.label} (not found)`,
      ok: !!karen,
    });
    opts.push({
      key: VOICE_PREFS.es.key,
      label: paulina ? VOICE_PREFS.es.label : `${VOICE_PREFS.es.label} (not found)`,
      ok: !!paulina,
    });

    uiVoiceSel.innerHTML = opts
      .map((o) => `<option value="${escapeHTML(o.key)}">${escapeHTML(o.label)}</option>`)
      .join("");

    // Default selection based on language
    const desiredKey = state.uiLang === "es" ? VOICE_PREFS.es.key : VOICE_PREFS.en.key;
    uiVoiceSel.value = state.voiceKey || desiredKey;

    // Set voiceObj
    state.voiceObj = findVoiceFor(state.uiLang);

    // Note text
    if (note) {
      const missing = opts.filter((o) => !o.ok).map((o) => o.label.replace(" (not found)", ""));
      note.textContent =
        missing.length > 0
          ? `Note: Some voices not found on this device: ${missing.join(", ")}`
          : "";
    }
  }

  // ----------------------------
  // Tabs
  // ----------------------------
  function initTabs() {
    const tabs = qsa(".tab");
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const tab = btn.getAttribute("data-tab");
        showTab(tab);
      });
    });
  }

  function showTab(tab) {
    const views = {
      chat: $("view-chat"),
      bible: $("view-bible"),
      devotional: $("view-devotional"),
      prayer: $("view-prayer"),
    };
    Object.values(views).forEach((v) => {
      if (v) v.style.display = "none";
    });
    if (views[tab]) views[tab].style.display = "";

    // Update language-sensitive labels when switching
    refreshTextsForLang();

    // Ensure controls exist
    ensureGlobalControls();
    populateVoiceSelect();
  }

  // ----------------------------
  // Account / Billing
  // ----------------------------
  async function refreshMe() {
    const pill = $("accountPill");
    if (pill) pill.textContent = t("accountChecking");

    try {
      const me = await apiFetch("/me");
      state.me = me;
      state.active = !!me?.active;
      state.email = me?.email || null;

      if (pill) {
        if (me?.logged_in && me?.active && me?.email) {
          pill.textContent = I18N[state.uiLang].accountActive(me.email);
          pill.classList.remove("danger");
          pill.classList.add("ok");
        } else if (me?.logged_in && !me?.active) {
          pill.textContent = t("accountInactive");
          pill.classList.remove("ok");
          pill.classList.add("danger");
        } else {
          pill.textContent = t("accountInactive");
          pill.classList.remove("ok");
          pill.classList.add("danger");
        }
      }
    } catch (e) {
      if (pill) {
        pill.textContent = t("accountError");
        pill.classList.remove("ok");
        pill.classList.add("danger");
      }
    }
  }

  async function initBillingButtons() {
    const supportBtn = $("btnSupport");
    const billingBtn = $("btnBilling");

    if (supportBtn) {
      supportBtn.textContent = t("support");
      supportBtn.addEventListener("click", async () => {
        try {
          // Let user optionally subscribe without entering email (Stripe UI handles)
          const r = await apiFetch("/stripe/create-checkout-session", { method: "POST", body: {} });
          if (r?.url) window.location.href = r.url;
        } catch (e) {
          alert(String(e.message || e));
        }
      });
    }

    if (billingBtn) {
      billingBtn.textContent = t("billing");
      billingBtn.addEventListener("click", async () => {
        try {
          const r = await apiFetch("/stripe/create-portal-session", { method: "POST", body: {} });
          if (r?.url) window.location.href = r.url;
        } catch (e) {
          alert(String(e.message || e));
        }
      });
    }
  }

  // ----------------------------
  // Chat
  // ----------------------------
  function loadSavedChats() {
    const raw = localStorage.getItem(LS.CHAT_SAVED);
    const arr = safeJSONParse(raw, []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveSavedChats(arr) {
    localStorage.setItem(LS.CHAT_SAVED, JSON.stringify(arr || []));
  }

  function renderSavedList() {
    const list = $("savedList");
    if (!list) return;

    const saved = loadSavedChats();
    list.innerHTML = "";

    if (!saved.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = t("savedChatsEmpty");
      list.appendChild(empty);
      return;
    }

    saved
      .slice()
      .reverse()
      .forEach((item) => {
        const row = document.createElement("div");
        row.className = "saved-item";

        const left = document.createElement("div");
        const name = document.createElement("div");
        name.className = "name";
        name.textContent = item.name || "Saved chat";
        const meta = document.createElement("div");
        meta.className = "small";
        meta.textContent = item.date || "";
        left.appendChild(name);
        left.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "actions";

        const loadBtn = document.createElement("button");
        loadBtn.className = "btn";
        loadBtn.textContent = "Load";

        const delBtn = document.createElement("button");
        delBtn.className = "btn";
        delBtn.textContent = "Delete";

        actions.appendChild(loadBtn);
        actions.appendChild(delBtn);

        row.appendChild(left);
        row.appendChild(actions);
        list.appendChild(row);

        loadBtn.addEventListener("click", () => {
          state.chatMessages = Array.isArray(item.messages) ? item.messages : [];
          state.chatHistory = Array.isArray(item.history) ? item.history : [];
          const lastBot = [...state.chatMessages].reverse().find((m) => m.role === "assistant");
          state.lastBotText = lastBot?.content || "";
          renderMessages();
        });

        delBtn.addEventListener("click", () => {
          const all = loadSavedChats();
          const kept = all.filter((x) => x.id !== item.id);
          saveSavedChats(kept);
          renderSavedList();
        });
      });
  }

  function renderMessages() {
    const box = $("messages");
    if (!box) return;
    box.innerHTML = "";

    for (const m of state.chatMessages) {
      const row = document.createElement("div");
      row.className = `msg-row ${m.role === "user" ? "me" : "bot"}`;

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = m.content;

      row.appendChild(bubble);
      box.appendChild(row);
    }

    box.scrollTop = box.scrollHeight;
  }

  function setChatStatus(msg) {
    const s = $("chatStatus");
    if (s) s.textContent = msg || "";
  }

  async function sendChat() {
    const input = $("chatInput");
    if (!input) return;

    const text = String(input.value || "").trim();
    if (!text) return;

    // user message
    state.chatMessages.push({ role: "user", content: text });
    state.chatHistory.push({ role: "user", content: text });
    renderMessages();

    input.value = "";
    localStorage.setItem(LS.CHAT_DRAFT, "");

    setChatStatus("…");

    try {
      const endpoint = state.active ? "/premium/chat" : "/chat";

      const body = {
        prompt: text,
        history: state.chatHistory.slice(-16),
      };

      const r = await apiFetch(endpoint, { method: "POST", body });
      const msg = r?.message || "…";

      state.chatMessages.push({ role: "assistant", content: msg });
      state.chatHistory.push({ role: "assistant", content: msg });
      state.lastBotText = msg;

      renderMessages();
      setChatStatus("");
    } catch (e) {
      setChatStatus(`Error: ${e.message || e}`);
    }
  }

  function newChat() {
    state.chatMessages = [];
    state.chatHistory = [];
    state.lastBotText = "";
    renderMessages();
    setChatStatus("");
  }

  function saveChat() {
    const saved = loadSavedChats();
    const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());

    const titleSeed =
      state.chatMessages.find((m) => m.role === "user")?.content ||
      (state.uiLang === "es" ? "Chat guardado" : "Saved chat");

    const name = titleSeed.length > 34 ? titleSeed.slice(0, 34) + "…" : titleSeed;

    saved.push({
      id,
      name,
      date: new Date().toLocaleString(),
      messages: state.chatMessages,
      history: state.chatHistory,
    });

    saveSavedChats(saved);
    renderSavedList();
    setChatStatus(t("saved"));
  }

  function initChatUI() {
    const input = $("chatInput");
    const sendBtn = $("sendBtn");
    const newBtn = $("newBtn");
    const saveBtn = $("saveBtn");

    if (sendBtn) sendBtn.textContent = t("send");
    if (newBtn) newBtn.textContent = t("newChat");
    if (saveBtn) saveBtn.textContent = t("save");

    if (input) {
      input.placeholder = t("chatPlaceholder");
      input.value = localStorage.getItem(LS.CHAT_DRAFT) || "";
      input.addEventListener("input", () => localStorage.setItem(LS.CHAT_DRAFT, input.value || ""));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendChat();
      });
    }

    if (sendBtn) sendBtn.addEventListener("click", sendChat);
    if (newBtn) newBtn.addEventListener("click", newChat);
    if (saveBtn) saveBtn.addEventListener("click", saveChat);

    renderSavedList();
  }

  // ----------------------------
  // Bible
  // ----------------------------
  async function initBible() {
    const bookSel = $("bookSelect");
    const chapSel = $("chapterSelect");
    const loadChapterBtn = $("loadChapterBtn");
    const loadPassageBtn = $("loadPassageBtn");
    const startVerse = $("startVerse");
    const endVerse = $("endVerse");
    const out = $("bibleOut");

    if (!bookSel || !chapSel || !loadChapterBtn || !out) return;

    if (startVerse) startVerse.placeholder = t("startVerse");
    if (endVerse) endVerse.placeholder = t("endVerse");
    loadChapterBtn.textContent = t("loadChapter");
    if (loadPassageBtn) loadPassageBtn.textContent = t("loadPassage");

    // books
    const r = await apiFetch("/bible/books");
    const books = r?.books || [];
    bookSel.innerHTML = books.map((b) => `<option value="${escapeHTML(String(b.id))}">${escapeHTML(b.name)}</option>`).join("");

    async function loadChapters() {
      chapSel.innerHTML = "";
      const bookId = bookSel.value;
      const rr = await apiFetch(`/bible/chapters?book=${encodeURIComponent(bookId)}`);
      const ch = rr?.chapters || [];
      chapSel.innerHTML = ch.map((n) => `<option value="${n}">Chapter ${n}</option>`).join("");
    }

    async function loadChapter(full = true) {
      const bookId = bookSel.value;
      const chapter = chapSel.value;
      if (!bookId || !chapter) return;

      const rr = await apiFetch(
        `/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=${full ? "true" : "false"}`
      );

      const ref = rr?.reference || "";
      const text = rr?.text || "";
      state.bibleLastText = `${ref}\n\n${text}`.trim();

      renderBiblePassage(ref, text);
    }

    async function loadPassage() {
      const bookId = bookSel.value;
      const chapter = chapSel.value;
      if (!bookId || !chapter) return;

      const s = parseInt(String(startVerse?.value || "").trim(), 10);
      const e = parseInt(String(endVerse?.value || "").trim(), 10);

      const start = Number.isFinite(s) && s > 0 ? s : 1;
      const end = Number.isFinite(e) && e >= start ? e : start;

      const rr = await apiFetch(
        `/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=false&start=${start}&end=${end}`
      );

      const ref = rr?.reference || "";
      const text = rr?.text || "";
      state.bibleLastText = `${ref}\n\n${text}`.trim();

      renderBiblePassage(ref, text);
    }

    function renderBiblePassage(ref, text) {
      const versionSel = $("bibleVersion");
      const versionLabel = versionSel ? versionSel.options[versionSel.selectedIndex]?.textContent || "" : "";

      out.innerHTML = `
        <div class="row" style="margin-bottom:10px;">
          <div style="flex:2; min-width:260px;">
            <div style="font-weight:800;">${escapeHTML(ref || "")}</div>
            <div class="small">${escapeHTML(versionLabel || "")}</div>
          </div>
          <button class="btn" id="bibleListenBtn">${escapeHTML(t("listen"))}</button>
          <button class="btn" id="bibleStopBtn">${escapeHTML(t("stop"))}</button>
        </div>
        <div style="white-space:pre-wrap; line-height:1.45;">${escapeHTML(text || t("noBibleText"))}</div>
      `;

      const listenBtn = $("bibleListenBtn");
      const stopBtn = $("bibleStopBtn");
      if (listenBtn) listenBtn.addEventListener("click", () => speak(state.bibleLastText || ""));
      if (stopBtn) stopBtn.addEventListener("click", stopSpeaking);
    }

    bookSel.addEventListener("change", async () => {
      try {
        await loadChapters();
      } catch (e) {
        out.innerHTML = `<div class="danger">${escapeHTML(e.message || String(e))}</div>`;
      }
    });

    loadChapterBtn.addEventListener("click", async () => {
      try {
        await loadChapter(true);
      } catch (e) {
        out.innerHTML = `<div class="danger">${escapeHTML(e.message || String(e))}</div>`;
      }
    });

    if (loadPassageBtn) {
      loadPassageBtn.addEventListener("click", async () => {
        try {
          await loadPassage();
        } catch (e) {
          out.innerHTML = `<div class="danger">${escapeHTML(e.message || String(e))}</div>`;
        }
      });
    }

    // initial
    await loadChapters();
    out.innerHTML = `<div class="muted">${escapeHTML(t("selectBookChapter"))}</div>`;
  }

  // ----------------------------
  // Devotional (guided + streak)
  // ----------------------------
  function getStreak(kind) {
    const key = kind === "dev" ? LS.DEV_STREAK : LS.PRAY_STREAK;
    const raw = localStorage.getItem(key);
    const n = parseInt(raw || "0", 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function setStreak(kind, n) {
    const key = kind === "dev" ? LS.DEV_STREAK : LS.PRAY_STREAK;
    localStorage.setItem(key, String(n));
  }

  function getLastDate(kind) {
    const key = kind === "dev" ? LS.DEV_LAST_DATE : LS.PRAY_LAST_DATE;
    return localStorage.getItem(key) || "";
  }

  function setLastDate(kind, d) {
    const key = kind === "dev" ? LS.DEV_LAST_DATE : LS.PRAY_LAST_DATE;
    localStorage.setItem(key, d);
  }

  function bumpStreak(kind) {
    const last = getLastDate(kind);
    const today = todayISO();
    const current = getStreak(kind);

    if (!last) {
      setStreak(kind, 1);
      setLastDate(kind, today);
      return 1;
    }

    if (last === today) {
      return current; // already saved today
    }

    const lastDate = new Date(last + "T00:00:00");
    const todayDate = new Date(today + "T00:00:00");
    const diffDays = Math.round((todayDate - lastDate) / (24 * 60 * 60 * 1000));

    if (diffDays === 1) {
      setStreak(kind, current + 1);
      setLastDate(kind, today);
      return current + 1;
    }

    // broke streak
    setStreak(kind, 1);
    setLastDate(kind, today);
    return 1;
  }

  function initDevotionalUI() {
    const devView = $("view-devotional");
    const devLang = $("devLang");
    const devBtn = $("devBtn");
    const devOut = $("devOut");
    if (!devView || !devLang || !devBtn || !devOut) return;

    devBtn.textContent = t("devotionalGenerate");

    // Guided UI (we reuse devOut container)
    devOut.innerHTML = `
      <div class="muted" id="devIntro" style="margin-bottom:10px;"></div>

      <div class="card" style="background:rgba(0,0,0,.16); margin-bottom:12px;">
        <div style="font-weight:800; margin-bottom:6px;" id="devScriptureTitle">Scripture</div>
        <div class="small" id="devScriptureRef"></div>
        <div style="white-space:pre-wrap; margin-top:8px;" id="devScriptureText"></div>
        <div style="margin-top:10px; font-weight:800;" id="devExplainTitle">Explanation</div>
        <div style="white-space:pre-wrap; margin-top:6px;" id="devExplainText"></div>
      </div>

      <div class="small" id="devStreakPill" style="margin-bottom:10px;"></div>

      <div style="font-weight:800; margin-top:6px;" id="devRefTitle"></div>
      <div class="small" id="devRefExample" style="margin:6px 0 8px;"></div>
      <textarea id="devRefInput" placeholder="Write here..."></textarea>

      <div style="font-weight:800; margin-top:14px;" id="devAppTitle"></div>
      <div class="small" id="devAppExample" style="margin:6px 0 8px;"></div>
      <textarea id="devAppInput" placeholder="Write here..."></textarea>

      <div style="font-weight:800; margin-top:14px;" id="devPrayerTitle"></div>
      <div class="small" id="devPrayerExample" style="margin:6px 0 8px;"></div>
      <textarea id="devPrayerInput" placeholder="Write here..."></textarea>

      <div style="font-weight:800; margin-top:14px;" id="devChallengeTitle"></div>
      <div class="small" id="devChallengeExample" style="margin:6px 0 8px;"></div>
      <textarea id="devChallengeInput" placeholder="Write here..."></textarea>

      <div style="font-weight:800; margin-top:14px;" id="devFocusTitle"></div>
      <div class="small" id="devFocusExample" style="margin:6px 0 8px;"></div>
      <textarea id="devFocusInput" placeholder="Write here..."></textarea>

      <div class="row" style="margin-top:14px;">
        <button class="btn good" id="devSaveBtn">${escapeHTML(t("saveDevotional"))}</button>
      </div>
      <div class="small" id="devStatus" style="margin-top:8px;"></div>
    `;

    // Restore saved inputs
    const savedInputs = safeJSONParse(localStorage.getItem(LS.DEV_USER_INPUTS), {}) || {};
    const ids = ["devRefInput", "devAppInput", "devPrayerInput", "devChallengeInput", "devFocusInput"];
    ids.forEach((id) => {
      const el = $(id);
      if (el && typeof savedInputs[id] === "string") el.value = savedInputs[id];
      if (el) {
        el.addEventListener("input", () => {
          const current = safeJSONParse(localStorage.getItem(LS.DEV_USER_INPUTS), {}) || {};
          current[id] = el.value || "";
          localStorage.setItem(LS.DEV_USER_INPUTS, JSON.stringify(current));
        });
      }
    });

    function setDevStatus(msg) {
      const s = $("devStatus");
      if (s) s.textContent = msg || "";
    }

    function renderDevGenerated(gen) {
      $("devScriptureRef").textContent = gen?.reference ? gen.reference : "";
      $("devScriptureText").textContent = gen?.verses ? gen.verses : "";
      $("devExplainText").textContent = gen?.explanation ? gen.explanation : "";

      $("devRefExample").textContent = gen?.example_reflection ? `${t("example")} ${gen.example_reflection}` : "";
      $("devAppExample").textContent = gen?.example_application ? `${t("example")} ${gen.example_application}` : "";
      $("devPrayerExample").textContent = gen?.example_prayer ? `${t("example")} ${gen.example_prayer}` : "";
      $("devChallengeExample").textContent = gen?.challenge ? `${t("example")} ${gen.challenge}` : "";
      $("devFocusExample").textContent = gen?.one_day_focus ? `${t("example")} ${gen.one_day_focus}` : "";
    }

    async function generateDevotional() {
      setDevStatus("…");

      const lang = normLang(devLang.value);
      const wantsEs = lang === "es";

      // Use /chat so we can generate the richer structure you want (scripture 1–5 verses + ref + examples).
      const prompt = wantsEs
        ? `
Eres Alyana Luz. Devuelve SOLO JSON válido (sin markdown). Todo en español.
Genera un devocional breve con esta forma EXACTA:
{
  "reference": "Referencia clara (ej: Juan 15:5)",
  "verses": "Cita directa de 1 a 5 versículos (con número de versículo si aplica). Manténlo breve.",
  "explanation": "2-4 oraciones explicando de forma simple y práctica.",
  "example_reflection": "1-2 oraciones de ejemplo (reflexión/insight).",
  "example_application": "1-2 oraciones de ejemplo (aplicación).",
  "example_prayer": "1-2 oraciones de ejemplo (oración).",
  "challenge": "1 oración como desafío/cierre.",
  "one_day_focus": "1 oración como enfoque espiritual de un día."
}
Reglas:
- No mezcles inglés.
- Cita claramente la referencia.
- Manténlo cálido, directo y corto.
`.trim()
        : `
You are Alyana Luz. Return ONLY valid JSON (no markdown). Everything in English.
Generate a brief devotional with EXACT shape:
{
  "reference": "Clear reference (e.g., John 15:5)",
  "verses": "Direct quote of 1 to 5 verses. Keep it brief.",
  "explanation": "2-4 sentences explaining it simply and practically.",
  "example_reflection": "1-2 sentence example (reflection/insight).",
  "example_application": "1-2 sentence example (application).",
  "example_prayer": "1-2 sentence example (prayer).",
  "challenge": "1 sentence closing challenge.",
  "one_day_focus": "1 sentence one-day spiritual focus."
}
Rules:
- Do not include extra keys.
- Keep it warm, practical, brief.
`.trim();

      try {
        const r = await apiFetch("/chat", {
          method: "POST",
          body: { prompt, history: [] },
        });

        // r.message is text; parse JSON
        const parsed = safeJSONParse(r?.message || "", null);
        if (!parsed || typeof parsed !== "object") {
          throw new Error(wantsEs ? "No pude leer el devocional (JSON inválido)." : "Could not read devotional (invalid JSON).");
        }

        state.devGenerated = parsed;
        renderDevGenerated(parsed);
        setDevStatus("");
      } catch (e) {
        setDevStatus(`Error: ${e.message || e}`);
      }
    }

    devBtn.addEventListener("click", generateDevotional);

    const saveBtn = $("devSaveBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const next = bumpStreak("dev");
        updateDevPrayerStreakLabels();
        setDevStatus(t("saved"));
      });
    }
  }

  // ----------------------------
  // Daily Prayer (ACTS) guided + no "generate needed"
  // ----------------------------
  const PRAYER_STARTERS = {
    en: {
      adoration: "Heavenly Father, I adore You for Your faithful love and for being near to me today.",
      confession: "Lord, I confess where I’ve fallen short. Please forgive me and help me walk in obedience.",
      thanksgiving: "Thank You, God, for Your daily provision, protection, and the small blessings I often miss.",
      supplication: "Father, I bring my needs to You. Give me wisdom, peace, and strength for what’s ahead.",
    },
    es: {
      adoration: "Padre celestial, te adoro por tu amor fiel y porque estás cerca de mí hoy.",
      confession: "Señor, confieso en lo que he fallado. Perdóname y ayúdame a caminar en obediencia.",
      thanksgiving: "Gracias, Dios, por tu provisión diaria, tu cuidado y las bendiciones que a veces no noto.",
      supplication: "Padre, pongo mis necesidades delante de Ti. Dame sabiduría, paz y fuerzas para lo que viene.",
    },
  };

  function initPrayerUI() {
    const prayView = $("view-prayer");
    const prayLang = $("prayLang");
    const prayBtn = $("prayBtn");
    const prayOut = $("prayOut");

    if (!prayView || !prayLang || !prayBtn || !prayOut) return;

    // User request: no need to "Generate" every time
    // We keep button in DOM but hide it.
    prayBtn.style.display = "none";

    // Build guided UI inside prayOut
    prayOut.innerHTML = `
      <div class="muted" id="prayIntro" style="margin-bottom:10px;"></div>
      <div class="small" id="prayStreakPill" style="margin-bottom:10px;"></div>

      <div class="card" style="background:rgba(0,0,0,.16); margin-bottom:12px;">
        <div style="font-weight:800; margin-bottom:6px;" id="actsA"></div>
        <div class="small" id="actsAEx" style="white-space:pre-wrap;"></div>
      </div>
      <div class="small" id="yourA"></div>
      <textarea id="prayAInput" placeholder=""></textarea>

      <div class="card" style="background:rgba(0,0,0,.16); margin:12px 0;">
        <div style="font-weight:800; margin-bottom:6px;" id="actsC"></div>
        <div class="small" id="actsCEx" style="white-space:pre-wrap;"></div>
      </div>
      <div class="small" id="yourC"></div>
      <textarea id="prayCInput" placeholder=""></textarea>

      <div class="card" style="background:rgba(0,0,0,.16); margin:12px 0;">
        <div style="font-weight:800; margin-bottom:6px;" id="actsT"></div>
        <div class="small" id="actsTEx" style="white-space:pre-wrap;"></div>
      </div>
      <div class="small" id="yourT"></div>
      <textarea id="prayTInput" placeholder=""></textarea>

      <div class="card" style="background:rgba(0,0,0,.16); margin:12px 0;">
        <div style="font-weight:800; margin-bottom:6px;" id="actsS"></div>
        <div class="small" id="actsSEx" style="white-space:pre-wrap;"></div>
      </div>
      <div class="small" id="yourS"></div>
      <textarea id="praySInput" placeholder=""></textarea>

      <div class="row" style="margin-top:12px;">
        <button class="btn good" id="praySaveBtn"></button>
        <button class="btn" id="prayListenBtn"></button>
        <button class="btn" id="prayStopBtn"></button>
      </div>
      <div class="small" id="prayStatus" style="margin-top:8px;"></div>
    `;

    // Restore prayer inputs
    const savedInputs = safeJSONParse(localStorage.getItem(LS.PRAY_USER_INPUTS), {}) || {};
    const bind = (id) => {
      const el = $(id);
      if (!el) return;
      if (typeof savedInputs[id] === "string") el.value = savedInputs[id];
      el.addEventListener("input", () => {
        const curr = safeJSONParse(localStorage.getItem(LS.PRAY_USER_INPUTS), {}) || {};
        curr[id] = el.value || "";
        localStorage.setItem(LS.PRAY_USER_INPUTS, JSON.stringify(curr));
      });
    };
    bind("prayAInput");
    bind("prayCInput");
    bind("prayTInput");
    bind("praySInput");

    const setStatus = (msg) => {
      const s = $("prayStatus");
      if (s) s.textContent = msg || "";
    };

    $("praySaveBtn").addEventListener("click", () => {
      bumpStreak("pray");
      updateDevPrayerStreakLabels();
      setStatus(t("saved"));
    });

    $("prayListenBtn").addEventListener("click", () => {
      const L = state.uiLang;
      const s = PRAYER_STARTERS[L];
      speak(
        [
          `${t("adoration")}: ${s.adoration}`,
          `${t("confession")}: ${s.confession}`,
          `${t("thanksgiving")}: ${s.thanksgiving}`,
          `${t("supplication")}: ${s.supplication}`,
        ].join("\n\n")
      );
    });

    $("prayStopBtn").addEventListener("click", stopSpeaking);

    // when prayLang changes, also update global uiLang to match (single source of truth)
    prayLang.addEventListener("change", () => {
      state.uiLang = normLang(prayLang.value);
      localStorage.setItem(LS.UI_LANG, state.uiLang);

      const uiLangSel = $("uiLangSel");
      if (uiLangSel) uiLangSel.value = state.uiLang;

      state.voiceObj = findVoiceFor(state.uiLang);
      state.voiceKey = state.uiLang === "es" ? VOICE_PREFS.es.key : VOICE_PREFS.en.key;
      localStorage.setItem(LS.UI_VOICE_KEY, state.voiceKey);

      refreshTextsForLang();
      populateVoiceSelect();
    });
  }

  function renderPrayerStarters() {
    const L = state.uiLang;
    const s = PRAYER_STARTERS[L];

    if ($("actsA")) $("actsA").textContent = `${t("adoration")}:`;
    if ($("actsC")) $("actsC").textContent = `${t("confession")}:`;
    if ($("actsT")) $("actsT").textContent = `${t("thanksgiving")}:`;
    if ($("actsS")) $("actsS").textContent = `${t("supplication")}:`;

    if ($("actsAEx")) $("actsAEx").textContent = s.adoration;
    if ($("actsCEx")) $("actsCEx").textContent = s.confession;
    if ($("actsTEx")) $("actsTEx").textContent = s.thanksgiving;
    if ($("actsSEx")) $("actsSEx").textContent = s.supplication;

    if ($("yourA")) $("yourA").textContent = t("yourAdoration");
    if ($("yourC")) $("yourC").textContent = t("yourConfession");
    if ($("yourT")) $("yourT").textContent = t("yourThanksgiving");
    if ($("yourS")) $("yourS").textContent = t("yourSupplication");

    // placeholders
    if ($("prayAInput")) $("prayAInput").placeholder = L === "es" ? "Escribe tu adoración aquí..." : "Write your adoration here...";
    if ($("prayCInput")) $("prayCInput").placeholder = L === "es" ? "Escribe tu confesión aquí..." : "Write your confession here...";
    if ($("prayTInput")) $("prayTInput").placeholder = L === "es" ? "Escribe tu acción de gracias aquí..." : "Write your thanksgiving here...";
    if ($("praySInput")) $("praySInput").placeholder = L === "es" ? "Escribe tu súplica aquí..." : "Write your supplication here...";

    if ($("prayIntro")) $("prayIntro").textContent = t("dailyPrayerIntro");
    if ($("praySaveBtn")) $("praySaveBtn").textContent = t("savePrayer");
    if ($("prayListenBtn")) $("prayListenBtn").textContent = t("listenStarters");
    if ($("prayStopBtn")) $("prayStopBtn").textContent = t("stop");
  }

  function updateDevPrayerStreakLabels() {
    const devPill = $("devStreakPill");
    if (devPill) devPill.textContent = t("devotionalStreak")(getStreak("dev"));

    const prayPill = $("prayStreakPill");
    if (prayPill) prayPill.textContent = t("prayerStreak")(getStreak("pray"));
  }

  // ----------------------------
  // Refresh labels when language changes
  // ----------------------------
  function refreshTextsForLang() {
    // Header buttons/pill
    const pill = $("accountPill");
    if (pill) {
      if (!state.me) pill.textContent = t("accountChecking");
      else if (state.me.logged_in && state.me.active && state.me.email) pill.textContent = I18N[state.uiLang].accountActive(state.me.email);
      else pill.textContent = t("accountInactive");
    }

    // Chat view
    const chatView = $("view-chat");
    if (chatView) {
      const h2 = qs("h2", chatView);
      const help = qs(".muted", chatView);
      if (h2) h2.textContent = t("chatTitle");
      if (help) help.textContent = t("chatHelp");

      const input = $("chatInput");
      if (input) input.placeholder = t("chatPlaceholder");

      const sendBtn = $("sendBtn");
      const newBtn = $("newBtn");
      const saveBtn = $("saveBtn");
      if (sendBtn) sendBtn.textContent = t("send");
      if (newBtn) newBtn.textContent = t("newChat");
      if (saveBtn) saveBtn.textContent = t("save");

      const listenChatBtn = $("listenChatBtn");
      const stopChatBtn = $("stopChatBtn");
      if (listenChatBtn) listenChatBtn.textContent = t("listenLast");
      if (stopChatBtn) stopChatBtn.textContent = t("stop");
    }

    // Bible view
    const bibleView = $("view-bible");
    if (bibleView) {
      const h2 = qs("h2", bibleView);
      if (h2) h2.textContent = t("readBibleTitle");

      const info = $("bibleVoiceRow");
      if (info) info.textContent = t("bibleHelp");

      const loadChapterBtn = $("loadChapterBtn");
      const loadPassageBtn = $("loadPassageBtn");
      if (loadChapterBtn) loadChapterBtn.textContent = t("loadChapter");
      if (loadPassageBtn) loadPassageBtn.textContent = t("loadPassage");

      const startVerse = $("startVerse");
      const endVerse = $("endVerse");
      if (startVerse) startVerse.placeholder = t("startVerse");
      if (endVerse) endVerse.placeholder = t("endVerse");
    }

    // Devotional view labels
    const devView = $("view-devotional");
    if (devView) {
      const h2 = qs("h2", devView);
      if (h2) h2.textContent = t("devotionalTitle");

      const devBtn = $("devBtn");
      if (devBtn) devBtn.textContent = t("devotionalGenerate");

      if ($("devIntro")) $("devIntro").textContent = t("devotionalIntro");

      if ($("devRefTitle")) $("devRefTitle").textContent = t("reflection");
      if ($("devAppTitle")) $("devAppTitle").textContent = t("application");
      if ($("devPrayerTitle")) $("devPrayerTitle").textContent = t("prayer");
      if ($("devChallengeTitle")) $("devChallengeTitle").textContent = t("challenge");
      if ($("devFocusTitle")) $("devFocusTitle").textContent = t("focus");

      if ($("devSaveBtn")) $("devSaveBtn").textContent = t("saveDevotional");
    }

    // Prayer view labels
    const prayView = $("view-prayer");
    if (prayView) {
      const h2 = qs("h2", prayView);
      if (h2) h2.textContent = t("dailyPrayerTitle");

      // sync prayLang select to global lang
      const prayLang = $("prayLang");
      if (prayLang) prayLang.value = state.uiLang;

      renderPrayerStarters();
    }

    updateDevPrayerStreakLabels();
    renderSavedList();
  }

  // ----------------------------
  // Init
  // ----------------------------
  function initVoices() {
    if (!window.speechSynthesis) return;

    const applyDefaultVoice = () => {
      // Always auto-pick based on language unless user explicitly picked
      const desiredKey = state.uiLang === "es" ? VOICE_PREFS.es.key : VOICE_PREFS.en.key;
      if (!state.voiceKey) {
        state.voiceKey = desiredKey;
        localStorage.setItem(LS.UI_VOICE_KEY, state.voiceKey);
      }

      state.voiceObj = findVoiceFor(state.uiLang);

      ensureGlobalControls();
      populateVoiceSelect();
    };

    // Some browsers load voices async
    applyDefaultVoice();
    window.speechSynthesis.onvoiceschanged = () => {
      applyDefaultVoice();
    };
  }

  async function main() {
    initTabs();
    initVoices();

    ensureGlobalControls();
    populateVoiceSelect();

    await initBillingButtons();
    await refreshMe();

    initChatUI();
    initDevotionalUI();
    initPrayerUI();

    // Bible init can fail if bible.db missing; keep it safe
    try {
      await initBible();
    } catch (e) {
      const out = $("bibleOut");
      if (out) out.innerHTML = `<div class="danger">${escapeHTML(e.message || String(e))}</div>`;
    }

    // Ensure global labels match current language
    refreshTextsForLang();

    // Default tab stays whatever is active in HTML; make sure correct view is visible
    const activeTab = qs(".tab.active")?.getAttribute("data-tab") || "chat";
    showTab(activeTab);
  }

  document.addEventListener("DOMContentLoaded", main);
})();











