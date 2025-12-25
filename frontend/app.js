/* frontend/app.js */

(() => {
  "use strict";

  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
  }[c]));

  const LS = {
    CHATS: "alyana_chats_v1",
    DEVOS: "alyana_devotionals_v1",
    PRAYERS: "alyana_prayers_v1",
    DEV_STREAK: "alyana_dev_streak_v1",
    PR_STREAK: "alyana_pr_streak_v1",
  };

  const nowISO = () => new Date().toISOString();

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  function setPill(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("ok", "warn", "bad");
    if (cls) el.classList.add(cls);
  }

  function scrollChatToBottom() {
    const chat = $("chat");
    if (!chat) return;
    chat.scrollTop = chat.scrollHeight;
  }

  // -----------------------------
  // i18n (UI text only)
  // -----------------------------
  const I18N = {
    dev: {
      en: {
        intro: "Alyana gives short starter examples. You write and save your real devotional.",
        generate: "Generate",
        save: "Save",
        didToday: "I did it today",
        streak: "Streak",
        req: "Required to save (streak): Context + Reflection + Application + Prayer.",
        nowWrite: "Now write yours:",
        theme: "Theme / Title (Alyana)",
        scripture: "Scripture (Alyana)",
        ctx: "Alyana Starter — Context / Observation",
        ref: "Alyana Starter — Reflection / Insight",
        app: "Alyana Starter — Application (Practical)",
        pr: "Alyana Starter — Prayer",
        notes: "Notes / Reflection (optional)",
        ph_ctx: "Context / Observation (What’s happening? Who is speaking? Why does it matter?)",
        ph_ref: "Reflection / Insight (What does this reveal about God? About me?)",
        ph_app: "Application (What will I do today because of this?)",
        ph_pr: "Prayer (write your real prayer here)",
        ph_notes: "Notes…",
        savedEmpty: "No saved devotionals yet.",
      },
      es: {
        intro: "Alyana da ejemplos cortos. Tú escribes y guardas tu devocional real.",
        generate: "Generar",
        save: "Guardar",
        didToday: "Lo hice hoy",
        streak: "Racha",
        req: "Requerido para guardar (racha): Contexto + Reflexión + Aplicación + Oración.",
        nowWrite: "Ahora escribe el tuyo:",
        theme: "Tema / Título (Alyana)",
        scripture: "Escritura (Alyana)",
        ctx: "Inicio de Alyana — Contexto / Observación",
        ref: "Inicio de Alyana — Reflexión / Enseñanza",
        app: "Inicio de Alyana — Aplicación (Práctica)",
        pr: "Inicio de Alyana — Oración",
        notes: "Notas / Reflexión (opcional)",
        ph_ctx: "Contexto / Observación (¿Qué está pasando? ¿Quién habla? ¿Por qué importa?)",
        ph_ref: "Reflexión (¿Qué revela de Dios? ¿Qué revela de mí?)",
        ph_app: "Aplicación (¿Qué haré hoy por esta verdad?)",
        ph_pr: "Oración (escribe tu oración aquí)",
        ph_notes: "Notas…",
        savedEmpty: "Todavía no hay devocionales guardados.",
      },
    },
    prayer: {
      en: {
        intro: "Alyana gives a short starter example. You write and save your real prayer.",
        generate: "Generate Starters",
        save: "Save",
        didToday: "I did it today",
        streak: "Streak",
        a: "Alyana Starter — Adoration",
        c: "Alyana Starter — Confession",
        t: "Alyana Starter — Thanksgiving",
        s: "Alyana Starter — Supplication",
        n: "Notes",
        now: "Now write your own:",
        ph_a: "Adoration (praise God for who He is)…",
        ph_c: "Confession (what I need to confess)…",
        ph_t: "Thanksgiving (what I’m grateful for)…",
        ph_s: "Supplication (requests for myself/others)…",
        ph_n: "Notes…",
        savedEmpty: "No saved prayers yet.",
      },
      es: {
        intro: "Alyana da un ejemplo corto. Tú escribes y guardas tu oración real.",
        generate: "Generar Inicios",
        save: "Guardar",
        didToday: "Lo hice hoy",
        streak: "Racha",
        a: "Inicio de Alyana — Adoración",
        c: "Inicio de Alyana — Confesión",
        t: "Inicio de Alyana — Gratitud",
        s: "Inicio de Alyana — Peticiones",
        n: "Notas",
        now: "Ahora escribe la tuya:",
        ph_a: "Adoración (alaba a Dios por quien Él es)…",
        ph_c: "Confesión (lo que necesito confesar)…",
        ph_t: "Gratitud (por lo que estoy agradecido)…",
        ph_s: "Peticiones (por mí / por otros)…",
        ph_n: "Notas…",
        savedEmpty: "Todavía no hay oraciones guardadas.",
      },
    },
  };

  // -----------------------------
  // TTS: lock voices
  // -----------------------------
  let VOICES = [];
  let voicesReady = false;

  function loadVoices() {
    VOICES = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (VOICES && VOICES.length > 0) voicesReady = true;
    return VOICES;
  }

  function findPreferredVoice(target) {
    // target: "es" or "en"
    loadVoices();

    const want = target === "es"
      ? { nameIncludes: "Paulina", lang: "es-MX" }
      : { nameIncludes: "Karen", lang: "en-AU" };

    // 1) Exact-ish match by name + lang
    let v = VOICES.find(x =>
      (x.name || "").toLowerCase().includes(want.nameIncludes.toLowerCase()) &&
      (x.lang || "").toLowerCase().startsWith(want.lang.toLowerCase())
    );
    if (v) return { voice: v, exact: true };

    // 2) Name-only
    v = VOICES.find(x =>
      (x.name || "").toLowerCase().includes(want.nameIncludes.toLowerCase())
    );
    if (v) return { voice: v, exact: false };

    // 3) Lang match fallback
    v = VOICES.find(x => (x.lang || "").toLowerCase().startsWith(want.lang.toLowerCase()));
    if (v) return { voice: v, exact: false };

    // 4) Generic language fallback
    if (target === "es") {
      v = VOICES.find(x => (x.lang || "").toLowerCase().startsWith("es"));
    } else {
      v = VOICES.find(x => (x.lang || "").toLowerCase().startsWith("en"));
    }
    if (v) return { voice: v, exact: false };

    return { voice: null, exact: false };
  }

  function speakText(text, langTarget, pillEl) {
    if (!window.speechSynthesis) {
      if (pillEl) setPill(pillEl, "Voice: not supported", "bad");
      return;
    }

    window.speechSynthesis.cancel();

    const { voice, exact } = findPreferredVoice(langTarget);
    const utter = new SpeechSynthesisUtterance(String(text || "").trim());

    // Force language tags
    utter.lang = (langTarget === "es") ? "es-MX" : "en-AU";

    if (voice) utter.voice = voice;

    if (pillEl) {
      if (voice) {
        const label = `${voice.name} (${voice.lang})${exact ? "" : " (fallback)"}`;
        setPill(pillEl, `Voice: ${label}`, exact ? "ok" : "warn");
      } else {
        setPill(pillEl, "Voice: missing (install Paulina/Karen)", "bad");
      }
    }

    window.speechSynthesis.speak(utter);
  }

  function stopSpeak(pillEl) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (pillEl) setPill(pillEl, "Voice: stopped", "warn");
  }

  // voices load async in many browsers
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      loadVoices();
      voicesReady = true;
      const tts = $("ttsStatus");
      const chatPill = $("chatVoicePill");
      if (tts) setPill(tts, "Voice: ready", "ok");
      if (chatPill) setPill(chatPill, "Voice: ready", "ok");
    };
    loadVoices();
  }

  // -----------------------------
  // Navigation (tabs)
  // -----------------------------
  function setupMenu() {
    const buttons = Array.from(document.querySelectorAll(".menu-btn"));
    const sections = Array.from(document.querySelectorAll(".app-section"));
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        const target = btn.getAttribute("data-target");
        sections.forEach((s) => s.classList.remove("active"));
        const sec = document.getElementById(target);
        if (sec) sec.classList.add("active");
      });
    });
  }

  // -----------------------------
  // Chat
  // -----------------------------
  let chatMessages = []; // {role:"user"|"bot"|"system", text, ts}

  function renderChat() {
    const chat = $("chat");
    if (!chat) return;
    chat.innerHTML = "";

    for (const msg of chatMessages) {
      const row = document.createElement("div");
      row.className = `bubble-row ${msg.role}`;

      const bubble = document.createElement("div");
      bubble.className = `bubble ${msg.role}`;
      bubble.textContent = msg.text;

      row.appendChild(bubble);
      chat.appendChild(row);
    }
    scrollChatToBottom();
  }

  function addChat(role, text) {
    chatMessages.push({ role, text: String(text || ""), ts: nowISO() });
    renderChat();
  }

  function newChat() {
    chatMessages = [];
    addChat("system", "New chat started.");
  }

  function getLastBotMessage() {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === "bot") return chatMessages[i].text;
    }
    return "";
  }

  function loadSavedChats() {
    const list = $("chatSavedList");
    if (!list) return;

    const saved = readJSON(LS.CHATS, []);
    if (!Array.isArray(saved) || saved.length === 0) {
      list.innerHTML = `<small style="opacity:0.75;">No saved chats yet.</small>`;
      return;
    }

    list.innerHTML = "";
    saved
      .slice()
      .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
      .forEach((item, idx) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        const title = item.title || `Chat ${idx + 1}`;
        const date = item.ts ? new Date(item.ts).toLocaleString() : "";
        btn.textContent = `${title}${date ? " — " + date : ""}`;
        btn.addEventListener("click", () => {
          chatMessages = Array.isArray(item.messages) ? item.messages : [];
          renderChat();
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = "Delete";
        del.addEventListener("click", () => {
          const all = readJSON(LS.CHATS, []);
          const filtered = all.filter((x) => x.id !== item.id);
          writeJSON(LS.CHATS, filtered);
          loadSavedChats();
        });

        const wrap = document.createElement("div");
        wrap.style.display = "grid";
        wrap.style.gridTemplateColumns = "1fr 120px";
        wrap.style.gap = "8px";
        wrap.appendChild(btn);
        wrap.appendChild(del);
        list.appendChild(wrap);
      });
  }

  function saveCurrentChat() {
    const saved = readJSON(LS.CHATS, []);
    const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    const title = (chatMessages.find((m) => m.role === "user")?.text || "Chat").slice(0, 40);
    saved.push({ id, title, ts: nowISO(), messages: chatMessages });
    writeJSON(LS.CHATS, saved);
    loadSavedChats();
  }

  async function sendChat() {
    const input = $("chatInput");
    const btn = $("chatSendBtn");
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    addChat("user", text);

    if (btn) btn.disabled = true;

    try {
      const resp = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await resp.json().catch(() => ({}));
      const reply = data.reply || data.response || "Sorry — no response.";
      addChat("bot", reply);
    } catch (e) {
      addChat("bot", "Sorry — the server did not respond. Check your backend logs.");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function setupChat() {
    const js = $("jsStatus");
    if (js) js.textContent = "JS: ready";

    const form = $("chatForm");
    const newBtn = $("chatNewBtn");
    const saveBtn = $("chatSaveBtn");
    const listenBtn = $("chatListenBtn");
    const stopBtn = $("chatStopBtn");
    const chatLang = $("chatLangSelect");
    const chatVoicePill = $("chatVoicePill");

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        sendChat();
      });
    }
    if (newBtn) newBtn.addEventListener("click", newChat);
    if (saveBtn) saveBtn.addEventListener("click", saveCurrentChat);

    if (listenBtn) {
      listenBtn.addEventListener("click", () => {
        const last = getLastBotMessage();
        if (!last) return;

        const pref = (chatLang && chatLang.value) ? chatLang.value : "auto";
        const langTarget = (pref === "es") ? "es" : "en"; // auto defaults to English voice
        speakText(last, langTarget, chatVoicePill);
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener("click", () => stopSpeak(chatVoicePill));
    }

    // init
    newChat();
    loadSavedChats();
    if (chatVoicePill) setPill(chatVoicePill, voicesReady ? "Voice: ready" : "Voice: loading…", voicesReady ? "ok" : "warn");
  }

  // -----------------------------
  // Devotionals (local storage + UI language)
  // -----------------------------
  function applyDevLang() {
    const lang = ($("devUiLang")?.value || "en");
    const t = I18N.dev[lang] || I18N.dev.en;

    const el = (id, val) => { const x = $(id); if (x) x.textContent = val; };
    el("devIntro", t.intro);
    el("devLabelTheme", t.theme);
    el("devLabelScripture", t.scripture);
    el("devLabelCtxA", t.ctx);
    el("devLabelRefA", t.ref);
    el("devLabelAppA", t.app);
    el("devLabelPrA", t.pr);
    el("devLabelNotes", t.notes);
    el("devNow1", t.nowWrite);
    el("devNow2", t.nowWrite);
    el("devNow3", t.nowWrite);
    el("devNow4", t.nowWrite);
    el("devReqNote", t.req);

    const btnGen = $("devotionalBtn");
    const btnSave = $("devSaveBtn");
    const btnStreak = $("devStreakBtn");
    const pill = $("devStreakPill");
    if (btnGen) btnGen.textContent = t.generate;
    if (btnSave) btnSave.textContent = t.save;
    if (btnStreak) btnStreak.textContent = t.didToday;
    if (pill) pill.textContent = `${t.streak}: ${getDevStreak()}`;

    const ph = (id, val) => { const x = $(id); if (x) x.placeholder = val; };
    ph("devMyContext", t.ph_ctx);
    ph("devMyReflection", t.ph_ref);
    ph("devMyApplication", t.ph_app);
    ph("devMyPrayer", t.ph_pr);
    ph("devMyNotes", t.ph_notes);

    renderDevSavedList();
  }

  function getDevStreak() {
    const n = parseInt(localStorage.getItem(LS.DEV_STREAK) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  }

  function incDevStreak() {
    const next = getDevStreak() + 1;
    localStorage.setItem(LS.DEV_STREAK, String(next));
    applyDevLang();
  }

  function getDevos() {
    const arr = readJSON(LS.DEVOS, []);
    return Array.isArray(arr) ? arr : [];
  }

  function saveDevo() {
    // Must include the user-written fields
    const myContext = ($("devMyContext")?.value || "").trim();
    const myReflection = ($("devMyReflection")?.value || "").trim();
    const myApplication = ($("devMyApplication")?.value || "").trim();
    const myPrayer = ($("devMyPrayer")?.value || "").trim();
    const myNotes = ($("devMyNotes")?.value || "").trim();

    if (!myContext || !myReflection || !myApplication || !myPrayer) {
      alert("To save: Context + Reflection + Application + Prayer are required.");
      return;
    }

    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      ts: nowISO(),
      lang: $("devUiLang")?.value || "en",
      alyana: {
        theme: $("devTheme")?.textContent || "",
        scripture_ref: $("devScriptureRef")?.textContent || "",
        scripture_text: $("devScriptureText")?.textContent || "",
        starter_context: $("devStarterContext")?.textContent || "",
        starter_reflection: $("devStarterReflection")?.textContent || "",
        starter_application: $("devStarterApplication")?.textContent || "",
        starter_prayer: $("devStarterPrayer")?.textContent || "",
      },
      mine: { myContext, myReflection, myApplication, myPrayer, myNotes },
    };

    const all = getDevos();
    all.push(item);
    writeJSON(LS.DEVOS, all);
    renderDevSavedList();
    alert("Saved.");
  }

  function renderDevSavedList() {
    const list = $("devSavedList");
    if (!list) return;

    const lang = ($("devUiLang")?.value || "en");
    const t = I18N.dev[lang] || I18N.dev.en;

    const all = getDevos();
    if (all.length === 0) {
      list.innerHTML = `<small style="opacity:0.75;">${esc(t.savedEmpty)}</small>`;
      return;
    }

    list.innerHTML = "";
    all
      .slice()
      .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
      .forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        const date = item.ts ? new Date(item.ts).toLocaleString() : "";
        const title = (item.alyana?.theme || "Devotional").slice(0, 60);
        btn.textContent = `${title}${date ? " — " + date : ""}`;

        btn.addEventListener("click", () => {
          // Load into editor
          if ($("devUiLang")) $("devUiLang").value = item.lang || "en";
          applyDevLang();

          $("devTheme").textContent = item.alyana?.theme || "—";
          $("devScriptureRef").textContent = item.alyana?.scripture_ref || "—";
          $("devScriptureText").textContent = item.alyana?.scripture_text || "—";
          $("devStarterContext").textContent = item.alyana?.starter_context || "—";
          $("devStarterReflection").textContent = item.alyana?.starter_reflection || "—";
          $("devStarterApplication").textContent = item.alyana?.starter_application || "—";
          $("devStarterPrayer").textContent = item.alyana?.starter_prayer || "—";

          $("devMyContext").value = item.mine?.myContext || "";
          $("devMyReflection").value = item.mine?.myReflection || "";
          $("devMyApplication").value = item.mine?.myApplication || "";
          $("devMyPrayer").value = item.mine?.myPrayer || "";
          $("devMyNotes").value = item.mine?.myNotes || "";
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = (lang === "es") ? "Eliminar" : "Delete";
        del.addEventListener("click", () => {
          const next = getDevos().filter((x) => x.id !== item.id);
          writeJSON(LS.DEVOS, next);
          renderDevSavedList();
        });

        const wrap = document.createElement("div");
        wrap.style.display = "grid";
        wrap.style.gridTemplateColumns = "1fr 120px";
        wrap.style.gap = "8px";
        wrap.appendChild(btn);
        wrap.appendChild(del);

        list.appendChild(wrap);
      });
  }

  async function generateDevotionalStarters() {
    // Your backend is currently "Coming soon."
    // We'll generate lightweight starters locally so the UI works today.
    const lang = $("devUiLang")?.value || "en";

    if (lang === "es") {
      $("devTheme").textContent = "Confianza en medio de la incertidumbre";
      $("devScriptureRef").textContent = "Proverbios 3:5–6";
      $("devScriptureText").textContent =
        "Confía en Jehová con todo tu corazón...\nReconócelo en todos tus caminos, y él enderezará tus veredas.";
      $("devStarterContext").textContent =
        "Salomón enseña que la confianza verdadera no depende de entenderlo todo, sino de rendir nuestros caminos a Dios.";
      $("devStarterReflection").textContent =
        "Dios no solo ve el presente; Él guía el futuro. La fe crece cuando decidimos confiar más allá de lo que sentimos.";
      $("devStarterApplication").textContent =
        "Hoy, entrega una preocupación específica al Señor. Ora antes de tomar decisiones y busca su dirección.";
      $("devStarterPrayer").textContent =
        "Señor, ayúdame a confiar en Ti con todo mi corazón. Endereza mis pasos y dame paz al caminar contigo. Amén.";
    } else {
      $("devTheme").textContent = "Trust in Uncertainty";
      $("devScriptureRef").textContent = "Proverbs 3:5–6";
      $("devScriptureText").textContent =
        "Trust in the LORD with all your heart...\nIn all your ways acknowledge him, and he shall direct your paths.";
      $("devStarterContext").textContent =
        "Solomon teaches that real trust is not rooted in perfect understanding, but in surrendering our path to God.";
      $("devStarterReflection").textContent =
        "God sees what we cannot. Faith grows when we choose to trust beyond our feelings and incomplete information.";
      $("devStarterApplication").textContent =
        "Today, name one worry and place it in God’s hands. Pray before decisions and ask for clear direction.";
      $("devStarterPrayer").textContent =
        "Lord, help me trust you with my whole heart. Direct my steps and give me peace as I walk with you. Amen.";
    }
  }

  function setupDevotional() {
    const sel = $("devUiLang");
    const btnGen = $("devotionalBtn");
    const btnSave = $("devSaveBtn");
    const btnStreak = $("devStreakBtn");

    if (sel) sel.addEventListener("change", applyDevLang);
    if (btnGen) btnGen.addEventListener("click", generateDevotionalStarters);
    if (btnSave) btnSave.addEventListener("click", saveDevo);
    if (btnStreak) btnStreak.addEventListener("click", incDevStreak);

    applyDevLang();
    renderDevSavedList();
  }

  // -----------------------------
  // Daily Prayer (local storage + UI language)
  // -----------------------------
  function applyPrayerLang() {
    const lang = ($("prUiLang")?.value || "en");
    const t = I18N.prayer[lang] || I18N.prayer.en;

    const el = (id, val) => { const x = $(id); if (x) x.textContent = val; };
    el("prIntro", t.intro);
    el("prLabelA", t.a);
    el("prLabelC", t.c);
    el("prLabelT", t.t);
    el("prLabelS", t.s);
    el("prLabelN", t.n);

    el("prNow1", t.now);
    el("prNow2", t.now);
    el("prNow3", t.now);
    el("prNow4", t.now);

    const btnGen = $("prayerBtn");
    const btnSave = $("prSaveBtn");
    const btnStreak = $("prStreakBtn");
    const pill = $("prStreakPill");
    if (btnGen) btnGen.textContent = t.generate;
    if (btnSave) btnSave.textContent = t.save;
    if (btnStreak) btnStreak.textContent = t.didToday;
    if (pill) pill.textContent = `${t.streak}: ${getPrayerStreak()}`;

    const ph = (id, val) => { const x = $(id); if (x) x.placeholder = val; };
    ph("myAdoration", t.ph_a);
    ph("myConfession", t.ph_c);
    ph("myThanksgiving", t.ph_t);
    ph("mySupplication", t.ph_s);
    ph("prayerNotes", t.ph_n);

    renderPrayerSavedList();
  }

  function getPrayerStreak() {
    const n = parseInt(localStorage.getItem(LS.PR_STREAK) || "0", 10);
    return Number.isFinite(n) ? n : 0;
  }

  function incPrayerStreak() {
    const next = getPrayerStreak() + 1;
    localStorage.setItem(LS.PR_STREAK, String(next));
    applyPrayerLang();
  }

  function getPrayers() {
    const arr = readJSON(LS.PRAYERS, []);
    return Array.isArray(arr) ? arr : [];
  }

  function savePrayer() {
    const myA = ($("myAdoration")?.value || "").trim();
    const myC = ($("myConfession")?.value || "").trim();
    const myT = ($("myThanksgiving")?.value || "").trim();
    const myS = ($("mySupplication")?.value || "").trim();
    const notes = ($("prayerNotes")?.value || "").trim();

    if (!myA || !myC || !myT || !myS) {
      alert("To save: Adoration + Confession + Thanksgiving + Supplication are required.");
      return;
    }

    const item = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      ts: nowISO(),
      lang: $("prUiLang")?.value || "en",
      alyana: {
        a: $("pA")?.textContent || "",
        c: $("pC")?.textContent || "",
        t: $("pT")?.textContent || "",
        s: $("pS")?.textContent || "",
      },
      mine: { myA, myC, myT, myS, notes },
    };

    const all = getPrayers();
    all.push(item);
    writeJSON(LS.PRAYERS, all);
    renderPrayerSavedList();
    alert("Saved.");
  }

  function renderPrayerSavedList() {
    const list = $("prSavedList");
    if (!list) return;

    const lang = ($("prUiLang")?.value || "en");
    const t = I18N.prayer[lang] || I18N.prayer.en;

    const all = getPrayers();
    if (all.length === 0) {
      list.innerHTML = `<small style="opacity:0.75;">${esc(t.savedEmpty)}</small>`;
      return;
    }

    list.innerHTML = "";
    all
      .slice()
      .sort((a, b) => (b.ts || "").localeCompare(a.ts || ""))
      .forEach((item) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        const date = item.ts ? new Date(item.ts).toLocaleString() : "";
        btn.textContent = `${(lang === "es" ? "Oración" : "Prayer")}${date ? " — " + date : ""}`;

        btn.addEventListener("click", () => {
          if ($("prUiLang")) $("prUiLang").value = item.lang || "en";
          applyPrayerLang();

          $("pA").textContent = item.alyana?.a || "—";
          $("pC").textContent = item.alyana?.c || "—";
          $("pT").textContent = item.alyana?.t || "—";
          $("pS").textContent = item.alyana?.s || "—";

          $("myAdoration").value = item.mine?.myA || "";
          $("myConfession").value = item.mine?.myC || "";
          $("myThanksgiving").value = item.mine?.myT || "";
          $("mySupplication").value = item.mine?.myS || "";
          $("prayerNotes").value = item.mine?.notes || "";
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = (lang === "es") ? "Eliminar" : "Delete";
        del.addEventListener("click", () => {
          const next = getPrayers().filter((x) => x.id !== item.id);
          writeJSON(LS.PRAYERS, next);
          renderPrayerSavedList();
        });

        const wrap = document.createElement("div");
        wrap.style.display = "grid";
        wrap.style.gridTemplateColumns = "1fr 120px";
        wrap.style.gap = "8px";
        wrap.appendChild(btn);
        wrap.appendChild(del);
        list.appendChild(wrap);
      });
  }

  function generatePrayerStarters() {
    const lang = $("prUiLang")?.value || "en";

    if (lang === "es") {
      $("pA").textContent = "Señor, Tú eres santo, bueno y fiel. Te adoro porque Tu amor no falla.";
      $("pC").textContent = "Perdóname por cuando he confiado más en mis fuerzas que en Ti.";
      $("pT").textContent = "Gracias por Tu protección, por mi familia y por cada nueva oportunidad.";
      $("pS").textContent = "Guíame hoy, dame sabiduría y fortalece mi fe. Bendice a los que amo.";
    } else {
      $("pA").textContent = "Lord, you are holy, good, and faithful. I adore you because your love never fails.";
      $("pC").textContent = "Forgive me for the times I trusted my strength more than I trusted you.";
      $("pT").textContent = "Thank you for your protection, for my family, and for new mercies today.";
      $("pS").textContent = "Guide me today, give me wisdom, and strengthen my faith. Bless those I love.";
    }
  }

  function setupPrayer() {
    const sel = $("prUiLang");
    const btnGen = $("prayerBtn");
    const btnSave = $("prSaveBtn");
    const btnStreak = $("prStreakBtn");

    if (sel) sel.addEventListener("change", applyPrayerLang);
    if (btnGen) btnGen.addEventListener("click", generatePrayerStarters);
    if (btnSave) btnSave.addEventListener("click", savePrayer);
    if (btnStreak) btnStreak.addEventListener("click", incPrayerStreak);

    applyPrayerLang();
    renderPrayerSavedList();
  }

  // -----------------------------
  // Bible Reader (DB switching + TTS)
  // -----------------------------
  function bibleVersionFromReaderLang() {
    const rv = $("readingVoice")?.value || "en";
    return (rv === "es") ? "es" : "en_default";
  }

  async function bibleFetchJSON(path) {
    const resp = await fetch(path);
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status} ${t}`);
    }
    return resp.json();
  }

  async function refreshBibleStatus() {
    const el = $("bibleDbStatus");
    if (!el) return;

    const version = bibleVersionFromReaderLang();
    try {
      const data = await bibleFetchJSON(`/bible/status?version=${encodeURIComponent(version)}`);
      el.textContent = `OK — version=${data.version} — verses=${data.verse_count}`;
    } catch (e) {
      el.textContent = `Error: ${(e && e.message) ? e.message : "unknown"}`;
    }
  }

  function fillSelect(select, options, placeholder) {
    if (!select) return;
    select.innerHTML = "";
    if (placeholder) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = placeholder;
      select.appendChild(opt);
    }
    for (const o of options) {
      const opt = document.createElement("option");
      opt.value = String(o.value);
      opt.textContent = String(o.label);
      select.appendChild(opt);
    }
  }

  async function loadBibleBooks() {
    const bookSel = $("bookSelect");
    const chapterSel = $("chapterSelect");
    const vsSel = $("verseStartSelect");
    const veSel = $("verseEndSelect");

    fillSelect(chapterSel, [], "—");
    fillSelect(vsSel, [], "—");
    fillSelect(veSel, [{ value: "", label: "(optional)" }], null);

    const version = bibleVersionFromReaderLang();

    try {
      fillSelect(bookSel, [], "Loading…");
      const data = await bibleFetchJSON(`/bible/books?version=${encodeURIComponent(version)}`);
      const books = (data.books || []).map((b) => ({ value: b.id, label: b.name }));
      fillSelect(bookSel, books, "Select…");
    } catch (e) {
      fillSelect(bookSel, [], "Failed to load");
      const status = $("bibleDbStatus");
      if (status) status.textContent = `Error loading books: ${(e && e.message) ? e.message : "unknown"}`;
    }
  }

  async function loadBibleChapters() {
    const bookSel = $("bookSelect");
    const chapterSel = $("chapterSelect");
    const vsSel = $("verseStartSelect");
    const veSel = $("verseEndSelect");

    fillSelect(chapterSel, [], "—");
    fillSelect(vsSel, [], "—");
    fillSelect(veSel, [{ value: "", label: "(optional)" }], null);

    const bookId = parseInt(bookSel?.value || "0", 10);
    if (!bookId) return;

    const version = bibleVersionFromReaderLang();

    try {
      const data = await bibleFetchJSON(`/bible/chapters?version=${encodeURIComponent(version)}&book_id=${bookId}`);
      const chs = (data.chapters || []).map((n) => ({ value: n, label: String(n) }));
      fillSelect(chapterSel, chs, "Select…");
    } catch (e) {
      fillSelect(chapterSel, [], "Failed");
    }
  }

  async function loadVersesForChapterPreview() {
    // We fetch the whole chapter once to:
    // 1) fill verse selects
    // 2) show Passage preview
    const bookSel = $("bookSelect");
    const chapterSel = $("chapterSelect");

    const bookId = parseInt(bookSel?.value || "0", 10);
    const chapter = parseInt(chapterSel?.value || "0", 10);
    if (!bookId || !chapter) return;

    const version = bibleVersionFromReaderLang();
    const data = await bibleFetchJSON(
      `/bible/text?version=${encodeURIComponent(version)}&book_id=${bookId}&chapter=${chapter}&whole_chapter=true`
    );

    const verses = data.verses || [];
    const vsSel = $("verseStartSelect");
    const veSel = $("verseEndSelect");

    const opts = verses.map((v) => ({ value: v.verse, label: String(v.verse) }));
    fillSelect(vsSel, opts, "—");
    fillSelect(veSel, [{ value: "", label: "(optional)" }, ...opts], null);

    // show preview
    $("passageRef").textContent = `${data.book} ${data.chapter}`;
    $("passageText").textContent = data.text || "—";
  }

  async function listenSelectedPassage() {
    const ttsPill = $("ttsStatus");
    const bookSel = $("bookSelect");
    const chapterSel = $("chapterSelect");
    const vsSel = $("verseStartSelect");
    const veSel = $("verseEndSelect");
    const full = $("fullChapter")?.checked;
    const readLang = $("readingVoice")?.value || "en";
    const versionLabel = $("versionSelect")?.value || "KJV";

    const bookId = parseInt(bookSel?.value || "0", 10);
    const chapter = parseInt(chapterSel?.value || "0", 10);
    if (!bookId || !chapter) {
      setPill(ttsPill, "Voice: select book + chapter", "warn");
      return;
    }

    const version = bibleVersionFromReaderLang();

    let url = `/bible/text?version=${encodeURIComponent(version)}&book_id=${bookId}&chapter=${chapter}`;
    if (full) {
      url += `&whole_chapter=true`;
    } else {
      const vs = parseInt(vsSel?.value || "0", 10);
      const ve = parseInt(veSel?.value || "0", 10);
      if (!vs) {
        setPill(ttsPill, "Voice: select verse start", "warn");
        return;
      }
      url += `&verse_start=${vs}`;
      if (ve) url += `&verse_end=${ve}`;
    }

    try {
      const data = await bibleFetchJSON(url);

      const ref = full
        ? `${data.book} ${data.chapter}`
        : `${data.book} ${data.chapter}:${data.verses?.[0]?.verse || ""}${(data.verses && data.verses.length > 1) ? "-" + data.verses[data.verses.length - 1].verse : ""}`;

      $("passageRef").textContent = ref;
      $("passageText").textContent = data.text || "—";

      // Speak rules:
      // - Spanish voice: ONLY verse text (no English labels)
      // - English voice: say reference + version label + text
      let speakPayload = "";
      if (readLang === "es") {
        speakPayload = (data.verses || []).map(v => v.text).join(" ");
      } else {
        speakPayload = `${ref}. ${versionLabel}. ${(data.verses || []).map(v => v.text).join(" ")}`;
      }

      speakText(speakPayload, (readLang === "es") ? "es" : "en", ttsPill);
    } catch (e) {
      setPill(ttsPill, "Voice: bible error", "bad");
      const status = $("bibleDbStatus");
      if (status) status.textContent = `Bible error: ${(e && e.message) ? e.message : "unknown"}`;
    }
  }

  function setupBible() {
    const readVoice = $("readingVoice");
    const bookSel = $("bookSelect");
    const chapterSel = $("chapterSelect");
    const listenBtn = $("listenBible");
    const stopBtn = $("stopBible");
    const ttsPill = $("ttsStatus");
    const full = $("fullChapter");

    if (readVoice) {
      readVoice.addEventListener("change", async () => {
        setPill(ttsPill, "Voice: ready", "ok");
        await refreshBibleStatus();
        await loadBibleBooks();
      });
    }

    if (bookSel) bookSel.addEventListener("change", loadBibleChapters);
    if (chapterSel) chapterSel.addEventListener("change", loadVersesForChapterPreview);

    if (full) {
      full.addEventListener("change", () => {
        // No heavy logic required; verse selectors remain but ignored at play time.
      });
    }

    if (listenBtn) listenBtn.addEventListener("click", listenSelectedPassage);
    if (stopBtn) stopBtn.addEventListener("click", () => stopSpeak(ttsPill));

    // init
    refreshBibleStatus();
    loadBibleBooks();
    if (ttsPill) setPill(ttsPill, voicesReady ? "Voice: ready" : "Voice: loading…", voicesReady ? "ok" : "warn");
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    setupMenu();
    setupChat();
    setupDevotional();
    setupPrayer();
    setupBible();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();






























