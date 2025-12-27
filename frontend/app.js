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
    readingLang: "alyana.read.lang",
    bibleVersion: "alyana.bible.version",

    // “account” (Stripe restore)
    authEmail: "alyana.auth.email",
    authStatus: "alyana.auth.status", // "unknown" | "active" | "inactive"
    authToken: "alyana.auth.token",   // Bearer token from /stripe/restore

    // saved content
    savedChats: "alyana.saved.chats",
    savedDevs: "alyana.saved.devs",
    savedPrayers: "alyana.saved.prayers",

    // drafts
    chatDraft: "alyana.chat.draft",
    devDraft: "alyana.dev.draft",
    prDraft: "alyana.pr.draft",
  };

  const safeJSON = (s, fallback) => {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
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

  function toast(message, isError = false) {
    const hint = $("#authHint");
    if (hint) {
      showInline(hint, message, isError);
      setTimeout(() => {
        hint.style.display = "none";
      }, 3500);
    } else {
      alert(message);
    }
  }

  function getToken() {
    return (localStorage.getItem(LS.authToken) || "").trim();
  }

  function authHeaders(extra = {}) {
    const tok = getToken();
    return tok ? { ...extra, Authorization: `Bearer ${tok}` } : { ...extra };
  }

  async function apiGet(path, opts = {}) {
    const res = await fetch(path, {
      headers: { Accept: "application/json", ...(opts.headers || {}) },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GET ${path} -> ${res.status} ${t}`.trim());
    }
    return res.json();
  }

  async function apiPost(path, body, opts = {}) {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(opts.headers || {}),
      },
      body: JSON.stringify(body || {}),
    });

    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      let detail = raw;
      try {
        const j = JSON.parse(raw);
        if (j && typeof j.detail === "string") detail = j.detail;
      } catch {}
      throw new Error(`POST ${path} -> ${res.status} ${detail || ""}`.trim());
    }

    return res.json();
  }

  function getQueryParam(name) {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(name);
    } catch {
      return null;
    }
  }

  function removeQueryParams(names = []) {
    try {
      const u = new URL(window.location.href);
      names.forEach((n) => u.searchParams.delete(n));
      window.history.replaceState({}, document.title, u.toString());
    } catch {}
  }

  // ---------------------------
  // UI language strings
  // ---------------------------
  const I18N = {
    en: {
      delete: "Delete",
      select: "Select…",
      optional: "(optional)",
      dash: "—",

      // top
      support: "❤️ Support Alyana Luz",
      supportNote:
        "Your support helps maintain and grow Alyana Luz — continually improving development and expanding this ministry.\n" +
        "To access premium features, subscribe with Support, or restore access using the email you used on Stripe.",
      restoreAccess: "Restore access",
      emailUsedForStripe: "Email used for Stripe…",
      accountChecking: "Account: checking…",
      accountReady: "Account: ready",
      accountActive: "Account: active",
      accountInactive: "Account: inactive",
      manageBilling: "Manage billing",
      logout: "Logout",

      // tabs
      tabChat: "Chat",
      tabBible: "Read Bible",
      tabDev: "Devotional",
      tabPrayer: "Daily Prayer",

      // chat
      chatTitle: "Chat",
      savedChatsHint: "Saved chat logs are stored on this device.",
      chatLangLabel: "Chat Language",
      chatPlaceholder: "Ask for a prayer, verse, or ‘verses about forgiveness’…",
      send: "Send",
      listen: "Listen",
      stop: "Stop",
      new: "New",
      save: "Save",
      savedChatsTitle: "Saved Chats",
      savedChatsHint2: "Load or delete any saved chat.",
      nothingToSave: "Nothing to save yet.",
      savedOk: "Saved.",
      noBotToRead: "No bot message to read yet.",

      // common list
      noSaved: "No saved items yet.",

      // voices
      voiceReady: "Voice: ready",
      voiceMissing:
        "Voice not found. Your browser must have 'Paulina (es-MX)' and 'Karen (en-AU)' installed.",

      // bible
      bibleTitle: "Bible Reader (Listen)",
      bibleHint: "Pick a book/chapter and verse range, or Full Chapter.",
      read: "Read",
      lblBook: "Book",
      lblChapter: "Chapter",
      lblVerseStart: "Verse (start)",
      lblVerseEnd: "Verse (end)",
      lblReaderLang: "Reader Language",
      readerLangNote: "Only two voices, locked for consistency.",
      lblFullChapter: "Full Chapter",
      fullChapterNote: "If Full Chapter is on, verses are ignored.",
      lblVersion: "Version label (English only)",
      versionNote: "For Spanish voice, we do not speak the version label.",
      spanishReadNote:
        "Spanish voice reads ONLY verse text (no English labels), so it stays pure Spanish.",
      dbStatusTitle: "Bible DB Status",
      passageTitle: "Passage",
      pickBookChapter: "Pick a book and chapter first.",
      loading: "Loading…",
      bibleNotFound:
        "Bible DB not found. Confirm your Render deployment includes /data/bible.db and /data/bible_es_rvr.db.",

      // devotional
      devTitle: "Devotional",
      devIntro:
        "Alyana gives short starter examples. You write and save your real devotional.",
      streak: "Streak",
      didIt: "I did it today",
      generate: "Generate",
      devSave: "Save",
      devLabelTheme: "Theme / Title (Alyana)",
      devLabelScripture: "Scripture (Alyana)",
      devLabelCtx: "Alyana Starter — Context / Observation",
      devLabelRef: "Alyana Starter — Reflection / Insight",
      devLabelApp: "Alyana Starter — Application (Practical)",
      devLabelPr: "Alyana Starter — Prayer",
      devNow1: "Now write yours:",
      devNow2: "Now write yours:",
      devNow3: "Now write yours:",
      devNow4: "Now write your real prayer:",
      devMyContextPH:
        "Context / Observation (What’s happening? Who is speaking? Why does it matter?)",
      devMyReflectionPH:
        "Reflection / Insight (What does this reveal about God? About me?)",
      devMyApplicationPH: "Application (What will I do today because of this?)",
      devMyPrayerPH: "Prayer (write your real prayer here)",
      devNotes: "Notes / Reflection (optional)",
      devNotesPH: "Notes…",
      devReqNote:
        "Required to save (streak): Context + Reflection + Application + Prayer.",
      devSavedTitle: "Saved Devotionals",
      devSavedHint: "Load or delete past devotionals saved on this device.",
      devSavedToast: "Saved devotional.",
      devReqToast:
        "To save: Context + Reflection + Application + Prayer are required.",

      // prayer
      prTitle: "Daily Prayer",
      prIntro:
        "Alyana gives a short starter example. You write and save your real prayer.",
      prGenerate: "Generate Starters",
      prSave: "Save",
      prLabelA: "Alyana Starter — Adoration",
      prLabelC: "Alyana Starter — Confession",
      prLabelT: "Alyana Starter — Thanksgiving",
      prLabelS: "Alyana Starter — Supplication",
      prLabelN: "Notes",
      prNow1: "Now write your own:",
      prNow2: "Now write your own:",
      prNow3: "Now write your own:",
      prNow4: "Now write your own:",
      myAdorationPH: "Adoration (praise God for who He is)…",
      myConfessionPH: "Confession (what I need to confess)…",
      myThanksPH: "Thanksgiving (what I’m grateful for)…",
      mySuppPH: "Supplication (requests for myself/others)…",
      prNotesPH: "Notes…",
      prSavedTitle: "Saved Prayers",
      prSavedHint: "Load or delete past prayers saved on this device.",
      prSavedToast: "Saved prayer.",
      prReqToast:
        "To save: Adoration + Confession + Thanksgiving + Supplication are required.",

      // stripe
      needEmail: "Please enter the email you used for Stripe, then press Restore access.",
      stripeNotWired:
        "Stripe endpoints are not available on the server yet. Add /stripe/checkout, /stripe/restore, and /stripe/portal to server.py.",
      authMissing:
        "Please click Restore access first (so we can authenticate) then try Manage billing.",

      // stripe success/cancel
      stripeSuccess: "Payment started successfully. Restoring access…",
      stripeCanceled: "Checkout canceled.",
      accessRestored: "Access restored.",
    },

    es: {
      delete: "Eliminar",
      select: "Seleccionar…",
      optional: "(opcional)",
      dash: "—",

      support: "❤️ Apoyar a Alyana Luz",
      supportNote:
        "Tu apoyo ayuda a mantener y hacer crecer Alyana Luz — mejorando continuamente el desarrollo y expandiendo este ministerio.\n" +
        "Para acceder a funciones premium, suscríbete con Apoyar, o restaura el acceso usando el correo que usaste en Stripe.",
      restoreAccess: "Restaurar acceso",
      emailUsedForStripe: "Correo usado en Stripe…",
      accountChecking: "Cuenta: verificando…",
      accountReady: "Cuenta: lista",
      accountActive: "Cuenta: activa",
      accountInactive: "Cuenta: inactiva",
      manageBilling: "Administrar pagos",
      logout: "Cerrar sesión",

      tabChat: "Chat",
      tabBible: "Leer Biblia",
      tabDev: "Devocional",
      tabPrayer: "Oración diaria",

      chatTitle: "Chat",
      savedChatsHint: "Los chats guardados se almacenan en este dispositivo.",
      chatLangLabel: "Idioma del chat",
      chatPlaceholder: "Pide una oración, un versículo, o ‘versículos sobre perdón’…",
      send: "Enviar",
      listen: "Escuchar",
      stop: "Detener",
      new: "Nuevo",
      save: "Guardar",
      savedChatsTitle: "Chats guardados",
      savedChatsHint2: "Carga o elimina cualquier chat guardado.",
      nothingToSave: "Todavía no hay nada para guardar.",
      savedOk: "Guardado.",
      noBotToRead: "Aún no hay un mensaje del bot para leer.",

      noSaved: "Todavía no hay elementos guardados.",

      voiceReady: "Voz: lista",
      voiceMissing:
        "No se encontró la voz. Tu navegador debe tener instaladas 'Paulina (es-MX)' y 'Karen (en-AU)'.",

      bibleTitle: "Lector de Biblia (Escuchar)",
      bibleHint: "Elige un libro/capítulo y rango de versículos, o Capítulo completo.",
      read: "Leer",
      lblBook: "Libro",
      lblChapter: "Capítulo",
      lblVerseStart: "Versículo (inicio)",
      lblVerseEnd: "Versículo (fin)",
      lblReaderLang: "Idioma del lector",
      readerLangNote: "Solo dos voces, fijas para consistencia.",
      lblFullChapter: "Capítulo completo",
      fullChapterNote: "Si está activado, se ignoran los versículos.",
      lblVersion: "Etiqueta de versión (solo inglés)",
      versionNote: "Para voz en español, no decimos la etiqueta de versión.",
      spanishReadNote: "La voz en español lee SOLO el texto (sin etiquetas en inglés).",
      dbStatusTitle: "Estado de la DB bíblica",
      passageTitle: "Pasaje",
      pickBookChapter: "Primero elige un libro y un capítulo.",
      loading: "Cargando…",
      bibleNotFound:
        "No se encontró la base de datos bíblica. Confirma que Render incluye /data/bible.db y /data/bible_es_rvr.db.",

      devTitle: "Devocional",
      devIntro: "Alyana da ejemplos cortos. Tú escribes y guardas tu devocional real.",
      streak: "Racha",
      didIt: "Lo hice hoy",
      generate: "Generar",
      devSave: "Guardar",
      devLabelTheme: "Tema / Título (Alyana)",
      devLabelScripture: "Escritura (Alyana)",
      devLabelCtx: "Alyana Starter — Contexto / Observación",
      devLabelRef: "Alyana Starter — Reflexión / Enseñanza",
      devLabelApp: "Alyana Starter — Aplicación (práctica)",
      devLabelPr: "Alyana Starter — Oración",
      devNow1: "Ahora escribe el tuyo:",
      devNow2: "Ahora escribe el tuyo:",
      devNow3: "Ahora escribe el tuyo:",
      devNow4: "Ahora escribe tu oración real:",
      devMyContextPH:
        "Contexto / Observación (¿Qué está pasando? ¿Quién habla? ¿Por qué importa?)",
      devMyReflectionPH: "Reflexión (¿Qué revela esto de Dios? ¿De mí?)",
      devMyApplicationPH: "Aplicación (¿Qué haré hoy por esto?)",
      devMyPrayerPH: "Oración (escribe tu oración real aquí)",
      devNotes: "Notas / Reflexión (opcional)",
      devNotesPH: "Notas…",
      devReqNote:
        "Requisito para guardar (racha): Contexto + Reflexión + Aplicación + Oración.",
      devSavedTitle: "Devocionales guardados",
      devSavedHint: "Carga o elimina devocionales guardados en este dispositivo.",
      devSavedToast: "Devocional guardado.",
      devReqToast:
        "Para guardar: Contexto + Reflexión + Aplicación + Oración son requeridos.",

      prTitle: "Oración diaria",
      prIntro: "Alyana da un ejemplo corto. Tú escribes y guardas tu oración real.",
      prGenerate: "Generar ejemplos",
      prSave: "Guardar",
      prLabelA: "Alyana Starter — Adoración",
      prLabelC: "Alyana Starter — Confesión",
      prLabelT: "Alyana Starter — Acción de gracias",
      prLabelS: "Alyana Starter — Súplica",
      prLabelN: "Notas",
      prNow1: "Ahora escribe la tuya:",
      prNow2: "Ahora escribe la tuya:",
      prNow3: "Ahora escribe la tuya:",
      prNow4: "Ahora escribe la tuya:",
      myAdorationPH: "Adoración (alaba a Dios por quién Él es)…",
      myConfessionPH: "Confesión (lo que necesito confesar)…",
      myThanksPH: "Acción de gracias (por lo que estoy agradecido)…",
      mySuppPH: "Súplica (peticiones por mí/otros)…",
      prNotesPH: "Notas…",
      prSavedTitle: "Oraciones guardadas",
      prSavedHint: "Carga o elimina oraciones guardadas en este dispositivo.",
      prSavedToast: "Oración guardada.",
      prReqToast:
        "Para guardar: Adoración + Confesión + Acción de gracias + Súplica son requeridos.",

      needEmail: "Escribe el correo que usaste en Stripe y presiona Restaurar acceso.",
      stripeNotWired:
        "Los endpoints de Stripe no están disponibles en el servidor todavía. Agrega /stripe/checkout, /stripe/restore y /stripe/portal en server.py.",
      authMissing:
        "Primero presiona Restaurar acceso (para autenticar) y luego intenta Administrar pagos.",

      stripeSuccess: "Pago iniciado. Restaurando acceso…",
      stripeCanceled: "Compra cancelada.",
      accessRestored: "Acceso restaurado.",
    },
  };

  function normLang(v, fallback = "en") {
    const val = (v || fallback || "en").toLowerCase();
    return val === "es" ? "es" : "en";
  }

  function getUILang() {
    const sel = $("#uiLangSelect");
    const stored = normLang(localStorage.getItem(LS.uiLang) || "en", "en");
    const v = sel && sel.value ? normLang(sel.value, stored) : stored;
    return v;
  }

  function setSelectValue(sel, v) {
    const el = $(sel);
    if (!el) return;
    el.value = v;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setPlaceholder(id, value) {
    const el = document.getElementById(id);
    if (el) el.setAttribute("placeholder", value);
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

  function applyTabLabels(uiLang) {
    const t = I18N[uiLang];
    const bChat = document.querySelector('.menu-btn[data-target="chatSection"]');
    const bBible = document.querySelector('.menu-btn[data-target="bibleSection"]');
    const bDev = document.querySelector('.menu-btn[data-target="devotionalSection"]');
    const bPr = document.querySelector('.menu-btn[data-target="prayerSection"]');

    if (bChat) bChat.textContent = t.tabChat;
    if (bBible) bBible.textContent = t.tabBible;
    if (bDev) bDev.textContent = t.tabDev;
    if (bPr) bPr.textContent = t.tabPrayer;
  }

  // ---------------------------
  // Speech (locked voices)
  // ---------------------------
  const VOICE_LOCK = {
    en: { wantNameIncludes: "karen", wantLangPrefix: "en" },
    es: { wantNameIncludes: "paulina", wantLangPrefix: "es" },
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

  async function pickLockedVoice(lang) {
    const voices = await getAllVoices();
    const spec = VOICE_LOCK[lang];

    const byName = voices.find((v) =>
      (v.name || "").toLowerCase().includes(spec.wantNameIncludes)
    );
    if (byName && (byName.lang || "").toLowerCase().startsWith(spec.wantLangPrefix)) return byName;
    if (byName) return byName;

    const byLang = voices.find((v) =>
      (v.lang || "").toLowerCase().startsWith(spec.wantLangPrefix)
    );
    return byLang || null;
  }

  function stopSpeak() {
    try {
      speechSynthesis.cancel();
    } catch {}
  }

  function isSpeaking() {
    try {
      return !!(speechSynthesis.speaking || speechSynthesis.pending);
    } catch {
      return false;
    }
  }

  async function speakText(text, lang, rate = 1.0) {
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
  // Stripe / Account UI
  // ---------------------------
  function setAuthUI(state /* "unknown"|"active"|"inactive" */, emailMaybe) {
    const uiLang = getUILang();
    const t = I18N[uiLang];

    const pill = $("#authPill");
    const manageBtn = $("#manageBillingBtn");
    const logoutBtn = $("#logoutBtn");
    const email = (emailMaybe || localStorage.getItem(LS.authEmail) || "").trim();

    let label = t.accountChecking;
    let cls = "pill warn";
    let canManage = false;

    if (state === "active") {
      label = t.accountActive;
      cls = "pill ok";
      canManage = true;
    } else if (state === "inactive") {
      label = t.accountInactive;
      cls = "pill bad";
      canManage = true;
    } else if (state === "ready") {
      label = t.accountReady;
      cls = "pill warn";
    }

    if (pill) {
      pill.className = cls;
      pill.textContent = label;
      pill.title = email ? `Email: ${email}` : "";
    }

    if (manageBtn) manageBtn.disabled = !canManage;
    if (logoutBtn) logoutBtn.style.display = email ? "" : "none";
  }

  function getEmailInput() {
    const el = $("#loginEmail");
    return (el && el.value ? String(el.value) : "").trim();
  }

  function setEmailInput(v) {
    const el = $("#loginEmail");
    if (el) el.value = v || "";
  }

  function rememberEmail(email) {
    const e = (email || "").trim();
    if (!e) return;
    localStorage.setItem(LS.authEmail, e);
  }

  function rememberToken(token) {
    const t = (token || "").trim();
    if (!t) return;
    localStorage.setItem(LS.authToken, t);
  }

  async function refreshMeFromServer() {
    try {
      const tok = getToken();
      if (!tok) return;

      const me = await apiGet("/me", { headers: authHeaders() });
      if (me && me.ok && me.authed) {
        const status = (me.status || (me.subscribed ? "active" : "inactive") || "unknown").toLowerCase();
        localStorage.setItem(LS.authStatus, status);
        if (me.email) localStorage.setItem(LS.authEmail, String(me.email));
        setAuthUI(status === "active" ? "active" : "inactive", localStorage.getItem(LS.authEmail) || "");
      }
    } catch {
      // ignore
    }
  }

  async function stripeRestoreAccess(showToast = true) {
    const uiLang = getUILang();
    const t = I18N[uiLang];

    const email = (getEmailInput() || localStorage.getItem(LS.authEmail) || "").trim();
    if (!email) return toast(t.needEmail, true);

    rememberEmail(email);
    setAuthUI("unknown", email);

    try {
      const j = await apiPost("/stripe/restore", { email });

      if (j && j.token) rememberToken(String(j.token));
      if (j && j.customer_email) rememberEmail(String(j.customer_email));

      const status =
        (j && typeof j.status === "string" && j.status) ?
          String(j.status).toLowerCase() :
          (j && typeof j.subscribed === "boolean" ? (j.subscribed ? "active" : "inactive") : "unknown");

      localStorage.setItem(LS.authStatus, status);
      setAuthUI(status === "active" ? "active" : "inactive", localStorage.getItem(LS.authEmail) || email);

      // ✅ Re-check /me for final truth (handles trialing/active logic)
      await refreshMeFromServer();

      if (showToast) toast(t.accessRestored);
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (/404\b/.test(msg) || /Not Found/i.test(msg)) toast(t.stripeNotWired, true);
      else toast(msg, true);
      setAuthUI("unknown", email);
    }
  }

  async function stripeCheckout() {
    const uiLang = getUILang();
    const t = I18N[uiLang];

    const email = (getEmailInput() || localStorage.getItem(LS.authEmail) || "").trim();
    if (!email) return toast(t.needEmail, true);

    rememberEmail(email);

    try {
      const j = await apiPost("/stripe/checkout", { email });
      const url = j && (j.url || j.checkout_url) ? String(j.url || j.checkout_url) : "";
      if (!url) throw new Error("Checkout URL missing from server response.");
      window.location.href = url;
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (/404\b/.test(msg) || /Not Found/i.test(msg)) toast(t.stripeNotWired, true);
      else toast(msg, true);
    }
  }

  async function stripePortal() {
    const uiLang = getUILang();
    const t = I18N[uiLang];

    const tok = getToken();
    if (!tok) return toast(t.authMissing, true);

    try {
      const j = await apiPost("/stripe/portal", {}, { headers: authHeaders() });
      const url = j && (j.url || j.portal_url) ? String(j.url || j.portal_url) : "";
      if (!url) throw new Error("Portal URL missing from server response.");
      window.location.href = url;
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      if (/401\b/.test(msg) || /Not authenticated/i.test(msg)) toast(t.authMissing, true);
      else toast(msg, true);
    }
  }

  function logoutLocal() {
    localStorage.removeItem(LS.authEmail);
    localStorage.removeItem(LS.authStatus);
    localStorage.removeItem(LS.authToken);
    setEmailInput("");
    setAuthUI("unknown", "");
    toast(getUILang() === "es" ? "Sesión cerrada." : "Logged out.");
  }

  function initStripeUI() {
    const supportBtn = $("#supportBtn");
    const loginBtn = $("#loginBtn");
    const manageBtn = $("#manageBillingBtn");
    const logoutBtn = $("#logoutBtn");

    if (supportBtn) supportBtn.addEventListener("click", stripeCheckout);
    if (loginBtn) loginBtn.addEventListener("click", () => stripeRestoreAccess(true));
    if (manageBtn) manageBtn.addEventListener("click", stripePortal);
    if (logoutBtn) logoutBtn.addEventListener("click", logoutLocal);

    const savedEmail = (localStorage.getItem(LS.authEmail) || "").trim();
    if (savedEmail) setEmailInput(savedEmail);

    const savedStatus = (localStorage.getItem(LS.authStatus) || "unknown").toLowerCase();
    setAuthUI(savedStatus === "active" ? "active" : savedStatus === "inactive" ? "inactive" : "unknown", savedEmail);
  }

  // ---------------------------
  // Apply UI language
  // ---------------------------
  function applyTabLabelsOnly(uiLang) {
    applyTabLabels(uiLang);
  }

  function applyUILang() {
    const uiLang = getUILang();
    localStorage.setItem(LS.uiLang, uiLang);
    const t = I18N[uiLang];

    applyTabLabelsOnly(uiLang);

    const supportBtn = $("#supportBtn");
    if (supportBtn) supportBtn.textContent = t.support;

    const manageBtn = $("#manageBillingBtn");
    if (manageBtn) manageBtn.textContent = t.manageBilling;

    const logoutBtn = $("#logoutBtn");
    if (logoutBtn) logoutBtn.textContent = t.logout;

    setPlaceholder("loginEmail", t.emailUsedForStripe);

    const loginBtn = $("#loginBtn");
    if (loginBtn) loginBtn.textContent = t.restoreAccess;

    const note = document.querySelector(".support-note");
    if (note) note.textContent = t.supportNote;

    const savedStatus = (localStorage.getItem(LS.authStatus) || "unknown").toLowerCase();
    const email = (localStorage.getItem(LS.authEmail) || getEmailInput() || "").trim();
    setAuthUI(savedStatus === "active" ? "active" : savedStatus === "inactive" ? "inactive" : "unknown", email);

    setText("ttsStatus", t.voiceReady);
    setText("chatVoicePill", t.voiceReady);

    const chatCardTitle = document.querySelector("#chatSection h3");
    if (chatCardTitle) chatCardTitle.textContent = t.chatTitle;

    const chatHint = document.querySelector("#chatSection .muted");
    if (chatHint) chatHint.textContent = t.savedChatsHint;

    const chatLangWrap = $("#chatLangSelect")?.closest("label");
    if (chatLangWrap) {
      const span = chatLangWrap.querySelector(".muted");
      if (span) span.textContent = t.chatLangLabel;
    }

    setPlaceholder("chatInput", t.chatPlaceholder);

    const chatSendBtn = $("#chatSendBtn");
    if (chatSendBtn) chatSendBtn.textContent = t.send;

    const chatListenBtn = $("#chatListenBtn");
    if (chatListenBtn) chatListenBtn.textContent = t.listen;

    const chatStopBtn = $("#chatStopBtn");
    if (chatStopBtn) chatStopBtn.textContent = t.stop;

    const chatNewBtn = $("#chatNewBtn");
    if (chatNewBtn) chatNewBtn.textContent = t.new;

    const chatSaveBtn = $("#chatSaveBtn");
    if (chatSaveBtn) chatSaveBtn.textContent = t.save;

    const savedChatsTitle = document.querySelector("#chatSection h4");
    if (savedChatsTitle) savedChatsTitle.textContent = t.savedChatsTitle;

    const savedChatsHint2 = document.querySelector("#chatSection .card:nth-child(2) .muted");
    if (savedChatsHint2) savedChatsHint2.textContent = t.savedChatsHint2;

    const bibleH3 = document.querySelector("#bibleSection h3");
    if (bibleH3) bibleH3.textContent = t.bibleTitle;

    const bibleHint = $("#bibleSection .muted");
    if (bibleHint) bibleHint.textContent = t.bibleHint;

    const readBibleBtn = $("#readBibleBtn");
    if (readBibleBtn) readBibleBtn.textContent = t.read;

    const spanishNote = document.querySelector("#bibleSection .small-note");
    if (spanishNote) spanishNote.textContent = t.spanishReadNote;

    const devH3 = document.querySelector("#devotionalSection h3");
    if (devH3) devH3.textContent = t.devTitle;

    setText("devIntro", t.devIntro);

    const devStreakPill = $("#devStreakPill");
    if (devStreakPill) {
      const num = (devStreakPill.textContent || "").match(/\d+/)?.[0] || "0";
      devStreakPill.textContent = `${t.streak}: ${num}`;
    }

    const devStreakBtn = $("#devStreakBtn");
    if (devStreakBtn) devStreakBtn.textContent = t.didIt;

    const devotionalBtn = $("#devotionalBtn");
    if (devotionalBtn) devotionalBtn.textContent = t.generate;

    const devSaveBtn = $("#devSaveBtn");
    if (devSaveBtn) devSaveBtn.textContent = t.devSave;

    setText("devLabelTheme", t.devLabelTheme);
    setText("devLabelScripture", t.devLabelScripture);
    setText("devLabelCtxA", t.devLabelCtx);
    setText("devLabelRefA", t.devLabelRef);
    setText("devLabelAppA", t.devLabelApp);
    setText("devLabelPrA", t.devLabelPr);
    setText("devNow1", t.devNow1);
    setText("devNow2", t.devNow2);
    setText("devNow3", t.devNow3);
    setText("devNow4", t.devNow4);
    setPlaceholder("devMyContext", t.devMyContextPH);
    setPlaceholder("devMyReflection", t.devMyReflectionPH);
    setPlaceholder("devMyApplication", t.devMyApplicationPH);
    setPlaceholder("devMyPrayer", t.devMyPrayerPH);
    setText("devLabelNotes", t.devNotes);
    setPlaceholder("devMyNotes", t.devNotesPH);
    setText("devReqNote", t.devReqNote);

    const devSavedTitle = document.querySelector("#devotionalSection h4");
    if (devSavedTitle) devSavedTitle.textContent = t.devSavedTitle;

    const devSavedHint = document.querySelector("#devotionalSection .card:nth-child(2) .muted");
    if (devSavedHint) devSavedHint.textContent = t.devSavedHint;

    const prH3 = document.querySelector("#prayerSection h3");
    if (prH3) prH3.textContent = t.prTitle;

    setText("prIntro", t.prIntro);

    const prStreakPill = $("#prStreakPill");
    if (prStreakPill) {
      const num = (prStreakPill.textContent || "").match(/\d+/)?.[0] || "0";
      prStreakPill.textContent = `${t.streak}: ${num}`;
    }

    const prStreakBtn = $("#prStreakBtn");
    if (prStreakBtn) prStreakBtn.textContent = t.didIt;

    const prayerBtn = $("#prayerBtn");
    if (prayerBtn) prayerBtn.textContent = t.prGenerate;

    const prSaveBtn = $("#prSaveBtn");
    if (prSaveBtn) prSaveBtn.textContent = t.prSave;

    setText("prLabelA", t.prLabelA);
    setText("prLabelC", t.prLabelC);
    setText("prLabelT", t.prLabelT);
    setText("prLabelS", t.prLabelS);
    setText("prLabelN", t.prLabelN);
    setText("prNow1", t.prNow1);
    setText("prNow2", t.prNow2);
    setText("prNow3", t.prNow3);
    setText("prNow4", t.prNow4);
    setPlaceholder("myAdoration", t.myAdorationPH);
    setPlaceholder("myConfession", t.myConfessionPH);
    setPlaceholder("myThanksgiving", t.myThanksPH);
    setPlaceholder("mySupplication", t.mySuppPH);
    setPlaceholder("prayerNotes", t.prNotesPH);

    const prSavedTitle = document.querySelector("#prayerSection h4");
    if (prSavedTitle) prSavedTitle.textContent = t.prSavedTitle;

    const prSavedHint = document.querySelector("#prayerSection .card:nth-child(2) .muted");
    if (prSavedHint) prSavedHint.textContent = t.prSavedHint;

    renderSavedChats();
    renderSavedDevs();
    renderSavedPrayers();
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

    const uiLang = getUILang();
    const t = I18N[uiLang];

    const list = chatStorageLoad();
    box.innerHTML = "";

    if (!list.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = t.noSaved;
      box.appendChild(small);
      return;
    }

    list
      .slice()
      .reverse()
      .forEach((item, idxFromEnd) => {
        const idx = list.length - 1 - idxFromEnd;

        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.type = "button";
        btn.textContent = `${item.title || "Chat"} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
        btn.addEventListener("click", () => {
          const chat = $("#chat");
          if (!chat) return;
          chat.innerHTML = "";
          (item.messages || []).forEach((m) => addBubble(m.kind, m.text));
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
    rows.forEach((r) => {
      const kind = r.classList.contains("user")
        ? "user"
        : r.classList.contains("bot")
        ? "bot"
        : "system";
      const b = r.querySelector(".bubble");
      const text = b && b.textContent ? b.textContent : "";
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

    if (input) input.value = localStorage.getItem(LS.chatDraft) || "";

    if (input) {
      input.addEventListener("input", () => {
        localStorage.setItem(LS.chatDraft, input.value || "");
      });
    }

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
        const uiLang = getUILang();
        const t = I18N[uiLang];

        const msgs = getChatMessagesFromDOM();
        if (!msgs.length) return toast(t.nothingToSave);

        const title = (msgs.find((m) => m.kind === "user")?.text || "Chat").slice(0, 36);
        const list = chatStorageLoad();
        list.push({ ts: nowISO(), title, messages: msgs });
        chatStorageSave(list);
        renderSavedChats();
        toast(t.savedOk);
      });
    }

    const listenBtn = $("#chatListenBtn");
    if (listenBtn) {
      listenBtn.addEventListener("click", async () => {
        const uiLang = getUILang();
        const t = I18N[uiLang];

        const last = getLastBotText() || "";
        if (!last) return toast(t.noBotToRead);

        const langSel = $("#chatLangSelect");
        const chosen = langSel && langSel.value ? langSel.value : "auto";
        const lang =
          chosen === "es"
            ? "es"
            : chosen === "en"
            ? "en"
            : /[áéíóúñ¿¡]/i.test(last)
            ? "es"
            : "en";

        try {
          await speakText(last, lang);
        } catch {
          toast(I18N[lang].voiceMissing, true);
        }
      });
    }

    if (stopBtn) stopBtn.addEventListener("click", () => stopSpeak());

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!input) return;

        const msg = (input.value || "").trim();
        if (!msg) return;

        addBubble("user", msg);
        input.value = "";
        localStorage.removeItem(LS.chatDraft);

        if (sendBtn) sendBtn.disabled = true;

        const langSel = $("#chatLangSelect");
        const chosen = (langSel && langSel.value ? langSel.value : "auto").toLowerCase().trim();
        const lang = chosen === "en" || chosen === "es" ? chosen : "auto";

        try {
          const resp = await apiPost("/chat", { message: msg, lang });
          const reply = resp && resp.reply ? String(resp.reply) : "(No reply)";
          addBubble("bot", reply);
        } catch (err) {
          const uiLang = getUILang();
          const friendly =
            uiLang === "es"
              ? "El chat falló. Revisa tu clave Gemini en Render y mira los logs."
              : "Chat failed. Check your Gemini key in Render and review server logs.";
          addBubble("system", `${friendly}\n\n${String(err.message || err)}`);
        } finally {
          if (sendBtn) sendBtn.disabled = false;
        }
      });
    }

    renderSavedChats();
  }

  // ---------------------------
  // Devotionals (unchanged from your code)
  // ---------------------------
  function loadSavedDevs() { return safeJSON(localStorage.getItem(LS.savedDevs) || "[]", []); }
  function saveSavedDevs(list) { localStorage.setItem(LS.savedDevs, JSON.stringify(list || [])); }

  function renderSavedDevs() {
    const box = $("#devSavedList");
    if (!box) return;

    const uiLang = getUILang();
    const t = I18N[uiLang];

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
      btn.textContent = `${(item.theme || t.devTitle).slice(0, 40)} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
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

  function devotionalStarters(lang) {
    if (lang === "es") {
      return {
        theme: "Caminando en paz",
        ref: "Filipenses 4:6–7",
        text:
          "6. Por nada estéis afanosos; si no sean conocidas vuestras peticiones delante de Dios en toda oración y ruego, con acción de gracias.\n" +
          "7. Y la paz de Dios, que sobrepasa todo entendimiento, guardará vuestros corazones y vuestros pensamientos en Cristo Jesús.",
        ctx: "Pablo anima a los creyentes a llevar toda preocupación a Dios en oración, en vez de cargar la ansiedad solos.",
        refl: "La paz de Dios no depende de las circunstancias. Es una guardia sobre tu corazón cuando confías en Él.",
        app: "Hoy nombra específicamente lo que te inquieta y entrégaselo a Dios en oración—y practica la gratitud.",
        pr: "Señor, enséñame a llevar mis cargas a Ti. Reemplaza mi ansiedad con Tu paz. Amén.",
      };
    }
    return {
      theme: "Walking in Peace",
      ref: "Philippians 4:6–7",
      text:
        "6. Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.\n" +
        "7. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.",
      ctx: "Paul is encouraging believers to bring every worry to God in prayer instead of carrying anxiety alone.",
      refl: "God’s peace is not based on circumstances. It is a guard over your heart when you trust Him.",
      app: "Today, name the specific thing you’re anxious about, and hand it to God in prayer—then practice gratitude.",
      pr: "Lord, teach me to bring my burdens to You. Replace my anxiety with Your peace. Amen.",
    };
  }

  function initDevotional() {
    const generateBtn = $("#devotionalBtn");
    const saveBtn = $("#devSaveBtn");

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

    ["#devMyContext", "#devMyReflection", "#devMyApplication", "#devMyPrayer", "#devMyNotes"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", saveDraft);
    });

    if (generateBtn) {
      generateBtn.addEventListener("click", async () => {
        generateBtn.disabled = true;
        try {
          const lang = getUILang();
          const s = devotionalStarters(lang);
          $("#devTheme").textContent = s.theme;
          $("#devScriptureRef").textContent = s.ref;
          $("#devScriptureText").textContent = s.text;
          $("#devStarterContext").textContent = s.ctx;
          $("#devStarterReflection").textContent = s.refl;
          $("#devStarterApplication").textContent = s.app;
          $("#devStarterPrayer").textContent = s.pr;
        } catch (e) {
          toast(String(e.message || e), true);
        } finally {
          generateBtn.disabled = false;
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const lang = getUILang();
        const t = I18N[lang];

        const my_context = ($("#devMyContext")?.value || "").trim();
        const my_reflection = ($("#devMyReflection")?.value || "").trim();
        const my_application = ($("#devMyApplication")?.value || "").trim();
        const my_prayer = ($("#devMyPrayer")?.value || "").trim();

        if (!my_context || !my_reflection || !my_application || !my_prayer) {
          return toast(t.devReqToast, true);
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
          ui_lang: lang,
        };

        const list = loadSavedDevs();
        list.push(item);
        saveSavedDevs(list);
        renderSavedDevs();
        toast(t.devSavedToast);
      });
    }

    renderSavedDevs();
  }

  // ---------------------------
  // Daily Prayer (unchanged from your code)
  // ---------------------------
  function loadSavedPrayers() { return safeJSON(localStorage.getItem(LS.savedPrayers) || "[]", []); }
  function saveSavedPrayers(list) { localStorage.setItem(LS.savedPrayers, JSON.stringify(list || [])); }

  function renderSavedPrayers() {
    const box = $("#prSavedList");
    if (!box) return;

    const uiLang = getUILang();
    const t = I18N[uiLang];

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
      btn.textContent = `${(item.title || t.prTitle).slice(0, 40)} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
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

  function prayerStarters(lang) {
    if (lang === "es") {
      return {
        A: "Señor, Tú eres santo, fiel y cercano. Te alabo por Tu amor y Tu misericordia.",
        C: "Padre, perdóname por donde he fallado. Limpia mi corazón y renueva mi mente.",
        T: "Gracias por la vida, la protección, la provisión y la gracia que me das cada día.",
        S: "Por favor guíame hoy. Dame sabiduría, fuerzas y paz. Bendice a mi familia y a quienes amo.",
      };
    }
    return {
      A: "Lord, You are holy, faithful, and near. I praise You for Your love and mercy.",
      C: "Father, forgive me for where I have fallen short. Cleanse my heart and renew my mind.",
      T: "Thank You for life, protection, provision, and the grace You give me each day.",
      S: "Please guide me today. Give me wisdom, strength, and peace. Help my family and those I love.",
    };
  }

  function initPrayer() {
    const genBtn = $("#prayerBtn");
    const saveBtn = $("#prSaveBtn");

    const draft = safeJSON(localStorage.getItem(LS.prDraft) || "{}", {});
    if ($("#myAdoration")) $("#myAdoration").value = draft.myA || "";
    if ($("#myConfession")) $("#myConfession").value = draft.myC || "";
    if ($("#myThanksgiving")) $("#myThanksgiving").value = draft.myT || "";
    if ($("#mySupplication")) $("#mySupplication").value = draft.myS || "";
    if ($("#prayerNotes")) $("#prayerNotes").value = draft.notes || "";

    const saveDraft = () => {
      localStorage.setItem(
        LS.prDraft,
        JSON.stringify({
          myA: $("#myAdoration")?.value || "",
          myC: $("#myConfession")?.value || "",
          myT: $("#myThanksgiving")?.value || "",
          myS: $("#mySupplication")?.value || "",
          notes: $("#prayerNotes")?.value || "",
        })
      );
    };

    ["#myAdoration", "#myConfession", "#myThanksgiving", "#mySupplication", "#prayerNotes"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("input", saveDraft);
    });

    if (genBtn) {
      genBtn.addEventListener("click", () => {
        const lang = getUILang();
        const s = prayerStarters(lang);
        $("#pA").textContent = s.A;
        $("#pC").textContent = s.C;
        $("#pT").textContent = s.T;
        $("#pS").textContent = s.S;
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const lang = getUILang();
        const t = I18N[lang];

        const myA = ($("#myAdoration")?.value || "").trim();
        const myC = ($("#myConfession")?.value || "").trim();
        const myT = ($("#myThanksgiving")?.value || "").trim();
        const myS = ($("#mySupplication")?.value || "").trim();

        if (!myA || !myC || !myT || !myS) {
          return toast(t.prReqToast, true);
        }

        const item = {
          ts: nowISO(),
          title: t.prTitle,
          starterA: $("#pA")?.textContent || "",
          starterC: $("#pC")?.textContent || "",
          starterT: $("#pT")?.textContent || "",
          starterS: $("#pS")?.textContent || "",
          myA, myC, myT, myS,
          notes: $("#prayerNotes")?.value || "",
          ui_lang: lang,
        };

        const list = loadSavedPrayers();
        list.push(item);
        saveSavedPrayers(list);
        renderSavedPrayers();
        toast(t.prSavedToast);
      });
    }

    renderSavedPrayers();
  }

  // ---------------------------
  // Bible Reader (unchanged from your code)
  // ---------------------------
  function bibleVersionForReadingLang(readLang) {
    return readLang === "es" ? "es" : "en_default";
  }

  function getBookSelection() {
    const bookSel = $("#bookSelect");
    if (!bookSel) return { kind: "none" };

    const raw = String(bookSel.value || "").trim();
    if (!raw) return { kind: "none" };

    const asNum = Number(raw);
    if (Number.isFinite(asNum) && String(asNum) === raw) {
      return { kind: "id", book_id: asNum };
    }
    return { kind: "name", book: raw };
  }

  async function refreshBibleStatus() {
    const el = $("#bibleDbStatus");
    if (!el) return;

    const readLang = normLang($("#readingVoice")?.value || "en", "en");
    const version = bibleVersionForReadingLang(readLang);

    try {
      const j = await apiGet(`/bible/status?version=${encodeURIComponent(version)}`);
      el.textContent = `OK • ${j.version} • verses: ${j.verse_count}`;
    } catch (e) {
      el.textContent = `Error: ${e && e.message ? e.message : String(e)}`;
    }
  }

  async function loadBooks() {
    const bookSel = $("#bookSelect");
    if (!bookSel) return;

    const uiLang = getUILang();
    const t = I18N[uiLang];

    const readLang = normLang($("#readingVoice")?.value || "en", "en");
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
      bookSel.innerHTML = `<option value="">(Error loading books)</option>`;
      const st = $("#bibleDbStatus");
      if (st) st.textContent = t.bibleNotFound;
    }
  }

  async function loadChaptersForBook() {
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    if (!chapSel || !vsStart || !vsEnd) return;

    const uiLang = getUILang();
    const t = I18N[uiLang];

    chapSel.innerHTML = `<option value="">${t.dash}</option>`;
    vsStart.innerHTML = `<option value="">${t.dash}</option>`;
    vsEnd.innerHTML = `<option value="">${t.optional}</option>`;

    const pick = getBookSelection();
    if (pick.kind === "none") return;

    const readLang = normLang($("#readingVoice")?.value || "en", "en");
    const version = bibleVersionForReadingLang(readLang);

    try {
      const qs = new URLSearchParams();
      qs.set("version", version);
      if (pick.kind === "id") qs.set("book_id", String(pick.book_id));
      if (pick.kind === "name") qs.set("book", pick.book);

      const j = await apiGet(`/bible/chapters?${qs.toString()}`);
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
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    if (!chapSel || !vsStart || !vsEnd) return;

    const uiLang = getUILang();
    const t = I18N[uiLang];

    vsStart.innerHTML = `<option value="">${t.dash}</option>`;
    vsEnd.innerHTML = `<option value="">${t.optional}</option>`;

    const pick = getBookSelection();
    const ch = parseInt(chapSel.value || "0", 10);
    if (pick.kind === "none" || !ch) return;

    const readLang = normLang($("#readingVoice")?.value || "en", "en");
    const version = bibleVersionForReadingLang(readLang);

    try {
      if (pick.kind !== "id") return;

      const j = await apiGet(
        `/bible/verses_max?version=${encodeURIComponent(version)}&book_id=${pick.book_id}&chapter=${ch}`
      );
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
    } catch (e) {}
  }

  async function listenBible() {
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    const fullCh = $("#fullChapter");
    const passageRef = $("#passageRef");
    const passageText = $("#passageText");

    if (!chapSel || !passageRef || !passageText) return;

    const uiLang = getUILang();
    const t = I18N[uiLang];

    const pick = getBookSelection();
    const ch = parseInt(chapSel.value || "0", 10);
    if (pick.kind === "none" || !ch) return toast(t.pickBookChapter, true);

    const readLang = normLang($("#readingVoice")?.value || "en", "en");
    const version = bibleVersionForReadingLang(readLang);
    const whole = !!(fullCh && fullCh.checked);

    const qs = new URLSearchParams();
    qs.set("version", version);
    qs.set("chapter", String(ch));

    if (pick.kind === "id") qs.set("book_id", String(pick.book_id));
    if (pick.kind === "name") qs.set("book", pick.book);

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

      await speakText(toSpeak, readLang, 1.0);
    } catch (e) {
      toast(String(e.message || e), true);
    }
  }

  async function toggleReadBible() {
    if (isSpeaking()) {
      stopSpeak();
      return;
    }
    await listenBible();
  }

  function initBible() {
    const readBtn = $("#readBibleBtn") || $("#listenBible");
    const stopBtn = $("#stopBible");
    const readVoice = $("#readingVoice");
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");

    if (readBtn) {
      readBtn.addEventListener("click", async () => {
        const hasSeparateStop = !!stopBtn;
        if (hasSeparateStop && readBtn.id === "listenBible") {
          await listenBible();
        } else {
          await toggleReadBible();
        }
      });
    }

    if (stopBtn) stopBtn.addEventListener("click", () => stopSpeak());

    if (readVoice) {
      readVoice.addEventListener("change", async () => {
        stopSpeak();
        await refreshBibleStatus();
        await loadBooks();

        const uiLang = getUILang();
        const t = I18N[uiLang];

        const c = $("#chapterSelect");
        const vs1 = $("#verseStartSelect");
        const vs2 = $("#verseEndSelect");
        if (c) c.innerHTML = `<option value="">${t.dash}</option>`;
        if (vs1) vs1.innerHTML = `<option value="">${t.dash}</option>`;
        if (vs2) vs2.innerHTML = `<option value="">${t.optional}</option>`;
      });
    }

    if (bookSel) bookSel.addEventListener("change", async () => { await loadChaptersForBook(); });
    if (chapSel) chapSel.addEventListener("change", async () => { await loadVersesForChapter(); });

    refreshBibleStatus().catch(() => {});
    loadBooks().catch(() => {});
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

    const storedUILang = normLang(localStorage.getItem(LS.uiLang) || "en", "en");
    setSelectValue("#uiLangSelect", storedUILang);

    const uiSel = $("#uiLangSelect");
    if (uiSel) {
      uiSel.addEventListener("change", () => {
        applyUILang();
      });
    }

    applyUILang();

    // ✅ Handle Stripe redirect results
    const uiLang = getUILang();
    const t = I18N[uiLang];

    const success = getQueryParam("success");
    const canceled = getQueryParam("canceled");

    if (success === "1") {
      toast(t.stripeSuccess, false);

      // If user already typed/saved email, auto-restore so pill flips to Active
      const email = (localStorage.getItem(LS.authEmail) || getEmailInput() || "").trim();
      if (email) {
        await stripeRestoreAccess(false);
      } else {
        // If no email stored, we cannot restore automatically
        // user can press Restore access manually
      }

      removeQueryParams(["success"]);
    } else if (canceled === "1") {
      toast(t.stripeCanceled, true);
      removeQueryParams(["canceled"]);
    }

    // Voice check
    const ttsStatus = $("#ttsStatus");
    const chatVoicePill = $("#chatVoicePill");

    try {
      const vEn = await pickLockedVoice("en");
      const vEs = await pickLockedVoice("es");
      const ok = !!(vEn && vEs);
      const langNow = getUILang();
      const msg = ok ? I18N[langNow].voiceReady : I18N[langNow].voiceMissing;

      if (ttsStatus) ttsStatus.textContent = msg;
      if (chatVoicePill) chatVoicePill.textContent = msg;
    } catch {
      const langNow = getUILang();
      if (ttsStatus) ttsStatus.textContent = I18N[langNow].voiceMissing;
      if (chatVoicePill) chatVoicePill.textContent = I18N[langNow].voiceMissing;
    }

    // Health/auth ping (updates account pill if token exists)
    await refreshMeFromServer();

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
