/* Alyana Luz · Bible AI — app.js
   - Global Language + Voices (Karen en-AU, Paulina es-MX)
   - Chat listen + Bible listen (TOGGLE buttons, no Stop buttons)
   - Bible Spanish output via AI translation when lang=es
   - Devotional: new guided format + save + streak
   - Daily Prayer: ACTS sections + save + streak + listen (TOGGLE)
*/

(() => {
  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function safeJsonParse(str) {
    try {
      return JSON.parse(str);
    } catch {
      const start = str.indexOf("{");
      const end = str.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(str.slice(start, end + 1));
        } catch {}
      }
      return null;
    }
  }

  function todayKeyLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  // -----------------------------
  // i18n (UI text)
  // -----------------------------
  const I18N = {
    en: {
      tabs: { chat: "Chat", bible: "Read Bible", devotional: "Devotional", prayer: "Daily Prayer" },
      saved: { title: "Saved Chats", subtitle: "Load or delete any saved chat.", empty: "No saved chats yet." },
      chat: {
        title: "Chat",
        subtitle: "Saved chat logs are stored on this device (localStorage).",
        placeholder: "Ask for a prayer, verse, or ‘verses about forgiveness’...",
        send: "Send",
        new: "New",
        save: "Save",
        listenLast: "Listen last",
        stop: "Stop",
        langLabel: "Language",
        voiceLabel: "Voice",
        statusReady: "Ready.",
      },
      bible: {
        title: "Read Bible",
        note: "Voice & language apply to Listen in Bible + Chat.",
        loadChapter: "Load chapter",
        loadPassage: "Load passage",
        startVerse: "Start verse (optional)",
        endVerse: "End verse (optional)",
        selectPrompt: "Select a book and chapter.",
        listen: "Listen",
        stop: "Stop",
        versionLabel: "Version",
        versionDefault: "Default (local)",
        versionUiOnly: "UI only",
        translating: "Translating to Spanish…",
      },
      devotional: {
        title: "Devotional",
        generate: "Generate",
        instruction:
          "Alyana generates Scripture + a short explanation + brief examples. Then you fill in your sections and Save to build your streak.",
        scripture: "Scripture",
        explanation: "Explanation",
        streak: "Devotional streak",
        save: "Save devotional",
        fields: {
          reflection: "Reflection / Insight",
          application: "Application",
          prayer: "Prayer",
          closing: "Closing prompt / challenge",
          focus: "One-day spiritual focus",
        },
        placeholders: { writeHere: "Write here..." },
      },
      prayer: {
        title: "Daily Prayer Starters (ACTS)",
        generate: "Generate",
        instruction: "Alyana gives short ACTS starters. You write your own prayer in each section and Save to build your streak.",
        streak: "Prayer streak",
        save: "Save prayer",
        listen: "Listen starters",
        stop: "Stop",
        labels: {
          adoration: "Adoration",
          confession: "Confession",
          thanksgiving: "Thanksgiving",
          supplication: "Supplication",
          yourAdoration: "Your Adoration",
          yourConfession: "Your Confession",
          yourThanksgiving: "Your Thanksgiving",
          yourSupplication: "Your Supplication",
        },
        placeholders: {
          adoration: "Write your adoration here...",
          confession: "Write your confession here...",
          thanksgiving: "Write your thanksgiving here...",
          supplication: "Write your supplication here...",
        },
      },
      account: { checking: "Account: checking…", active: "Account: active", error: "Account: error" },
      billing: { support: "Support Alyana Luz", manage: "Manage billing" },
    },

    es: {
      tabs: { chat: "Chat", bible: "Leer Biblia", devotional: "Devocional", prayer: "Oración diaria" },
      saved: { title: "Chats guardados", subtitle: "Cargar o eliminar cualquier chat guardado.", empty: "Aún no hay chats guardados." },
      chat: {
        title: "Chat",
        subtitle: "Los chats guardados se almacenan en este dispositivo (localStorage).",
        placeholder: "Pide una oración, un verso, o ‘versos sobre el perdón’...",
        send: "Enviar",
        new: "Nuevo",
        save: "Guardar",
        listenLast: "Escuchar último",
        stop: "Detener",
        langLabel: "Idioma",
        voiceLabel: "Voz",
        statusReady: "Listo.",
      },
      bible: {
        title: "Leer Biblia",
        note: "La voz y el idioma se aplican a Escuchar en Biblia + Chat.",
        loadChapter: "Cargar capítulo",
        loadPassage: "Cargar pasaje",
        startVerse: "Verso inicial (opcional)",
        endVerse: "Verso final (opcional)",
        selectPrompt: "Selecciona un libro y capítulo.",
        listen: "Escuchar",
        stop: "Detener",
        versionLabel: "Versión",
        versionDefault: "Predeterminada (local)",
        versionUiOnly: "Solo UI",
        translating: "Traduciendo al español…",
      },
      devotional: {
        title: "Devocional",
        generate: "Generar",
        instruction:
          "Alyana genera Escritura + una explicación breve + ejemplos cortos. Luego completas tus secciones y Guardas para crear tu racha.",
        scripture: "Escritura",
        explanation: "Explicación",
        streak: "Racha de devocional",
        save: "Guardar devocional",
        fields: {
          reflection: "Reflexión / Insight",
          application: "Aplicación",
          prayer: "Oración",
          closing: "Cierre / desafío",
          focus: "Enfoque espiritual de un día",
        },
        placeholders: { writeHere: "Escribe aquí..." },
      },
      prayer: {
        title: "Guía de oración diaria (ACTS)",
        generate: "Generar",
        instruction: "Alyana da ejemplos cortos ACTS. Tú escribes tu oración en cada sección y Guardas para crear tu racha.",
        streak: "Racha de oración",
        save: "Guardar oración",
        listen: "Escuchar ejemplos",
        stop: "Detener",
        labels: {
          adoration: "Adoración",
          confession: "Confesión",
          thanksgiving: "Acción de gracias",
          supplication: "Súplica",
          yourAdoration: "Tu adoración",
          yourConfession: "Tu confesión",
          yourThanksgiving: "Tu acción de gracias",
          yourSupplication: "Tu súplica",
        },
        placeholders: {
          adoration: "Escribe tu adoración aquí...",
          confession: "Escribe tu confesión aquí...",
          thanksgiving: "Escribe tu acción de gracias aquí...",
          supplication: "Escribe tu súplica aquí...",
        },
      },
      account: { checking: "Cuenta: verificando…", active: "Cuenta: activa", error: "Cuenta: error" },
      billing: { support: "Apoyar a Alyana Luz", manage: "Administrar pagos" },
    },
  };

  // -----------------------------
  // Global state (localStorage)
  // -----------------------------
  const LS = {
    uiLang: "alyana_ui_lang",
    voiceChoice: "alyana_voice_choice",
    speechRate: "alyana_speech_rate",
    chatCurrent: "alyana_chat_current_v2",
    chatSaved: "alyana_chat_saved_v2",
    devotionalStreak: "alyana_devotional_streak_v1",
    devotionalLastDate: "alyana_devotional_last_date_v1",
    devotionalDraft: "alyana_devotional_draft_v1",
    prayerStreak: "alyana_prayer_streak_v1",
    prayerLastDate: "alyana_prayer_last_date_v1",
    prayerDraft: "alyana_prayer_draft_v1",
    lastBible: "alyana_bible_last_v1",
  };

  let uiLang = (localStorage.getItem(LS.uiLang) || "en").toLowerCase().startsWith("es") ? "es" : "en";

  // Voice identifiers you chose
  const VOICES_KEEP = [
    { key: "karen-en-AU", label: "Karen — en-AU", lang: "en-AU", match: (v) => /karen/i.test(v.name) && /^en/i.test(v.lang) },
    { key: "paulina-es-MX", label: "Paulina — es-MX", lang: "es-MX", match: (v) => /paulina/i.test(v.name) && /^es/i.test(v.lang) },
  ];

  let voiceChoice = localStorage.getItem(LS.voiceChoice) || (uiLang === "es" ? "paulina-es-MX" : "karen-en-AU");
  if (!["karen-en-AU", "paulina-es-MX"].includes(voiceChoice)) {
    voiceChoice = uiLang === "es" ? "paulina-es-MX" : "karen-en-AU";
  }

  let speechRate = parseFloat(localStorage.getItem(LS.speechRate) || "0.90");
  speechRate = clamp(isFinite(speechRate) ? speechRate : 0.9, 0.7, 1.05);

  // Speech engine
  const synth = window.speechSynthesis;
  let availableVoices = [];
  let activeUtterance = null;

  // Track what button should show Stop right now (only one source at a time)
  let speakingSource = null; // "chat" | "bible" | "prayer" | null

  function loadVoices() {
    availableVoices = synth ? synth.getVoices() : [];
    return availableVoices;
  }

  function pickActualVoiceForChoice(choiceKey) {
    const keep = VOICES_KEEP.find((x) => x.key === choiceKey) || VOICES_KEEP[0];
    const voices = availableVoices || [];
    let v = voices.find((vv) => keep.match(vv) && vv.lang === keep.lang);
    if (!v) v = voices.find((vv) => keep.match(vv));
    if (!v) v = voices.find((vv) => (vv.lang || "").toLowerCase().startsWith((keep.lang || "").slice(0, 2).toLowerCase()));
    return v || null;
  }

  function isSpeaking() {
    try {
      return !!(synth && (synth.speaking || synth.pending));
    } catch {
      return false;
    }
  }

  function updateSpeakButtons() {
    const t = I18N[uiLang];

    const listenLastBtn = document.getElementById("listenLastBtn");
    const bibleListenBtn = document.getElementById("bibleListenBtn");
    const prayerListenBtn = document.getElementById("prayerListenBtn");

    // Default labels
    if (listenLastBtn) listenLastBtn.textContent = t.chat.listenLast;
    if (bibleListenBtn) bibleListenBtn.textContent = t.bible.listen;
    if (prayerListenBtn) prayerListenBtn.textContent = t.prayer.listen;

    // If currently speaking, only the active source shows "Stop"
    if (isSpeaking() && speakingSource) {
      if (speakingSource === "chat" && listenLastBtn) listenLastBtn.textContent = t.chat.stop;
      if (speakingSource === "bible" && bibleListenBtn) bibleListenBtn.textContent = t.bible.stop;
      if (speakingSource === "prayer" && prayerListenBtn) prayerListenBtn.textContent = t.prayer.stop;
    }
  }

  function stopSpeaking() {
    try {
      if (synth) {
        synth.cancel();
        // Firefox/Safari sometimes keep going; double-cancel next tick
        setTimeout(() => {
          try { synth.cancel(); } catch {}
        }, 0);
      }
    } catch {}
    activeUtterance = null;
    speakingSource = null;
    updateSpeakButtons();
  }

  function speakText(text, sourceTag) {
    if (!synth) return;

    const cleaned = (text || "").trim();
    if (!cleaned) return;

    stopSpeaking(); // stop anything currently speaking first

    speakingSource = sourceTag || null;
    updateSpeakButtons();

    loadVoices();

    const keep = VOICES_KEEP.find((x) => x.key === voiceChoice) || VOICES_KEEP[0];
    const actual = pickActualVoiceForChoice(keep.key);

    const u = new SpeechSynthesisUtterance(cleaned);
    u.rate = speechRate;
    u.pitch = 1.0;
    u.volume = 1.0;
    u.lang = keep.lang;
    if (actual) u.voice = actual;

    u.onend = () => {
      activeUtterance = null;
      speakingSource = null;
      updateSpeakButtons();
    };
    u.onerror = () => {
      activeUtterance = null;
      speakingSource = null;
      updateSpeakButtons();
    };

    activeUtterance = u;
    synth.speak(u);
  }

  if (synth) {
    loadVoices();
    synth.onvoiceschanged = () => {
      loadVoices();
    };
  }

  // -----------------------------
  // API calls
  // -----------------------------
  async function apiGet(url) {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function apiPost(url, body) {
    const r = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!r.ok) {
      let msg = "";
      try {
        const j = await r.json();
        msg = j?.detail || j?.error || JSON.stringify(j);
      } catch {
        msg = await r.text();
      }
      throw new Error(msg || `Request failed (${r.status})`);
    }
    return r.json();
  }

  async function alyanaChat(prompt, history) {
    const payload = { prompt, history: history || [] };
    const j = await apiPost("/chat", payload);
    return j?.message || "";
  }

  // -----------------------------
  // DOM: find views
  // -----------------------------
  const viewChat = $("view-chat");
  const viewBible = $("view-bible");
  const viewDev = $("view-devotional");
  const viewPrayer = $("view-prayer");

  const messagesEl = $("messages");
  const chatInput = $("chatInput");
  const sendBtn = $("sendBtn");
  const newBtn = $("newBtn");
  const saveBtn = $("saveBtn");
  const chatStatus = $("chatStatus");

  const bookSelect = $("bookSelect");
  const chapterSelect = $("chapterSelect");
  const loadChapterBtn = $("loadChapterBtn");
  const startVerse = $("startVerse");
  const endVerse = $("endVerse");
  const loadPassageBtn = $("loadPassageBtn");
  const bibleOut = $("bibleOut");

  const devLangSel = $("devLang");
  const devBtn = $("devBtn");
  const devOut = $("devOut");

  const prayLangSel = $("prayLang");
  const prayBtn = $("prayBtn");
  const prayOut = $("prayOut");

  const savedList = $("savedList");

  const btnSupport = $("btnSupport");
  const btnBilling = $("btnBilling");
  const accountPill = $("accountPill");

  // -----------------------------
  // Inject missing UI controls
  // -----------------------------
  function ensureTopControls() {
    // Chat: add Language + Voice dropdowns if not already present
    if (viewChat && !document.getElementById("globalLangSelect")) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "10px";

      const langWrap = document.createElement("div");
      const langSel = document.createElement("select");
      langSel.id = "globalLangSelect";
      langSel.innerHTML = `
        <option value="en">English</option>
        <option value="es">Español</option>
      `;
      langWrap.appendChild(langSel);

      const voiceWrap = document.createElement("div");
      const voiceSel = document.createElement("select");
      voiceSel.id = "voiceSelect";
      voiceSel.innerHTML = VOICES_KEEP.map((v) => `<option value="${v.key}">${v.label}</option>`).join("");
      voiceWrap.appendChild(voiceSel);

      row.appendChild(langWrap);
      row.appendChild(voiceWrap);

      const h2 = viewChat.querySelector("h2");
      if (h2 && h2.nextElementSibling) {
        h2.parentNode.insertBefore(row, h2.nextElementSibling.nextElementSibling || h2.nextElementSibling);
      } else if (h2) {
        h2.parentNode.insertBefore(row, h2.nextElementSibling);
      } else {
        viewChat.prepend(row);
      }
    }

    // Chat: add ONLY Listen Last button (TOGGLE). REMOVE Stop button entirely.
    const composer = viewChat?.querySelector(".composer");
    if (composer) {
      const existingStop = document.getElementById("stopSpeakBtn");
      if (existingStop) existingStop.remove();

      if (!document.getElementById("listenLastBtn")) {
        const listenBtn = document.createElement("button");
        listenBtn.className = "btn";
        listenBtn.id = "listenLastBtn";
        composer.appendChild(listenBtn);
      }
    }

    // Bible: add Version dropdown if not present (UI-only)
    if (viewBible && !document.getElementById("bibleVersionSelect")) {
      const topRow = viewBible.querySelector(".row");
      if (topRow) {
        const versionSel = document.createElement("select");
        versionSel.id = "bibleVersionSelect";
        versionSel.innerHTML = `
          <option value="default">${uiLang === "es" ? I18N.es.bible.versionDefault : I18N.en.bible.versionDefault}</option>
          <option value="ui-nlt">NLT (${uiLang === "es" ? I18N.es.bible.versionUiOnly : I18N.en.bible.versionUiOnly})</option>
        `;
        topRow.insertBefore(versionSel, topRow.firstChild);
      }
    }

    // Bible: create ONLY ONE Listen button (TOGGLE). REMOVE Stop button entirely.
    if (viewBible) {
      const existingStop = document.getElementById("bibleStopBtn");
      if (existingStop) existingStop.remove();

      if (!document.getElementById("bibleListenBtn")) {
        const controls = document.createElement("div");
        controls.className = "row";
        controls.style.marginTop = "10px";

        const listen = document.createElement("button");
        listen.className = "btn";
        listen.id = "bibleListenBtn";
        controls.appendChild(listen);

        if (bibleOut && bibleOut.parentNode) {
          bibleOut.parentNode.insertBefore(controls, bibleOut);
        } else {
          viewBible.appendChild(controls);
        }
      }
    }

    // Devotional: remove listen/stop if they exist from older versions
    const devListen = document.getElementById("devListenBtn");
    const devStop = document.getElementById("devStopBtn");
    if (devListen) devListen.remove();
    if (devStop) devStop.remove();
  }

  // -----------------------------
  // Tabs
  // -----------------------------
  function setActiveTab(tab) {
    stopSpeaking(); // optional: stop speech when switching tabs
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((t) => {
      const active = t.getAttribute("data-tab") === tab;
      t.classList.toggle("active", active);
    });

    if (viewChat) viewChat.style.display = tab === "chat" ? "" : "none";
    if (viewBible) viewBible.style.display = tab === "bible" ? "" : "none";
    if (viewDev) viewDev.style.display = tab === "devotional" ? "" : "none";
    if (viewPrayer) viewPrayer.style.display = tab === "prayer" ? "" : "none";
  }

  function initTabs() {
    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((t) => {
      t.addEventListener("click", () => setActiveTab(t.getAttribute("data-tab")));
    });
  }

  // -----------------------------
  // Account / Billing UI
  // -----------------------------
  async function refreshAccount() {
    try {
      accountPill.textContent = I18N[uiLang].account.checking;
      const me = await apiGet("/me");
      if (me?.logged_in && me?.active) {
        accountPill.textContent = `${I18N[uiLang].account.active} (${me.email})`;
        accountPill.classList.remove("danger");
        accountPill.classList.add("ok");
      } else if (me?.logged_in) {
        accountPill.textContent = `${I18N[uiLang].account.error}`;
        accountPill.classList.remove("ok");
        accountPill.classList.add("danger");
      } else {
        accountPill.textContent = I18N[uiLang].account.checking;
        accountPill.classList.remove("ok", "danger");
      }
    } catch {
      accountPill.textContent = I18N[uiLang].account.error;
      accountPill.classList.remove("ok");
      accountPill.classList.add("danger");
    }
  }

  async function handleSupport() {
    try {
      const j = await apiPost("/stripe/create-checkout-session", {});
      if (j?.url) window.location.href = j.url;
    } catch (e) {
      alert(String(e.message || e));
    }
  }

  async function handleBilling() {
    try {
      const j = await apiPost("/stripe/create-portal-session", {});
      if (j?.url) window.location.href = j.url;
    } catch (e) {
      alert(String(e.message || e));
    }
  }

  // -----------------------------
  // Chat state + saved chats
  // -----------------------------
  function loadCurrentChat() {
    const raw = localStorage.getItem(LS.chatCurrent);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveCurrentChat(arr) {
    localStorage.setItem(LS.chatCurrent, JSON.stringify(arr || []));
  }

  function loadSavedChats() {
    const raw = localStorage.getItem(LS.chatSaved);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveSavedChats(arr) {
    localStorage.setItem(LS.chatSaved, JSON.stringify(arr || []));
  }

  function renderMessages(chatArr) {
    if (!messagesEl) return;
    messagesEl.innerHTML = "";
    (chatArr || []).forEach((m) => {
      const row = document.createElement("div");
      row.className = "msg-row " + (m.role === "user" ? "me" : "bot");

      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = m.content || "";

      row.appendChild(bubble);
      messagesEl.appendChild(row);
    });

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderSavedChats() {
    if (!savedList) return;
    const saved = loadSavedChats();
    savedList.innerHTML = "";

    if (!saved.length) {
      const d = document.createElement("div");
      d.className = "muted";
      d.textContent = I18N[uiLang].saved.empty;
      savedList.appendChild(d);
      return;
    }

    saved.forEach((item) => {
      const row = document.createElement("div");
      row.className = "saved-item";

      const left = document.createElement("div");
      left.className = "name";
      left.textContent = item.name || "Saved chat";

      const actions = document.createElement("div");
      actions.className = "actions";

      const loadBtn = document.createElement("button");
      loadBtn.className = "btn";
      loadBtn.textContent = uiLang === "es" ? "Cargar" : "Load";
      loadBtn.onclick = () => {
        saveCurrentChat(item.chat || []);
        renderMessages(item.chat || []);
        setActiveTab("chat");
      };

      const delBtn = document.createElement("button");
      delBtn.className = "btn";
      delBtn.textContent = uiLang === "es" ? "Eliminar" : "Delete";
      delBtn.onclick = () => {
        const next = loadSavedChats().filter((x) => x.id !== item.id);
        saveSavedChats(next);
        renderSavedChats();
      };

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(actions);
      savedList.appendChild(row);
    });
  }

  function lastAssistantMessage(chatArr) {
    for (let i = (chatArr || []).length - 1; i >= 0; i--) {
      const m = chatArr[i];
      if (m && m.role === "assistant" && (m.content || "").trim()) return m.content.trim();
    }
    return "";
  }

  async function sendChat() {
    const text = (chatInput?.value || "").trim();
    if (!text) return;

    stopSpeaking();

    const chatArr = loadCurrentChat();
    chatArr.push({ role: "user", content: text });
    saveCurrentChat(chatArr);
    renderMessages(chatArr);

    chatInput.value = "";
    if (chatStatus) chatStatus.textContent = uiLang === "es" ? "Pensando…" : "Thinking…";

    const history = chatArr.slice(-16).map((m) => ({ role: m.role, content: m.content }));

    const langInstruction =
      uiLang === "es"
        ? "Responde completamente en español (sin mezclar inglés)."
        : "Reply completely in English (do not mix Spanish).";

    try {
      const reply = await alyanaChat(`${langInstruction}\n\nUser: ${text}`, history);
      chatArr.push({ role: "assistant", content: reply || "" });
      saveCurrentChat(chatArr);
      renderMessages(chatArr);
      if (chatStatus) chatStatus.textContent = I18N[uiLang].chat.statusReady;
    } catch (e) {
      chatArr.push({ role: "assistant", content: `Error: ${String(e.message || e)}` });
      saveCurrentChat(chatArr);
      renderMessages(chatArr);
      if (chatStatus) chatStatus.textContent = `Error`;
    }
  }

  function newChat() {
    stopSpeaking();
    saveCurrentChat([]);
    renderMessages([]);
    if (chatStatus) chatStatus.textContent = I18N[uiLang].chat.statusReady;
  }

  function saveChat() {
    const chatArr = loadCurrentChat();
    if (!chatArr.length) return;

    const name = prompt(uiLang === "es" ? "Nombre para este chat:" : "Name for this chat:");
    if (!name) return;

    const saved = loadSavedChats();
    saved.unshift({
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      name,
      createdAt: Date.now(),
      chat: chatArr,
    });
    saveSavedChats(saved.slice(0, 50));
    renderSavedChats();
  }

  // -----------------------------
  // Bible Reader
  // -----------------------------
  let bibleCurrent = {
    reference: "",
    text: "",
    displayedText: "",
    lang: "en",
    version: "default",
  };

  async function loadBooks() {
    const j = await apiGet("/bible/books");
    const books = j?.books || [];
    if (!bookSelect) return;
    bookSelect.innerHTML = books.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
  }

  async function loadChaptersForBook(bookId) {
    const j = await apiGet(`/bible/chapters?book=${encodeURIComponent(bookId)}`);
    const chs = j?.chapters || [];
    if (!chapterSelect) return;
    chapterSelect.innerHTML = chs.map((c) => `<option value="${c}">Chapter ${c}</option>`).join("");
  }

  function setBibleOut(reference, text, mutedLine) {
    if (!bibleOut) return;
    bibleOut.innerHTML = "";
    if (mutedLine) {
      const m = document.createElement("div");
      m.className = "muted";
      m.textContent = mutedLine;
      bibleOut.appendChild(m);
      return;
    }
    const h = document.createElement("div");
    h.style.fontWeight = "800";
    h.style.marginBottom = "8px";
    h.textContent = reference || "";

    const pre = document.createElement("div");
    pre.style.whiteSpace = "pre-wrap";
    pre.textContent = text || "";

    bibleOut.appendChild(h);
    bibleOut.appendChild(pre);
  }

  async function translateToSpanishIfNeeded(reference, englishText) {
    if (uiLang !== "es") return { reference, text: englishText };
    if (/á|é|í|ó|ú|ñ|¿|¡/.test(englishText)) return { reference, text: englishText };

    setBibleOut("", "", I18N[uiLang].bible.translating);

    const prompt = `
Translate the following Bible passage into Spanish (Latin American, natural, reverent).
Rules:
- Output ONLY the translated passage text (no commentary).
- Keep verse numbers intact.
- Do NOT mix English.
Passage:
${reference}
${englishText}
`.trim();

    const translated = await alyanaChat(prompt, []);
    return { reference, text: (translated || "").trim() || englishText };
  }

  async function loadChapter() {
    stopSpeaking();

    const bookId = bookSelect?.value;
    const chapter = chapterSelect?.value;
    if (!bookId || !chapter) return;

    const j = await apiGet(`/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=true`);
    const reference = j?.reference || "";
    const text = j?.text || "";

    const verSel = document.getElementById("bibleVersionSelect");
    const version = verSel ? verSel.value : "default";

    bibleCurrent.reference = reference;
    bibleCurrent.text = text;
    bibleCurrent.lang = uiLang;
    bibleCurrent.version = version;

    const shown = await translateToSpanishIfNeeded(reference, text);
    bibleCurrent.displayedText = shown.text;

    setBibleOut(reference, shown.text);

    localStorage.setItem(LS.lastBible, JSON.stringify({
      bookId, chapter, start: "", end: "", reference, englishText: text, displayedText: shown.text, lang: uiLang, version
    }));
  }

  async function loadPassage() {
    stopSpeaking();

    const bookId = bookSelect?.value;
    const chapter = chapterSelect?.value;
    if (!bookId || !chapter) return;

    const s = parseInt((startVerse?.value || "").trim(), 10);
    const e = parseInt((endVerse?.value || "").trim(), 10);

    const hasS = Number.isFinite(s) && s > 0;
    const hasE = Number.isFinite(e) && e > 0;

    const start = hasS ? s : 1;
    const end = hasE ? e : start;

    const j = await apiGet(
      `/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=false&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    );

    const reference = j?.reference || "";
    const text = j?.text || "";

    const verSel = document.getElementById("bibleVersionSelect");
    const version = verSel ? verSel.value : "default";

    bibleCurrent.reference = reference;
    bibleCurrent.text = text;
    bibleCurrent.lang = uiLang;
    bibleCurrent.version = version;

    const shown = await translateToSpanishIfNeeded(reference, text);
    bibleCurrent.displayedText = shown.text;

    setBibleOut(reference, shown.text);

    localStorage.setItem(LS.lastBible, JSON.stringify({
      bookId, chapter, start: String(start), end: String(end), reference, englishText: text, displayedText: shown.text, lang: uiLang, version
    }));
  }

  function listenBibleToggle() {
    // If anything is speaking and it was started by Bible, stop it
    if (isSpeaking() && speakingSource === "bible") {
      stopSpeaking();
      return;
    }

    const t = (bibleCurrent.displayedText || "").trim();
    if (!t) return;

    speakText(`${bibleCurrent.reference}\n\n${t}`, "bible");
  }

  // -----------------------------
  // Devotional: new guided format (AI via /chat)
  // -----------------------------
  function ensureDevotionalUI() {
    if (!viewDev) return;

    if (!document.getElementById("devStreakPill")) {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.id = "devStreakPill";
      pill.style.marginTop = "10px";
      viewDev.appendChild(pill);
    }

    if (!document.getElementById("devSaveBtn")) {
      const btn = document.createElement("button");
      btn.className = "btn good";
      btn.id = "devSaveBtn";
      btn.style.marginTop = "10px";
      btn.style.width = "100%";
      viewDev.appendChild(btn);
    }

    const needed = [
      { id: "devReflection", labelKey: "reflection" },
      { id: "devApplication", labelKey: "application" },
      { id: "devPrayer", labelKey: "prayer" },
      { id: "devClosing", labelKey: "closing" },
      { id: "devFocus", labelKey: "focus" },
    ];

    needed.forEach((n) => {
      if (!document.getElementById(n.id)) {
        const wrap = document.createElement("div");
        wrap.style.marginTop = "12px";

        const h = document.createElement("div");
        h.style.fontWeight = "800";
        h.style.marginBottom = "6px";
        h.id = `${n.id}_label`;
        wrap.appendChild(h);

        const ta = document.createElement("textarea");
        ta.id = n.id;
        wrap.appendChild(ta);

        viewDev.appendChild(wrap);
      }
    });
  }

  function getDevotionalStreak() {
    return parseInt(localStorage.getItem(LS.devotionalStreak) || "0", 10) || 0;
  }

  function setDevotionalStreak(n) {
    localStorage.setItem(LS.devotionalStreak, String(Math.max(0, n | 0)));
    updateDevotionalStreakUI();
  }

  function updateDevotionalStreakUI() {
    const pill = document.getElementById("devStreakPill");
    if (!pill) return;
    const n = getDevotionalStreak();
    pill.textContent = `${I18N[uiLang].devotional.streak}: ${n}`;
  }

  function loadDevotionalDraft() {
    const raw = localStorage.getItem(LS.devotionalDraft);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function saveDevotionalDraft(draft) {
    localStorage.setItem(LS.devotionalDraft, JSON.stringify(draft || {}));
  }

  function hydrateDevotionalFieldsFromDraft() {
    const draft = loadDevotionalDraft();
    if (!draft) return;
    const ids = ["devReflection", "devApplication", "devPrayer", "devClosing", "devFocus"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el && typeof draft[id] === "string") el.value = draft[id];
    });
    if (devOut && typeof draft.devOutHtml === "string") devOut.innerHTML = draft.devOutHtml;
  }

  function bindDevotionalDraftAutosave() {
    const ids = ["devReflection", "devApplication", "devPrayer", "devClosing", "devFocus"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => {
        const draft = loadDevotionalDraft() || {};
        draft[id] = el.value || "";
        if (devOut) draft.devOutHtml = devOut.innerHTML;
        saveDevotionalDraft(draft);
      });
    });
  }

  async function generateDevotional() {
    stopSpeaking();

    if (!devOut) return;

    const lang = devLangSel ? (devLangSel.value || uiLang) : uiLang;
    const L = lang.startsWith("es") ? "es" : "en";

    devOut.innerHTML = `<div class="muted">${L === "es" ? "Generando…" : "Generating…"}</div>`;

    const promptEn = `
You are Alyana Luz. Create a short devotional in JSON ONLY (no markdown).
Requirements:
- Choose ONE Bible reference and quote 1–5 verses directly (keep it brief).
- Include the reference clearly (e.g., "Philippians 4:6–7").
- Do not invent extra verses beyond 1–5.
Return this exact JSON shape:
{
  "reference": "Book Chapter:Verse(s)",
  "verses": "Verse text with verse numbers (1–5 verses max)",
  "short_explanation": "2–4 sentences",
  "example_reflection": "1 short example sentence",
  "example_application": "1 short example sentence",
  "example_prayer": "1 short example sentence",
  "example_challenge": "1 short challenge sentence",
  "example_focus": "1 short one-day focus sentence"
}
`.trim();

    const promptEs = `
Eres Alyana Luz. Crea un devocional corto en JSON SOLAMENTE (sin markdown).
Requisitos:
- Elige UNA referencia bíblica y cita directamente 1–5 versículos (breve).
- Incluye la referencia claramente (ej. "Filipenses 4:6–7").
- No inventes más de 1–5 versículos.
Devuelve exactamente este JSON:
{
  "reference": "Libro Capítulo:Verso(s)",
  "verses": "Texto con números de versículo (máx 1–5 versículos)",
  "short_explanation": "2–4 oraciones",
  "example_reflection": "1 ejemplo corto",
  "example_application": "1 ejemplo corto",
  "example_prayer": "1 ejemplo corto",
  "example_challenge": "1 desafío corto",
  "example_focus": "1 enfoque corto de un día"
}
`.trim();

    try {
      const raw = await alyanaChat(L === "es" ? promptEs : promptEn, []);
      const data = safeJsonParse(raw) || {};
      const reference = (data.reference || "").trim();
      const verses = (data.verses || "").trim();
      const expl = (data.short_explanation || "").trim();

      const html = `
        <div class="card" style="background:rgba(0,0,0,.16);">
          <div style="font-weight:800; margin-bottom:6px;">${I18N[L].devotional.scripture}</div>
          <div style="white-space:pre-wrap;">${escapeHtml(reference)}\n${escapeHtml(verses)}</div>
          <div style="margin-top:10px; font-weight:800;">${I18N[L].devotional.explanation}</div>
          <div style="white-space:pre-wrap;">${escapeHtml(expl)}</div>
        </div>
      `;
      devOut.innerHTML = html;

      const map = {
        devReflection: data.example_reflection,
        devApplication: data.example_application,
        devPrayer: data.example_prayer,
        devClosing: data.example_challenge,
        devFocus: data.example_focus,
      };
      Object.keys(map).forEach((id) => {
        const el = document.getElementById(id);
        const v = (map[id] || "").trim();
        if (el) {
          el.placeholder = v ? `${I18N[L].devotional.placeholders.writeHere} (${v})` : I18N[L].devotional.placeholders.writeHere;
        }
      });

      const draft = loadDevotionalDraft() || {};
      draft.devOutHtml = devOut.innerHTML;
      saveDevotionalDraft(draft);

    } catch (e) {
      devOut.innerHTML = `<div class="danger">${escapeHtml(String(e.message || e))}</div>`;
    }
  }

  function saveDevotional() {
    const L = uiLang;
    const ids = ["devReflection", "devApplication", "devPrayer", "devClosing", "devFocus"];
    const draft = loadDevotionalDraft() || {};
    ids.forEach((id) => {
      const el = document.getElementById(id);
      draft[id] = el ? (el.value || "") : "";
    });
    draft.devOutHtml = devOut ? devOut.innerHTML : "";
    saveDevotionalDraft(draft);

    const today = todayKeyLocal();
    const last = localStorage.getItem(LS.devotionalLastDate) || "";

    if (last === today) {
      updateDevotionalStreakUI();
      alert(L === "es" ? "Devocional guardado. (Ya contaste hoy para la racha.)" : "Devotional saved. (You already counted today for your streak.)");
      return;
    }

    const lastDate = last ? new Date(last + "T00:00:00") : null;
    const tDate = new Date(today + "T00:00:00");
    let next = 1;
    if (lastDate) {
      const diffDays = Math.round((tDate - lastDate) / (1000 * 60 * 60 * 24));
      next = diffDays === 1 ? getDevotionalStreak() + 1 : 1;
    }
    localStorage.setItem(LS.devotionalLastDate, today);
    setDevotionalStreak(next);
    alert(L === "es" ? "Devocional guardado. Racha actualizada." : "Devotional saved. Streak updated.");
  }

  // -----------------------------
  // Daily Prayer (ACTS)
  // -----------------------------
  function ensurePrayerUI() {
    if (!viewPrayer) return;

    if (!document.getElementById("prayerStreakPill")) {
      const pill = document.createElement("div");
      pill.className = "pill";
      pill.id = "prayerStreakPill";
      pill.style.marginTop = "10px";
      viewPrayer.appendChild(pill);
    }

    const needed = [
      { id: "pAdoration", labelKey: "yourAdoration", placeholderKey: "adoration" },
      { id: "pConfession", labelKey: "yourConfession", placeholderKey: "confession" },
      { id: "pThanksgiving", labelKey: "yourThanksgiving", placeholderKey: "thanksgiving" },
      { id: "pSupplication", labelKey: "yourSupplication", placeholderKey: "supplication" },
    ];

    needed.forEach((n) => {
      if (!document.getElementById(n.id)) {
        const wrap = document.createElement("div");
        wrap.style.marginTop = "12px";

        const lbl = document.createElement("div");
        lbl.style.fontWeight = "800";
        lbl.style.marginBottom = "6px";
        lbl.id = `${n.id}_label`;
        wrap.appendChild(lbl);

        const ta = document.createElement("textarea");
        ta.id = n.id;
        wrap.appendChild(ta);

        viewPrayer.appendChild(wrap);
      }
    });

    // Buttons row: SAVE + LISTEN (TOGGLE). Remove Stop button if it exists.
    const oldStop = document.getElementById("prayerStopBtn");
    if (oldStop) oldStop.remove();

    if (!document.getElementById("prayerSaveBtn")) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "12px";

      const save = document.createElement("button");
      save.className = "btn good";
      save.id = "prayerSaveBtn";
      row.appendChild(save);

      const listen = document.createElement("button");
      listen.className = "btn primary";
      listen.id = "prayerListenBtn";
      row.appendChild(listen);

      viewPrayer.appendChild(row);
    } else {
      // Ensure listen exists
      if (!document.getElementById("prayerListenBtn")) {
        const listen = document.createElement("button");
        listen.className = "btn primary";
        listen.id = "prayerListenBtn";
        const row = document.getElementById("prayerSaveBtn")?.parentNode;
        if (row) row.appendChild(listen);
      }
    }
  }

  function getPrayerStreak() {
    return parseInt(localStorage.getItem(LS.prayerStreak) || "0", 10) || 0;
  }

  function setPrayerStreak(n) {
    localStorage.setItem(LS.prayerStreak, String(Math.max(0, n | 0)));
    updatePrayerStreakUI();
  }

  function updatePrayerStreakUI() {
    const pill = document.getElementById("prayerStreakPill");
    if (!pill) return;
    pill.textContent = `${I18N[uiLang].prayer.streak}: ${getPrayerStreak()}`;
  }

  function loadPrayerDraft() {
    const raw = localStorage.getItem(LS.prayerDraft);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  function savePrayerDraft(d) {
    localStorage.setItem(LS.prayerDraft, JSON.stringify(d || {}));
  }

  function hydratePrayerFromDraft() {
    const d = loadPrayerDraft();
    if (!d) return;
    ["pAdoration", "pConfession", "pThanksgiving", "pSupplication"].forEach((id) => {
      const el = document.getElementById(id);
      if (el && typeof d[id] === "string") el.value = d[id];
    });
    if (prayOut && typeof d.prayOutHtml === "string") prayOut.innerHTML = d.prayOutHtml;
  }

  function bindPrayerDraftAutosave() {
    ["pAdoration", "pConfession", "pThanksgiving", "pSupplication"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => {
        const d = loadPrayerDraft() || {};
        d[id] = el.value || "";
        if (prayOut) d.prayOutHtml = prayOut.innerHTML;
        savePrayerDraft(d);
      });
    });
  }

  async function generatePrayerStarters() {
    stopSpeaking();

    if (!prayOut) return;

    const lang = prayLangSel ? (prayLangSel.value || uiLang) : uiLang;
    const L = lang.startsWith("es") ? "es" : "en";

    prayOut.innerHTML = `<div class="muted">${L === "es" ? "Generando…" : "Generating…"}</div>`;

    try {
      const prompt =
        L === "es"
          ? `
Eres Alyana Luz. Genera ejemplos cortos para una oración ACTS.
Reglas:
- SOLO español (no mezcles inglés).
- 1–2 frases por sección.
Devuelve JSON EXACTO:
{
  "adoration": "...",
  "confession": "...",
  "thanksgiving": "...",
  "supplication": "..."
}`.trim()
          : `
You are Alyana Luz. Generate short starters for an ACTS prayer.
Rules:
- ONLY English (do not mix Spanish).
- 1–2 sentences per section.
Return EXACT JSON:
{
  "adoration": "...",
  "confession": "...",
  "thanksgiving": "...",
  "supplication": "..."
}`.trim();

      const raw = await alyanaChat(prompt, []);
      const data = safeJsonParse(raw) || {};

      const blocks = [
        { key: "adoration", title: I18N[L].prayer.labels.adoration },
        { key: "confession", title: I18N[L].prayer.labels.confession },
        { key: "thanksgiving", title: I18N[L].prayer.labels.thanksgiving },
        { key: "supplication", title: I18N[L].prayer.labels.supplication },
      ];

      const html = blocks
        .map((b) => {
          const txt = (data[b.key] || "").trim();
          return `
            <div class="card" style="background:rgba(0,0,0,.16); margin-top:10px;">
              <div style="font-weight:800; margin-bottom:6px;">${escapeHtml(b.title)}:</div>
              <div style="white-space:pre-wrap;">${escapeHtml(txt)}</div>
            </div>
          `;
        })
        .join("");

      prayOut.innerHTML = html;

      const d = loadPrayerDraft() || {};
      d.prayOutHtml = prayOut.innerHTML;
      savePrayerDraft(d);

    } catch (e) {
      prayOut.innerHTML = `<div class="danger">${escapeHtml(String(e.message || e))}</div>`;
    }
  }

  function savePrayer() {
    const L = uiLang;

    const d = loadPrayerDraft() || {};
    ["pAdoration", "pConfession", "pThanksgiving", "pSupplication"].forEach((id) => {
      const el = document.getElementById(id);
      d[id] = el ? (el.value || "") : "";
    });
    if (prayOut) d.prayOutHtml = prayOut.innerHTML;
    savePrayerDraft(d);

    const today = todayKeyLocal();
    const last = localStorage.getItem(LS.prayerLastDate) || "";

    if (last === today) {
      updatePrayerStreakUI();
      alert(L === "es" ? "Oración guardada. (Ya contaste hoy para la racha.)" : "Prayer saved. (You already counted today for your streak.)");
      return;
    }

    const lastDate = last ? new Date(last + "T00:00:00") : null;
    const tDate = new Date(today + "T00:00:00");
    let next = 1;
    if (lastDate) {
      const diffDays = Math.round((tDate - lastDate) / (1000 * 60 * 60 * 24));
      next = diffDays === 1 ? getPrayerStreak() + 1 : 1;
    }

    localStorage.setItem(LS.prayerLastDate, today);
    setPrayerStreak(next);
    alert(L === "es" ? "Oración guardada. Racha actualizada." : "Prayer saved. Streak updated.");
  }

  function listenPrayerToggle() {
    if (!prayOut) return;

    // If anything is speaking and it was started by Prayer, stop it
    if (isSpeaking() && speakingSource === "prayer") {
      stopSpeaking();
      return;
    }

    const text = (prayOut.innerText || "").trim();
    if (!text) return;

    speakText(text, "prayer");
  }

  // -----------------------------
  // UI Language + Voice wiring
  // -----------------------------
  function applyUILanguage() {
    const t = I18N[uiLang];

    if (btnSupport) btnSupport.textContent = t.billing.support;
    if (btnBilling) btnBilling.textContent = t.billing.manage;

    const tabButtons = document.querySelectorAll(".tab");
    tabButtons.forEach((b) => {
      const key = b.getAttribute("data-tab");
      if (key && t.tabs[key]) b.textContent = t.tabs[key];
    });

    renderSavedChats();

    if (viewChat) {
      const h2 = viewChat.querySelector("h2");
      if (h2) h2.textContent = t.chat.title;

      const muted = viewChat.querySelector(".muted");
      if (muted) muted.textContent = t.chat.subtitle;

      if (chatInput) chatInput.placeholder = t.chat.placeholder;
      if (sendBtn) sendBtn.textContent = t.chat.send;
      if (newBtn) newBtn.textContent = t.chat.new;
      if (saveBtn) saveBtn.textContent = t.chat.save;

      const listenLastBtn = document.getElementById("listenLastBtn");
      if (listenLastBtn) listenLastBtn.textContent = t.chat.listenLast;

      if (chatStatus && !chatStatus.textContent) chatStatus.textContent = t.chat.statusReady;

      const langSel = document.getElementById("globalLangSelect");
      if (langSel) langSel.value = uiLang;

      const voiceSel = document.getElementById("voiceSelect");
      if (voiceSel) voiceSel.value = voiceChoice;
    }

    if (viewBible) {
      const h2 = viewBible.querySelector("h2");
      if (h2) h2.textContent = t.bible.title;

      if (loadChapterBtn) loadChapterBtn.textContent = t.bible.loadChapter;
      if (loadPassageBtn) loadPassageBtn.textContent = t.bible.loadPassage;
      if (startVerse) startVerse.placeholder = t.bible.startVerse;
      if (endVerse) endVerse.placeholder = t.bible.endVerse;

      const listen = document.getElementById("bibleListenBtn");
      if (listen) listen.textContent = t.bible.listen;

      const verSel = document.getElementById("bibleVersionSelect");
      if (verSel) {
        verSel.options[0].textContent = t.bible.versionDefault;
        if (verSel.options[1]) verSel.options[1].textContent = `NLT (${t.bible.versionUiOnly})`;
      }

      if (bibleOut && bibleOut.innerText && bibleOut.innerText.includes("Select a book and chapter")) {
        setBibleOut("", "", t.bible.selectPrompt);
      }
    }

    if (viewDev) {
      const h2 = viewDev.querySelector("h2");
      if (h2) h2.textContent = t.devotional.title;

      if (devBtn) devBtn.textContent = t.devotional.generate;

      const muted = viewDev.querySelector(".muted");
      if (muted) muted.textContent = t.devotional.instruction;

      const labelMap = [
        { id: "devReflection_label", text: t.devotional.fields.reflection },
        { id: "devApplication_label", text: t.devotional.fields.application },
        { id: "devPrayer_label", text: t.devotional.fields.prayer },
        { id: "devClosing_label", text: t.devotional.fields.closing },
        { id: "devFocus_label", text: t.devotional.fields.focus },
      ];
      labelMap.forEach((x) => {
        const el = document.getElementById(x.id);
        if (el) el.textContent = x.text;
      });

      ["devReflection", "devApplication", "devPrayer", "devClosing", "devFocus"].forEach((id) => {
        const el = document.getElementById(id);
        if (el && !el.placeholder) el.placeholder = t.devotional.placeholders.writeHere;
      });

      const save = document.getElementById("devSaveBtn");
      if (save) save.textContent = t.devotional.save;
      updateDevotionalStreakUI();

      if (devLangSel) devLangSel.value = uiLang;
    }

    if (viewPrayer) {
      const h2 = viewPrayer.querySelector("h2");
      if (h2) h2.textContent = t.prayer.title;

      if (prayBtn) prayBtn.textContent = t.prayer.generate;
      const muted = viewPrayer.querySelector(".muted");
      if (muted) muted.textContent = t.prayer.instruction;

      const labelPairs = [
        { id: "pAdoration_label", text: t.prayer.labels.yourAdoration },
        { id: "pConfession_label", text: t.prayer.labels.yourConfession },
        { id: "pThanksgiving_label", text: t.prayer.labels.yourThanksgiving },
        { id: "pSupplication_label", text: t.prayer.labels.yourSupplication },
      ];
      labelPairs.forEach((x) => {
        const el = document.getElementById(x.id);
        if (el) el.textContent = x.text;
      });

      const phMap = [
        { id: "pAdoration", ph: t.prayer.placeholders.adoration },
        { id: "pConfession", ph: t.prayer.placeholders.confession },
        { id: "pThanksgiving", ph: t.prayer.placeholders.thanksgiving },
        { id: "pSupplication", ph: t.prayer.placeholders.supplication },
      ];
      phMap.forEach((x) => {
        const el = document.getElementById(x.id);
        if (el) el.placeholder = x.ph;
      });

      const save = document.getElementById("prayerSaveBtn");
      const listen = document.getElementById("prayerListenBtn");
      if (save) save.textContent = t.prayer.save;
      if (listen) listen.textContent = t.prayer.listen;

      updatePrayerStreakUI();

      if (prayLangSel) prayLangSel.value = uiLang;
    }

    updateSpeakButtons();
  }

  function bindGlobalLanguageAndVoice() {
    const langSel = document.getElementById("globalLangSelect");
    const voiceSel = document.getElementById("voiceSelect");

    if (langSel) {
      langSel.value = uiLang;
      langSel.addEventListener("change", async () => {
        uiLang = (langSel.value || "en").startsWith("es") ? "es" : "en";
        localStorage.setItem(LS.uiLang, uiLang);

        voiceChoice = uiLang === "es" ? "paulina-es-MX" : "karen-en-AU";
        localStorage.setItem(LS.voiceChoice, voiceChoice);
        if (voiceSel) voiceSel.value = voiceChoice;

        applyUILanguage();
        await refreshAccount();

        if (bibleCurrent.text) {
          const shown = await translateToSpanishIfNeeded(bibleCurrent.reference, bibleCurrent.text);
          bibleCurrent.displayedText = shown.text;
          setBibleOut(bibleCurrent.reference, shown.text);
        }
      });
    }

    if (voiceSel) {
      voiceSel.value = voiceChoice;
      voiceSel.addEventListener("change", () => {
        voiceChoice = voiceSel.value || voiceChoice;
        if (!["karen-en-AU", "paulina-es-MX"].includes(voiceChoice)) {
          voiceChoice = uiLang === "es" ? "paulina-es-MX" : "karen-en-AU";
        }
        localStorage.setItem(LS.voiceChoice, voiceChoice);
        stopSpeaking();
      });
    }
  }

  // -----------------------------
  // Escape HTML
  // -----------------------------
  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -----------------------------
  // Init wiring
  // -----------------------------
  function bindEvents() {
    if (btnSupport) btnSupport.addEventListener("click", handleSupport);
    if (btnBilling) btnBilling.addEventListener("click", handleBilling);

    // Chat
    if (sendBtn) sendBtn.addEventListener("click", sendChat);
    if (chatInput) {
      chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendChat();
      });
    }
    if (newBtn) newBtn.addEventListener("click", newChat);
    if (saveBtn) saveBtn.addEventListener("click", saveChat);

    // Chat Listen (TOGGLE)
    const listenLastBtn = document.getElementById("listenLastBtn");
    if (listenLastBtn) {
      listenLastBtn.addEventListener("click", () => {
        // If speaking from chat, stop
        if (isSpeaking() && speakingSource === "chat") {
          stopSpeaking();
          return;
        }
        const chatArr = loadCurrentChat();
        const text = lastAssistantMessage(chatArr);
        if (!text) return;
        speakText(text, "chat");
      });
    }

    // Bible
    if (bookSelect) {
      bookSelect.addEventListener("change", async () => {
        try {
          await loadChaptersForBook(bookSelect.value);
        } catch {}
      });
    }
    if (loadChapterBtn) loadChapterBtn.addEventListener("click", loadChapter);
    if (loadPassageBtn) loadPassageBtn.addEventListener("click", loadPassage);

    // Bible Listen (TOGGLE)
    const bibleListenBtn = document.getElementById("bibleListenBtn");
    if (bibleListenBtn) bibleListenBtn.addEventListener("click", listenBibleToggle);

    // Devotional
    if (devBtn) devBtn.addEventListener("click", generateDevotional);
    const devSave = document.getElementById("devSaveBtn");
    if (devSave) devSave.addEventListener("click", saveDevotional);

    // Daily prayer
    if (prayBtn) prayBtn.addEventListener("click", generatePrayerStarters);
    const prayerSave = document.getElementById("prayerSaveBtn");
    const prayerListen = document.getElementById("prayerListenBtn");
    if (prayerSave) prayerSave.addEventListener("click", savePrayer);
    if (prayerListen) prayerListen.addEventListener("click", listenPrayerToggle);

    if (devLangSel) {
      devLangSel.addEventListener("change", () => {
        uiLang = (devLangSel.value || "en").startsWith("es") ? "es" : "en";
        localStorage.setItem(LS.uiLang, uiLang);
        const langSel = document.getElementById("globalLangSelect");
        if (langSel) langSel.value = uiLang;

        voiceChoice = uiLang === "es" ? "paulina-es-MX" : "karen-en-AU";
        localStorage.setItem(LS.voiceChoice, voiceChoice);
        const voiceSel = document.getElementById("voiceSelect");
        if (voiceSel) voiceSel.value = voiceChoice;

        applyUILanguage();
      });
    }
    if (prayLangSel) {
      prayLangSel.addEventListener("change", () => {
        uiLang = (prayLangSel.value || "en").startsWith("es") ? "es" : "en";
        localStorage.setItem(LS.uiLang, uiLang);
        const langSel = document.getElementById("globalLangSelect");
        if (langSel) langSel.value = uiLang;

        voiceChoice = uiLang === "es" ? "paulina-es-MX" : "karen-en-AU";
        localStorage.setItem(LS.voiceChoice, voiceChoice);
        const voiceSel = document.getElementById("voiceSelect");
        if (voiceSel) voiceSel.value = voiceChoice;

        applyUILanguage();
      });
    }
  }

  async function initBible() {
    try {
      await loadBooks();
      if (bookSelect?.value) await loadChaptersForBook(bookSelect.value);

      const raw = localStorage.getItem(LS.lastBible);
      if (raw) {
        try {
          const last = JSON.parse(raw);
          if (last?.bookId && bookSelect) bookSelect.value = String(last.bookId);
          if (last?.bookId) await loadChaptersForBook(String(last.bookId));
          if (last?.chapter && chapterSelect) chapterSelect.value = String(last.chapter);
          if (startVerse) startVerse.value = last?.start || "";
          if (endVerse) endVerse.value = last?.end || "";

          bibleCurrent.reference = last?.reference || "";
          bibleCurrent.text = last?.englishText || "";
          bibleCurrent.displayedText = last?.displayedText || "";
          bibleCurrent.lang = uiLang;
          setBibleOut(bibleCurrent.reference, uiLang === "es" ? (bibleCurrent.displayedText || bibleCurrent.text) : bibleCurrent.text);
        } catch {}
      } else {
        setBibleOut("", "", I18N[uiLang].bible.selectPrompt);
      }
    } catch {
      setBibleOut("", "", uiLang === "es" ? "Error cargando la Biblia local." : "Error loading local Bible.");
    }
  }

  function initDevotional() {
    ensureDevotionalUI();
    updateDevotionalStreakUI();
    hydrateDevotionalFieldsFromDraft();
    bindDevotionalDraftAutosave();
  }

  function initPrayer() {
    ensurePrayerUI();
    updatePrayerStreakUI();
    hydratePrayerFromDraft();
    bindPrayerDraftAutosave();
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function boot() {
    ensureTopControls();
    initTabs();

    renderMessages(loadCurrentChat());
    renderSavedChats();

    initDevotional();
    initPrayer();

    applyUILanguage();
    bindGlobalLanguageAndVoice();

    bindEvents();

    await initBible();
    await refreshAccount();

    if (chatStatus) chatStatus.textContent = I18N[uiLang].chat.statusReady;

    updateSpeakButtons();
  }

  boot();
})();













