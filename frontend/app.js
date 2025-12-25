/* frontend/app.js */

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);

  const LS = {
    uiLang: "alyana.ui.lang",

    chatLang: "alyana.chat.lang",
    devLang: "alyana.dev.lang",
    prLang: "alyana.pr.lang",
    readingLang: "alyana.read.lang",
    bibleVersion: "alyana.bible.version",
    savedChats: "alyana.saved.chats",
    savedDevs: "alyana.saved.devs",
    savedPrayers: "alyana.saved.prayers",
    chatDraft: "alyana.chat.draft",
    devDraft: "alyana.dev.draft",
    prDraft: "alyana.pr.draft",
  };

  const safeJSON = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  const nowISO = () => new Date().toISOString();

  function showTopStatus(text) {
    const pill = $("#jsStatus");
    if (pill) pill.textContent = text;
  }

  function showInline(el, text, isError = false) {
    if (!el) return;
    el.style.display = "block";
    el.textContent = text;
    el.style.color = isError ? "rgba(255,140,140,0.95)" : "";
  }

  function toast(message) {
    // Minimal: reuse authHint area if present
    const hint = $("#authHint");
    if (hint) {
      showInline(hint, message, false);
      setTimeout(() => { hint.style.display = "none"; }, 3500);
    } else {
      alert(message);
    }
  }

  async function apiGet(path) {
    const res = await fetch(path, { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GET ${path} -> ${res.status} ${t}`);
    }
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`POST ${path} -> ${res.status} ${t}`);
    }
    return res.json();
  }

  // ---------------------------
  // UI language strings
  // ---------------------------
  const I18N = {
    en: {
      restoreAccess: "Restore access",
      noSaved: "No saved items yet.",
      savedChats: "Saved chat logs are stored on this device.",
      savedDevs: "Load or delete past devotionals saved on this device.",
      savedPrayers: "Load or delete past prayers saved on this device.",

      chatPlaceholder: "Ask for a prayer, verse, or ‘verses about forgiveness’…",
      listen: "Listen",
      stop: "Stop",
      generate: "Generate",
      generateStarters: "Generate Starters",
      save: "Save",
      newChat: "New",
      send: "Send",
      delete: "Delete",

      didIt: "I did it today",
      checking: "Checking…",
      loading: "Loading…",
      bibleDbChecking: "Checking…",
      voiceReady: "Voice: ready",
      voiceMissing:
        "Voice not found. Your browser must have 'Paulina (es-MX)' and 'Karen (en-AU)' installed.",
      bibleNotFound:
        "Bible DB not found. Confirm your Render deployment includes /data/bible.db and /data/bible_es_rvr.db.",

      // Devotional placeholders
      devMyContextPH: "Context / Observation (What’s happening? Who is speaking? Why does it matter?)",
      devMyReflectionPH: "Reflection / Insight (What does this reveal about God? About me?)",
      devMyApplicationPH: "Application (What will I do today because of this?)",
      devMyPrayerPH: "Prayer (write your real prayer here)",
      devMyNotesPH: "Notes…",

      // Prayer placeholders
      prMyAdorationPH: "Adoration (praise God for who He is)…",
      prMyConfessionPH: "Confession (what I need to confess)…",
      prMyThanksgivingPH: "Thanksgiving (what I’m grateful for)…",
      prMySupplicationPH: "Supplication (requests for myself/others)…",
      prNotesPH: "Notes…",

      // Bible
      pickBookChapterFirst: "Pick a book and chapter first.",
      select: "Select…",
      optional: "(optional)",
      errorLoadingBooks: "(Error loading books)",
    },
    es: {
      restoreAccess: "Restaurar acceso",
      noSaved: "Todavía no hay elementos guardados.",
      savedChats: "Los chats guardados se almacenan en este dispositivo.",
      savedDevs: "Carga o elimina devocionales guardados en este dispositivo.",
      savedPrayers: "Carga o elimina oraciones guardadas en este dispositivo.",

      chatPlaceholder: "Pide una oración, un versículo, o ‘versículos sobre perdón’…",
      listen: "Escuchar",
      stop: "Detener",
      generate: "Generar",
      generateStarters: "Generar ejemplos",
      save: "Guardar",
      newChat: "Nuevo",
      send: "Enviar",
      delete: "Eliminar",

      didIt: "Lo hice hoy",
      checking: "Verificando…",
      loading: "Cargando…",
      bibleDbChecking: "Verificando…",
      voiceReady: "Voz: lista",
      voiceMissing:
        "No se encontró la voz. Tu navegador debe tener instaladas 'Paulina (es-MX)' y 'Karen (en-AU)'.",
      bibleNotFound:
        "No se encontró la base de datos bíblica. Confirma que Render incluye /data/bible.db y /data/bible_es_rvr.db.",

      // Devotional placeholders
      devMyContextPH: "Contexto / Observación (¿Qué está pasando? ¿Quién habla? ¿Por qué importa?)",
      devMyReflectionPH: "Reflexión / Enseñanza (¿Qué revela sobre Dios? ¿Sobre mí?)",
      devMyApplicationPH: "Aplicación (¿Qué haré hoy por esto?)",
      devMyPrayerPH: "Oración (escribe tu oración real aquí)",
      devMyNotesPH: "Notas…",

      // Prayer placeholders
      prMyAdorationPH: "Adoración (alaba a Dios por quién es)…",
      prMyConfessionPH: "Confesión (lo que necesito confesar)…",
      prMyThanksgivingPH: "Acción de gracias (por qué estoy agradecido/a)…",
      prMySupplicationPH: "Súplica (peticiones por mí/otros)…",
      prNotesPH: "Notas…",

      // Bible
      pickBookChapterFirst: "Primero elige un libro y un capítulo.",
      select: "Seleccionar…",
      optional: "(opcional)",
      errorLoadingBooks: "(Error cargando libros)",
    },
  };

  function normalizeUiLang(lang) {
    return (lang === "es") ? "es" : "en";
  }

  function getUiLang() {
    const fromLS = localStorage.getItem(LS.uiLang);
    if (fromLS === "es" || fromLS === "en") return fromLS;
    // default English
    return "en";
  }

  function setUiLang(lang) {
    const v = normalizeUiLang(lang);
    localStorage.setItem(LS.uiLang, v);

    // Sync any existing UI language selectors (optional)
    const devSel = $("#devUiLang");
    const prSel = $("#prUiLang");
    const globalSel = $("#uiLangSelect"); // (optional if you add later)

    if (devSel && devSel.value !== v) devSel.value = v;
    if (prSel && prSel.value !== v) prSel.value = v;
    if (globalSel && globalSel.value !== v) globalSel.value = v;

    applyUiText();
  }

  function applyUiText() {
    const lang = getUiLang();
    const t = I18N[lang];

    // Top restore access
    const loginBtn = $("#loginBtn");
    if (loginBtn) loginBtn.textContent = t.restoreAccess;

    // Chat controls
    const chatInput = $("#chatInput");
    if (chatInput) chatInput.setAttribute("placeholder", t.chatPlaceholder);

    const chatSendBtn = $("#chatSendBtn");
    if (chatSendBtn) chatSendBtn.textContent = t.send;

    const chatListenBtn = $("#chatListenBtn");
    if (chatListenBtn) chatListenBtn.textContent = t.listen;

    const chatStopBtn = $("#chatStopBtn");
    if (chatStopBtn) chatStopBtn.textContent = t.stop;

    const chatNewBtn = $("#chatNewBtn");
    if (chatNewBtn) chatNewBtn.textContent = t.newChat;

    const chatSaveBtn = $("#chatSaveBtn");
    if (chatSaveBtn) chatSaveBtn.textContent = t.save;

    // Saved list placeholders (if empty)
    const chatSavedList = $("#chatSavedList");
    if (chatSavedList && !chatSavedList.querySelector("button")) {
      chatSavedList.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
    }

    const devSavedList = $("#devSavedList");
    if (devSavedList && !devSavedList.querySelector("button")) {
      devSavedList.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
    }

    const prSavedList = $("#prSavedList");
    if (prSavedList && !prSavedList.querySelector("button")) {
      prSavedList.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
    }

    // Devotional buttons
    const devotionalBtn = $("#devotionalBtn");
    if (devotionalBtn) devotionalBtn.textContent = t.generate;

    const devSaveBtn = $("#devSaveBtn");
    if (devSaveBtn) devSaveBtn.textContent = t.save;

    const devStreakBtn = $("#devStreakBtn");
    if (devStreakBtn) devStreakBtn.textContent = t.didIt;

    // Devotional placeholders
    const devMyContext = $("#devMyContext");
    if (devMyContext) devMyContext.setAttribute("placeholder", t.devMyContextPH);

    const devMyReflection = $("#devMyReflection");
    if (devMyReflection) devMyReflection.setAttribute("placeholder", t.devMyReflectionPH);

    const devMyApplication = $("#devMyApplication");
    if (devMyApplication) devMyApplication.setAttribute("placeholder", t.devMyApplicationPH);

    const devMyPrayer = $("#devMyPrayer");
    if (devMyPrayer) devMyPrayer.setAttribute("placeholder", t.devMyPrayerPH);

    const devMyNotes = $("#devMyNotes");
    if (devMyNotes) devMyNotes.setAttribute("placeholder", t.devMyNotesPH);

    // Prayer buttons
    const prayerBtn = $("#prayerBtn");
    if (prayerBtn) prayerBtn.textContent = t.generateStarters;

    const prSaveBtn = $("#prSaveBtn");
    if (prSaveBtn) prSaveBtn.textContent = t.save;

    const prStreakBtn = $("#prStreakBtn");
    if (prStreakBtn) prStreakBtn.textContent = t.didIt;

    // Prayer placeholders
    const myAdoration = $("#myAdoration");
    if (myAdoration) myAdoration.setAttribute("placeholder", t.prMyAdorationPH);

    const myConfession = $("#myConfession");
    if (myConfession) myConfession.setAttribute("placeholder", t.prMyConfessionPH);

    const myThanksgiving = $("#myThanksgiving");
    if (myThanksgiving) myThanksgiving.setAttribute("placeholder", t.prMyThanksgivingPH);

    const mySupplication = $("#mySupplication");
    if (mySupplication) mySupplication.setAttribute("placeholder", t.prMySupplicationPH);

    const prayerNotes = $("#prayerNotes");
    if (prayerNotes) prayerNotes.setAttribute("placeholder", t.prNotesPH);
  }

  // ---------------------------
  // Tabs
  // ---------------------------
  function initTabs() {
    const buttons = document.querySelectorAll(".menu-btn");
    const sections = document.querySelectorAll(".app-section");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        sections.forEach((s) => s.classList.remove("active"));

        btn.classList.add("active");
        const target = btn.getAttribute("data-target");
        const sec = document.getElementById(target);
        if (sec) sec.classList.add("active");
      });
    });
  }

  // ---------------------------
  // Speech (locked voices)
  // ---------------------------
  const VOICE_LOCK = {
    en: { wantNameIncludes: "karen", wantLangPrefix: "en" },     // Karen en-AU
    es: { wantNameIncludes: "paulina", wantLangPrefix: "es" },  // Paulina es-MX
  };

  function getAllVoices() {
    return new Promise((resolve) => {
      let voices = speechSynthesis.getVoices();
      if (voices && voices.length) return resolve(voices);

      speechSynthesis.onvoiceschanged = () => {
        voices = speechSynthesis.getVoices();
        resolve(voices || []);
      };

      setTimeout(() => resolve(speechSynthesis.getVoices() || []), 800);
    });
  }

  async function pickLockedVoice(lang /* 'en'|'es' */) {
    const voices = await getAllVoices();
    const spec = VOICE_LOCK[lang];

    const byName = voices.find(v => (v.name || "").toLowerCase().includes(spec.wantNameIncludes));
    if (byName && (byName.lang || "").toLowerCase().startsWith(spec.wantLangPrefix)) return byName;

    if (byName) return byName;

    const byLang = voices.find(v => (v.lang || "").toLowerCase().startsWith(spec.wantLangPrefix));
    return byLang || null;
  }

  function stopSpeak() {
    try { speechSynthesis.cancel(); } catch {}
  }

  async function speakText(text, lang /* 'en'|'es' */, rate = 1.0) {
    stopSpeak();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = rate;
    utter.pitch = 1;

    const v = await pickLockedVoice(lang);
    if (!v) throw new Error("VOICE_NOT_FOUND");
    utter.voice = v;
    utter.lang = v.lang || (lang === "es" ? "es-MX" : "en-AU");

    return new Promise((resolve, reject) => {
      utter.onend = resolve;
      utter.onerror = reject;
      speechSynthesis.speak(utter);
    });
  }

  // ---------------------------
  // Chat
  // ---------------------------
  function chatStorageLoad() {
    return safeJSON(localStorage.getItem(LS.savedChats) || "[]", []);
  }
  function chatStorageSave(list) {
    localStorage.setItem(LS.savedChats, JSON.stringify(list || []));
  }

  function addBubble(kind, text) {
    const chat = $("#chat");
    if (!chat) return;

    const row = document.createElement("div");
    row.className = `bubble-row ${kind}`;

    const bubble = document.createElement("div");
    bubble.className = `bubble ${kind}`;
    bubble.textContent = text;

    row.appendChild(bubble);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
  }

  function getLastBotText() {
    const chat = $("#chat");
    if (!chat) return "";
    const bots = chat.querySelectorAll(".bubble.bot");
    if (!bots.length) return "";
    return (bots[bots.length - 1].textContent || "").trim();
  }

  function renderSavedChats() {
    const box = $("#chatSavedList");
    if (!box) return;

    const lang = getUiLang();
    const t = I18N[lang];

    const list = chatStorageLoad();
    box.innerHTML = "";

    if (!list.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = t.noSaved;
      box.appendChild(small);
      return;
    }

    list.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = list.length - 1 - idxFromEnd;
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${item.title || "Chat"} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
      btn.addEventListener("click", () => {
        const chat = $("#chat");
        if (!chat) return;
        chat.innerHTML = "";
        (item.messages || []).forEach(m => addBubble(m.kind, m.text));
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.textContent = t.delete;
      del.style.marginTop = "8px";
      del.addEventListener("click", () => {
        const next = chatStorageLoad().filter((_, i) => i !== idx);
        chatStorageSave(next);
        renderSavedChats();
      });

      box.appendChild(btn);
      box.appendChild(del);
    });
  }

  function getChatMessagesFromDOM() {
    const chat = $("#chat");
    if (!chat) return [];
    const rows = chat.querySelectorAll(".bubble-row");
    const msgs = [];
    rows.forEach(r => {
      const kind = r.classList.contains("user") ? "user" : r.classList.contains("bot") ? "bot" : "system";
      const b = r.querySelector(".bubble");
      const text = (b && b.textContent) ? b.textContent : "";
      msgs.push({ kind, text });
    });
    return msgs;
  }

  function initChat() {
    const form = $("#chatForm");
    const input = $("#chatInput");
    const newBtn = $("#chatNewBtn");
    const saveBtn = $("#chatSaveBtn");
    const sendBtn = $("#chatSendBtn");
    const stopBtn = $("#chatStopBtn");
    const listenBtn = $("#chatListenBtn");

    // Restore draft
    if (input) input.value = localStorage.getItem(LS.chatDraft) || "";

    if (input) {
      input.addEventListener("input", () => {
        localStorage.setItem(LS.chatDraft, input.value || "");
      });
    }

    if (stopBtn) stopBtn.addEventListener("click", stopSpeak);

    if (newBtn) {
      newBtn.addEventListener("click", () => {
        const chat = $("#chat");
        if (chat) chat.innerHTML = "";
        if (input) input.value = "";
        localStorage.removeItem(LS.chatDraft);
        stopSpeak();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const msgs = getChatMessagesFromDOM();
        if (!msgs.length) return toast(getUiLang() === "es" ? "Nada para guardar todavía." : "Nothing to save yet.");
        const title = (msgs.find(m => m.kind === "user")?.text || "Chat").slice(0, 36);
        const list = chatStorageLoad();
        list.push({ ts: nowISO(), title, messages: msgs });
        chatStorageSave(list);
        renderSavedChats();
        toast(getUiLang() === "es" ? "Guardado." : "Saved.");
      });
    }

    if (listenBtn) {
      listenBtn.addEventListener("click", async () => {
        const last = getLastBotText() || "";
        if (!last) return toast(getUiLang() === "es" ? "No hay mensaje para leer todavía." : "No bot message to read yet.");

        const langSel = $("#chatLangSelect");
        const chosen = (langSel && langSel.value) ? langSel.value : "auto";
        const lang = (chosen === "es") ? "es" : (chosen === "en") ? "en" : (/[áéíóúñ¿¡]/i.test(last) ? "es" : "en");

        try {
          await speakText(last, lang);
        } catch (e) {
          toast(I18N[getUiLang()].voiceMissing);
        }
      });
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!input) return;

        const msg = (input.value || "").trim();
        if (!msg) return;

        addBubble("user", msg);
        input.value = "";
        localStorage.removeItem(LS.chatDraft);

        sendBtn && (sendBtn.disabled = true);

        try {
          const resp = await apiPost("/chat", { message: msg });
          const reply = (resp && resp.reply) ? String(resp.reply) : "(No reply)";
          addBubble("bot", reply);
        } catch (err) {
          addBubble("system", `Error: ${String(err.message || err)}`);
        } finally {
          sendBtn && (sendBtn.disabled = false);
        }
      });
    }

    renderSavedChats();
  }

  // ---------------------------
  // Devotionals
  // ---------------------------
  function loadSavedDevs() {
    return safeJSON(localStorage.getItem(LS.savedDevs) || "[]", []);
  }
  function saveSavedDevs(list) {
    localStorage.setItem(LS.savedDevs, JSON.stringify(list || []));
  }

  function renderSavedDevs() {
    const box = $("#devSavedList");
    if (!box) return;

    const lang = getUiLang();
    const t = I18N[lang];

    const list = loadSavedDevs();
    box.innerHTML = "";

    if (!list.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = t.noSaved;
      box.appendChild(small);
      return;
    }

    list.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = list.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${(item.theme || (lang === "es" ? "Devocional" : "Devotional")).slice(0, 40)} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
      btn.addEventListener("click", () => {
        $("#devTheme").textContent = item.theme || "—";
        $("#devScriptureRef").textContent = item.scripture_ref || "—";
        $("#devScriptureText").textContent = item.scripture_text || "—";
        $("#devStarterContext").textContent = item.starter_context || "—";
        $("#devStarterReflection").textContent = item.starter_reflection || "—";
        $("#devStarterApplication").textContent = item.starter_application || "—";
        $("#devStarterPrayer").textContent = item.starter_prayer || "—";

        $("#devMyContext").value = item.my_context || "";
        $("#devMyReflection").value = item.my_reflection || "";
        $("#devMyApplication").value = item.my_application || "";
        $("#devMyPrayer").value = item.my_prayer || "";
        $("#devMyNotes").value = item.my_notes || "";
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.textContent = t.delete;
      del.style.marginTop = "8px";
      del.addEventListener("click", () => {
        const next = loadSavedDevs().filter((_, i) => i !== idx);
        saveSavedDevs(next);
        renderSavedDevs();
      });

      box.appendChild(btn);
      box.appendChild(del);
    });
  }

  function initDevotional() {
    const generateBtn = $("#devotionalBtn");
    const saveBtn = $("#devSaveBtn");
    const langSel = $("#devUiLang");

    // global lang init
    if (langSel) {
      langSel.addEventListener("change", () => setUiLang(langSel.value));
    }

    // restore drafts
    const draft = safeJSON(localStorage.getItem(LS.devDraft) || "{}", {});
    if ($("#devMyContext")) $("#devMyContext").value = draft.my_context || "";
    if ($("#devMyReflection")) $("#devMyReflection").value = draft.my_reflection || "";
    if ($("#devMyApplication")) $("#devMyApplication").value = draft.my_application || "";
    if ($("#devMyPrayer")) $("#devMyPrayer").value = draft.my_prayer || "";
    if ($("#devMyNotes")) $("#devMyNotes").value = draft.my_notes || "";

    const saveDraft = () => {
      const d = {
        my_context: $("#devMyContext")?.value || "",
        my_reflection: $("#devMyReflection")?.value || "",
        my_application: $("#devMyApplication")?.value || "",
        my_prayer: $("#devMyPrayer")?.value || "",
        my_notes: $("#devMyNotes")?.value || "",
      };
      localStorage.setItem(LS.devDraft, JSON.stringify(d));
    };

    ["#devMyContext","#devMyReflection","#devMyApplication","#devMyPrayer","#devMyNotes"].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener("input", saveDraft);
    });

    if (generateBtn) {
      generateBtn.addEventListener("click", async () => {
        generateBtn.disabled = true;
        try {
          // Starter example (UI language only)
          const ui = getUiLang();
          if (ui === "es") {
            $("#devTheme").textContent = "Caminar en Paz";
            $("#devScriptureRef").textContent = "Filipenses 4:6–7";
            $("#devScriptureText").textContent =
              "6. Por nada estéis afanosos, sino sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias.\n" +
              "7. Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.";
            $("#devStarterContext").textContent =
              "Pablo anima a los creyentes a llevar cada preocupación a Dios en oración, en vez de cargarla solos.";
            $("#devStarterReflection").textContent =
              "La paz de Dios no depende de las circunstancias. Es un guardia sobre tu corazón cuando confías en Él.";
            $("#devStarterApplication").textContent =
              "Hoy, nombra específicamente lo que te preocupa y entrégaselo a Dios en oración—y practica la gratitud.";
            $("#devStarterPrayer").textContent =
              "Señor, enséñame a traer mis cargas a Ti. Reemplaza mi ansiedad con Tu paz. Amén.";
          } else {
            $("#devTheme").textContent = "Walking in Peace";
            $("#devScriptureRef").textContent = "Philippians 4:6–7";
            $("#devScriptureText").textContent =
              "6. Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.\n" +
              "7. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.";
            $("#devStarterContext").textContent =
              "Paul is encouraging believers to bring every worry to God in prayer instead of carrying anxiety alone.";
            $("#devStarterReflection").textContent =
              "God’s peace is not based on circumstances. It is a guard over your heart when you trust Him.";
            $("#devStarterApplication").textContent =
              "Today, name the specific thing you’re anxious about, and hand it to God in prayer—then practice gratitude.";
            $("#devStarterPrayer").textContent =
              "Lord, teach me to bring my burdens to You. Replace my anxiety with Your peace. Amen.";
          }
        } catch (e) {
          toast(String(e.message || e));
        } finally {
          generateBtn.disabled = false;
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const ui = getUiLang();

        const my_context = ($("#devMyContext")?.value || "").trim();
        const my_reflection = ($("#devMyReflection")?.value || "").trim();
        const my_application = ($("#devMyApplication")?.value || "").trim();
        const my_prayer = ($("#devMyPrayer")?.value || "").trim();

        if (!my_context || !my_reflection || !my_application || !my_prayer) {
          return toast(ui === "es"
            ? "Para guardar: Contexto + Reflexión + Aplicación + Oración son obligatorios."
            : "To save: Context + Reflection + Application + Prayer are required."
          );
        }

        const item = {
          ts: nowISO(),
          theme: $("#devTheme")?.textContent || "",
          scripture_ref: $("#devScriptureRef")?.textContent || "",
          scripture_text: $("#devScriptureText")?.textContent || "",
          starter_context: $("#devStarterContext")?.textContent || "",
          starter_reflection: $("#devStarterReflection")?.textContent || "",
          starter_application: $("#devStarterApplication")?.textContent || "",
          starter_prayer: $("#devStarterPrayer")?.textContent || "",
          my_context,
          my_reflection,
          my_application,
          my_prayer,
          my_notes: $("#devMyNotes")?.value || "",
        };

        const list = loadSavedDevs();
        list.push(item);
        saveSavedDevs(list);
        renderSavedDevs();
        toast(ui === "es" ? "Devocional guardado." : "Saved devotional.");
      });
    }

    renderSavedDevs();
  }

  // ---------------------------
  // Daily Prayer
  // ---------------------------
  function loadSavedPrayers() {
    return safeJSON(localStorage.getItem(LS.savedPrayers) || "[]", []);
  }
  function saveSavedPrayers(list) {
    localStorage.setItem(LS.savedPrayers, JSON.stringify(list || []));
  }

  function renderSavedPrayers() {
    const box = $("#prSavedList");
    if (!box) return;

    const lang = getUiLang();
    const t = I18N[lang];

    const list = loadSavedPrayers();
    box.innerHTML = "";

    if (!list.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = t.noSaved;
      box.appendChild(small);
      return;
    }

    list.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = list.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${(item.title || (lang === "es" ? "Oración" : "Prayer")).slice(0, 40)} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
      btn.addEventListener("click", () => {
        $("#pA").textContent = item.starterA || "—";
        $("#pC").textContent = item.starterC || "—";
        $("#pT").textContent = item.starterT || "—";
        $("#pS").textContent = item.starterS || "—";
        $("#myAdoration").value = item.myA || "";
        $("#myConfession").value = item.myC || "";
        $("#myThanksgiving").value = item.myT || "";
        $("#mySupplication").value = item.myS || "";
        $("#prayerNotes").value = item.notes || "";
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.textContent = t.delete;
      del.style.marginTop = "8px";
      del.addEventListener("click", () => {
        const next = loadSavedPrayers().filter((_, i) => i !== idx);
        saveSavedPrayers(next);
        renderSavedPrayers();
      });

      box.appendChild(btn);
      box.appendChild(del);
    });
  }

  function initPrayer() {
    const genBtn = $("#prayerBtn");
    const saveBtn = $("#prSaveBtn");
    const langSel = $("#prUiLang");

    if (langSel) {
      langSel.addEventListener("change", () => setUiLang(langSel.value));
    }

    // restore draft
    const draft = safeJSON(localStorage.getItem(LS.prDraft) || "{}", {});
    if ($("#myAdoration")) $("#myAdoration").value = draft.myA || "";
    if ($("#myConfession")) $("#myConfession").value = draft.myC || "";
    if ($("#myThanksgiving")) $("#myThanksgiving").value = draft.myT || "";
    if ($("#mySupplication")) $("#mySupplication").value = draft.myS || "";
    if ($("#prayerNotes")) $("#prayerNotes").value = draft.notes || "";

    const saveDraft = () => {
      localStorage.setItem(LS.prDraft, JSON.stringify({
        myA: $("#myAdoration")?.value || "",
        myC: $("#myConfession")?.value || "",
        myT: $("#myThanksgiving")?.value || "",
        myS: $("#mySupplication")?.value || "",
        notes: $("#prayerNotes")?.value || "",
      }));
    };

    ["#myAdoration","#myConfession","#myThanksgiving","#mySupplication","#prayerNotes"].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener("input", saveDraft);
    });

    if (genBtn) {
      genBtn.addEventListener("click", () => {
        const ui = getUiLang();
        if (ui === "es") {
          $("#pA").textContent = "Señor, Tú eres santo, fiel y cercano. Te alabo por Tu amor y misericordia.";
          $("#pC").textContent = "Padre, perdóname por donde he fallado. Limpia mi corazón y renueva mi mente.";
          $("#pT").textContent = "Gracias por la vida, la protección, la provisión y la gracia que me das cada día.";
          $("#pS").textContent = "Guíame hoy, por favor. Dame sabiduría, fuerza y paz. Bendice a mi familia y a los que amo.";
        } else {
          $("#pA").textContent = "Lord, You are holy, faithful, and near. I praise You for Your love and mercy.";
          $("#pC").textContent = "Father, forgive me for where I have fallen short. Cleanse my heart and renew my mind.";
          $("#pT").textContent = "Thank You for life, protection, provision, and the grace You give me each day.";
          $("#pS").textContent = "Please guide me today. Give me wisdom, strength, and peace. Help my family and those I love.";
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const ui = getUiLang();

        const myA = ($("#myAdoration")?.value || "").trim();
        const myC = ($("#myConfession")?.value || "").trim();
        const myT = ($("#myThanksgiving")?.value || "").trim();
        const myS = ($("#mySupplication")?.value || "").trim();

        if (!myA || !myC || !myT || !myS) {
          return toast(ui === "es"
            ? "Para guardar: Adoración + Confesión + Acción de gracias + Súplica son obligatorios."
            : "To save: Adoration + Confession + Thanksgiving + Supplication are required."
          );
        }

        const item = {
          ts: nowISO(),
          title: ui === "es" ? "Oración diaria" : "Daily Prayer",
          starterA: $("#pA")?.textContent || "",
          starterC: $("#pC")?.textContent || "",
          starterT: $("#pT")?.textContent || "",
          starterS: $("#pS")?.textContent || "",
          myA, myC, myT, myS,
          notes: $("#prayerNotes")?.value || "",
        };

        const list = loadSavedPrayers();
        list.push(item);
        saveSavedPrayers(list);
        renderSavedPrayers();
        toast(ui === "es" ? "Oración guardada." : "Saved prayer.");
      });
    }

    renderSavedPrayers();
  }

  // ---------------------------
  // Bible Reader (EN/ES DB + locked voices)
  // ---------------------------
  function bibleVersionForReadingLang(readLang /* en|es */) {
    // English -> bible.db => version=en_default
    // Spanish -> bible_es_rvr.db => version=es
    return (readLang === "es") ? "es" : "en_default";
  }

  async function refreshBibleStatus() {
    const el = $("#bibleDbStatus");
    if (!el) return;

    const readVoice = $("#readingVoice");
    const readLang = (readVoice && readVoice.value === "es") ? "es" : "en";
    const version = bibleVersionForReadingLang(readLang);

    try {
      const j = await apiGet(`/bible/status?version=${encodeURIComponent(version)}`);
      el.textContent = `OK • ${j.version} • verses: ${j.verse_count}`;
    } catch (e) {
      el.textContent = `Error: ${(e && e.message) ? e.message : String(e)}`;
    }
  }

  async function loadBooks() {
    const bookSel = $("#bookSelect");
    if (!bookSel) return;

    const t = I18N[getUiLang()];

    const readVoice = $("#readingVoice");
    const readLang = (readVoice && readVoice.value === "es") ? "es" : "en";
    const version = bibleVersionForReadingLang(readLang);

    bookSel.innerHTML = `<option value="">${t.loading}</option>`;

    try {
      const j = await apiGet(`/bible/books?version=${encodeURIComponent(version)}`);
      const books = j.books || [];
      bookSel.innerHTML = `<option value="">${t.select}</option>`;
      books.forEach((b) => {
        const opt = document.createElement("option");
        opt.value = String(b.id);
        opt.textContent = b.name;
        bookSel.appendChild(opt);
      });
    } catch (e) {
      bookSel.innerHTML = `<option value="">${t.errorLoadingBooks}</option>`;
      const status = $("#bibleDbStatus");
      if (status) status.textContent = t.bibleNotFound;
    }
  }

  async function loadChaptersForBook() {
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    if (!bookSel || !chapSel || !vsStart || !vsEnd) return;

    const t = I18N[getUiLang()];

    chapSel.innerHTML = `<option value="">—</option>`;
    vsStart.innerHTML = `<option value="">—</option>`;
    vsEnd.innerHTML = `<option value="">${t.optional}</option>`;

    const bid = parseInt(bookSel.value || "0", 10);
    if (!bid) return;

    const readVoice = $("#readingVoice");
    const readLang = (readVoice && readVoice.value === "es") ? "es" : "en";
    const version = bibleVersionForReadingLang(readLang);

    try {
      const j = await apiGet(`/bible/chapters?version=${encodeURIComponent(version)}&book_id=${bid}`);
      const chs = j.chapters || [];
      chapSel.innerHTML = `<option value="">${t.select}</option>`;
      chs.forEach((n) => {
        const opt = document.createElement("option");
        opt.value = String(n);
        opt.textContent = String(n);
        chapSel.appendChild(opt);
      });
    } catch (e) {
      chapSel.innerHTML = `<option value="">(Error)</option>`;
    }
  }

  async function loadVersesForChapter() {
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    if (!bookSel || !chapSel || !vsStart || !vsEnd) return;

    const t = I18N[getUiLang()];

    vsStart.innerHTML = `<option value="">—</option>`;
    vsEnd.innerHTML = `<option value="">${t.optional}</option>`;

    const bid = parseInt(bookSel.value || "0", 10);
    const ch = parseInt(chapSel.value || "0", 10);
    if (!bid || !ch) return;

    const readVoice = $("#readingVoice");
    const readLang = (readVoice && readVoice.value === "es") ? "es" : "en";
    const version = bibleVersionForReadingLang(readLang);

    try {
      const j = await apiGet(`/bible/verses_max?version=${encodeURIComponent(version)}&book_id=${bid}&chapter=${ch}`);
      const maxV = parseInt(j.max_verse || "0", 10);
      if (!maxV) return;

      vsStart.innerHTML = `<option value="">${t.select}</option>`;
      vsEnd.innerHTML = `<option value="">${t.optional}</option>`;
      for (let i = 1; i <= maxV; i++) {
        const o1 = document.createElement("option");
        o1.value = String(i);
        o1.textContent = String(i);
        vsStart.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = String(i);
        o2.textContent = String(i);
        vsEnd.appendChild(o2);
      }
    } catch (e) {
      // ignore
    }
  }

  async function listenBible() {
    const t = I18N[getUiLang()];

    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    const fullCh = $("#fullChapter");
    const passageRef = $("#passageRef");
    const passageText = $("#passageText");

    if (!bookSel || !chapSel || !passageRef || !passageText) return;

    const bid = parseInt(bookSel.value || "0", 10);
    const ch = parseInt(chapSel.value || "0", 10);
    if (!bid || !ch) return toast(t.pickBookChapterFirst);

    const readVoice = $("#readingVoice");
    const readLang = (readVoice && readVoice.value === "es") ? "es" : "en";
    const version = bibleVersionForReadingLang(readLang);
    const whole = !!(fullCh && fullCh.checked);

    const qs = new URLSearchParams();
    qs.set("version", version);
    qs.set("book_id", String(bid));
    qs.set("chapter", String(ch));
    if (whole) {
      qs.set("whole_chapter", "true");
    } else {
      const s = parseInt(vsStart?.value || "0", 10);
      const e = parseInt(vsEnd?.value || "0", 10);
      if (s) qs.set("verse_start", String(s));
      if (e) qs.set("verse_end", String(e));
    }

    try {
      const j = await apiGet(`/bible/text?${qs.toString()}`);
      passageRef.textContent = `${j.book} ${j.chapter}`;
      passageText.textContent = j.text || "—";

      const toSpeak = (j.text || "").trim();
      if (!toSpeak) return;

      // Speak ONLY the verse text (no extra labels)
      await speakText(toSpeak, readLang, 1.0);
    } catch (e) {
      toast(String(e.message || e));
    }
  }

  function initBible() {
    const listenBtn = $("#listenBible");
    const stopBtn = $("#stopBible");
    const readVoice = $("#readingVoice");
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");

    if (listenBtn) listenBtn.addEventListener("click", listenBible);
    if (stopBtn) stopBtn.addEventListener("click", stopSpeak);

    if (readVoice) {
      readVoice.addEventListener("change", async () => {
        stopSpeak();
        await refreshBibleStatus();
        await loadBooks();
      });
    }

    if (bookSel) bookSel.addEventListener("change", async () => {
      await loadChaptersForBook();
    });

    if (chapSel) chapSel.addEventListener("change", async () => {
      await loadVersesForChapter();
    });

    refreshBibleStatus().catch(() => {});
    loadBooks().catch(() => {});
  }

  // ---------------------------
  // Init + safety
  // ---------------------------
  async function init() {
    showTopStatus("JS: starting…");

    // Set global UI lang from localStorage BEFORE init renders
    const ui = getUiLang();
    setUiLang(ui); // sync selects + apply text

    // Also: if you have per-section selectors, keep them synced on load
    const devSel = $("#devUiLang");
    const prSel = $("#prUiLang");
    if (devSel) devSel.value = ui;
    if (prSel) prSel.value = ui;

    initTabs();
    initChat();
    initDevotional();
    initPrayer();
    initBible();

    // Voice pills: verify locked voices exist
    const ttsStatus = $("#ttsStatus");
    const chatVoicePill = $("#chatVoicePill");

    try {
      const vEn = await pickLockedVoice("en");
      const vEs = await pickLockedVoice("es");
      const ok = !!(vEn && vEs);
      const msg = ok ? I18N[getUiLang()].voiceReady : I18N[getUiLang()].voiceMissing;

      if (ttsStatus) ttsStatus.textContent = msg;
      if (chatVoicePill) chatVoicePill.textContent = msg;
    } catch {
      const msg = I18N[getUiLang()].voiceMissing;
      if (ttsStatus) ttsStatus.textContent = msg;
      if (chatVoicePill) chatVoicePill.textContent = msg;
    }

    showTopStatus("JS: ready");
  }

  window.addEventListener("error", (e) => {
    console.error("Global error:", e.error || e.message);
    showTopStatus("JS: error");
  });

  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled rejection:", e.reason);
    showTopStatus("JS: error");
  });

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error("Init failed:", e);
      showTopStatus("JS: error");
    });
  });

})();

































