
/* Alyana Luz · Bible AI — app.js */

(() => {
  // -----------------------------
  // Theme (force "old" purple colors)
  // -----------------------------
  function applyOldThemeColors() {
    const root = document.documentElement;
    root.style.setProperty("--bg", "#050316");
    root.style.setProperty("--panel", "rgba(255,255,255,.06)");
    root.style.setProperty("--panel2", "rgba(255,255,255,.09)");
    root.style.setProperty("--stroke", "rgba(255,255,255,.12)");
    root.style.setProperty("--text", "rgba(255,255,255,.92)");
    root.style.setProperty("--muted", "rgba(255,255,255,.65)");
    root.style.setProperty("--accent", "#7c6cff");
    root.style.setProperty("--good", "#28d17c");
    root.style.setProperty("--bad", "#ff4d6d");
    root.style.setProperty("--shadow", "0 18px 50px rgba(0,0,0,.45)");

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#050316");
  }

  // -----------------------------
  // DOM helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => {
      if (c == null) return;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  // -----------------------------
  // Language strings
  // -----------------------------
  const I18N = {
    en: {
      langName: "English",
      langToggle: "Switch to Español",
      voiceHint: "Voice & language apply to Listen in Bible + Chat + Devotional + Prayer.",
      chatSavedHint: "Saved chats are stored on this device (localStorage).",
      chatPlaceholder: "Ask for a prayer, verse, or ‘verses about forgiveness’...",
      listen: "Listen",
      stop: "Stop",
      save: "Save",
      send: "Send",
      new: "New",
      savedChatsTitle: "Saved Chats",
      savedChatsHint: "Load or delete any saved chat.",
      noSavedChats: "No saved chats yet.",
      load: "Load",
      delete: "Delete",
      sending: "Sending...",
      savedOnDevice: "Saved on this device.",
      bibleVersionNote: "Bible version selection is UI-only right now (your backend currently serves one Bible database).",
      bibleSelectHint: "Select a book and chapter.",
      loadChapter: "Load chapter",
      loadPassage: "Load passage",
      startVerse: "Start verse (optional)",
      endVerse: "End verse (optional)",
      devotionalIntro:
        "Alyana will generate scripture and a short explanation. Then you fill in your own sections to save and build your streak.",
      devotionalStreak: (n) => `Devotional streak: ${n}`,
      prayerIntro:
        "Alyana gives short ACTS starters. You write your own prayer and save it to build your streak.",
      prayerStreak: (n) => `Prayer streak: ${n}`,
      generate: "Generate",
      saveReflection: "Save devotional",
      savePrayer: "Save prayer",
      listenStarters: "Listen starters",
      listenDevotional: "Listen devotional",
      writeHere: "Write here...",
      reflectionTitle: "Reflection / Insight",
      applicationTitle: "Application",
      prayerTitle: "Prayer",
      challengeTitle: "Closing prompt / challenge",
      focusTitle: "One-day spiritual focus",
      yourReflection: "Your Reflection / Insight:",
      yourApplication: "Your Application:",
      yourPrayer: "Your Prayer:",
      yourChallenge: "Your Closing prompt / challenge:",
      yourFocus: "Your One-day spiritual focus:",
      exReflection:
        "Example: I notice I’ve been anxious about outcomes. Today I’ll surrender control to God and choose trust.",
      exApplication:
        "Example: I will reach out to one person today with encouragement and speak life instead of criticism.",
      exPrayer:
        "Example: Lord, guide my heart today. Help me obey quickly and love deeply. Strengthen me to walk in Your peace.",
      exChallenge:
        "Example: For the next 24 hours, whenever you feel stress, pause and pray one sentence: “Jesus, I trust You.”",
      exFocus:
        "Example: One-day focus: practice gratitude—write down 5 blessings before bed and thank God for each one.",
      actsAdoration: "Your Adoration:",
      actsConfession: "Your Confession:",
      actsThanksgiving: "Your Thanksgiving:",
      actsSupplication: "Your Supplication:",
      phAdoration: "Write your adoration here...",
      phConfession: "Write your confession here...",
      phThanksgiving: "Write your thanksgiving here...",
      phSupplication: "Write your supplication here...",
      needWriteFirst: "Write something first, then Save.",
      devotionalNeedAll: "Please fill at least one of the devotional sections before saving.",
      savedAndStreak: "Saved. Streak updated.",
      ttsNotSupported: "Text-to-speech is not supported in this browser.",
      devInvalidJson: "Devotional returned invalid JSON.",
      prayInvalidJson: "Prayer starters returned invalid JSON.",
    },
    es: {
      langName: "Español",
      langToggle: "Cambiar a English",
      voiceHint: "La voz y el idioma aplican a ‘Escuchar’ en Biblia + Chat + Devocional + Oración.",
      chatSavedHint: "Los chats guardados se almacenan en este dispositivo (localStorage).",
      chatPlaceholder: "Pide una oración, un versículo o ‘versículos sobre el perdón’...",
      listen: "Escuchar",
      stop: "Detener",
      save: "Guardar",
      send: "Enviar",
      new: "Nuevo",
      savedChatsTitle: "Chats guardados",
      savedChatsHint: "Carga o elimina cualquier chat guardado.",
      noSavedChats: "Todavía no hay chats guardados.",
      load: "Cargar",
      delete: "Eliminar",
      sending: "Enviando...",
      savedOnDevice: "Guardado en este dispositivo.",
      bibleVersionNote:
        "La versión de la Biblia es solo interfaz por ahora (tu backend actualmente sirve una sola base de datos).",
      bibleSelectHint: "Selecciona un libro y un capítulo.",
      loadChapter: "Cargar capítulo",
      loadPassage: "Cargar pasaje",
      startVerse: "Verso inicial (opcional)",
      endVerse: "Verso final (opcional)",
      devotionalIntro:
        "Alyana generará Escritura y una explicación breve. Luego tú llenas tus secciones para guardar y crear tu racha.",
      devotionalStreak: (n) => `Racha devocional: ${n}`,
      prayerIntro:
        "Alyana da iniciadores cortos ACTS. Tú escribes tu oración y la guardas para crear tu racha.",
      prayerStreak: (n) => `Racha de oración: ${n}`,
      generate: "Generar",
      saveReflection: "Guardar devocional",
      savePrayer: "Guardar oración",
      listenStarters: "Escuchar iniciadores",
      listenDevotional: "Escuchar devocional",
      writeHere: "Escribe aquí...",
      reflectionTitle: "Reflexión / Insight",
      applicationTitle: "Aplicación",
      prayerTitle: "Oración",
      challengeTitle: "Cierre / desafío",
      focusTitle: "Enfoque espiritual de 1 día",
      yourReflection: "Tu Reflexión / Insight:",
      yourApplication: "Tu Aplicación:",
      yourPrayer: "Tu Oración:",
      yourChallenge: "Tu Cierre / desafío:",
      yourFocus: "Tu Enfoque espiritual de 1 día:",
      exReflection:
        "Ejemplo: Me doy cuenta de que he estado ansioso por los resultados. Hoy entrego el control a Dios y elijo confiar.",
      exApplication:
        "Ejemplo: Hoy animaré a una persona y hablaré vida en vez de crítica.",
      exPrayer:
        "Ejemplo: Señor, guía mi corazón hoy. Ayúdame a obedecer rápido y amar profundamente. Fortaléceme para caminar en tu paz.",
      exChallenge:
        "Ejemplo: Por las próximas 24 horas, cuando sientas estrés, detente y ora una frase: “Jesús, confío en Ti.”",
      exFocus:
        "Ejemplo: Enfoque de 1 día: gratitud—escribe 5 bendiciones antes de dormir y dale gracias a Dios por cada una.",
      actsAdoration: "Tu Adoración:",
      actsConfession: "Tu Confesión:",
      actsThanksgiving: "Tu Gratitud:",
      actsSupplication: "Tu Súplica:",
      phAdoration: "Escribe tu adoración aquí...",
      phConfession: "Escribe tu confesión aquí...",
      phThanksgiving: "Escribe tu gratitud aquí...",
      phSupplication: "Escribe tu súplica aquí...",
      needWriteFirst: "Escribe algo primero y luego guarda.",
      devotionalNeedAll: "Llena al menos una sección del devocional antes de guardar.",
      savedAndStreak: "Guardado. Racha actualizada.",
      ttsNotSupported: "El texto a voz no está soportado en este navegador.",
      devInvalidJson: "El devocional devolvió JSON inválido.",
      prayInvalidJson: "Los iniciadores de oración devolvieron JSON inválido.",
    },
  };

  // -----------------------------
  // API helper
  // -----------------------------
  async function api(path, { method = "GET", body, headers } = {}) {
    const opts = {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(headers || {}),
      },
      credentials: "include",
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg =
        (data && data.detail) ||
        (typeof data === "string" ? data : "") ||
        `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // -----------------------------
  // Speech (TTS)
  // -----------------------------
  const TTS = {
    voices: [],
    selectedVoiceName: null,
    lang: "en",

    wanted: [
      { key: "en", match: (v) => /karen/i.test(v.name) && /en[-_]?au/i.test(v.lang) },
      { key: "es", match: (v) => /paulina/i.test(v.name) && /es[-_]?mx/i.test(v.lang) },
    ],

    loadVoices() {
      const all = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      const selected = [];

      for (const w of TTS.wanted) {
        const found = all.find(w.match);
        if (found) selected.push(found);
      }

      // De-dupe
      const dedup = [];
      const seen = new Set();
      for (const v of selected) {
        const k = `${v.name}__${v.lang}`;
        if (!seen.has(k)) {
          seen.add(k);
          dedup.push(v);
        }
      }

      TTS.voices = dedup;
      TTS.autoPick();
    },

    autoPick() {
      if (!TTS.voices.length) return;
      if (TTS.lang === "es") {
        const paulina = TTS.voices.find((v) => /paulina/i.test(v.name));
        if (paulina) TTS.selectedVoiceName = paulina.name;
      } else {
        const karen = TTS.voices.find((v) => /karen/i.test(v.name));
        if (karen) TTS.selectedVoiceName = karen.name;
      }
    },

    stop() {
      try {
        if (window.speechSynthesis) speechSynthesis.cancel();
      } catch {}
    },

    speak(text) {
      if (!window.speechSynthesis) {
        alert(t().ttsNotSupported);
        return;
      }
      TTS.stop();
      const raw = String(text || "").trim();
      if (!raw) return;

      const u = new SpeechSynthesisUtterance(raw);
      const v = TTS.voices.find((x) => x.name === TTS.selectedVoiceName) || null;
      if (v) u.voice = v;

      u.lang = (v && v.lang) || (TTS.lang === "es" ? "es-MX" : "en-AU");
      speechSynthesis.speak(u);
    },
  };

  // -----------------------------
  // Local storage keys
  // -----------------------------
  const LS = {
    chats: "alyana_saved_chats_v5",
    current: "alyana_current_chat_v5",
    devotionals: "alyana_saved_devotionals_v3",
    prayers: "alyana_saved_prayers_v3",
    streaks: "alyana_streaks_v2",
    tts: "alyana_tts_v3",
    bibleVersion: "alyana_bible_version_v1",
    uiLang: "alyana_ui_lang_v1",
  };

  function loadJson(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJson(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  // -----------------------------
  // i18n state
  // -----------------------------
  function getUiLang() {
    const v = localStorage.getItem(LS.uiLang);
    return v === "es" ? "es" : "en";
  }
  function setUiLang(lang) {
    localStorage.setItem(LS.uiLang, lang === "es" ? "es" : "en");
  }
  function t() {
    return I18N[getUiLang()];
  }

  // -----------------------------
  // App state
  // -----------------------------
  let account = { logged_in: false, email: null, active: false };
  let bible = { books: [], chapters: [] };
  let currentTab = "chat";

  let currentChat = {
    id: String(Date.now()),
    title: "New chat",
    messages: [],
  };

  // -----------------------------
  // UI language apply (no mixing)
  // -----------------------------
  function applyUiLanguageToStaticText() {
    const L = t();

    // Chat
    const chatMuted = $("#view-chat .muted");
    if (chatMuted) chatMuted.textContent = L.chatSavedHint;

    const input = $("#chatInput");
    if (input) input.placeholder = L.chatPlaceholder;

    const sendBtn = $("#sendBtn");
    if (sendBtn) sendBtn.textContent = L.send;

    const newBtn = $("#newBtn");
    if (newBtn) newBtn.textContent = L.new;

    const saveBtn = $("#saveBtn");
    if (saveBtn) saveBtn.textContent = L.save;

    // Saved Chats card
    const savedCard = $("#savedList")?.closest(".card");
    if (savedCard) {
      const h2 = savedCard.querySelector("h2");
      const muted = savedCard.querySelector(".muted");
      if (h2) h2.textContent = L.savedChatsTitle;
      if (muted) muted.textContent = L.savedChatsHint;
    }

    // Bible placeholders/buttons
    const startVerse = $("#startVerse");
    const endVerse = $("#endVerse");
    if (startVerse) startVerse.placeholder = L.startVerse;
    if (endVerse) endVerse.placeholder = L.endVerse;

    const loadChapterBtn = $("#loadChapterBtn");
    const loadPassageBtn = $("#loadPassageBtn");
    if (loadChapterBtn) loadChapterBtn.textContent = L.loadChapter;
    if (loadPassageBtn) loadPassageBtn.textContent = L.loadPassage;

    const bibleOut = $("#bibleOut");
    if (bibleOut && !bibleOut.dataset.hasPassage) {
      bibleOut.innerHTML = `<div class="muted">${escapeHtml(L.bibleSelectHint)}</div>`;
    }

    // Devotional + Prayer top buttons
    const devBtn = $("#devBtn");
    const prayBtn = $("#prayBtn");
    if (devBtn) devBtn.textContent = L.generate;
    if (prayBtn) prayBtn.textContent = L.generate;

    // Prayer user labels/placeholders
    updatePrayerGuidedText();

    // Devotional guided labels/placeholders
    updateDevotionalGuidedText();

    // Voice hint + toggle label
    const hint = $("#voiceHint");
    if (hint) hint.textContent = L.voiceHint;

    const langToggle = $("#langToggleBtn");
    if (langToggle) langToggle.textContent = L.langToggle;

    // Dev/Pray streak pills refresh
    refreshStreakPills();
  }

  // -----------------------------
  // Voice + Language controls row
  // -----------------------------
  function injectVoiceControls() {
    const viewChat = $("#view-chat");
    if (!viewChat) return;
    if ($("#voiceRow")) return;

    const row = el("div", { class: "row", id: "voiceRow", style: "margin-top:10px; align-items:center;" });

    // Language toggle button
    const langToggle = el("button", { class: "btn", id: "langToggleBtn", type: "button" }, [t().langToggle]);

    // Voice dropdown (only Karen + Paulina)
    const voiceSel = el("select", { id: "voiceSel" });

    // Listen last assistant in chat + stop
    const listenBtn = el("button", { class: "btn primary", id: "listenLastBtn", type: "button" }, [t().listen]);
    const stopBtn = el("button", { class: "btn", id: "stopBtn", type: "button" }, [t().stop]);

    const hint = el("div", { class: "small", id: "voiceHint", style: "flex-basis:100%; min-width:100%;" }, [
      t().voiceHint,
    ]);

    row.appendChild(langToggle);
    row.appendChild(voiceSel);
    row.appendChild(listenBtn);
    row.appendChild(stopBtn);
    row.appendChild(hint);

    const chatbox = viewChat.querySelector(".chatbox");
    viewChat.insertBefore(row, chatbox);

    langToggle.addEventListener("click", () => {
      // Toggle app UI + TTS language together
      const next = getUiLang() === "es" ? "en" : "es";
      setUiLang(next);

      TTS.lang = next;
      TTS.autoPick();
      persistTtsSettings();
      renderVoiceDropdown();

      // Also update the Dev/Prayer backend language dropdowns to match
      const devLang = $("#devLang");
      const prayLang = $("#prayLang");
      if (devLang) devLang.value = next;
      if (prayLang) prayLang.value = next;

      applyUiLanguageToStaticText();
    });

    voiceSel.addEventListener("change", () => {
      TTS.selectedVoiceName = voiceSel.value;
      persistTtsSettings();
    });

    listenBtn.addEventListener("click", () => {
      const last = [...currentChat.messages].reverse().find((m) => m.role === "assistant");
      if (!last) return;
      TTS.speak(last.content);
    });

    stopBtn.addEventListener("click", () => TTS.stop());
  }

  function renderVoiceDropdown() {
    const voiceSel = $("#voiceSel");
    if (!voiceSel) return;

    voiceSel.innerHTML = "";
    if (!TTS.voices.length) {
      voiceSel.appendChild(el("option", { value: "" }, ["(No voices found)"]));
      voiceSel.disabled = true;
      return;
    }
    voiceSel.disabled = false;

    for (const v of TTS.voices) {
      const label =
        /karen/i.test(v.name) ? "Karen — en-AU" :
        /paulina/i.test(v.name) ? "Paulina — es-MX" :
        `${v.name} — ${v.lang}`;
      voiceSel.appendChild(el("option", { value: v.name }, [label]));
    }
    if (TTS.selectedVoiceName) voiceSel.value = TTS.selectedVoiceName;
  }

  function persistTtsSettings() {
    saveJson(LS.tts, { lang: TTS.lang, selectedVoiceName: TTS.selectedVoiceName });
  }

  function restoreTtsSettings() {
    const s = loadJson(LS.tts, null);
    const ui = getUiLang();
    TTS.lang = ui; // always follow UI to prevent mixing

    if (s && s.selectedVoiceName) TTS.selectedVoiceName = s.selectedVoiceName;
    if (!TTS.selectedVoiceName) TTS.autoPick();
  }

  // -----------------------------
  // Tabs
  // -----------------------------
  function setTab(tab) {
    currentTab = tab;
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("#view-chat").style.display = tab === "chat" ? "" : "none";
    $("#view-bible").style.display = tab === "bible" ? "" : "none";
    $("#view-devotional").style.display = tab === "devotional" ? "" : "none";
    $("#view-prayer").style.display = tab === "prayer" ? "" : "none";
  }

  // -----------------------------
  // Chat
  // -----------------------------
  function renderMessages() {
    const box = $("#messages");
    if (!box) return;
    box.innerHTML = "";

    for (let i = 0; i < currentChat.messages.length; i++) {
      const m = currentChat.messages[i];
      const row = el("div", { class: `msg-row ${m.role === "user" ? "me" : "bot"}` });
      const bubble = el("div", { class: "bubble" }, []);
      bubble.innerHTML = escapeHtml(m.content);

      const meta = el("div", { class: "meta" }, []);
      const ts = new Date(m.ts || Date.now()).toLocaleString();
      meta.appendChild(document.createTextNode(ts));

      if (m.role === "assistant") {
        const btnWrap = el("span", { style: "margin-left:10px;" });
        const listen = el(
          "button",
          { class: "btn", type: "button", style: "padding:6px 9px; border-radius:10px;" },
          [t().listen]
        );
        listen.addEventListener("click", () => TTS.speak(m.content));
        btnWrap.appendChild(listen);

        const stop = el(
          "button",
          { class: "btn", type: "button", style: "padding:6px 9px; border-radius:10px; margin-left:8px;" },
          [t().stop]
        );
        stop.addEventListener("click", () => TTS.stop());
        btnWrap.appendChild(stop);

        meta.appendChild(btnWrap);
      }

      bubble.appendChild(meta);
      row.appendChild(bubble);
      box.appendChild(row);
    }

    box.scrollTop = box.scrollHeight;
  }

  function setChatStatus(text, isError = false) {
    const s = $("#chatStatus");
    if (!s) return;
    s.className = isError ? "danger small" : "small";
    s.textContent = text || "";
  }

  function getHistoryForBackend() {
    return currentChat.messages.slice(-16).map((m) => ({ role: m.role, content: m.content }));
  }

  async function sendChat() {
    const input = $("#chatInput");
    const sendBtn = $("#sendBtn");
    if (!input) return;

    const prompt = String(input.value || "").trim();
    if (!prompt) return;

    input.value = "";
    setChatStatus(t().sending);
    if (sendBtn) sendBtn.disabled = true;

    currentChat.messages.push({ role: "user", content: prompt, ts: Date.now() });
    renderMessages();
    persistCurrentChat();

    try {
      const data = await api("/chat", { method: "POST", body: { prompt, history: getHistoryForBackend() } });
      const reply = (data && data.message) || "";
      currentChat.messages.push({ role: "assistant", content: reply || "(No response)", ts: Date.now() });

      if (currentChat.title === "New chat") {
        currentChat.title = prompt.length > 28 ? prompt.slice(0, 28) + "…" : prompt;
      }

      setChatStatus("");
      renderMessages();
      persistCurrentChat();
      renderSavedChats();
    } catch (e) {
      setChatStatus(`Error: ${e.message}`, true);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  function newChat() {
    TTS.stop();
    currentChat = { id: String(Date.now()), title: "New chat", messages: [] };
    persistCurrentChat();
    renderMessages();
    setChatStatus("");
  }

  function saveChat() {
    const all = loadJson(LS.chats, []);
    const idx = all.findIndex((c) => c.id === currentChat.id);
    const snapshot = {
      id: currentChat.id,
      title: currentChat.title || "Chat",
      messages: currentChat.messages || [],
      updatedAt: Date.now(),
    };
    if (idx >= 0) all[idx] = snapshot;
    else all.unshift(snapshot);

    saveJson(LS.chats, all.slice(0, 50));
    renderSavedChats();
    setChatStatus(t().savedOnDevice);
    setTimeout(() => setChatStatus(""), 1200);
  }

  function persistCurrentChat() {
    saveJson(LS.current, currentChat);
  }

  function restoreCurrentChat() {
    const c = loadJson(LS.current, null);
    if (c && c.id && Array.isArray(c.messages)) currentChat = c;
  }

  function renderSavedChats() {
    const list = $("#savedList");
    if (!list) return;
    const all = loadJson(LS.chats, []);
    list.innerHTML = "";

    if (!all.length) {
      list.appendChild(el("div", { class: "muted" }, [t().noSavedChats]));
      return;
    }

    for (const c of all) {
      const item = el("div", { class: "saved-item" });

      const left = el("div", {}, [
        el("div", { class: "name" }, [c.title || "Chat"]),
        el("div", { class: "small" }, [new Date(c.updatedAt || Date.now()).toLocaleString()]),
      ]);

      const actions = el("div", { class: "actions" });
      const loadBtn = el("button", { class: "btn", type: "button" }, [t().load]);
      loadBtn.addEventListener("click", () => {
        TTS.stop();
        currentChat = { id: c.id, title: c.title || "Chat", messages: c.messages || [] };
        persistCurrentChat();
        setTab("chat");
        renderMessages();
        setChatStatus("");
      });

      const delBtn = el("button", { class: "btn", type: "button" }, [t().delete]);
      delBtn.addEventListener("click", () => {
        const next = loadJson(LS.chats, []).filter((x) => x.id !== c.id);
        saveJson(LS.chats, next);
        renderSavedChats();
      });

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      item.appendChild(left);
      item.appendChild(actions);
      list.appendChild(item);
    }
  }

  // -----------------------------
  // Bible UI
  // -----------------------------
  function injectBibleVersionUI() {
    const view = $("#view-bible");
    if (!view) return;
    if ($("#bibleVersionRow")) return;

    const versionRow = el("div", { class: "row", id: "bibleVersionRow", style: "margin-top:10px;" });
    const verSel = el("select", { id: "bibleVersionSel" });

    const versions = [
      { value: "default", label: "Bible Version: Default (current database)" },
      { value: "kjv", label: "KJV (coming soon)", disabled: true },
      { value: "niv", label: "NIV (coming soon)", disabled: true },
      { value: "rvr1960", label: "RVR1960 (coming soon)", disabled: true },
    ];

    for (const v of versions) {
      const opt = el("option", { value: v.value }, [v.label]);
      if (v.disabled) opt.disabled = true;
      verSel.appendChild(opt);
    }

    verSel.value = localStorage.getItem(LS.bibleVersion) || "default";
    verSel.addEventListener("change", () => localStorage.setItem(LS.bibleVersion, verSel.value));

    const note = el("div", { class: "small", id: "bibleVersionNote", style: "flex-basis:100%; min-width:100%;" }, [
      t().bibleVersionNote,
    ]);

    versionRow.appendChild(verSel);
    versionRow.appendChild(note);

    const h2 = view.querySelector("h2");
    h2.insertAdjacentElement("afterend", versionRow);
  }

  async function loadBooks() {
    const bookSelect = $("#bookSelect");
    if (!bookSelect) return;

    bookSelect.innerHTML = "";
    bookSelect.appendChild(el("option", { value: "" }, ["Loading books..."]));
    try {
      const data = await api("/bible/books");
      bible.books = (data && data.books) || [];

      bookSelect.innerHTML = "";
      for (const b of bible.books) bookSelect.appendChild(el("option", { value: b.id }, [b.name]));

      if (bible.books.length) {
        bookSelect.value = String(bible.books[0].id);
        await loadChapters();
      }
    } catch (e) {
      bookSelect.innerHTML = "";
      bookSelect.appendChild(el("option", { value: "" }, ["(Failed to load books)"]));
      $("#bibleOut").innerHTML = `<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function loadChapters() {
    const bookSelect = $("#bookSelect");
    const chapterSelect = $("#chapterSelect");
    if (!bookSelect || !chapterSelect) return;

    const book = bookSelect.value;
    if (!book) return;

    chapterSelect.innerHTML = "";
    chapterSelect.appendChild(el("option", { value: "" }, ["Loading chapters..."]));

    try {
      const data = await api(`/bible/chapters?book=${encodeURIComponent(book)}`);
      bible.chapters = (data && data.chapters) || [];

      chapterSelect.innerHTML = "";
      for (const c of bible.chapters) chapterSelect.appendChild(el("option", { value: c }, [`Chapter ${c}`]));
      if (bible.chapters.length) chapterSelect.value = String(bible.chapters[0]);
    } catch (e) {
      chapterSelect.innerHTML = "";
      chapterSelect.appendChild(el("option", { value: "" }, ["(Failed to load chapters)"]));
      $("#bibleOut").innerHTML = `<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`;
    }
  }

  function setBibleOut(reference, text) {
    const out = $("#bibleOut");
    if (!out) return;

    out.dataset.hasPassage = "1";
    out.innerHTML = "";

    const head = el("div", { class: "row", style: "align-items:center; margin-bottom:10px;" });
    const title = el("div", { style: "flex:1; font-weight:800;" }, [reference || "Passage"]);
    const listen = el("button", { class: "btn primary", type: "button" }, [t().listen]);
    const stop = el("button", { class: "btn", type: "button" }, [t().stop]);

    listen.addEventListener("click", () => TTS.speak(text));
    stop.addEventListener("click", () => TTS.stop());

    head.appendChild(title);
    head.appendChild(listen);
    head.appendChild(stop);

    const body = el("div", { style: "white-space:pre-wrap; line-height:1.45;" }, [text || ""]);
    out.appendChild(head);
    out.appendChild(body);
  }

  async function loadFullChapter() {
    const book = $("#bookSelect").value;
    const chapter = $("#chapterSelect").value;
    if (!book || !chapter) return;

    $("#bibleOut").innerHTML = `<div class="muted">Loading...</div>`;
    try {
      const data = await api(
        `/bible/passage?book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(chapter)}&full_chapter=true`
      );
      setBibleOut(data.reference, data.text);
    } catch (e) {
      $("#bibleOut").innerHTML = `<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function loadPassage() {
    const book = $("#bookSelect").value;
    const chapter = $("#chapterSelect").value;
    const start = ($("#startVerse").value || "").trim();
    const end = ($("#endVerse").value || "").trim();
    if (!book || !chapter) return;

    const qs = new URLSearchParams();
    qs.set("book", book);
    qs.set("chapter", chapter);
    qs.set("full_chapter", "false");
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);

    $("#bibleOut").innerHTML = `<div class="muted">Loading...</div>`;
    try {
      const data = await api(`/bible/passage?${qs.toString()}`);
      setBibleOut(data.reference, data.text);
    } catch (e) {
      $("#bibleOut").innerHTML = `<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`;
    }
  }

  // -----------------------------
  // Streaks
  // -----------------------------
  function getStreaks() {
    return loadJson(LS.streaks, {
      devotional: { count: 0, lastDate: null },
      prayer: { count: 0, lastDate: null },
    });
  }

  function bumpStreak(kind) {
    const s = getStreaks();
    const today = new Date();
    const yyyyMmDd = today.toISOString().slice(0, 10);

    const entry = s[kind] || { count: 0, lastDate: null };
    const last = entry.lastDate;

    if (!last) {
      entry.count = 1;
      entry.lastDate = yyyyMmDd;
    } else {
      const lastDate = new Date(last + "T00:00:00");
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) entry.lastDate = yyyyMmDd;
      else if (diffDays === 1) {
        entry.count += 1;
        entry.lastDate = yyyyMmDd;
      } else {
        entry.count = 1;
        entry.lastDate = yyyyMmDd;
      }
    }

    s[kind] = entry;
    saveJson(LS.streaks, s);
    return entry.count;
  }

  function refreshStreakPills() {
    const s = getStreaks();
    if ($("#devStreakPill")) $("#devStreakPill").textContent = t().devotionalStreak(s.devotional?.count || 0);
    if ($("#prayStreakPill")) $("#prayStreakPill").textContent = t().prayerStreak(s.prayer?.count || 0);
  }

  // -----------------------------
  // Devotional upgraded UI
  // -----------------------------
  function injectGuidedDevotionalUI() {
    const view = $("#view-devotional");
    if (!view) return;
    if ($("#devGuided")) return;

    const wrap = el("div", { id: "devGuided", style: "margin-top:12px;" });

    const desc = el("div", { class: "muted", id: "devIntro", style: "margin-top:10px;" }, [t().devotionalIntro]);
    const streak = el("div", { class: "pill", id: "devStreakPill", style: "margin-top:10px; display:inline-block;" }, [
      t().devotionalStreak(0),
    ]);

    // User sections (with Alyana example)
    function section(id, titleId, yourLabelId, exTextId) {
      return el("div", { style: "margin-top:12px;" }, [
        el("div", { style: "font-weight:800; margin-bottom:6px;", id: titleId }, [""]),
        el("div", { class: "small", id: yourLabelId }, [""]),
        el("textarea", { id, placeholder: t().writeHere }),
        el("div", { class: "small", id: exTextId, style: "margin-top:6px; opacity:.9;" }, [""]),
      ]);
    }

    const secReflection = section("devReflection", "devTitleReflection", "devYourReflection", "devExReflection");
    const secApplication = section("devApplication", "devTitleApplication", "devYourApplication", "devExApplication");
    const secPrayer = section("devPrayer", "devTitlePrayer", "devYourPrayer", "devExPrayer");
    const secChallenge = section("devChallenge", "devTitleChallenge", "devYourChallenge", "devExChallenge");
    const secFocus = section("devFocus", "devTitleFocus", "devYourFocus", "devExFocus");

    const actions = el("div", { class: "row", style: "margin-top:10px;" }, []);
    const saveBtn = el("button", { class: "btn good", id: "devSaveBtn", type: "button" }, [t().saveReflection]);
    const listenBtn = el("button", { class: "btn primary", id: "devListenBtn", type: "button" }, [t().listenDevotional]);
    const stopBtn = el("button", { class: "btn", id: "devStopBtn", type: "button" }, [t().stop]);
    actions.appendChild(saveBtn);
    actions.appendChild(listenBtn);
    actions.appendChild(stopBtn);

    wrap.appendChild(desc);
    wrap.appendChild(streak);
    wrap.appendChild(secReflection);
    wrap.appendChild(secApplication);
    wrap.appendChild(secPrayer);
    wrap.appendChild(secChallenge);
    wrap.appendChild(secFocus);
    wrap.appendChild(actions);

    view.appendChild(wrap);

    saveBtn.addEventListener("click", () => {
      const devOut = $("#devOut");

      const reflection = String($("#devReflection").value || "").trim();
      const application = String($("#devApplication").value || "").trim();
      const prayer = String($("#devPrayer").value || "").trim();
      const challenge = String($("#devChallenge").value || "").trim();
      const focus = String($("#devFocus").value || "").trim();

      if (!reflection && !application && !prayer && !challenge && !focus) {
        alert(t().devotionalNeedAll);
        return;
      }

      const payload = {
        ts: Date.now(),
        lang: getUiLang(),
        scripture: devOut?.dataset?.scripture || "",
        explanation: devOut?.dataset?.explanation || "",
        user: { reflection, application, prayer, challenge, focus },
      };

      const all = loadJson(LS.devotionals, []);
      all.unshift(payload);
      saveJson(LS.devotionals, all.slice(0, 200));

      const count = bumpStreak("devotional");
      $("#devStreakPill").textContent = t().devotionalStreak(count);

      $("#devReflection").value = "";
      $("#devApplication").value = "";
      $("#devPrayer").value = "";
      $("#devChallenge").value = "";
      $("#devFocus").value = "";

      alert(t().savedAndStreak);
    });

    listenBtn.addEventListener("click", () => {
      const devOut = $("#devOut");
      const scripture = devOut?.dataset?.scripture || "";
      const explanation = devOut?.dataset?.explanation || "";

      // speak only Alyana parts (scripture + explanation + examples)
      const parts = [
        scripture,
        explanation,
        t().exReflection,
        t().exApplication,
        t().exPrayer,
        t().exChallenge,
        t().exFocus,
      ].filter(Boolean);

      TTS.speak(parts.join("\n\n"));
    });

    stopBtn.addEventListener("click", () => TTS.stop());

    updateDevotionalGuidedText();
  }

  function updateDevotionalGuidedText() {
    const L = t();

    const intro = $("#devIntro");
    if (intro) intro.textContent = L.devotionalIntro;

    // Titles + labels + examples
    if ($("#devTitleReflection")) $("#devTitleReflection").textContent = L.reflectionTitle;
    if ($("#devYourReflection")) $("#devYourReflection").textContent = L.yourReflection;
    if ($("#devExReflection")) $("#devExReflection").textContent = L.exReflection;

    if ($("#devTitleApplication")) $("#devTitleApplication").textContent = L.applicationTitle;
    if ($("#devYourApplication")) $("#devYourApplication").textContent = L.yourApplication;
    if ($("#devExApplication")) $("#devExApplication").textContent = L.exApplication;

    if ($("#devTitlePrayer")) $("#devTitlePrayer").textContent = L.prayerTitle;
    if ($("#devYourPrayer")) $("#devYourPrayer").textContent = L.yourPrayer;
    if ($("#devExPrayer")) $("#devExPrayer").textContent = L.exPrayer;

    if ($("#devTitleChallenge")) $("#devTitleChallenge").textContent = L.challengeTitle;
    if ($("#devYourChallenge")) $("#devYourChallenge").textContent = L.yourChallenge;
    if ($("#devExChallenge")) $("#devExChallenge").textContent = L.exChallenge;

    if ($("#devTitleFocus")) $("#devTitleFocus").textContent = L.focusTitle;
    if ($("#devYourFocus")) $("#devYourFocus").textContent = L.yourFocus;
    if ($("#devExFocus")) $("#devExFocus").textContent = L.exFocus;

    // Button labels
    if ($("#devSaveBtn")) $("#devSaveBtn").textContent = L.saveReflection;
    if ($("#devListenBtn")) $("#devListenBtn").textContent = L.listenDevotional;
    if ($("#devStopBtn")) $("#devStopBtn").textContent = L.stop;

    // Placeholders
    ["devReflection", "devApplication", "devPrayer", "devChallenge", "devFocus"].forEach((id) => {
      const ta = $("#" + id);
      if (ta) ta.placeholder = L.writeHere;
    });
  }

  // -----------------------------
  // Prayer upgraded UI (bilingual)
  // -----------------------------
  function injectGuidedPrayerUI() {
    const view = $("#view-prayer");
    if (!view) return;
    if ($("#prayerGuided")) return;

    const wrap = el("div", { id: "prayerGuided", style: "margin-top:12px;" });

    const desc = el("div", { class: "muted", id: "prayIntro", style: "margin-top:10px;" }, [t().prayerIntro]);
    const streak = el("div", { class: "pill", id: "prayStreakPill", style: "margin-top:10px; display:inline-block;" }, [
      t().prayerStreak(0),
    ]);

    function box(labelId, textareaId) {
      return el("div", { style: "margin-top:12px;" }, [
        el("div", { class: "small", id: labelId }, [""]),
        el("textarea", { id: textareaId }),
      ]);
    }

    const a = box("prayLblA", "prayA");
    const c = box("prayLblC", "prayC");
    const tt = box("prayLblT", "prayT");
    const s = box("prayLblS", "prayS");

    const actions = el("div", { class: "row", style: "margin-top:10px;" }, []);
    const saveBtn = el("button", { class: "btn good", id: "praySaveBtn", type: "button" }, [t().savePrayer]);
    const listenBtn = el("button", { class: "btn primary", id: "prayListenBtn", type: "button" }, [t().listenStarters]);
    const stopBtn = el("button", { class: "btn", id: "prayStopBtn", type: "button" }, [t().stop]);
    actions.appendChild(saveBtn);
    actions.appendChild(listenBtn);
    actions.appendChild(stopBtn);

    wrap.appendChild(desc);
    wrap.appendChild(streak);
    wrap.appendChild(a);
    wrap.appendChild(c);
    wrap.appendChild(tt);
    wrap.appendChild(s);
    wrap.appendChild(actions);

    view.appendChild(wrap);

    saveBtn.addEventListener("click", () => {
      const prayOut = $("#prayOut");
      const ad = String($("#prayA").value || "").trim();
      const co = String($("#prayC").value || "").trim();
      const th = String($("#prayT").value || "").trim();
      const su = String($("#prayS").value || "").trim();

      if (!ad && !co && !th && !su) {
        alert(t().needWriteFirst);
        return;
      }

      const payload = {
        ts: Date.now(),
        lang: getUiLang(),
        starters: {
          adoration: prayOut?.dataset?.adoration || "",
          confession: prayOut?.dataset?.confession || "",
          thanksgiving: prayOut?.dataset?.thanksgiving || "",
          supplication: prayOut?.dataset?.supplication || "",
        },
        user: { adoration: ad, confession: co, thanksgiving: th, supplication: su },
      };

      const all = loadJson(LS.prayers, []);
      all.unshift(payload);
      saveJson(LS.prayers, all.slice(0, 200));

      const count = bumpStreak("prayer");
      $("#prayStreakPill").textContent = t().prayerStreak(count);

      $("#prayA").value = "";
      $("#prayC").value = "";
      $("#prayT").value = "";
      $("#prayS").value = "";

      alert(t().savedAndStreak);
    });

    listenBtn.addEventListener("click", () => {
      const prayOut = $("#prayOut");
      const L = t();
      const pieces = [
        prayOut?.dataset?.adoration ? `${L.actsAdoration.replace("Your ", "").replace("Tu ", "")} ${prayOut.dataset.adoration}` : "",
        prayOut?.dataset?.confession ? `${L.actsConfession.replace("Your ", "").replace("Tu ", "")} ${prayOut.dataset.confession}` : "",
        prayOut?.dataset?.thanksgiving ? `${L.actsThanksgiving.replace("Your ", "").replace("Tu ", "")} ${prayOut.dataset.thanksgiving}` : "",
        prayOut?.dataset?.supplication ? `${L.actsSupplication.replace("Your ", "").replace("Tu ", "")} ${prayOut.dataset.supplication}` : "",
      ].filter(Boolean);
      TTS.speak(pieces.join("\n\n"));
    });

    stopBtn.addEventListener("click", () => TTS.stop());

    updatePrayerGuidedText();
  }

  function updatePrayerGuidedText() {
    const L = t();
    const intro = $("#prayIntro");
    if (intro) intro.textContent = L.prayerIntro;

    if ($("#prayLblA")) $("#prayLblA").textContent = L.actsAdoration;
    if ($("#prayLblC")) $("#prayLblC").textContent = L.actsConfession;
    if ($("#prayLblT")) $("#prayLblT").textContent = L.actsThanksgiving;
    if ($("#prayLblS")) $("#prayLblS").textContent = L.actsSupplication;

    if ($("#prayA")) $("#prayA").placeholder = L.phAdoration;
    if ($("#prayC")) $("#prayC").placeholder = L.phConfession;
    if ($("#prayT")) $("#prayT").placeholder = L.phThanksgiving;
    if ($("#prayS")) $("#prayS").placeholder = L.phSupplication;

    if ($("#praySaveBtn")) $("#praySaveBtn").textContent = L.savePrayer;
    if ($("#prayListenBtn")) $("#prayListenBtn").textContent = L.listenStarters;
    if ($("#prayStopBtn")) $("#prayStopBtn").textContent = L.stop;
  }

  // -----------------------------
  // Devotional / Prayer fetch & render
  // -----------------------------
  function safeParseJsonFromServer(payload) {
    const raw = payload?.json;
    if (!raw || typeof raw !== "string") return null;
    try {
      return JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          return JSON.parse(m[0]);
        } catch {}
      }
      return null;
    }
  }

  // NOTE:
  // Your backend currently returns:
  // { "scripture": "Book 1:1-3 — verse text", "brief_explanation": "..." }
  // We will DISPLAY it cleanly and encourage 1–5 verses.
  async function generateDevotional() {
    const lang = getUiLang();
    const devLangSel = $("#devLang");
    if (devLangSel) devLangSel.value = lang;

    $("#devOut").innerHTML = `<div class="muted">${escapeHtml(t().generate)}...</div>`;
    try {
      const data = await api("/devotional", { method: "POST", body: { lang } });
      const j = safeParseJsonFromServer(data);
      if (!j) throw new Error(t().devInvalidJson);

      const scripture = String(j.scripture || "").trim();
      const explanation = String(j.brief_explanation || "").trim();

      // Save for listen/save
      $("#devOut").dataset.scripture = scripture;
      $("#devOut").dataset.explanation = explanation;

      // Render: scripture + explanation only (Alyana part)
      // If scripture already includes verse text + reference, we show it as-is.
      $("#devOut").innerHTML = `
        <div style="font-weight:900; margin-bottom:8px;">${escapeHtml(scripture)}</div>
        <div style="white-space:pre-wrap; line-height:1.45;">${escapeHtml(explanation)}</div>
        <div class="small" style="margin-top:10px; opacity:.9;">
          ${escapeHtml(
            lang === "es"
              ? "Nota: Mantén la Escritura breve (1–5 versículos) y con la referencia clara."
              : "Note: Keep scripture brief (1–5 verses) and cite the reference clearly."
          )}
        </div>
      `;
    } catch (e) {
      $("#devOut").innerHTML = `<div class="danger">Devotional error: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function generatePrayerStarters() {
    const lang = getUiLang();
    const prayLangSel = $("#prayLang");
    if (prayLangSel) prayLangSel.value = lang;

    $("#prayOut").innerHTML = `<div class="muted">${escapeHtml(t().generate)}...</div>`;
    try {
      const data = await api("/daily_prayer", { method: "POST", body: { lang } });
      const j = safeParseJsonFromServer(data);
      if (!j) throw new Error(t().prayInvalidJson);

      const ad = String(j.example_adoration || "").trim();
      const co = String(j.example_confession || "").trim();
      const th = String(j.example_thanksgiving || "").trim();
      const su = String(j.example_supplication || "").trim();

      $("#prayOut").dataset.adoration = ad;
      $("#prayOut").dataset.confession = co;
      $("#prayOut").dataset.thanksgiving = th;
      $("#prayOut").dataset.supplication = su;

      // Render headings in the same selected language (no mixing)
      const langHead = getUiLang();
      const heads =
        langHead === "es"
          ? { a: "Adoración", c: "Confesión", t: "Gratitud", s: "Súplica" }
          : { a: "Adoration", c: "Confession", t: "Thanksgiving", s: "Supplication" };

      $("#prayOut").innerHTML = `
        <div style="display:grid; gap:10px;">
          <div><b>${escapeHtml(heads.a)}:</b> ${escapeHtml(ad)}</div>
          <div><b>${escapeHtml(heads.c)}:</b> ${escapeHtml(co)}</div>
          <div><b>${escapeHtml(heads.t)}:</b> ${escapeHtml(th)}</div>
          <div><b>${escapeHtml(heads.s)}:</b> ${escapeHtml(su)}</div>
        </div>
      `;
    } catch (e) {
      $("#prayOut").innerHTML = `<div class="danger">Prayer error: ${escapeHtml(e.message)}</div>`;
    }
  }

  // -----------------------------
  // Account + billing buttons
  // -----------------------------
  function setAccountPill() {
    const pill = $("#accountPill");
    if (!pill) return;

    const ui = getUiLang();
    if (!account.logged_in) {
      pill.textContent = ui === "es" ? "Cuenta: no has iniciado sesión" : "Account: not logged in";
      pill.style.borderColor = "rgba(255,255,255,.12)";
      return;
    }
    if (account.active) {
      pill.textContent =
        ui === "es"
          ? `Cuenta: activa (${account.email})`
          : `Account: active (${account.email})`;
      pill.style.borderColor = "rgba(40,209,124,.34)";
      return;
    }
    pill.textContent =
      ui === "es"
        ? `Cuenta: inactiva (${account.email})`
        : `Account: inactive (${account.email})`;
    pill.style.borderColor = "rgba(255,77,109,.34)";
  }

  async function refreshMe() {
    try {
      const data = await api("/me");
      account = { logged_in: !!data.logged_in, email: data.email || null, active: !!data.active };
    } catch {
      account = { logged_in: false, email: null, active: false };
    } finally {
      setAccountPill();
    }
  }

  async function openBillingPortal() {
    try {
      const data = await api("/stripe/create-portal-session", { method: "POST", body: {} });
      if (data && data.url) window.location.href = data.url;
      else alert("Billing portal unavailable.");
    } catch (e) {
      alert(`Billing error: ${e.message}`);
    }
  }

  async function openSupportCheckout() {
    try {
      const data = await api("/stripe/create-checkout-session", { method: "POST", body: {} });
      if (data && data.url) window.location.href = data.url;
      else alert("Checkout unavailable.");
    } catch (e) {
      alert(`Support error: ${e.message}`);
    }
  }

  // -----------------------------
  // Events
  // -----------------------------
  function bindEvents() {
    $$(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

    $("#sendBtn")?.addEventListener("click", sendChat);
    $("#chatInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
    $("#newBtn")?.addEventListener("click", newChat);
    $("#saveBtn")?.addEventListener("click", saveChat);

    $("#bookSelect")?.addEventListener("change", loadChapters);
    $("#loadChapterBtn")?.addEventListener("click", loadFullChapter);
    $("#loadPassageBtn")?.addEventListener("click", loadPassage);

    $("#devBtn")?.addEventListener("click", generateDevotional);
    $("#prayBtn")?.addEventListener("click", generatePrayerStarters);

    $("#btnBilling")?.addEventListener("click", openBillingPortal);
    $("#btnSupport")?.addEventListener("click", openSupportCheckout);
  }

  // -----------------------------
  // Init TTS
  // -----------------------------
  function initTts() {
    if (!("speechSynthesis" in window)) return;

    const boot = () => {
      TTS.loadVoices();
      restoreTtsSettings();
      if (!TTS.selectedVoiceName) TTS.autoPick();
      renderVoiceDropdown();
      persistTtsSettings();
    };

    boot();
    speechSynthesis.onvoiceschanged = () => {
      TTS.loadVoices();
      if (TTS.selectedVoiceName && !TTS.voices.find((v) => v.name === TTS.selectedVoiceName)) {
        TTS.autoPick();
      }
      renderVoiceDropdown();
      persistTtsSettings();
    };
  }

  // -----------------------------
  // Startup
  // -----------------------------
  async function init() {
    applyOldThemeColors();

    // Init UI lang (default to English if none saved)
    const savedLang = getUiLang();
    if (!localStorage.getItem(LS.uiLang)) setUiLang(savedLang);

    // Sync backend language dropdowns to UI language
    if ($("#devLang")) $("#devLang").value = getUiLang();
    if ($("#prayLang")) $("#prayLang").value = getUiLang();

    injectVoiceControls();
    injectBibleVersionUI();
    injectGuidedDevotionalUI();
    injectGuidedPrayerUI();

    restoreCurrentChat();
    renderMessages();
    renderSavedChats();
    refreshStreakPills();

    bindEvents();
    initTts();

    applyUiLanguageToStaticText();
    await refreshMe();
    await loadBooks();
    setTab("chat");
  }

  init();
})();









