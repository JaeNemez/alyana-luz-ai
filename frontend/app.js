/* frontend/app.js
   Alyana Luz • Bible AI
   - Global UI language switch (English/Español) via #uiLangSelect
   - Fix mobile chat experience (no color changes; CSS handles sizing)
   - Bible Reader: adds a Read button (#readBibleBtn) + small Listen/Stop buttons
   - Spanish Bible uses your Spanish DB via version=es_rvr (or es_rvr alias)
   - TTS: picks stable voices when possible (Karen en-AU / Paulina es-MX), falls back safely
*/

(() => {
  "use strict";

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const LS = {
    uiLang: "alyana_ui_lang",
    chats: "alyana_saved_chats_v1",
    chatDraft: "alyana_chat_draft_v1",
    devotionals: "alyana_saved_devotionals_v1",
    prayers: "alyana_saved_prayers_v1",
    devStreak: "alyana_dev_streak_v1",
    prStreak: "alyana_pr_streak_v1",
    lastDevDone: "alyana_dev_done_date_v1",
    lastPrDone: "alyana_pr_done_date_v1",
  };

  const todayKey = () => new Date().toISOString().slice(0, 10);

  const safeJSONParse = (s, fallback) => {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  };

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const setHTML = (id, html) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  };

  const show = (el) => { if (el) el.style.display = ""; };
  const hide = (el) => { if (el) el.style.display = "none"; };

  const debounce = (fn, ms = 150) => {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  // -----------------------------
  // i18n (UI language)
  // -----------------------------
  const I18N = {
    en: {
      jsReady: "JS: ready",
      jsLoading: "JS: loading…",
      accountChecking: "Account: checking…",
      manageBilling: "Manage billing",
      restoreAccess: "Restore access",
      emailStripePH: "Email used for Stripe…",
      support: "❤️ Support Alyana Luz",
      supportNote:
        "Your support helps maintain and grow Alyana Luz — continually improving development and expanding this ministry.\nTo access premium features, subscribe with Support, or restore access using the email you used on Stripe.",
      chat: "Chat",
      readBible: "Read Bible",
      devotional: "Devotional",
      dailyPrayer: "Daily Prayer",
      savedChats: "Saved Chats",
      savedChatsHint: "Load or delete any saved chat.",
      noSavedChats: "No saved chats yet.",
      chatHint: "Saved chat logs are stored on this device.",
      chatLang: "Chat Language",
      voiceReady: "Voice: ready",
      voiceMissing: "Voice: missing",
      chatPH: "Ask for a prayer, verse, or ‘verses about forgiveness’…",
      send: "Send",
      listen: "Listen",
      stop: "Stop",
      new: "New",
      save: "Save",
      bibleReaderTitle: "Bible Reader (Listen)",
      bibleReaderHint: "Pick a book/chapter and verse range, or Full Chapter.",
      book: "Book",
      chapter: "Chapter",
      verseStart: "Verse (start)",
      verseEnd: "Verse (end)",
      readerLanguage: "Reader Language",
      onlyTwoVoices: "Only two voices, locked for consistency.",
      fullChapter: "Full Chapter",
      fullChapterHint: "If Full Chapter is on, verses are ignored.",
      versionLabel: "Version label (English only)",
      versionLabelHint: "For Spanish voice, we do not speak the version label.",
      read: "Read",
      bibleDbStatus: "Bible DB Status",
      checking: "Checking…",
      passage: "Passage",
      dash: "—",
      spanishVoiceNote:
        "Spanish voice reads ONLY verse text (no English labels), so it stays pure Spanish.",
      devIntro:
        "Alyana gives short starter examples. You write and save your real devotional.",
      prIntro:
        "Alyana gives a short starter example. You write and save your real prayer.",
      streak: "Streak",
      didItToday: "I did it today",
      generate: "Generate",
      generateStarters: "Generate Starters",
      themeTitle: "Theme / Title (Alyana)",
      scriptureA: "Scripture (Alyana)",
      starterCtx: "Alyana Starter — Context / Observation",
      starterRef: "Alyana Starter — Reflection / Insight",
      starterApp: "Alyana Starter — Application (Practical)",
      starterPr: "Alyana Starter — Prayer",
      nowWriteYours: "Now write yours:",
      nowWritePrayer: "Now write your real prayer:",
      notes: "Notes",
      notesOptional: "Notes / Reflection (optional)",
      requiredToSave:
        "Required to save (streak): Context + Reflection + Application + Prayer.",
      savedDevotionals: "Saved Devotionals",
      savedDevHint: "Load or delete past devotionals saved on this device.",
      noSavedDev: "No saved devotionals yet.",
      savedPrayers: "Saved Prayers",
      savedPrHint: "Load or delete past prayers saved on this device.",
      noSavedPr: "No saved prayers yet.",
      ttsNeedVoices:
        "For best results, install voices ‘Paulina (es-MX)’ and ‘Karen (en-AU)’.",
    },
    es: {
      jsReady: "JS: listo",
      jsLoading: "JS: cargando…",
      accountChecking: "Cuenta: verificando…",
      manageBilling: "Administrar pagos",
      restoreAccess: "Restaurar acceso",
      emailStripePH: "Correo usado en Stripe…",
      support: "❤️ Apoyar Alyana Luz",
      supportNote:
        "Tu apoyo ayuda a mantener y hacer crecer Alyana Luz — mejorando el desarrollo y expandiendo este ministerio.\nPara acceder a funciones premium, suscríbete con Apoyar, o restaura el acceso usando el correo que usaste en Stripe.",
      chat: "Chat",
      readBible: "Leer Biblia",
      devotional: "Devocional",
      dailyPrayer: "Oración Diaria",
      savedChats: "Chats guardados",
      savedChatsHint: "Cargar o eliminar cualquier chat guardado.",
      noSavedChats: "Todavía no hay chats guardados.",
      chatHint: "Los chats guardados se almacenan en este dispositivo.",
      chatLang: "Idioma del chat",
      voiceReady: "Voz: lista",
      voiceMissing: "Voz: no disponible",
      chatPH: "Pide una oración, un versículo o ‘versículos sobre perdón’…",
      send: "Enviar",
      listen: "Escuchar",
      stop: "Detener",
      new: "Nuevo",
      save: "Guardar",
      bibleReaderTitle: "Lectura Bíblica (Escuchar)",
      bibleReaderHint: "Elige libro/capítulo y rango de versículos, o Capítulo completo.",
      book: "Libro",
      chapter: "Capítulo",
      verseStart: "Versículo (inicio)",
      verseEnd: "Versículo (fin)",
      readerLanguage: "Idioma del lector",
      onlyTwoVoices: "Solo dos voces, bloqueadas por consistencia.",
      fullChapter: "Capítulo completo",
      fullChapterHint: "Si está activado, los versículos se ignoran.",
      versionLabel: "Etiqueta de versión (solo inglés)",
      versionLabelHint: "Con voz en español, no se pronuncia la etiqueta de versión.",
      read: "Leer",
      bibleDbStatus: "Estado de la Biblia (DB)",
      checking: "Verificando…",
      passage: "Pasaje",
      dash: "—",
      spanishVoiceNote:
        "La voz en español lee SOLO el texto del versículo (sin etiquetas en inglés).",
      devIntro:
        "Alyana da ejemplos cortos. Tú escribes y guardas tu devocional real.",
      prIntro:
        "Alyana da un ejemplo corto. Tú escribes y guardas tu oración real.",
      streak: "Racha",
      didItToday: "Lo hice hoy",
      generate: "Generar",
      generateStarters: "Generar ejemplos",
      themeTitle: "Tema / Título (Alyana)",
      scriptureA: "Escritura (Alyana)",
      starterCtx: "Ejemplo — Contexto / Observación",
      starterRef: "Ejemplo — Reflexión / Insight",
      starterApp: "Ejemplo — Aplicación (Práctica)",
      starterPr: "Ejemplo — Oración",
      nowWriteYours: "Ahora escribe el tuyo:",
      nowWritePrayer: "Ahora escribe tu oración real:",
      notes: "Notas",
      notesOptional: "Notas / Reflexión (opcional)",
      requiredToSave:
        "Requerido para guardar (racha): Contexto + Reflexión + Aplicación + Oración.",
      savedDevotionals: "Devocionales guardados",
      savedDevHint: "Cargar o eliminar devocionales guardados en este dispositivo.",
      noSavedDev: "Todavía no hay devocionales guardados.",
      savedPrayers: "Oraciones guardadas",
      savedPrHint: "Cargar o eliminar oraciones guardadas en este dispositivo.",
      noSavedPr: "Todavía no hay oraciones guardadas.",
      ttsNeedVoices:
        "Para mejores resultados, instala ‘Paulina (es-MX)’ y ‘Karen (en-AU)’.",
    },
  };

  function getUiLang() {
    const v = (localStorage.getItem(LS.uiLang) || "en").toLowerCase();
    return v === "es" ? "es" : "en";
  }

  function setUiLang(lang) {
    const v = (lang || "en").toLowerCase() === "es" ? "es" : "en";
    localStorage.setItem(LS.uiLang, v);
    applyUiLang(v);
  }

  function applyUiLang(lang) {
    const t = I18N[lang] || I18N.en;

    // JS status pill
    setText("jsStatus", t.jsReady);

    // Top CTA
    const supportBtn = document.getElementById("supportBtn");
    if (supportBtn) supportBtn.textContent = t.support;

    const manageBillingBtn = document.getElementById("manageBillingBtn");
    if (manageBillingBtn) manageBillingBtn.textContent = t.manageBilling;

    const loginBtn = document.getElementById("loginBtn");
    if (loginBtn) loginBtn.textContent = t.restoreAccess;

    const loginEmail = document.getElementById("loginEmail");
    if (loginEmail) loginEmail.placeholder = t.emailStripePH;

    const supportNote = document.querySelector(".support-note");
    if (supportNote) supportNote.textContent = t.supportNote;

    // Menu buttons (by text content is fragile; use data-target)
    const menuBtns = $$(".menu-btn");
    for (const b of menuBtns) {
      const target = b.getAttribute("data-target");
      if (target === "chatSection") b.textContent = t.chat;
      if (target === "bibleSection") b.textContent = t.readBible;
      if (target === "devotionalSection") b.textContent = t.devotional;
      if (target === "prayerSection") b.textContent = t.dailyPrayer;
    }

    // Chat section labels/placeholder/buttons
    setText("chatVoicePill", t.voiceReady);
    const chatInput = document.getElementById("chatInput");
    if (chatInput) chatInput.placeholder = t.chatPH;

    const chatSendBtn = document.getElementById("chatSendBtn");
    if (chatSendBtn) chatSendBtn.textContent = t.send;

    const chatListenBtn = document.getElementById("chatListenBtn");
    if (chatListenBtn) chatListenBtn.textContent = t.listen;

    const chatStopBtn = document.getElementById("chatStopBtn");
    if (chatStopBtn) chatStopBtn.textContent = t.stop;

    const chatNewBtn = document.getElementById("chatNewBtn");
    if (chatNewBtn) chatNewBtn.textContent = t.new;

    const chatSaveBtn = document.getElementById("chatSaveBtn");
    if (chatSaveBtn) chatSaveBtn.textContent = t.save;

    // Saved chats panel
    const savedChatsTitle = document.querySelector("#chatSection .card:last-child h4");
    if (savedChatsTitle) savedChatsTitle.textContent = t.savedChats;
    const savedChatsMuted = document.querySelector("#chatSection .card:last-child .muted");
    if (savedChatsMuted) savedChatsMuted.textContent = t.savedChatsHint;

    // Bible section buttons
    const readBibleBtn = document.getElementById("readBibleBtn");
    if (readBibleBtn) readBibleBtn.textContent = t.read;

    const listenBibleBtn = document.getElementById("listenBible");
    if (listenBibleBtn) listenBibleBtn.textContent = t.listen;

    const stopBibleBtn = document.getElementById("stopBible");
    if (stopBibleBtn) stopBibleBtn.textContent = t.stop;

    // Bible status headings
    const dbStatusH4 = document.querySelector("#bibleSection h4");
    if (dbStatusH4) dbStatusH4.textContent = t.bibleDbStatus;

    const passageCardH4 = document.querySelectorAll("#bibleSection h4")[1];
    if (passageCardH4) passageCardH4.textContent = t.passage;

    // Devotional section headings
    const devIntro = document.getElementById("devIntro");
    if (devIntro) devIntro.textContent = t.devIntro;

    const devStreakBtn = document.getElementById("devStreakBtn");
    if (devStreakBtn) devStreakBtn.textContent = t.didItToday;

    const devotionalBtn = document.getElementById("devotionalBtn");
    if (devotionalBtn) devotionalBtn.textContent = t.generate;

    const devSaveBtn = document.getElementById("devSaveBtn");
    if (devSaveBtn) devSaveBtn.textContent = t.save;

    setText("devReqNote", t.requiredToSave);

    // Prayer section headings
    const prIntro = document.getElementById("prIntro");
    if (prIntro) prIntro.textContent = t.prIntro;

    const prStreakBtn = document.getElementById("prStreakBtn");
    if (prStreakBtn) prStreakBtn.textContent = t.didItToday;

    const prayerBtn = document.getElementById("prayerBtn");
    if (prayerBtn) prayerBtn.textContent = t.generateStarters;

    const prSaveBtn = document.getElementById("prSaveBtn");
    if (prSaveBtn) prSaveBtn.textContent = t.save;

    // Pills (streak)
    updateStreakPills();

    // Saved lists empty text refresh
    renderSavedChats();
    renderSavedDevotionals();
    renderSavedPrayers();
  }

  // -----------------------------
  // Navigation (sections)
  // -----------------------------
  function initMenu() {
    const buttons = $$(".menu-btn");
    for (const btn of buttons) {
      btn.addEventListener("click", () => {
        for (const b of buttons) b.classList.remove("active");
        btn.classList.add("active");

        const target = btn.getAttribute("data-target");
        $$(".app-section").forEach((sec) => sec.classList.remove("active"));
        const sec = document.getElementById(target);
        if (sec) sec.classList.add("active");
      });
    }
  }

  // -----------------------------
  // TTS (two-voice locked)
  // -----------------------------
  let voices = [];
  let voicesReady = false;

  function loadVoices() {
    voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    voicesReady = Array.isArray(voices) && voices.length > 0;
    updateVoicePills();
  }

  function bestVoiceFor(lang) {
    if (!voicesReady) return null;
    const want = (lang || "en").toLowerCase();

    // Prefer exact names if available
    if (want === "es") {
      const v1 = voices.find((v) => (v.name || "").toLowerCase().includes("paulina"));
      if (v1) return v1;
      const v2 = voices.find((v) => (v.lang || "").toLowerCase().startsWith("es"));
      if (v2) return v2;
      return voices[0] || null;
    }

    // English: prefer "Karen"
    const e1 = voices.find((v) => (v.name || "").toLowerCase().includes("karen"));
    if (e1) return e1;
    const e2 = voices.find((v) => (v.lang || "").toLowerCase().startsWith("en"));
    if (e2) return e2;
    return voices[0] || null;
  }

  function speakText(text, lang = "en") {
    if (!window.speechSynthesis) return false;
    if (!text || !text.trim()) return false;

    speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    const v = bestVoiceFor(lang);

    if (v) {
      u.voice = v;
      u.lang = v.lang || (lang === "es" ? "es-MX" : "en-US");
    } else {
      u.lang = lang === "es" ? "es-MX" : "en-US";
    }

    // Slightly slower for clarity
    u.rate = 1.0;
    u.pitch = 1.0;

    speechSynthesis.speak(u);
    return true;
  }

  function stopSpeaking() {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
  }

  function updateVoicePills() {
    const uiLang = getUiLang();
    const t = I18N[uiLang];

    const ok = voicesReady && !!bestVoiceFor("en") && !!bestVoiceFor("es");
    const pillText = voicesReady ? t.voiceReady : t.voiceMissing;

    setText("ttsStatus", pillText);
    setText("chatVoicePill", pillText);

    // Optional hint: show missing voice guidance as a system message once
    if (!ok) {
      // We do not force spam; only show if chat exists and is empty
      const chatEl = document.getElementById("chat");
      if (chatEl && chatEl.children.length === 0) {
        addSystemMessage(t.ttsNeedVoices);
      }
    }
  }

  // Keep voices updated across browsers
  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = () => loadVoices();
  }

  // -----------------------------
  // Chat
  // -----------------------------
  function addBubble(text, who = "bot") {
    const chat = document.getElementById("chat");
    if (!chat) return;

    const row = document.createElement("div");
    row.className = `bubble-row ${who}`;

    const bubble = document.createElement("div");
    bubble.className = `bubble ${who}`;
    bubble.textContent = text;

    row.appendChild(bubble);
    chat.appendChild(row);

    // Scroll to bottom
    chat.scrollTop = chat.scrollHeight;
  }

  function addSystemMessage(text) {
    addBubble(text, "system");
  }

  function getSavedChats() {
    return safeJSONParse(localStorage.getItem(LS.chats) || "[]", []);
  }

  function setSavedChats(list) {
    localStorage.setItem(LS.chats, JSON.stringify(list || []));
  }

  function renderSavedChats() {
    const uiLang = getUiLang();
    const t = I18N[uiLang];

    const box = document.getElementById("chatSavedList");
    if (!box) return;

    const chats = getSavedChats();
    box.innerHTML = "";

    if (!chats.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = t.noSavedChats;
      box.appendChild(small);
      return;
    }

    chats
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .forEach((c) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        const when = new Date(c.ts || Date.now()).toLocaleString();
        btn.textContent = `${c.title || "Chat"} • ${when}`;
        btn.addEventListener("click", () => loadChat(c));
        box.appendChild(btn);

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = uiLang === "es" ? "Eliminar" : "Delete";
        del.addEventListener("click", () => {
          const next = getSavedChats().filter((x) => x.id !== c.id);
          setSavedChats(next);
          renderSavedChats();
        });
        box.appendChild(del);
      });
  }

  function serializeChat() {
    const chat = document.getElementById("chat");
    if (!chat) return [];

    const items = [];
    for (const row of chat.children) {
      const bubble = row.querySelector(".bubble");
      if (!bubble) continue;
      const who =
        row.classList.contains("user") ? "user" :
        row.classList.contains("bot") ? "bot" : "system";
      items.push({ who, text: bubble.textContent || "" });
    }
    return items;
  }

  function clearChat() {
    const chat = document.getElementById("chat");
    if (chat) chat.innerHTML = "";
  }

  function loadChat(chatObj) {
    clearChat();
    (chatObj.items || []).forEach((it) => addBubble(it.text, it.who));
  }

  async function sendChatToBackend(message) {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error("Chat request failed");
    return res.json();
  }

  function initChat() {
    const form = document.getElementById("chatForm");
    const input = document.getElementById("chatInput");
    const listenBtn = document.getElementById("chatListenBtn");
    const stopBtn = document.getElementById("chatStopBtn");
    const newBtn = document.getElementById("chatNewBtn");
    const saveBtn = document.getElementById("chatSaveBtn");

    if (!form || !input) return;

    // Restore draft
    const draft = localStorage.getItem(LS.chatDraft) || "";
    if (draft) input.value = draft;

    input.addEventListener("input", debounce(() => {
      localStorage.setItem(LS.chatDraft, input.value || "");
    }, 200));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = (input.value || "").trim();
      if (!msg) return;

      addBubble(msg, "user");
      input.value = "";
      localStorage.setItem(LS.chatDraft, "");

      try {
        const data = await sendChatToBackend(msg);
        const reply = (data && data.reply) ? String(data.reply) : "(no reply)";
        addBubble(reply, "bot");
      } catch (err) {
        addSystemMessage(getUiLang() === "es" ? "Error enviando mensaje." : "Error sending message.");
      }
    });

    if (listenBtn) {
      listenBtn.addEventListener("click", () => {
        // Listen to the last bot message
        const chat = document.getElementById("chat");
        if (!chat) return;
        const bubbles = Array.from(chat.querySelectorAll(".bubble.bot"));
        const last = bubbles[bubbles.length - 1];
        if (!last) return;

        const sel = document.getElementById("chatLangSelect");
        const mode = sel ? (sel.value || "auto") : "auto";
        let lang = "en";
        if (mode === "es") lang = "es";
        else if (mode === "en") lang = "en";
        else {
          // auto: detect basic Spanish chars/words
          const txt = (last.textContent || "").toLowerCase();
          lang = /[áéíóúñ¡¿]|(\b(el|la|de|que|para|con|por|dios)\b)/.test(txt) ? "es" : "en";
        }

        speakText(last.textContent || "", lang);
      });
    }

    if (stopBtn) stopBtn.addEventListener("click", () => stopSpeaking());

    if (newBtn) {
      newBtn.addEventListener("click", () => {
        clearChat();
        addSystemMessage(getUiLang() === "es" ? "Nuevo chat." : "New chat.");
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const items = serializeChat();
        if (!items.length) return;

        const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
        const title = items.find((x) => x.who === "user")?.text?.slice(0, 40) || "Chat";
        const obj = { id, ts: Date.now(), title, items };

        const chats = getSavedChats();
        chats.push(obj);
        setSavedChats(chats);
        renderSavedChats();
        addSystemMessage(getUiLang() === "es" ? "Chat guardado." : "Chat saved.");
      });
    }

    renderSavedChats();
  }

  // -----------------------------
  // Bible API
  // -----------------------------
  async function apiGetJSON(url) {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${txt}`);
    }
    return res.json();
  }

  function bibleVersionForReadingVoice(readingVoiceValue) {
    // readingVoice is either "en" or "es"
    if ((readingVoiceValue || "en").toLowerCase() === "es") return "es_rvr";
    return "en_default";
  }

  function setBibleDbStatus(text) {
    const el = document.getElementById("bibleDbStatus");
    if (el) el.textContent = text;
  }

  function setPassage(ref, text) {
    setText("passageRef", ref || I18N[getUiLang()].dash);
    const pt = document.getElementById("passageText");
    if (pt) pt.textContent = text || I18N[getUiLang()].dash;
  }

  async function loadBooks() {
    const readingVoice = document.getElementById("readingVoice");
    const version = bibleVersionForReadingVoice(readingVoice ? readingVoice.value : "en");

    const data = await apiGetJSON(`/bible/books?version=${encodeURIComponent(version)}`);
    return data.books || [];
  }

  async function loadChapters(bookId) {
    const readingVoice = document.getElementById("readingVoice");
    const version = bibleVersionForReadingVoice(readingVoice ? readingVoice.value : "en");

    const data = await apiGetJSON(`/bible/chapters?version=${encodeURIComponent(version)}&book_id=${encodeURIComponent(bookId)}`);
    return data.chapters || [];
  }

  async function loadMaxVerses(bookId, chapter) {
    const readingVoice = document.getElementById("readingVoice");
    const version = bibleVersionForReadingVoice(readingVoice ? readingVoice.value : "en");

    const data = await apiGetJSON(`/bible/verses_max?version=${encodeURIComponent(version)}&book_id=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}`);
    return data.max_verse || 0;
  }

  async function loadText({ bookId, chapter, verseStart, verseEnd, wholeChapter }) {
    const readingVoice = document.getElementById("readingVoice");
    const version = bibleVersionForReadingVoice(readingVoice ? readingVoice.value : "en");

    const params = new URLSearchParams();
    params.set("version", version);
    params.set("book_id", String(bookId));
    params.set("chapter", String(chapter));

    if (wholeChapter) {
      params.set("whole_chapter", "true");
    } else {
      if (verseStart) params.set("verse_start", String(verseStart));
      if (verseEnd) params.set("verse_end", String(verseEnd));
    }

    return apiGetJSON(`/bible/text?${params.toString()}`);
  }

  function fillSelect(selectEl, options, placeholder = "—") {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    if (placeholder) {
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = placeholder;
      selectEl.appendChild(opt0);
    }
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = String(o.value);
      opt.textContent = String(o.label);
      selectEl.appendChild(opt);
    }
  }

  async function refreshBibleDbStatus() {
    const uiLang = getUiLang();
    const t = I18N[uiLang];

    try {
      const readingVoice = document.getElementById("readingVoice");
      const version = bibleVersionForReadingVoice(readingVoice ? readingVoice.value : "en");
      const st = await apiGetJSON(`/bible/status?version=${encodeURIComponent(version)}`);
      const label = version === "es_rvr" ? "es_rvr" : "en_default";
      setBibleDbStatus(`${uiLang === "es" ? "OK" : "OK"} • ${label} • ${uiLang === "es" ? "versículos" : "verses"}: ${st.verse_count}`);
    } catch {
      setBibleDbStatus(uiLang === "es" ? "Error al verificar la Biblia." : "Error checking Bible DB.");
    }
  }

  function initBible() {
    const bookSelect = document.getElementById("bookSelect");
    const chapterSelect = document.getElementById("chapterSelect");
    const verseStartSelect = document.getElementById("verseStartSelect");
    const verseEndSelect = document.getElementById("verseEndSelect");
    const fullChapter = document.getElementById("fullChapter");
    const readingVoice = document.getElementById("readingVoice");

    const readBtn = document.getElementById("readBibleBtn");
    const listenBtn = document.getElementById("listenBible");
    const stopBtn = document.getElementById("stopBible");

    if (!bookSelect || !chapterSelect) return;

    let lastPassage = { ref: "", textForReading: "", lang: "en" };

    const resetVerses = () => {
      fillSelect(verseStartSelect, [], "—");
      fillSelect(verseEndSelect, [], "(optional)");
    };

    const onBookChange = async () => {
      const bid = parseInt(bookSelect.value, 10);
      if (!bid) {
        fillSelect(chapterSelect, [], "—");
        resetVerses();
        return;
      }

      fillSelect(chapterSelect, [], "…");
      resetVerses();

      try {
        const chapters = await loadChapters(bid);
        fillSelect(
          chapterSelect,
          chapters.map((c) => ({ value: c, label: c })),
          "Select…"
        );
      } catch {
        fillSelect(chapterSelect, [], "—");
      }
    };

    const onChapterChange = async () => {
      const bid = parseInt(bookSelect.value, 10);
      const ch = parseInt(chapterSelect.value, 10);
      if (!bid || !ch) {
        resetVerses();
        return;
      }

      try {
        const maxV = await loadMaxVerses(bid, ch);
        const verses = Array.from({ length: maxV }, (_, i) => i + 1).map((v) => ({ value: v, label: v }));
        fillSelect(verseStartSelect, verses, "Select…");
        fillSelect(verseEndSelect, verses, "(optional)");
      } catch {
        resetVerses();
      }
    };

    const readPassage = async () => {
      const uiLang = getUiLang();
      const t = I18N[uiLang];

      const bid = parseInt(bookSelect.value, 10);
      const ch = parseInt(chapterSelect.value, 10);

      if (!bid || !ch) {
        setPassage(t.dash, uiLang === "es" ? "Selecciona libro y capítulo." : "Select book and chapter.");
        return null;
      }

      const whole = !!(fullChapter && fullChapter.checked);

      let vs = parseInt(verseStartSelect?.value || "", 10);
      let ve = parseInt(verseEndSelect?.value || "", 10);
      if (!vs) vs = null;
      if (!ve) ve = null;

      try {
        const data = await loadText({
          bookId: bid,
          chapter: ch,
          verseStart: vs,
          verseEnd: ve,
          wholeChapter: whole,
        });

        // Display
        const ref = `${data.book} ${data.chapter}`;
        setPassage(ref, data.text || "");

        // Prepare TTS text
        const rv = readingVoice ? (readingVoice.value || "en") : "en";
        const lang = rv === "es" ? "es" : "en";

        // If Spanish voice, read ONLY verse text (no English labels)
        let ttsText = data.text || "";
        if (lang === "es") {
          // Keep as-is: your DB is Spanish; we just avoid adding labels
          ttsText = (data.verses || [])
            .map((v) => `${v.text}`)
            .join("\n");
        } else {
          // English: optionally speak version label first
          const versionSelect = document.getElementById("versionSelect");
          const versionLabel = versionSelect ? (versionSelect.value || "KJV") : "KJV";
          ttsText = `${versionLabel}. ${ref}.\n\n${data.text || ""}`;
        }

        lastPassage = { ref, textForReading: ttsText, lang };
        return lastPassage;
      } catch (e) {
        setPassage(t.dash, uiLang === "es" ? "No se encontró el pasaje." : "Passage not found.");
        return null;
      }
    };

    // Read button (fetch + display only)
    if (readBtn) readBtn.addEventListener("click", () => { readPassage(); });

    // Listen button (speak last read; if none, read then speak)
    if (listenBtn) {
      listenBtn.addEventListener("click", async () => {
        const p = lastPassage.textForReading ? lastPassage : await readPassage();
        if (!p || !p.textForReading) return;
        speakText(p.textForReading, p.lang);
      });
    }

    if (stopBtn) stopBtn.addEventListener("click", () => stopSpeaking());

    if (bookSelect) bookSelect.addEventListener("change", onBookChange);
    if (chapterSelect) chapterSelect.addEventListener("change", onChapterChange);

    if (readingVoice) {
      readingVoice.addEventListener("change", async () => {
        // Reload books for chosen DB/language
        try {
          fillSelect(bookSelect, [], "Loading…");
          fillSelect(chapterSelect, [], "—");
          resetVerses();
          setPassage(I18N[getUiLang()].dash, I18N[getUiLang()].dash);

          const books = await loadBooks();
          fillSelect(
            bookSelect,
            books.map((b) => ({ value: b.id, label: b.name })),
            ""
          );
          await refreshBibleDbStatus();
        } catch {
          // ignore
        }
      });
    }

    if (fullChapter) {
      fullChapter.addEventListener("change", () => {
        const whole = !!fullChapter.checked;
        if (verseStartSelect) verseStartSelect.disabled = whole;
        if (verseEndSelect) verseEndSelect.disabled = whole;
      });
    }

    // Initial load
    (async () => {
      try {
        fillSelect(bookSelect, [], "Loading…");
        const books = await loadBooks();
        fillSelect(
          bookSelect,
          books.map((b) => ({ value: b.id, label: b.name })),
          ""
        );
        await refreshBibleDbStatus();
        setPassage(I18N[getUiLang()].dash, I18N[getUiLang()].dash);
      } catch {
        // ignore
      }
    })();
  }

  // -----------------------------
  // Devotional / Prayer (local save + streak)
  // -----------------------------
  function getSavedDevotionals() {
    return safeJSONParse(localStorage.getItem(LS.devotionals) || "[]", []);
  }
  function setSavedDevotionals(list) {
    localStorage.setItem(LS.devotionals, JSON.stringify(list || []));
  }
  function getSavedPrayers() {
    return safeJSONParse(localStorage.getItem(LS.prayers) || "[]", []);
  }
  function setSavedPrayers(list) {
    localStorage.setItem(LS.prayers, JSON.stringify(list || []));
  }

  function updateStreakPills() {
    const uiLang = getUiLang();
    const t = I18N[uiLang];

    const devStreak = parseInt(localStorage.getItem(LS.devStreak) || "0", 10) || 0;
    const prStreak = parseInt(localStorage.getItem(LS.prStreak) || "0", 10) || 0;

    const devPill = document.getElementById("devStreakPill");
    if (devPill) devPill.textContent = `${t.streak}: ${devStreak}`;

    const prPill = document.getElementById("prStreakPill");
    if (prPill) prPill.textContent = `${t.streak}: ${prStreak}`;
  }

  function bumpStreak(which) {
    const today = todayKey();
    const uiLang = getUiLang();
    const doneKey = which === "dev" ? LS.lastDevDone : LS.lastPrDone;
    const streakKey = which === "dev" ? LS.devStreak : LS.prStreak;

    const lastDone = localStorage.getItem(doneKey) || "";
    if (lastDone === today) {
      addSystemMessage(uiLang === "es" ? "Ya marcado hoy." : "Already marked today.");
      return;
    }

    const cur = parseInt(localStorage.getItem(streakKey) || "0", 10) || 0;
    localStorage.setItem(streakKey, String(cur + 1));
    localStorage.setItem(doneKey, today);
    updateStreakPills();
  }

  function renderSavedDevotionals() {
    const uiLang = getUiLang();
    const t = I18N[uiLang];

    const box = document.getElementById("devSavedList");
    if (!box) return;

    const items = getSavedDevotionals();
    box.innerHTML = "";

    if (!items.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = t.noSavedDev;
      box.appendChild(small);
      return;
    }

    items
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .forEach((it) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        const when = new Date(it.ts || Date.now()).toLocaleString();
        btn.textContent = `${it.title || (uiLang === "es" ? "Devocional" : "Devotional")} • ${when}`;
        btn.addEventListener("click", () => {
          setText("devTheme", it.theme || "—");
          setText("devScriptureRef", it.scriptureRef || "—");
          setText("devScriptureText", it.scriptureText || "—");
          setText("devStarterContext", it.starterContext || "—");
          setText("devStarterReflection", it.starterReflection || "—");
          setText("devStarterApplication", it.starterApplication || "—");
          setText("devStarterPrayer", it.starterPrayer || "—");
          const ctx = document.getElementById("devMyContext");
          const ref = document.getElementById("devMyReflection");
          const app = document.getElementById("devMyApplication");
          const pr = document.getElementById("devMyPrayer");
          const notes = document.getElementById("devMyNotes");
          if (ctx) ctx.value = it.myContext || "";
          if (ref) ref.value = it.myReflection || "";
          if (app) app.value = it.myApplication || "";
          if (pr) pr.value = it.myPrayer || "";
          if (notes) notes.value = it.myNotes || "";
        });
        box.appendChild(btn);

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = uiLang === "es" ? "Eliminar" : "Delete";
        del.addEventListener("click", () => {
          const next = getSavedDevotionals().filter((x) => x.id !== it.id);
          setSavedDevotionals(next);
          renderSavedDevotionals();
        });
        box.appendChild(del);
      });
  }

  function renderSavedPrayers() {
    const uiLang = getUiLang();
    const t = I18N[uiLang];

    const box = document.getElementById("prSavedList");
    if (!box) return;

    const items = getSavedPrayers();
    box.innerHTML = "";

    if (!items.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = t.noSavedPr;
      box.appendChild(small);
      return;
    }

    items
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .forEach((it) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        const when = new Date(it.ts || Date.now()).toLocaleString();
        btn.textContent = `${it.title || (uiLang === "es" ? "Oración" : "Prayer")} • ${when}`;
        btn.addEventListener("click", () => {
          setText("pA", it.starterA || "—");
          setText("pC", it.starterC || "—");
          setText("pT", it.starterT || "—");
          setText("pS", it.starterS || "—");
          const a = document.getElementById("myAdoration");
          const c = document.getElementById("myConfession");
          const tt = document.getElementById("myThanksgiving");
          const s = document.getElementById("mySupplication");
          const n = document.getElementById("prayerNotes");
          if (a) a.value = it.myA || "";
          if (c) c.value = it.myC || "";
          if (tt) tt.value = it.myT || "";
          if (s) s.value = it.myS || "";
          if (n) n.value = it.notes || "";
        });
        box.appendChild(btn);

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = getUiLang() === "es" ? "Eliminar" : "Delete";
        del.addEventListener("click", () => {
          const next = getSavedPrayers().filter((x) => x.id !== it.id);
          setSavedPrayers(next);
          renderSavedPrayers();
        });
        box.appendChild(del);
      });
  }

  async function generateDevotionalStarters() {
    const lang = getUiLang();
    // You can later wire /devotional to Gemini and return structured fields.
    // For now: lightweight starters in the selected UI language.
    if (lang === "es") {
      return {
        theme: "Caminar en paz",
        scriptureRef: "Filipenses 4:6–7",
        scriptureText:
          "Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias.\nY la paz de Dios… guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.",
        starterContext:
          "Pablo anima a los creyentes a llevar sus cargas a Dios en oración, en lugar de vivir dominados por la ansiedad.",
        starterReflection:
          "Dios no solo escucha; también guarda el corazón con Su paz. La oración es el camino para cambiar preocupación por confianza.",
        starterApplication:
          "Hoy, escribe 1 preocupación específica y entrégasela a Dios en oración. Luego agradece por 2 cosas concretas.",
        starterPrayer:
          "Señor, traigo mis ansiedades ante Ti. Llena mi corazón con Tu paz y enséñame a confiar en Tu cuidado. Amén.",
      };
    }

    return {
      theme: "Walking in Peace",
      scriptureRef: "Philippians 4:6–7",
      scriptureText:
        "Be anxious for nothing; but in everything by prayer and supplication with thanksgiving let your requests be made known unto God.\nAnd the peace of God… shall keep your hearts and minds through Christ Jesus.",
      starterContext:
        "Paul urges believers to bring their burdens to God in prayer rather than living ruled by anxiety.",
      starterReflection:
        "God doesn’t only hear—He guards the heart with His peace. Prayer is the pathway from worry to trust.",
      starterApplication:
        "Today, write down 1 specific worry and give it to God in prayer. Then thank Him for 2 concrete blessings.",
      starterPrayer:
        "Lord, I bring my anxieties to You. Fill my heart with Your peace and teach me to trust Your care. Amen.",
    };
  }

  function initDevotional() {
    const btn = document.getElementById("devotionalBtn");
    const saveBtn = document.getElementById("devSaveBtn");
    const streakBtn = document.getElementById("devStreakBtn");

    if (streakBtn) streakBtn.addEventListener("click", () => bumpStreak("dev"));

    if (btn) {
      btn.addEventListener("click", async () => {
        const s = await generateDevotionalStarters();
        setText("devTheme", s.theme);
        setText("devScriptureRef", s.scriptureRef);
        setText("devScriptureText", s.scriptureText);
        setText("devStarterContext", s.starterContext);
        setText("devStarterReflection", s.starterReflection);
        setText("devStarterApplication", s.starterApplication);
        setText("devStarterPrayer", s.starterPrayer);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const uiLang = getUiLang();
        const ctx = ($("#devMyContext")?.value || "").trim();
        const ref = ($("#devMyReflection")?.value || "").trim();
        const app = ($("#devMyApplication")?.value || "").trim();
        const pr = ($("#devMyPrayer")?.value || "").trim();
        const notes = ($("#devMyNotes")?.value || "").trim();

        if (!ctx || !ref || !app || !pr) {
          addSystemMessage(uiLang === "es"
            ? "Completa Contexto, Reflexión, Aplicación y Oración antes de guardar."
            : "Fill Context, Reflection, Application, and Prayer before saving.");
          return;
        }

        const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
        const title = (document.getElementById("devTheme")?.textContent || "").slice(0, 50) || "Devotional";

        const obj = {
          id,
          ts: Date.now(),
          title,
          theme: document.getElementById("devTheme")?.textContent || "",
          scriptureRef: document.getElementById("devScriptureRef")?.textContent || "",
          scriptureText: document.getElementById("devScriptureText")?.textContent || "",
          starterContext: document.getElementById("devStarterContext")?.textContent || "",
          starterReflection: document.getElementById("devStarterReflection")?.textContent || "",
          starterApplication: document.getElementById("devStarterApplication")?.textContent || "",
          starterPrayer: document.getElementById("devStarterPrayer")?.textContent || "",
          myContext: ctx,
          myReflection: ref,
          myApplication: app,
          myPrayer: pr,
          myNotes: notes,
        };

        const items = getSavedDevotionals();
        items.push(obj);
        setSavedDevotionals(items);
        renderSavedDevotionals();
        bumpStreak("dev");
        addSystemMessage(uiLang === "es" ? "Devocional guardado." : "Devotional saved.");
      });
    }

    renderSavedDevotionals();
  }

  async function generatePrayerStarters() {
    const lang = getUiLang();
    if (lang === "es") {
      return {
        A: "Señor, Tú eres santo, fiel y cercano. Te alabo por Tu amor y misericordia.",
        C: "Padre, perdóname por donde he fallado. Limpia mi corazón y renueva mi mente.",
        T: "Gracias por Tu provisión, por mi familia, y por Tu paciencia conmigo.",
        S: "Te pido sabiduría hoy. Ayúdame a caminar en obediencia y a amar como Cristo.",
      };
    }
    return {
      A: "Lord, You are holy, faithful, and near. I praise You for Your love and mercy.",
      C: "Father, forgive me where I have fallen short. Cleanse my heart and renew my mind.",
      T: "Thank You for Your provision, my family, and Your patience with me.",
      S: "I ask for wisdom today. Help me walk in obedience and love like Christ.",
    };
  }

  function initPrayer() {
    const btn = document.getElementById("prayerBtn");
    const saveBtn = document.getElementById("prSaveBtn");
    const streakBtn = document.getElementById("prStreakBtn");

    if (streakBtn) streakBtn.addEventListener("click", () => bumpStreak("pr"));

    if (btn) {
      btn.addEventListener("click", async () => {
        const s = await generatePrayerStarters();
        setText("pA", s.A);
        setText("pC", s.C);
        setText("pT", s.T);
        setText("pS", s.S);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const uiLang = getUiLang();
        const a = ($("#myAdoration")?.value || "").trim();
        const c = ($("#myConfession")?.value || "").trim();
        const t = ($("#myThanksgiving")?.value || "").trim();
        const s = ($("#mySupplication")?.value || "").trim();
        const n = ($("#prayerNotes")?.value || "").trim();

        if (!a || !c || !t || !s) {
          addSystemMessage(uiLang === "es"
            ? "Completa Adoración, Confesión, Gratitud y Súplica antes de guardar."
            : "Fill Adoration, Confession, Thanksgiving, and Supplication before saving.");
          return;
        }

        const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now());
        const title = uiLang === "es" ? "Oración diaria" : "Daily prayer";

        const obj = {
          id,
          ts: Date.now(),
          title,
          starterA: document.getElementById("pA")?.textContent || "",
          starterC: document.getElementById("pC")?.textContent || "",
          starterT: document.getElementById("pT")?.textContent || "",
          starterS: document.getElementById("pS")?.textContent || "",
          myA: a,
          myC: c,
          myT: t,
          myS: s,
          notes: n,
        };

        const items = getSavedPrayers();
        items.push(obj);
        setSavedPrayers(items);
        renderSavedPrayers();
        bumpStreak("pr");
        addSystemMessage(uiLang === "es" ? "Oración guardada." : "Prayer saved.");
      });
    }

    renderSavedPrayers();
  }

  // -----------------------------
  // Auth/Billing stubs (safe)
  // -----------------------------
  function initAuthStubs() {
    const uiLang = getUiLang();
    const t = I18N[uiLang];

    const authPill = document.getElementById("authPill");
    const manageBtn = document.getElementById("manageBillingBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (authPill) authPill.textContent = t.accountChecking;

    // Stub: keep disabled unless you wire Stripe endpoints
    if (manageBtn) manageBtn.disabled = true;
    if (logoutBtn) hide(logoutBtn);
  }

  // -----------------------------
  // Global UI Language selector
  // -----------------------------
  function initUiLangSelect() {
    const sel = document.getElementById("uiLangSelect");
    if (!sel) return;

    const current = getUiLang();
    sel.value = current;

    sel.addEventListener("change", () => {
      setUiLang(sel.value);
    });
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    // JS status initial
    const uiLang = getUiLang();
    setText("jsStatus", I18N[uiLang].jsLoading);

    initMenu();
    initUiLangSelect();
    initAuthStubs();

    initChat();
    initBible();
    initDevotional();
    initPrayer();

    // Voices
    loadVoices();
    setTimeout(loadVoices, 250);
    setTimeout(loadVoices, 900);

    // Apply language last so it updates everything
    applyUiLang(getUiLang());
    updateVoicePills();
    updateStreakPills();
    refreshBibleDbStatus().catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();


































