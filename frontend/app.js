/* frontend/app.js
   Alyana Luz • Bible AI
   FIX: Spanish “Listen” can be silent on some devices if no Spanish TTS voice is installed.
        Now: if user selects Spanish, but device has NO Spanish voice, we fall back to an English voice
        (so it still speaks the Spanish text instead of staying silent).
   Notes:
   - Does NOT change your colors (CSS is in HTML).
   - Keeps global UI language (English/Español) via #uiLangSelect if present.
   - Bible Reader uses Spanish DB when Reader Language = Spanish (version=es_rvr).
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
      chatPH: "Ask for a prayer, verse, or ‘verses about forgiveness’…",
      send: "Send",
      listen: "Listen",
      stop: "Stop",
      new: "New",
      save: "Save",
      voiceReady: "Voice: ready",
      voiceMissing: "Voice: missing",
      voiceSpanishMissing: "Spanish voice not installed",
      bibleDbStatus: "Bible DB Status",
      checking: "Checking…",
      passage: "Passage",
      dash: "—",
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
      chatPH: "Pide una oración, un versículo o ‘versículos sobre perdón’…",
      send: "Enviar",
      listen: "Escuchar",
      stop: "Detener",
      new: "Nuevo",
      save: "Guardar",
      voiceReady: "Voz: lista",
      voiceMissing: "Voz: no disponible",
      voiceSpanishMissing: "Voz en español no instalada",
      bibleDbStatus: "Estado de la Biblia (DB)",
      checking: "Verificando…",
      passage: "Pasaje",
      dash: "—",
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

    setText("jsStatus", t.jsReady);

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

    const menuBtns = $$(".menu-btn");
    for (const b of menuBtns) {
      const target = b.getAttribute("data-target");
      if (target === "chatSection") b.textContent = t.chat;
      if (target === "bibleSection") b.textContent = t.readBible;
      if (target === "devotionalSection") b.textContent = t.devotional;
      if (target === "prayerSection") b.textContent = t.dailyPrayer;
    }

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

    const savedChatsTitle = document.querySelector("#chatSection .card:last-child h4");
    if (savedChatsTitle) savedChatsTitle.textContent = t.savedChats;
    const savedChatsMuted = document.querySelector("#chatSection .card:last-child .muted");
    if (savedChatsMuted) savedChatsMuted.textContent = t.savedChatsHint;

    const listenBibleBtn = document.getElementById("listenBible");
    if (listenBibleBtn) listenBibleBtn.textContent = t.listen;

    const stopBibleBtn = document.getElementById("stopBible");
    if (stopBibleBtn) stopBibleBtn.textContent = t.stop;

    // headings (safe)
    const h4s = document.querySelectorAll("#bibleSection h4");
    if (h4s[0]) h4s[0].textContent = t.bibleDbStatus;
    if (h4s[1]) h4s[1].textContent = t.passage;

    // refresh lists + pills text
    updateVoicePills();
    renderSavedChats();
  }

  // -----------------------------
  // Navigation
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
  // TTS
  // -----------------------------
  let voices = [];
  let voicesReady = false;

  function loadVoices() {
    voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    voicesReady = Array.isArray(voices) && voices.length > 0;
    updateVoicePills();
  }

  function hasVoiceFor(lang) {
    const want = (lang || "en").toLowerCase();
    if (!voicesReady) return false;
    if (want === "es") return voices.some((v) => (v.lang || "").toLowerCase().startsWith("es"));
    return voices.some((v) => (v.lang || "").toLowerCase().startsWith("en"));
  }

  function bestVoiceFor(lang) {
    if (!voicesReady) return null;
    const want = (lang || "en").toLowerCase();

    if (want === "es") {
      const v1 = voices.find((v) => (v.name || "").toLowerCase().includes("paulina"));
      if (v1) return v1;
      const v2 = voices.find((v) => (v.lang || "").toLowerCase().startsWith("es"));
      if (v2) return v2;
      return null;
    }

    const e1 = voices.find((v) => (v.name || "").toLowerCase().includes("karen"));
    if (e1) return e1;
    const e2 = voices.find((v) => (v.lang || "").toLowerCase().startsWith("en"));
    if (e2) return e2;
    return voices[0] || null;
  }

  function speakText(text, lang = "en") {
    if (!window.speechSynthesis) return false;
    if (!text || !text.trim()) return false;

    // iOS/Safari can be picky; cancel is ok but we avoid double-cancel patterns
    speechSynthesis.cancel();

    const want = (lang || "en").toLowerCase();
    const u = new SpeechSynthesisUtterance(text);

    // Prefer a matching voice, but FIX: if Spanish voice missing, fall back to English voice
    let v = bestVoiceFor(want);

    if (!v && want === "es") {
      // fall back to English voice so it still speaks (with accent) instead of silence
      v = bestVoiceFor("en");
    }

    if (v) {
      u.voice = v;
      u.lang = v.lang || (want === "es" ? "es-MX" : "en-US");
    } else {
      // ultimate fallback: let the browser choose
      u.lang = want === "es" ? "es-MX" : "en-US";
    }

    u.rate = 1.0;
    u.pitch = 1.0;

    // Some browsers need a tiny delay after cancel
    setTimeout(() => {
      try { speechSynthesis.speak(u); } catch { /* ignore */ }
    }, 40);

    return true;
  }

  function stopSpeaking() {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
  }

  function updateVoicePills() {
    const uiLang = getUiLang();
    const t = I18N[uiLang];

    const readingVoice = document.getElementById("readingVoice");
    const readerLang = readingVoice ? (readingVoice.value || "en") : "en";

    let pillText = voicesReady ? t.voiceReady : t.voiceMissing;

    // If user is trying Spanish reader and device has no Spanish voice, show warning pill text
    if (readerLang === "es" && voicesReady && !hasVoiceFor("es")) {
      pillText = t.voiceSpanishMissing;
    }

    setText("ttsStatus", pillText);
    setText("chatVoicePill", voicesReady ? t.voiceReady : t.voiceMissing);

    // Optional: show a system hint once when chat is empty
    const chatEl = document.getElementById("chat");
    if (chatEl && chatEl.children.length === 0 && (!voicesReady || (readerLang === "es" && voicesReady && !hasVoiceFor("es")))) {
      addSystemMessage(t.ttsNeedVoices);
    }
  }

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
      } catch {
        addSystemMessage(getUiLang() === "es" ? "Error enviando mensaje." : "Error sending message.");
      }
    });

    if (listenBtn) {
      listenBtn.addEventListener("click", () => {
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
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function bibleVersionForReadingVoice(readingVoiceValue) {
    return (String(readingVoiceValue || "en").toLowerCase() === "es") ? "es_rvr" : "en_default";
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
    if (placeholder !== null) {
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
    try {
      const readingVoice = document.getElementById("readingVoice");
      const version = bibleVersionForReadingVoice(readingVoice ? readingVoice.value : "en");
      const st = await apiGetJSON(`/bible/status?version=${encodeURIComponent(version)}`);
      if (uiLang === "es") {
        setBibleDbStatus(`OK • ${version} • versículos: ${st.verse_count}`);
      } else {
        setBibleDbStatus(`OK • ${version} • verses: ${st.verse_count}`);
      }
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

        const ref = `${data.book} ${data.chapter}`;
        setPassage(ref, data.text || "");

        const rv = readingVoice ? (readingVoice.value || "en") : "en";
        const lang = rv === "es" ? "es" : "en";

        let ttsText = data.text || "";
        if (lang === "es") {
          // Spanish: verse text only
          ttsText = (data.verses || []).map((v) => `${v.text}`).join("\n");
        } else {
          const versionSelect = document.getElementById("versionSelect");
          const versionLabel = versionSelect ? (versionSelect.value || "KJV") : "KJV";
          ttsText = `${versionLabel}. ${ref}.\n\n${data.text || ""}`;
        }

        lastPassage = { ref, textForReading: ttsText, lang };
        return lastPassage;
      } catch {
        setPassage(t.dash, uiLang === "es" ? "No se encontró el pasaje." : "Passage not found.");
        return null;
      }
    };

    if (listenBtn) {
      listenBtn.addEventListener("click", async () => {
        const p = lastPassage.textForReading ? lastPassage : await readPassage();
        if (!p || !p.textForReading) return;

        // Speak (with Spanish fallback-to-English voice fix)
        speakText(p.textForReading, p.lang);
      });
    }

    if (stopBtn) stopBtn.addEventListener("click", () => stopSpeaking());

    if (bookSelect) bookSelect.addEventListener("change", onBookChange);
    if (chapterSelect) chapterSelect.addEventListener("change", onChapterChange);

    if (readingVoice) {
      readingVoice.addEventListener("change", async () => {
        updateVoicePills();
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
  // Auth/Billing stubs
  // -----------------------------
  function initAuthStubs() {
    const uiLang = getUiLang();
    const t = I18N[uiLang];

    const authPill = document.getElementById("authPill");
    const manageBtn = document.getElementById("manageBillingBtn");
    const logoutBtn = document.getElementById("logoutBtn");

    if (authPill) authPill.textContent = t.accountChecking;
    if (manageBtn) manageBtn.disabled = true;
    if (logoutBtn) hide(logoutBtn);
  }

  // -----------------------------
  // Global UI Language selector
  // -----------------------------
  function initUiLangSelect() {
    const sel = document.getElementById("uiLangSelect");
    if (!sel) return;
    sel.value = getUiLang();
    sel.addEventListener("change", () => setUiLang(sel.value));
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    const uiLang = getUiLang();
    setText("jsStatus", I18N[uiLang].jsLoading);

    initMenu();
    initUiLangSelect();
    initAuthStubs();

    initChat();
    initBible();

    loadVoices();
    setTimeout(loadVoices, 250);
    setTimeout(loadVoices, 900);

    applyUiLang(getUiLang());
    updateVoicePills();
    refreshBibleDbStatus().catch(() => {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();



































