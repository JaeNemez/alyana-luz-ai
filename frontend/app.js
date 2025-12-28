
(() => {
  "use strict";

  // ---------------------------
  // Utilities
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const LS = {
    uiLang: "alyana_ui_lang",
    token: "alyana_token",
    authEmail: "alyana_auth_email",
    authStatus: "alyana_auth_status",

    chatDraft: "alyana_chat_draft",
    chatSaved: "alyana_chat_saved", // array

    devSaved: "alyana_dev_saved", // array
    devStreak: "alyana_dev_streak",
    devStreakDate: "alyana_dev_streak_date",

    prSaved: "alyana_pr_saved", // array
    prStreak: "alyana_pr_streak",
    prStreakDate: "alyana_pr_streak_date",
  };

  function showTopStatus(msg) {
    const el = $("#jsStatus");
    if (el) el.textContent = msg;
  }

  function clampStr(s, max = 3000) {
    s = String(s ?? "");
    return s.length > max ? s.slice(0, max) + "…" : s;
  }

  function safeJsonParse(s, fallback) {
    try { return JSON.parse(s); } catch { return fallback; }
  }

  function normLang(v, fallback = "en") {
    v = String(v || "").trim().toLowerCase();
    if (v === "es" || v === "en") return v;
    return fallback;
  }

  function setSelectValue(sel, val) {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (!el) return;
    const want = String(val);
    const opt = Array.from(el.options || []).find(o => String(o.value) === want);
    if (opt) el.value = want;
  }

  function nowDateKey() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // ---------------------------
  // Spanish Bible book display names (UI only)
  // NOTE: We keep <option value> as the backend id, and only swap the visible label.
  // ---------------------------
  const BOOK_NAME_ES = {
    "Genesis": "Génesis",
    "Exodus": "Éxodo",
    "Leviticus": "Levítico",
    "Numbers": "Números",
    "Deuteronomy": "Deuteronomio",
    "Joshua": "Josué",
    "Judges": "Jueces",
    "Ruth": "Rut",
    "1 Samuel": "1 Samuel",
    "2 Samuel": "2 Samuel",
    "1 Kings": "1 Reyes",
    "2 Kings": "2 Reyes",
    "1 Chronicles": "1 Crónicas",
    "2 Chronicles": "2 Crónicas",
    "Ezra": "Esdras",
    "Nehemiah": "Nehemías",
    "Esther": "Ester",
    "Job": "Job",
    "Psalms": "Salmos",
    "Proverbs": "Proverbios",
    "Ecclesiastes": "Eclesiastés",
    "Song of Solomon": "Cantares",
    "Isaiah": "Isaías",
    "Jeremiah": "Jeremías",
    "Lamentations": "Lamentaciones",
    "Ezekiel": "Ezequiel",
    "Daniel": "Daniel",
    "Hosea": "Oseas",
    "Joel": "Joel",
    "Amos": "Amós",
    "Obadiah": "Abdías",
    "Jonah": "Jonás",
    "Micah": "Miqueas",
    "Nahum": "Nahúm",
    "Habakkuk": "Habacuc",
    "Zephaniah": "Sofonías",
    "Haggai": "Hageo",
    "Zechariah": "Zacarías",
    "Malachi": "Malaquías",
    "Matthew": "Mateo",
    "Mark": "Marcos",
    "Luke": "Lucas",
    "John": "Juan",
    "Acts": "Hechos",
    "Romans": "Romanos",
    "1 Corinthians": "1 Corintios",
    "2 Corinthians": "2 Corintios",
    "Galatians": "Gálatas",
    "Ephesians": "Efesios",
    "Philippians": "Filipenses",
    "Colossians": "Colosenses",
    "1 Thessalonians": "1 Tesalonicenses",
    "2 Thessalonians": "2 Tesalonicenses",
    "1 Timothy": "1 Timoteo",
    "2 Timothy": "2 Timoteo",
    "Titus": "Tito",
    "Philemon": "Filemón",
    "Hebrews": "Hebreos",
    "James": "Santiago",
    "1 Peter": "1 Pedro",
    "2 Peter": "2 Pedro",
    "1 John": "1 Juan",
    "2 John": "2 Juan",
    "3 John": "3 Juan",
    "Jude": "Judas",
    "Revelation": "Apocalipsis"
  };

  // Store the English book name on each <option> so we can re-render labels on UI language switch.
  function displayBookName(bookEn) {
    const ui = getUILang();
    if (ui === "es") return BOOK_NAME_ES[bookEn] || bookEn;
    return bookEn;
  }

  function rerenderBookSelectLabels() {
    const bookSel = $("#bookSelect");
    if (!bookSel) return;
    Array.from(bookSel.options).forEach((opt) => {
      // Skip placeholder option
      if (!opt.value) return;
      const en = opt.dataset.enName || opt.textContent || "";
      if (en) opt.textContent = displayBookName(en);
    });
  }

  // ---------------------------
  // i18n
  // ---------------------------
  const I18N = {
    en: {
      tagline: "pray • learn • walk in the Light",
      uiLangLabel: "Language",
      supportBtnText: "Support Alyana Luz",
      manageBilling: "Manage billing",
      logout: "Logout",
      restoreAccess: "Restore access",
      stripeEmailPlaceholder: "Email used for Stripe…",
      supportNote:
        "Your support helps maintain and grow Alyana Luz — continually improving development and expanding this ministry.\n" +
        "To access premium features, subscribe with Support, or restore access using the email you used on Stripe.",

      tabChat: "Chat",
      tabBible: "Read Bible",
      tabDev: "Devotional",
      tabPrayer: "Daily Prayer",

      chatTitle: "Chat",
      chatSavedHint: "Saved chat logs are stored on this device.",
      savedChatsTitle: "Saved Chats",
      savedChatsHint: "Load or delete any saved chat.",
      chatLangLabel: "Chat Language",
      chatInputPh: "Ask for a prayer, verse, or ‘verses about forgiveness’…",
      send: "Send",
      listen: "Listen",
      stop: "Stop",
      new: "New",
      save: "Save",
      noSavedChats: "No saved chats yet.",

      bibleTitle: "Bible Reader",
      bibleHint: "Pick a book/chapter and verse range, or Full Chapter.",
      book: "Book",
      chapter: "Chapter",
      verseStart: "Verse (start)",
      verseEnd: "Verse (end)",
      readerLang: "Reader Language",
      readerLangNote: "Only two voices, locked for consistency.",
      fullChapter: "Full Chapter",
      fullChapterNote: "If Full Chapter is on, verses are ignored.",
      versionLabel: "Version label (English only)",
      versionNote: "For Spanish voice, we do not speak the version label.",
      spanishReadNote: "Spanish voice reads ONLY verse text (no English labels), so it stays pure Spanish.",
      bibleDbStatusTitle: "Bible DB Status",
      passageTitle: "Passage",
      read: "Read",

      devTitle: "Devotional",
      devIntro: "Alyana gives short starter examples. You write and save your real devotional.",
      devLangLabel: "Language",
      streak: "Streak",
      didItToday: "I did it today",
      generate: "Generate",
      devThemeLabel: "Theme / Title (Alyana)",
      devScriptureLabel: "Scripture (Alyana)",
      ctxObs: "Context / Observation",
      reflection: "Reflection / Insight",
      application: "Application (Practical)",
      prayer: "Prayer",
      nowWriteYours: "Now write yours:",
      nowWritePrayer: "Now write your real prayer:",
      notesOptional: "Notes / Reflection (optional)",
      requiredToSave: "Required to save (streak): Context + Reflection + Application + Prayer.",
      savedDevs: "Saved Devotionals",
      savedDevsHint: "Load or delete past devotionals saved on this device.",
      noSavedDevs: "No saved devotionals yet.",

      prTitle: "Daily Prayer",
      prIntro: "Alyana gives a short starter example. You write and save your real prayer.",
      prLangLabel: "Language",
      genStarters: "Generate Starters",
      adoration: "Adoration",
      confession: "Confession",
      thanksgiving: "Thanksgiving",
      supplication: "Supplication",
      notes: "Notes",
      savedPrayers: "Saved Prayers",
      savedPrayersHint: "Load or delete past prayers saved on this device.",
      noSavedPrayers: "No saved prayers yet.",

      voiceReady: "Voice: ready",
      voiceMissing: "Voice: missing",
      loading: "Loading…",
      working: "Working…",
      done: "Done.",
      errorGeneric: "Something went wrong. Check server logs.",
    },

    es: {
      tagline: "ora • aprende • camina en la Luz",
      uiLangLabel: "Idioma",
      supportBtnText: "Apoya a Alyana Luz",
      manageBilling: "Administrar facturación",
      logout: "Cerrar sesión",
      restoreAccess: "Restaurar acceso",
      stripeEmailPlaceholder: "Correo usado en Stripe…",
      supportNote:
        "Tu apoyo ayuda a mantener y hacer crecer Alyana Luz — mejorando el desarrollo y expandiendo este ministerio.\n" +
        "Para acceder a funciones premium, suscríbete con Apoyo, o restaura el acceso usando el correo que usaste en Stripe.",

      tabChat: "Chat",
      tabBible: "Leer Biblia",
      tabDev: "Devocional",
      tabPrayer: "Oración diaria",

      chatTitle: "Chat",
      chatSavedHint: "Los chats guardados se almacenan en este dispositivo.",
      savedChatsTitle: "Chats guardados",
      savedChatsHint: "Carga o elimina cualquier chat guardado.",
      chatLangLabel: "Idioma del chat",
      chatInputPh: "Pide una oración, un versículo, o ‘versículos sobre el perdón’…",
      send: "Enviar",
      listen: "Escuchar",
      stop: "Detener",
      new: "Nuevo",
      save: "Guardar",
      noSavedChats: "Aún no hay chats guardados.",

      bibleTitle: "Lector de Biblia",
      bibleHint: "Elige libro/capítulo y rango de versículos, o Capítulo completo.",
      book: "Libro",
      chapter: "Capítulo",
      verseStart: "Versículo (inicio)",
      verseEnd: "Versículo (fin)",
      readerLang: "Idioma de lectura",
      readerLangNote: "Solo dos voces, bloqueadas por consistencia.",
      fullChapter: "Capítulo completo",
      fullChapterNote: "Si está activo, los versículos se ignoran.",
      versionLabel: "Etiqueta de versión (solo inglés)",
      versionNote: "Para voz en español, no se pronuncia la etiqueta de versión.",
      spanishReadNote: "La voz en español lee SOLO el texto (sin etiquetas en inglés).",
      bibleDbStatusTitle: "Estado de Biblia DB",
      passageTitle: "Pasaje",
      read: "Leer",

      devTitle: "Devocional",
      devIntro: "Alyana da ejemplos cortos. Tú escribes y guardas tu devocional real.",
      devLangLabel: "Idioma",
      streak: "Racha",
      didItToday: "Lo hice hoy",
      generate: "Generar",
      devThemeLabel: "Tema / Título (Alyana)",
      devScriptureLabel: "Escritura (Alyana)",
      ctxObs: "Contexto / Observación",
      reflection: "Reflexión / Idea",
      application: "Aplicación (Práctica)",
      prayer: "Oración",
      nowWriteYours: "Ahora escribe el tuyo:",
      nowWritePrayer: "Ahora escribe tu oración real:",
      notesOptional: "Notas / Reflexión (opcional)",
      requiredToSave: "Requerido para guardar (racha): Contexto + Reflexión + Aplicación + Oración.",
      savedDevs: "Devocionales guardados",
      savedDevsHint: "Carga o elimina devocionales guardados en este dispositivo.",
      noSavedDevs: "Aún no hay devocionales guardados.",

      prTitle: "Oración diaria",
      prIntro: "Alyana da un ejemplo corto. Tú escribes y guardas tu oración real.",
      prLangLabel: "Idioma",
      genStarters: "Generar ejemplos",
      adoration: "Adoración",
      confession: "Confesión",
      thanksgiving: "Acción de gracias",
      supplication: "Súplica",
      notes: "Notas",
      savedPrayers: "Oraciones guardadas",
      savedPrayersHint: "Carga o elimina oraciones guardadas en este dispositivo.",
      noSavedPrayers: "Aún no hay oraciones guardadas.",

      voiceReady: "Voz: lista",
      voiceMissing: "Voz: no disponible",
      loading: "Cargando…",
      working: "Procesando…",
      done: "Listo.",
      errorGeneric: "Algo falló. Revisa los logs del servidor.",
    },
  };

  function getUILang() {
    return normLang(localStorage.getItem(LS.uiLang) || "en", "en");
  }

  function applyUILang() {
    const ui = getUILang();
    const t = I18N[ui];

    // top
    const tagline = $("#tagline");
    if (tagline) tagline.textContent = t.tagline;

    const uiLangLabel = $("#uiLangLabel");
    if (uiLangLabel) uiLangLabel.textContent = t.uiLangLabel;

    const supportBtnText = $("#supportBtnText");
    if (supportBtnText) supportBtnText.textContent = t.supportBtnText;

    const manageBillingText = $("#manageBillingText");
    if (manageBillingText) manageBillingText.textContent = t.manageBilling;

    const logoutText = $("#logoutText");
    if (logoutText) logoutText.textContent = t.logout;

    const supportNote = $("#supportNote");
    if (supportNote) supportNote.innerHTML = t.supportNote.replace(/\n/g, "<br />");

    const loginEmail = $("#loginEmail");
    if (loginEmail) loginEmail.placeholder = t.stripeEmailPlaceholder;

    const loginBtn = $("#loginBtn");
    if (loginBtn) loginBtn.textContent = t.restoreAccess;

    // tabs
    const tabChat = $("#tabChat");
    const tabBible = $("#tabBible");
    const tabDev = $("#tabDev");
    const tabPrayer = $("#tabPrayer");
    if (tabChat) tabChat.textContent = t.tabChat;
    if (tabBible) tabBible.textContent = t.tabBible;
    if (tabDev) tabDev.textContent = t.tabDev;
    if (tabPrayer) tabPrayer.textContent = t.tabPrayer;

    // chat
    const chatTitle = $("#chatTitle");
    const chatSavedHint = $("#chatSavedHint");
    const savedChatsTitle = $("#savedChatsTitle");
    const savedChatsHint = $("#savedChatsHint");
    const chatLangLabel = $("#chatLangLabel");
    const chatInput = $("#chatInput");

    if (chatTitle) chatTitle.textContent = t.chatTitle;
    if (chatSavedHint) chatSavedHint.textContent = t.chatSavedHint;
    if (savedChatsTitle) savedChatsTitle.textContent = t.savedChatsTitle;
    if (savedChatsHint) savedChatsHint.textContent = t.savedChatsHint;
    if (chatLangLabel) chatLangLabel.textContent = t.chatLangLabel;
    if (chatInput) chatInput.placeholder = t.chatInputPh;

    const chatSendBtn = $("#chatSendBtn");
    const chatListenBtn = $("#chatListenBtn");
    const chatStopBtn = $("#chatStopBtn");
    const chatNewBtn = $("#chatNewBtn");
    const chatSaveBtn = $("#chatSaveBtn");

    if (chatSendBtn) chatSendBtn.textContent = t.send;
    if (chatListenBtn) chatListenBtn.textContent = t.listen;
    if (chatStopBtn) chatStopBtn.textContent = t.stop;
    if (chatNewBtn) chatNewBtn.textContent = t.new;
    if (chatSaveBtn) chatSaveBtn.textContent = t.save;

    // bible
    const bibleTitle = $("#bibleTitle");
    const bibleHint = $("#bibleHint");
    const lblBook = $("#lblBook");
    const lblChapter = $("#lblChapter");
    const lblVerseStart = $("#lblVerseStart");
    const lblVerseEnd = $("#lblVerseEnd");
    const lblReaderLang = $("#lblReaderLang");
    const readerLangNote = $("#readerLangNote");
    const lblFullChapter = $("#lblFullChapter");
    const fullChapterNote = $("#fullChapterNote");
    const lblVersion = $("#lblVersion");
    const versionNote = $("#versionNote");
    const spanishReadNote = $("#spanishReadNote");
    const dbStatusTitle = $("#dbStatusTitle");
    const passageTitle = $("#passageTitle");
    const readBibleBtn = $("#readBibleBtn");
    const passageListenBtn = $("#passageListenBtn");
    const passageStopBtn = $("#passageStopBtn");

    if (bibleTitle) bibleTitle.textContent = t.bibleTitle;
    if (bibleHint) bibleHint.textContent = t.bibleHint;
    if (lblBook) lblBook.textContent = t.book;
    if (lblChapter) lblChapter.textContent = t.chapter;
    if (lblVerseStart) lblVerseStart.textContent = t.verseStart;
    if (lblVerseEnd) lblVerseEnd.textContent = t.verseEnd;
    if (lblReaderLang) lblReaderLang.textContent = t.readerLang;
    if (readerLangNote) readerLangNote.textContent = t.readerLangNote;
    if (lblFullChapter) lblFullChapter.textContent = t.fullChapter;
    if (fullChapterNote) fullChapterNote.textContent = t.fullChapterNote;
    if (lblVersion) lblVersion.textContent = t.versionLabel;
    if (versionNote) versionNote.textContent = t.versionNote;
    if (spanishReadNote) spanishReadNote.textContent = t.spanishReadNote;
    if (dbStatusTitle) dbStatusTitle.textContent = t.bibleDbStatusTitle;
    if (passageTitle) passageTitle.textContent = t.passageTitle;
    if (readBibleBtn) readBibleBtn.textContent = t.read;
    if (passageListenBtn) passageListenBtn.textContent = t.listen;
    if (passageStopBtn) passageStopBtn.textContent = t.stop;

    // devotional
    const devTitle = $("#devTitle");
    const devIntro = $("#devIntro");
    const devLangLabel = $("#devLangLabel");
    const devLabelTheme = $("#devLabelTheme");
    const devLabelScripture = $("#devLabelScripture");
    const devLabelCtxA = $("#devLabelCtxA");
    const devLabelRefA = $("#devLabelRefA");
    const devLabelAppA = $("#devLabelAppA");
    const devLabelPrA = $("#devLabelPrA");
    const devLabelNotes = $("#devLabelNotes");
    const devNow1 = $("#devNow1");
    const devNow2 = $("#devNow2");
    const devNow3 = $("#devNow3");
    const devNow4 = $("#devNow4");
    const devReqNote = $("#devReqNote");
    const devSavedTitle = $("#devSavedTitle");
    const devSavedHint = $("#devSavedHint");

    if (devTitle) devTitle.textContent = t.devTitle;
    if (devIntro) devIntro.textContent = t.devIntro;
    if (devLangLabel) devLangLabel.textContent = t.devLangLabel;
    if (devLabelTheme) devLabelTheme.textContent = t.devThemeLabel;
    if (devLabelScripture) devLabelScripture.textContent = t.devScriptureLabel;
    if (devLabelCtxA) devLabelCtxA.textContent = t.ctxObs;
    if (devLabelRefA) devLabelRefA.textContent = t.reflection;
    if (devLabelAppA) devLabelAppA.textContent = t.application;
    if (devLabelPrA) devLabelPrA.textContent = t.prayer;
    if (devLabelNotes) devLabelNotes.textContent = t.notesOptional;
    if (devNow1) devNow1.textContent = t.nowWriteYours;
    if (devNow2) devNow2.textContent = t.nowWriteYours;
    if (devNow3) devNow3.textContent = t.nowWriteYours;
    if (devNow4) devNow4.textContent = t.nowWritePrayer;
    if (devReqNote) devReqNote.textContent = t.requiredToSave;
    if (devSavedTitle) devSavedTitle.textContent = t.savedDevs;
    if (devSavedHint) devSavedHint.textContent = t.savedDevsHint;

    const devStreakBtn = $("#devStreakBtn");
    const devotionalBtn = $("#devotionalBtn");
    const devSaveBtn = $("#devSaveBtn");
    if (devStreakBtn) devStreakBtn.textContent = t.didItToday;
    if (devotionalBtn) devotionalBtn.textContent = t.generate;
    if (devSaveBtn) devSaveBtn.textContent = t.save;

    // prayer
    const prTitle = $("#prTitle");
    const prIntro = $("#prIntro");
    const prLangLabel = $("#prLangLabel");
    const prLabelA = $("#prLabelA");
    const prLabelC = $("#prLabelC");
    const prLabelT = $("#prLabelT");
    const prLabelS = $("#prLabelS");
    const prLabelN = $("#prLabelN");
    const prSavedTitle = $("#prSavedTitle");
    const prSavedHint = $("#prSavedHint");

    if (prTitle) prTitle.textContent = t.prTitle;
    if (prIntro) prIntro.textContent = t.prIntro;
    if (prLangLabel) prLangLabel.textContent = t.prLangLabel;
    if (prLabelA) prLabelA.textContent = t.adoration;
    if (prLabelC) prLabelC.textContent = t.confession;
    if (prLabelT) prLabelT.textContent = t.thanksgiving;
    if (prLabelS) prLabelS.textContent = t.supplication;
    if (prLabelN) prLabelN.textContent = t.notes;
    if (prSavedTitle) prSavedTitle.textContent = t.savedPrayers;
    if (prSavedHint) prSavedHint.textContent = t.savedPrayersHint;

    const prStreakBtn = $("#prStreakBtn");
    const prayerBtn = $("#prayerBtn");
    const prSaveBtn = $("#prSaveBtn");
    if (prStreakBtn) prStreakBtn.textContent = t.didItToday;
    if (prayerBtn) prayerBtn.textContent = t.genStarters;
    if (prSaveBtn) prSaveBtn.textContent = t.save;

    // Update streak pill labels
    updateStreakPills();

    // ✅ IMPORTANT: Re-render Book labels when UI language changes
    rerenderBookSelectLabels();
  }

  // ---------------------------
  // API helpers
  // ---------------------------
  function getToken() {
    return (localStorage.getItem(LS.token) || "").trim();
  }

  function authHeaders() {
    const tok = getToken();
    return tok ? { Authorization: `Bearer ${tok}` } : {};
  }

  async function apiGet(path, opts = {}) {
    const res = await fetch(path, { method: "GET", ...opts });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const msg = (data && (data.detail || data.error)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function apiPost(path, body, opts = {}) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: JSON.stringify(body || {}),
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const msg = (data && (data.detail || data.error)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ---------------------------
  // Tabs
  // ---------------------------
  function initTabs() {
    $$(".menu-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        if (!target) return;

        $$(".menu-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        $$(".app-section").forEach(sec => sec.classList.remove("active"));
        const sec = document.getElementById(target);
        if (sec) sec.classList.add("active");
      });
    });
  }

  // ---------------------------
  // Stripe UI
  // ---------------------------
  function setAuthUI(status, email) {
    const ui = getUILang();
    const t = I18N[ui];

    const pill = $("#authPill");
    const manage = $("#manageBillingBtn");
    const logoutBtn = $("#logoutBtn");
    const hint = $("#authHint");

    if (pill) {
      pill.classList.remove("ok", "warn", "bad");
      if (status === "active") {
        pill.classList.add("ok");
        pill.textContent = `Account: active${email ? " • " + email : ""}`;
      } else if (status === "inactive") {
        pill.classList.add("warn");
        pill.textContent = `Account: inactive${email ? " • " + email : ""}`;
      } else {
        pill.classList.add("warn");
        pill.textContent = `Account: ${status || "checking…"}`;
      }
    }

    const authed = status === "active" || status === "inactive";
    if (manage) manage.disabled = !authed;
    if (logoutBtn) logoutBtn.style.display = authed ? "inline-flex" : "none";

    if (hint) {
      hint.style.display = "none";
      hint.textContent = "";
    }
  }

  function initStripeUI() {
    const uiSel = $("#uiLangSelect");
    if (uiSel) {
      uiSel.addEventListener("change", () => {
        const v = normLang(uiSel.value, "en");
        localStorage.setItem(LS.uiLang, v);
        applyUILang();
        // ✅ book labels switch instantly too (applyUILang calls rerenderBookSelectLabels)
      });
    }

    const supportBtn = $("#supportBtn");
    if (supportBtn) {
      supportBtn.addEventListener("click", async () => {
        try {
          const email = ($("#loginEmail")?.value || "").trim().toLowerCase();
          const out = await apiPost("/stripe/checkout", { email });
          if (out?.url) window.location.href = out.url;
        } catch (e) {
          console.error(e);
          alert(String(e.message || e));
        }
      });
    }

    const loginBtn = $("#loginBtn");
    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        const email = ($("#loginEmail")?.value || "").trim().toLowerCase();
        if (!email || !email.includes("@")) {
          alert("Please enter a valid email.");
          return;
        }
        try {
          const out = await apiPost("/stripe/restore", { email });
          if (out?.token) localStorage.setItem(LS.token, out.token);
          if (out?.customer_email) localStorage.setItem(LS.authEmail, out.customer_email);
          if (out?.status) localStorage.setItem(LS.authStatus, out.status);
          setAuthUI(out.status || "inactive", out.customer_email || email);

          // Portal URL: open directly
          if (out?.portal_url) window.location.href = out.portal_url;
          else if (out?.url) window.location.href = out.url;
        } catch (e) {
          console.error(e);
          alert(String(e.message || e));
        }
      });
    }

    const manage = $("#manageBillingBtn");
    if (manage) {
      manage.addEventListener("click", async () => {
        try {
          const out = await apiPost("/stripe/portal", {}, { headers: authHeaders() });
          if (out?.url) window.location.href = out.url;
        } catch (e) {
          console.error(e);
          alert(String(e.message || e));
        }
      });
    }

    const logoutBtn = $("#logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem(LS.token);
        localStorage.removeItem(LS.authEmail);
        localStorage.removeItem(LS.authStatus);
        setAuthUI("checking…", "");
      });
    }

    // boot auth state
    setAuthUI("checking…", "");
  }

  // ---------------------------
  // Chat (local save)
  // ---------------------------
  let speechUtterance = null;
  let speechActive = false;

  function stopSpeech() {
    try { window.speechSynthesis?.cancel(); } catch {}
    speechUtterance = null;
    speechActive = false;
  }

  function speakText(text, lang) {
    stopSpeech();
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(String(text || ""));
    u.lang = (lang === "es") ? "es-ES" : "en-US";
    speechUtterance = u;
    speechActive = true;
    u.onend = () => { speechActive = false; };
    u.onerror = () => { speechActive = false; };
    window.speechSynthesis.speak(u);
  }

  function addBubble(role, text) {
    const chat = $("#chat");
    if (!chat) return;

    const row = document.createElement("div");
    row.className = `bubble-row ${role}`;

    const bubble = document.createElement("div");
    bubble.className = `bubble ${role}`;
    bubble.textContent = String(text || "");

    row.appendChild(bubble);
    chat.appendChild(row);

    chat.scrollTop = chat.scrollHeight;
  }

  function loadSavedChats() {
    const ui = getUILang();
    const t = I18N[ui];

    const list = $("#chatSavedList");
    if (!list) return;

    const saved = safeJsonParse(localStorage.getItem(LS.chatSaved) || "[]", []);
    list.innerHTML = "";

    if (!Array.isArray(saved) || saved.length === 0) {
      const sm = document.createElement("small");
      sm.style.opacity = "0.75";
      sm.textContent = t.noSavedChats;
      list.appendChild(sm);
      return;
    }

    saved.slice().reverse().forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = item.title || "Saved chat";
      btn.addEventListener("click", () => {
        const chat = $("#chat");
        if (!chat) return;
        chat.innerHTML = "";
        (item.messages || []).forEach(m => addBubble(m.role, m.text));
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.style.marginTop = "8px";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        const all = safeJsonParse(localStorage.getItem(LS.chatSaved) || "[]", []);
        const keep = all.filter(x => x.id !== item.id);
        localStorage.setItem(LS.chatSaved, JSON.stringify(keep));
        loadSavedChats();
      });

      list.appendChild(btn);
      list.appendChild(del);
    });
  }

  function initChat() {
    const form = $("#chatForm");
    const input = $("#chatInput");
    const listenBtn = $("#chatListenBtn");
    const stopBtn = $("#chatStopBtn");
    const newBtn = $("#chatNewBtn");
    const saveBtn = $("#chatSaveBtn");

    if (input) {
      input.value = localStorage.getItem(LS.chatDraft) || "";
      input.addEventListener("input", () => {
        localStorage.setItem(LS.chatDraft, input.value);
      });
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = (input?.value || "").trim();
        if (!msg) return;

        const lang = ($("#chatLangSelect")?.value || "auto").trim().toLowerCase();
        addBubble("user", msg);
        if (input) input.value = "";
        localStorage.setItem(LS.chatDraft, "");

        try {
          const out = await apiPost("/chat", { message: msg, lang });
          const reply = out?.reply || "…";
          addBubble("bot", reply);
        } catch (err) {
          console.error(err);
          addBubble("system", "Error: " + String(err.message || err));
        }
      });
    }

    if (listenBtn) {
      listenBtn.addEventListener("click", () => {
        // speak last bot message
        const chat = $("#chat");
        if (!chat) return;
        const bubbles = Array.from(chat.querySelectorAll(".bubble.bot"));
        const last = bubbles[bubbles.length - 1];
        const text = last ? last.textContent : "";
        if (!text) return;

        // choose based on UI lang (not chat lang)
        const ui = getUILang();
        speakText(text, ui);
      });
    }

    if (stopBtn) stopBtn.addEventListener("click", stopSpeech);

    if (newBtn) {
      newBtn.addEventListener("click", () => {
        const chat = $("#chat");
        if (chat) chat.innerHTML = "";
        stopSpeech();
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const chat = $("#chat");
        if (!chat) return;

        const msgs = [];
        Array.from(chat.querySelectorAll(".bubble-row")).forEach(row => {
          const role = row.classList.contains("user") ? "user"
                     : row.classList.contains("bot") ? "bot"
                     : "system";
          const bubble = row.querySelector(".bubble");
          const text = bubble ? bubble.textContent : "";
          if (text) msgs.push({ role, text });
        });

        const title = (msgs.find(m => m.role === "user")?.text || "Chat").slice(0, 42);
        const all = safeJsonParse(localStorage.getItem(LS.chatSaved) || "[]", []);
        all.push({ id: String(Date.now()), title, messages: msgs, ts: Date.now() });
        localStorage.setItem(LS.chatSaved, JSON.stringify(all));
        loadSavedChats();
      });
    }

    loadSavedChats();
  }

  // ---------------------------
  // Bible
  // ---------------------------
  let currentPassageText = "";
  let currentPassageLang = "en";

  function bibleVersionForReadingVoice(readingVoice) {
    // IMPORTANT: Spanish must use the Spanish DB map keys (server-side DB_MAP supports "es")
    return (readingVoice === "es") ? "es" : "en_default";
  }

  async function refreshBibleStatus() {
    const ui = getUILang();
    const t = I18N[ui];

    const outEl = $("#bibleDbStatus");
    if (outEl) outEl.textContent = t.loading;

    try {
      const rv = ($("#readingVoice")?.value || "en").trim().toLowerCase();
      const version = bibleVersionForReadingVoice(rv);
      const s = await apiGet(`/bible/status?version=${encodeURIComponent(version)}`);
      if (outEl) {
        outEl.textContent =
          `ok • version=${s.version} • verses=${s.verse_count}`;
      }
    } catch (e) {
      console.error(e);
      if (outEl) outEl.textContent = "Error: " + String(e.message || e);
    }
  }

  async function loadBooks() {
    const bookSel = $("#bookSelect");
    if (!bookSel) return;

    bookSel.innerHTML = `<option value="">Loading…</option>`;

    try {
      const rv = ($("#readingVoice")?.value || "en").trim().toLowerCase();
      const version = bibleVersionForReadingVoice(rv);

      const data = await apiGet(`/bible/books?version=${encodeURIComponent(version)}`);
      const books = data?.books || [];

      bookSel.innerHTML = `<option value="">—</option>`;
      for (const b of books) {
        const opt = document.createElement("option");
        opt.value = String(b.id);

        // IMPORTANT:
        // - b.name might be English (even when UI is Spanish), depending on your backend.
        // - We store the English name in dataset for toggling UI labels.
        const enName = String(b.name || "");
        opt.dataset.enName = enName;

        // Visible label depends on UI language
        opt.textContent = displayBookName(enName);

        bookSel.appendChild(opt);
      }

      // ensure labels are correct after load
      rerenderBookSelectLabels();
    } catch (e) {
      console.error(e);
      bookSel.innerHTML = `<option value="">(error)</option>`;
    }
  }

  async function loadChaptersForBook() {
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const vsSel = $("#verseStartSelect");
    const veSel = $("#verseEndSelect");

    if (!bookSel || !chapSel || !vsSel || !veSel) return;

    chapSel.innerHTML = `<option value="">—</option>`;
    vsSel.innerHTML = `<option value="">—</option>`;
    veSel.innerHTML = `<option value="">(optional)</option>`;

    const bid = parseInt(bookSel.value || "", 10);
    if (!bid) return;

    try {
      const rv = ($("#readingVoice")?.value || "en").trim().toLowerCase();
      const version = bibleVersionForReadingVoice(rv);

      const data = await apiGet(`/bible/chapters?version=${encodeURIComponent(version)}&book_id=${bid}`);
      const chapters = data?.chapters || [];

      chapSel.innerHTML = `<option value="">—</option>`;
      for (const c of chapters) {
        const opt = document.createElement("option");
        opt.value = String(c);
        opt.textContent = String(c);
        chapSel.appendChild(opt);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadVersesForChapter() {
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const vsSel = $("#verseStartSelect");
    const veSel = $("#verseEndSelect");
    if (!bookSel || !chapSel || !vsSel || !veSel) return;

    vsSel.innerHTML = `<option value="">—</option>`;
    veSel.innerHTML = `<option value="">(optional)</option>`;

    const bid = parseInt(bookSel.value || "", 10);
    const ch = parseInt(chapSel.value || "", 10);
    if (!bid || !ch) return;

    try {
      const rv = ($("#readingVoice")?.value || "en").trim().toLowerCase();
      const version = bibleVersionForReadingVoice(rv);

      const data = await apiGet(`/bible/verses_max?version=${encodeURIComponent(version)}&book_id=${bid}&chapter=${ch}`);
      const maxV = parseInt(data?.max_verse || "0", 10) || 0;

      vsSel.innerHTML = `<option value="">—</option>`;
      veSel.innerHTML = `<option value="">(optional)</option>`;

      for (let i = 1; i <= maxV; i++) {
        const o1 = document.createElement("option");
        o1.value = String(i);
        o1.textContent = String(i);
        vsSel.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = String(i);
        o2.textContent = String(i);
        veSel.appendChild(o2);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function readPassage() {
    const ui = getUILang();
    const t = I18N[ui];

    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const vsSel = $("#verseStartSelect");
    const veSel = $("#verseEndSelect");
    const full = $("#fullChapter");
    const outRef = $("#passageRef");
    const outText = $("#passageText");

    if (!bookSel || !chapSel || !outRef || !outText) return;

    const bid = parseInt(bookSel.value || "", 10);
    const ch = parseInt(chapSel.value || "", 10);
    if (!bid || !ch) {
      alert("Pick a book + chapter.");
      return;
    }

    outRef.textContent = t.working;
    outText.textContent = t.working;

    try {
      const rv = ($("#readingVoice")?.value || "en").trim().toLowerCase();
      const version = bibleVersionForReadingVoice(rv);

      const whole = !!(full && full.checked);
      const qs = new URLSearchParams();
      qs.set("version", version);
      qs.set("book_id", String(bid));
      qs.set("chapter", String(ch));
      qs.set("whole_chapter", whole ? "true" : "false");

      if (!whole) {
        const vs = parseInt(vsSel?.value || "", 10);
        const ve = parseInt(veSel?.value || "", 10);
        if (vs) qs.set("verse_start", String(vs));
        if (ve) qs.set("verse_end", String(ve));
      }

      const data = await apiGet(`/bible/text?${qs.toString()}`);

      const bookName = data?.book || "";
      const chapter = data?.chapter || ch;
      const text = data?.text || "";

      currentPassageText = String(text || "");
      currentPassageLang = (rv === "es") ? "es" : "en";

      const verseStart = qs.get("verse_start");
      const verseEnd = qs.get("verse_end");

      let ref = `${bookName} ${chapter}`;
      if (!whole && verseStart) {
        ref += `:${verseStart}`;
        if (verseEnd && verseEnd !== verseStart) ref += `-${verseEnd}`;
      }

      outRef.textContent = ref;
      outText.textContent = text || "—";
    } catch (e) {
      console.error(e);
      outRef.textContent = "Error";
      outText.textContent = String(e.message || e);
    }
  }

  function initBible() {
    const readBtn = $("#readBibleBtn");
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const rvSel = $("#readingVoice");
    const listenBtn = $("#passageListenBtn");
    const stopBtn = $("#passageStopBtn");

    if (readBtn) readBtn.addEventListener("click", readPassage);

    if (listenBtn) {
      listenBtn.addEventListener("click", () => {
        if (!currentPassageText) return;
        speakText(currentPassageText, currentPassageLang);
      });
    }
    if (stopBtn) stopBtn.addEventListener("click", stopSpeech);

    if (rvSel) {
      rvSel.addEventListener("change", async () => {
        // When switching reading voice to Spanish/English, reload from correct DB
        await refreshBibleStatus();
        await loadBooks();
      });
    }

    if (bookSel) {
      bookSel.addEventListener("change", async () => {
        await loadChaptersForBook();
      });
    }

    if (chapSel) {
      chapSel.addEventListener("change", async () => {
        await loadVersesForChapter();
      });
    }

    refreshBibleStatus().catch(() => {});
    loadBooks().catch(() => {});
  }

  // ---------------------------
  // Devotional & Prayer (AI “starters” via /chat)
  // ---------------------------
  function getDevLang() {
    const v = ($("#devUiLang")?.value || getUILang()).trim().toLowerCase();
    return (v === "es") ? "es" : "en";
  }

  function getPrLang() {
    const v = ($("#prUiLang")?.value || getUILang()).trim().toLowerCase();
    return (v === "es") ? "es" : "en";
  }

  function updateStreakPills() {
    const ui = getUILang();
    const t = I18N[ui];

    const devStreak = parseInt(localStorage.getItem(LS.devStreak) || "0", 10) || 0;
    const prStreak = parseInt(localStorage.getItem(LS.prStreak) || "0", 10) || 0;

    const devPill = $("#devStreakPill");
    const prPill = $("#prStreakPill");

    if (devPill) devPill.textContent = `${t.streak}: ${devStreak}`;
    if (prPill) prPill.textContent = `${t.streak}: ${prStreak}`;
  }

  function didStreakToday(keyDate) {
    return localStorage.getItem(keyDate) === nowDateKey();
  }

  function markStreakToday(keyDate, keyCount) {
    const today = nowDateKey();
    const last = localStorage.getItem(keyDate) || "";
    let count = parseInt(localStorage.getItem(keyCount) || "0", 10) || 0;

    if (last === today) return count; // already counted today
    // If you want strict “consecutive days” logic later, add it here.
    count += 1;

    localStorage.setItem(keyDate, today);
    localStorage.setItem(keyCount, String(count));
    return count;
  }

  function loadSavedList(key, containerId, emptyText) {
    const list = $(containerId);
    if (!list) return;
    const arr = safeJsonParse(localStorage.getItem(key) || "[]", []);
    list.innerHTML = "";

    if (!Array.isArray(arr) || arr.length === 0) {
      const sm = document.createElement("small");
      sm.style.opacity = "0.75";
      sm.textContent = emptyText;
      list.appendChild(sm);
      return;
    }

    arr.slice().reverse().forEach((item) => {
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = item.title || "Saved";
      btn.addEventListener("click", () => item.onLoad && item.onLoad());

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.style.marginTop = "8px";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        const all = safeJsonParse(localStorage.getItem(key) || "[]", []);
        const keep = all.filter(x => x.id !== item.id);
        localStorage.setItem(key, JSON.stringify(keep));
        // Reload via caller
        initDevotional();
        initPrayer();
      });

      list.appendChild(btn);
      list.appendChild(del);
    });
  }

  function parseByMarkers(text, markers) {
    // markers: [{key:"THEME", id:"devTheme"}, ...]
    const out = {};
    const lines = String(text || "").split("\n");
    let cur = null;
    for (const raw of lines) {
      const line = raw.trim();
      const m = line.match(/^([A-Z_]+)\s*:\s*(.*)$/);
      if (m) {
        const k = m[1];
        const rest = m[2] || "";
        if (markers.includes(k)) {
          cur = k;
          out[cur] = rest ? rest + "\n" : "";
          continue;
        }
      }
      if (cur) out[cur] += raw + "\n";
    }
    Object.keys(out).forEach(k => out[k] = out[k].trim());
    return out;
  }

  async function generateDevotional() {
    const lang = getDevLang();
    const ui = getUILang();

    $("#devTheme").textContent = "…";
    $("#devScriptureRef").textContent = "…";
    $("#devScriptureText").textContent = "…";
    $("#devStarterContext").textContent = "…";
    $("#devStarterReflection").textContent = "…";
    $("#devStarterApplication").textContent = "…";
    $("#devStarterPrayer").textContent = "…";

    const promptEn =
      "Create a short Christian devotional STARTER.\n" +
      "Return ONLY these markers in plain text (no markdown):\n" +
      "THEME: ...\nSCRIPTURE_REF: ...\nSCRIPTURE_TEXT: ...\nCONTEXT: ...\nREFLECTION: ...\nAPPLICATION: ...\nPRAYER: ...\n" +
      "Keep each section concise and gentle.";

    const promptEs =
      "Crea un devocional cristiano CORTO (solo un ejemplo inicial).\n" +
      "Devuelve SOLO estos marcadores en texto plano (sin markdown):\n" +
      "THEME: ...\nSCRIPTURE_REF: ...\nSCRIPTURE_TEXT: ...\nCONTEXT: ...\nREFLECTION: ...\nAPPLICATION: ...\nPRAYER: ...\n" +
      "Mantén cada sección breve, clara y con tono suave. Responde en español.";

    try {
      const out = await apiPost("/chat", {
        message: lang === "es" ? promptEs : promptEn,
        lang: lang,
      });
      const reply = out?.reply || "";
      const parsed = parseByMarkers(reply, [
        "THEME",
        "SCRIPTURE_REF",
        "SCRIPTURE_TEXT",
        "CONTEXT",
        "REFLECTION",
        "APPLICATION",
        "PRAYER",
      ]);

      $("#devTheme").textContent = parsed.THEME || "—";
      $("#devScriptureRef").textContent = parsed.SCRIPTURE_REF || "—";
      $("#devScriptureText").textContent = parsed.SCRIPTURE_TEXT || "—";
      $("#devStarterContext").textContent = parsed.CONTEXT || "—";
      $("#devStarterReflection").textContent = parsed.REFLECTION || "—";
      $("#devStarterApplication").textContent = parsed.APPLICATION || "—";
      $("#devStarterPrayer").textContent = parsed.PRAYER || "—";
    } catch (e) {
      console.error(e);
      $("#devTheme").textContent = "Error";
      $("#devScriptureText").textContent = String(e.message || e);
    }
  }

  function saveDevotional() {
    const myCtx = ($("#devMyContext")?.value || "").trim();
    const myRef = ($("#devMyReflection")?.value || "").trim();
    const myApp = ($("#devMyApplication")?.value || "").trim();
    const myPr = ($("#devMyPrayer")?.value || "").trim();

    if (!myCtx || !myRef || !myApp || !myPr) {
      alert("Fill Context + Reflection + Application + Prayer to save.");
      return;
    }

    const title = (String($("#devTheme")?.textContent || "Devotional") || "Devotional").slice(0, 50);
    const entry = {
      id: String(Date.now()),
      title,
      ts: Date.now(),
      lang: getDevLang(),
      theme: $("#devTheme")?.textContent || "",
      scripture_ref: $("#devScriptureRef")?.textContent || "",
      scripture_text: $("#devScriptureText")?.textContent || "",
      starter: {
        context: $("#devStarterContext")?.textContent || "",
        reflection: $("#devStarterReflection")?.textContent || "",
        application: $("#devStarterApplication")?.textContent || "",
        prayer: $("#devStarterPrayer")?.textContent || "",
      },
      mine: {
        context: myCtx,
        reflection: myRef,
        application: myApp,
        prayer: myPr,
        notes: ($("#devMyNotes")?.value || "").trim(),
      },
    };

    const all = safeJsonParse(localStorage.getItem(LS.devSaved) || "[]", []);
    all.push(entry);
    localStorage.setItem(LS.devSaved, JSON.stringify(all));

    markStreakToday(LS.devStreakDate, LS.devStreak);
    updateStreakPills();
    initDevotional();
  }

  function initDevotional() {
    const ui = getUILang();
    const t = I18N[ui];

    // streak pill
    updateStreakPills();

    const devLangSel = $("#devUiLang");
    if (devLangSel && !devLangSel._bound) {
      devLangSel._bound = true;
      devLangSel.addEventListener("change", () => {
        // no need to change entire UI language; this is devotional language only
      });
    }

    const devBtn = $("#devotionalBtn");
    if (devBtn && !devBtn._bound) {
      devBtn._bound = true;
      devBtn.addEventListener("click", generateDevotional);
    }

    const saveBtn = $("#devSaveBtn");
    if (saveBtn && !saveBtn._bound) {
      saveBtn._bound = true;
      saveBtn.addEventListener("click", saveDevotional);
    }

    const streakBtn = $("#devStreakBtn");
    if (streakBtn && !streakBtn._bound) {
      streakBtn._bound = true;
      streakBtn.addEventListener("click", () => {
        markStreakToday(LS.devStreakDate, LS.devStreak);
        updateStreakPills();
      });
    }

    // saved list
    const arr = safeJsonParse(localStorage.getItem(LS.devSaved) || "[]", []);
    const list = $("#devSavedList");
    if (list) {
      list.innerHTML = "";
      if (!Array.isArray(arr) || arr.length === 0) {
        const sm = document.createElement("small");
        sm.style.opacity = "0.75";
        sm.textContent = t.noSavedDevs;
        list.appendChild(sm);
      } else {
        arr.slice().reverse().forEach((item) => {
          const btn = document.createElement("button");
          btn.className = "btn btn-ghost";
          btn.type = "button";
          btn.textContent = item.title || "Devotional";
          btn.addEventListener("click", () => {
            $("#devTheme").textContent = item.theme || "—";
            $("#devScriptureRef").textContent = item.scripture_ref || "—";
            $("#devScriptureText").textContent = item.scripture_text || "—";
            $("#devStarterContext").textContent = item.starter?.context || "—";
            $("#devStarterReflection").textContent = item.starter?.reflection || "—";
            $("#devStarterApplication").textContent = item.starter?.application || "—";
            $("#devStarterPrayer").textContent = item.starter?.prayer || "—";

            $("#devMyContext").value = item.mine?.context || "";
            $("#devMyReflection").value = item.mine?.reflection || "";
            $("#devMyApplication").value = item.mine?.application || "";
            $("#devMyPrayer").value = item.mine?.prayer || "";
            $("#devMyNotes").value = item.mine?.notes || "";
            setSelectValue("#devUiLang", item.lang || "en");
          });

          const del = document.createElement("button");
          del.className = "btn btn-danger";
          del.type = "button";
          del.style.marginTop = "8px";
          del.textContent = "Delete";
          del.addEventListener("click", () => {
            const all = safeJsonParse(localStorage.getItem(LS.devSaved) || "[]", []);
            const keep = all.filter(x => x.id !== item.id);
            localStorage.setItem(LS.devSaved, JSON.stringify(keep));
            initDevotional();
          });

          list.appendChild(btn);
          list.appendChild(del);
        });
      }
    }
  }

  async function generatePrayerStarters() {
    const lang = getPrLang();

    $("#pA").textContent = "…";
    $("#pC").textContent = "…";
    $("#pT").textContent = "…";
    $("#pS").textContent = "…";

    const promptEn =
      "Create short Christian prayer STARTERS using ACTS.\n" +
      "Return ONLY these markers (plain text, no markdown):\n" +
      "ADORATION: ...\nCONFESSION: ...\nTHANKSGIVING: ...\nSUPPLICATION: ...\n" +
      "Keep each section concise and gentle.";

    const promptEs =
      "Crea ejemplos cortos de oración cristiana usando ACTS.\n" +
      "Devuelve SOLO estos marcadores (texto plano, sin markdown):\n" +
      "ADORATION: ...\nCONFESSION: ...\nTHANKSGIVING: ...\nSUPPLICATION: ...\n" +
      "Responde en español y mantén cada sección breve.";

    try {
      const out = await apiPost("/chat", {
        message: lang === "es" ? promptEs : promptEn,
        lang: lang,
      });
      const reply = out?.reply || "";
      const parsed = parseByMarkers(reply, ["ADORATION", "CONFESSION", "THANKSGIVING", "SUPPLICATION"]);

      $("#pA").textContent = parsed.ADORATION || "—";
      $("#pC").textContent = parsed.CONFESSION || "—";
      $("#pT").textContent = parsed.THANKSGIVING || "—";
      $("#pS").textContent = parsed.SUPPLICATION || "—";
    } catch (e) {
      console.error(e);
      $("#pA").textContent = "Error";
      $("#pC").textContent = String(e.message || e);
    }
  }

  function savePrayer() {
    const a = ($("#myAdoration")?.value || "").trim();
    const c = ($("#myConfession")?.value || "").trim();
    const t = ($("#myThanksgiving")?.value || "").trim();
    const s = ($("#mySupplication")?.value || "").trim();

    if (!a || !c || !t || !s) {
      alert("Fill Adoration + Confession + Thanksgiving + Supplication to save.");
      return;
    }

    const title = `Prayer • ${new Date().toLocaleDateString()}`;
    const entry = {
      id: String(Date.now()),
      title,
      ts: Date.now(),
      lang: getPrLang(),
      starter: { a: $("#pA")?.textContent || "", c: $("#pC")?.textContent || "", t: $("#pT")?.textContent || "", s: $("#pS")?.textContent || "" },
      mine: { a, c, t, s, notes: ($("#prayerNotes")?.value || "").trim() },
    };

    const all = safeJsonParse(localStorage.getItem(LS.prSaved) || "[]", []);
    all.push(entry);
    localStorage.setItem(LS.prSaved, JSON.stringify(all));

    markStreakToday(LS.prStreakDate, LS.prStreak);
    updateStreakPills();
    initPrayer();
  }

  function initPrayer() {
    const ui = getUILang();
    const t = I18N[ui];

    updateStreakPills();

    const prBtn = $("#prayerBtn");
    if (prBtn && !prBtn._bound) {
      prBtn._bound = true;
      prBtn.addEventListener("click", generatePrayerStarters);
    }

    const saveBtn = $("#prSaveBtn");
    if (saveBtn && !saveBtn._bound) {
      saveBtn._bound = true;
      saveBtn.addEventListener("click", savePrayer);
    }

    const streakBtn = $("#prStreakBtn");
    if (streakBtn && !streakBtn._bound) {
      streakBtn._bound = true;
      streakBtn.addEventListener("click", () => {
        markStreakToday(LS.prStreakDate, LS.prStreak);
        updateStreakPills();
      });
    }

    // saved list
    const arr = safeJsonParse(localStorage.getItem(LS.prSaved) || "[]", []);
    const list = $("#prSavedList");
    if (list) {
      list.innerHTML = "";
      if (!Array.isArray(arr) || arr.length === 0) {
        const sm = document.createElement("small");
        sm.style.opacity = "0.75";
        sm.textContent = t.noSavedPrayers;
        list.appendChild(sm);
      } else {
        arr.slice().reverse().forEach((item) => {
          const btn = document.createElement("button");
          btn.className = "btn btn-ghost";
          btn.type = "button";
          btn.textContent = item.title || "Prayer";
          btn.addEventListener("click", () => {
            $("#pA").textContent = item.starter?.a || "—";
            $("#pC").textContent = item.starter?.c || "—";
            $("#pT").textContent = item.starter?.t || "—";
            $("#pS").textContent = item.starter?.s || "—";

            $("#myAdoration").value = item.mine?.a || "";
            $("#myConfession").value = item.mine?.c || "";
            $("#myThanksgiving").value = item.mine?.t || "";
            $("#mySupplication").value = item.mine?.s || "";
            $("#prayerNotes").value = item.mine?.notes || "";
            setSelectValue("#prUiLang", item.lang || "en");
          });

          const del = document.createElement("button");
          del.className = "btn btn-danger";
          del.type = "button";
          del.style.marginTop = "8px";
          del.textContent = "Delete";
          del.addEventListener("click", () => {
            const all = safeJsonParse(localStorage.getItem(LS.prSaved) || "[]", []);
            const keep = all.filter(x => x.id !== item.id);
            localStorage.setItem(LS.prSaved, JSON.stringify(keep));
            initPrayer();
          });

          list.appendChild(btn);
          list.appendChild(del);
        });
      }
    }
  }

  // ---------------------------
  // Voices status
  // ---------------------------
  async function pickLockedVoice(lang) {
    // simple: rely on default voice availability
    // (Your original app had more advanced selection; this avoids breaking UI.)
    return true;
  }

  // ---------------------------
  // Init
  // ---------------------------
  async function init() {
    showTopStatus("JS: starting…");
    initTabs();
    initStripeUI();
    initChat();
    initDevotional();
    initPrayer();
    initBible();

    // set UI lang select from storage
    const stored = normLang(localStorage.getItem(LS.uiLang) || "en", "en");
    localStorage.setItem(LS.uiLang, stored);
    setSelectValue("#uiLangSelect", stored);

    applyUILang();

    // Voice pills
    const ttsStatus = $("#ttsStatus");
    const chatVoicePill = $("#chatVoicePill");
    try {
      const ok = await pickLockedVoice("en");
      const ui = getUILang();
      const msg = ok ? I18N[ui].voiceReady : I18N[ui].voiceMissing;
      if (ttsStatus) ttsStatus.textContent = msg;
      if (chatVoicePill) chatVoicePill.textContent = msg;
    } catch {
      const ui = getUILang();
      if (ttsStatus) ttsStatus.textContent = I18N[ui].voiceMissing;
      if (chatVoicePill) chatVoicePill.textContent = I18N[ui].voiceMissing;
    }

    // Auth ping
    try {
      const tok = getToken();
      if (tok) {
        const me = await apiGet("/me", { headers: authHeaders() });
        if (me && me.ok && me.authed) {
          const status = (me.status || (me.subscribed ? "active" : "inactive") || "unknown").toLowerCase();
          localStorage.setItem(LS.authStatus, status);
          if (me.email) localStorage.setItem(LS.authEmail, String(me.email));
          setAuthUI(status === "active" ? "active" : "inactive", localStorage.getItem(LS.authEmail) || "");
        }
      } else {
        const email = localStorage.getItem(LS.authEmail) || "";
        const st = localStorage.getItem(LS.authStatus) || "";
        if (st) setAuthUI(st, email);
      }
    } catch {}

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

