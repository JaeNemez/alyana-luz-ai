/* frontend/app.js
   Alyana Luz • Bible AI (single-file client)
   - Renders full UI into #app
   - Tabs: Chat, Read Bible, Devotional, Daily Prayer
   - Calls backend endpoints:
       GET  /me
       POST /chat
       GET  /bible/status
       GET  /bible/books
       GET  /bible/chapters?book_id=...
       GET  /bible/text?book_id=...&chapter=...&vstart=...&vend=...&full=...
       GET  /devotional?lang=en|es&version=en_default
   - LocalStorage: saved chats, devotionals, prayers + streaks
   - Web Speech API TTS (English + Spanish)
*/

(() => {
  "use strict";

  // -----------------------------
  // Config
  // -----------------------------
  const API_BASE = ""; // same origin
  const DEFAULT_BIBLE_VERSION = "en_default";

  // Local storage keys
  const LS = {
    chatSessions: "alyana.chat.sessions.v1",
    chatActive: "alyana.chat.active.v1",
    devEntries: "alyana.dev.entries.v1",
    devStreak: "alyana.dev.streak.v1",
    devLastDay: "alyana.dev.lastDay.v1",
    prEntries: "alyana.pr.entries.v1",
    prStreak: "alyana.pr.streak.v1",
    prLastDay: "alyana.pr.lastDay.v1",
  };

  // -----------------------------
  // Utilities
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);

  function nowDayKeyLocal() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function safeJsonParse(s, fallback) {
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }

  function loadLS(key, fallback) {
    return safeJsonParse(localStorage.getItem(key), fallback);
  }

  function saveLS(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  async function apiGet(path) {
    const res = await fetch(API_BASE + path, { credentials: "same-origin" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} ${txt}`.trim());
    }
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(API_BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} ${txt}`.trim());
    }
    return res.json();
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? "";
  }

  function setHtml(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html ?? "";
  }

  function show(el) {
    if (el) el.style.display = "";
  }
  function hide(el) {
    if (el) el.style.display = "none";
  }

  // -----------------------------
  // TTS
  // -----------------------------
  let ttsVoices = [];
  let ttsReady = false;
  let ttsSpeaking = false;

  function loadVoices() {
    ttsVoices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (ttsVoices.length) ttsReady = true;
  }

  function pickVoice(langCode /* en|es */) {
    // Prefer voices that match language
    const target = (langCode || "en").toLowerCase();
    const wanted = target === "es" ? ["es", "es-"] : ["en", "en-"];

    const candidates = ttsVoices.filter((v) => {
      const l = (v.lang || "").toLowerCase();
      return wanted.some((p) => l.startsWith(p));
    });

    // Try to prefer a stable common voice name (not required)
    if (candidates.length) return candidates[0];

    // Fallback any voice
    return ttsVoices[0] || null;
  }

  function stopTTS() {
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        ttsSpeaking = false;
      }
    } catch {}
  }

  function speakText(text, langCode) {
    if (!window.speechSynthesis) return;
    stopTTS();
    const utter = new SpeechSynthesisUtterance(String(text || ""));
    const v = pickVoice(langCode);
    if (v) utter.voice = v;
    utter.lang = v?.lang || (langCode === "es" ? "es-ES" : "en-US");
    utter.rate = 1;
    utter.pitch = 1;
    utter.onstart = () => {
      ttsSpeaking = true;
      updateTtsPills();
    };
    utter.onend = () => {
      ttsSpeaking = false;
      updateTtsPills();
    };
    utter.onerror = () => {
      ttsSpeaking = false;
      updateTtsPills();
    };
    window.speechSynthesis.speak(utter);
  }

  function updateTtsPills() {
    const msg = !window.speechSynthesis
      ? "Voice: unsupported"
      : !ttsReady
      ? "Voice: loading…"
      : ttsSpeaking
      ? "Voice: speaking…"
      : "Voice: ready";

    setText("ttsStatus", msg);
    setText("chatVoicePill", msg);
  }

  // -----------------------------
  // i18n (UI strings)
  // -----------------------------
  const I18N = {
    en: {
      tabs: { chat: "Chat", bible: "Read Bible", dev: "Devotional", pr: "Daily Prayer" },
      devIntro: "Alyana gives short starter examples. You write and save your real devotional.",
      prIntro: "Alyana gives a short starter example. You write and save your real prayer.",
      generate: "Generate",
      save: "Save",
      generateStarters: "Generate Starters",
      didToday: "I did it today",
      streak: "Streak",
      requiredNote: "Required to save (streak): Context + Reflection + Application + Prayer.",
      themeTitle: "Theme / Title (Alyana)",
      scriptureA: "Scripture (Alyana)",
      starterContext: "Alyana Starter — Context / Observation",
      starterReflection: "Alyana Starter — Reflection / Insight",
      starterApplication: "Alyana Starter — Application (Practical)",
      starterPrayer: "Alyana Starter — Prayer",
      nowWrite: "Now write yours:",
      nowWritePrayer: "Now write your real prayer:",
      notesOpt: "Notes / Reflection (optional)",
      savedDev: "Saved Devotionals",
      savedPr: "Saved Prayers",
      savedChats: "Saved Chats",
      noSaved: "No saved entries yet.",
      bibleReaderTitle: "Bible Reader (Listen)",
      listen: "Listen",
      stop: "Stop",
      fullChapter: "Full Chapter",
      versionLabel: "Version label (English only)",
      chatPlaceholder: "Ask for a prayer, verse, or ‘verses about forgiveness’…",
      chatNew: "New",
      chatSave: "Save",
      chatSend: "Send",
      localMode: "Account: local mode",
      checking: "Account: checking…",
    },
    es: {
      tabs: { chat: "Chat", bible: "Leer Biblia", dev: "Devocional", pr: "Oración diaria" },
      devIntro: "Alyana te da ejemplos breves. Tú escribes y guardas tu devocional real.",
      prIntro: "Alyana te da un ejemplo breve. Tú escribes y guardas tu oración real.",
      generate: "Generar",
      save: "Guardar",
      generateStarters: "Generar ejemplos",
      didToday: "Lo hice hoy",
      streak: "Racha",
      requiredNote: "Requisito para guardar (racha): Contexto + Reflexión + Aplicación + Oración.",
      themeTitle: "Tema / Título (Alyana)",
      scriptureA: "Escritura (Alyana)",
      starterContext: "Ejemplo de Alyana — Contexto / Observación",
      starterReflection: "Ejemplo de Alyana — Reflexión / Enseñanza",
      starterApplication: "Ejemplo de Alyana — Aplicación (Práctica)",
      starterPrayer: "Ejemplo de Alyana — Oración",
      nowWrite: "Ahora escribe el tuyo:",
      nowWritePrayer: "Ahora escribe tu oración real:",
      notesOpt: "Notas / Reflexión (opcional)",
      savedDev: "Devocionales guardados",
      savedPr: "Oraciones guardadas",
      savedChats: "Chats guardados",
      noSaved: "Aún no hay entradas guardadas.",
      bibleReaderTitle: "Lector de Biblia (Escuchar)",
      listen: "Escuchar",
      stop: "Detener",
      fullChapter: "Capítulo completo",
      versionLabel: "Etiqueta de versión (solo inglés)",
      chatPlaceholder: "Pide una oración, un versículo, o ‘versículos sobre perdón’…",
      chatNew: "Nuevo",
      chatSave: "Guardar",
      chatSend: "Enviar",
      localMode: "Cuenta: modo local",
      checking: "Cuenta: comprobando…",
    },
  };

  function getUILang(selectId, fallback = "en") {
    const el = document.getElementById(selectId);
    const v = (el?.value || fallback).toLowerCase();
    return v === "es" ? "es" : "en";
  }

  // -----------------------------
  // Render UI into #app
  // -----------------------------
  function renderAppShell() {
    const mount = document.getElementById("app");
    if (!mount) throw new Error("#app mount not found in index.html");

    mount.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        :root{
          --bg-0: #050316;
          --bg-1: #090424;

          --surface-0: rgba(12, 10, 29, 0.82);
          --surface-1: rgba(14, 12, 36, 0.74);
          --surface-2: rgba(18, 16, 48, 0.62);

          --border-0: rgba(255,255,255,0.12);
          --border-1: rgba(186,108,184,0.22);
          --border-2: rgba(186,108,184,0.30);

          --text-0: #f9f5ff;
          --text-1: rgba(249,245,255,0.88);
          --text-2: rgba(249,245,255,0.74);

          --accent: #9A4B9C;
          --accent-2: #A95CA9;
          --accent-3: #BA6CB8;

          --accent-dark: #2a1030;
          --accent-soft: rgba(154,75,156,0.22);

          --good: #22c55e;
          --danger: #e11d48;

          --focus: rgba(186,108,184,0.55);
        }

        body {
          margin: 0;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
          background: var(--bg-0);
          color: var(--text-0);
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }

        .app {
          width: 100%;
          max-width: 1000px;
          height: 92vh;
          display: flex;
          flex-direction: column;

          background:
            radial-gradient(circle at 28% 8%, rgba(186,108,184,0.55) 0, rgba(154,75,156,0.22) 22%, rgba(5,3,22,1) 60%),
            radial-gradient(circle at 80% 18%, rgba(169,92,169,0.22) 0, rgba(5,3,22,1) 55%);

          border-radius: 18px;
          border: 1px solid var(--border-0);
          box-shadow: 0 20px 60px rgba(0,0,0,0.6);
          overflow: hidden;
        }

        header {
          padding: 16px 24px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: relative;
        }
        header h1 { margin: 0; font-size: 20px; display: flex; align-items: center; gap: 8px; }
        header small { color: rgba(249,245,255,0.72); font-size: 12px; }

        .js-pill {
          position: absolute;
          right: 16px;
          top: 14px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(186,108,184,0.22);
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
          color: var(--text-1);
        }

        .top-cta {
          padding: 10px 24px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .support-btn {
          padding: 10px 16px;
          background: linear-gradient(135deg, var(--accent-2), var(--accent));
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 10px;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
          color: #ffffff;
          box-shadow: 0 2px 10px rgba(0,0,0,0.25);
        }

        .support-note {
          font-size: 11px;
          opacity: 0.85;
          max-width: 760px;
          text-align: center;
          margin: 0;
          color: var(--text-2);
        }

        .account-row {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: center;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(186,108,184,0.22);
          font-size: 12px;
          font-weight: 800;
          white-space: nowrap;
          color: var(--text-1);
        }

        .menu-bar {
          padding: 12px 18px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }

        .menu-btn {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(186,108,184,0.16);
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          background: rgba(255,255,255,0.07);
          color: var(--text-0);
          box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        }
        .menu-btn.active {
          background: linear-gradient(135deg, var(--accent-2), var(--accent));
          border: 1px solid rgba(255,255,255,0.14);
          color: #ffffff;
        }

        .main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
        .app-section { display: none; height: 100%; overflow: hidden; }
        .app-section.active { display: flex; flex-direction: column; height: 100%; }

        .section-body { flex: 1; overflow-y: auto; padding: 18px; }

        .card {
          background: var(--surface-1);
          border: 1px solid var(--border-1);
          border-radius: 16px;
          padding: 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        }
        .card + .card { margin-top: 12px; }
        .card h3, .card h4 { margin: 0 0 10px 0; color: rgba(255,255,255,0.92); }

        .muted { opacity: 0.85; font-size: 13px; color: var(--text-2); }
        .row { display: flex; gap: 10px; flex-wrap: wrap; }
        .row > * { flex: 1; min-width: 220px; }

        label { font-size: 12px; opacity: 0.9; color: var(--text-2); }

        input[type="text"], select, textarea {
          width: 100%;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(186,108,184,0.35);
          background: rgba(10, 8, 28, 0.72);
          color: var(--text-0);
          outline: none;
          font-size: 14px;
        }
        input[type="text"]:focus, select:focus, textarea:focus{
          border-color: var(--focus);
          box-shadow: 0 0 0 3px rgba(186,108,184,0.16);
        }

        textarea { min-height: 110px; resize: vertical; }

        .btn {
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid rgba(186,108,184,0.18);
          cursor: pointer;
          font-weight: 900;
          font-size: 13px;
          color: #ffffff;
          background: rgba(255,255,255,0.08);
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--accent-2), var(--accent));
          border: 1px solid rgba(255,255,255,0.14);
          color: #ffffff;
        }

        .btn-danger { background: rgba(225,29,72,0.92); border-color: rgba(225,29,72,0.35); color: white; }
        .btn-green { background: rgba(34,197,94,0.92); border-color: rgba(34,197,94,0.30); color: #062a14; }
        .btn-ghost { background: rgba(255,255,255,0.07); color: white; border-color: rgba(186,108,184,0.18); }
        .btn:disabled { opacity: 0.6; cursor: default; }

        .saved-list button { width: 100%; text-align: left; margin-top: 8px; }

        .block {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(186,108,184,0.18);
          border-radius: 14px;
          padding: 12px;
        }
        .block + .block { margin-top: 10px; }

        .divider {
          height: 1px;
          background: rgba(186,108,184,0.18);
          margin: 12px 0;
        }

        /* CHAT */
        .chat-layout {
          flex: 1;
          overflow: hidden;
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 12px;
          padding: 12px;
        }
        @media (max-width: 920px) {
          .chat-layout { grid-template-columns: 1fr; }
        }

        #chat {
          height: 100%;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          border-radius: 16px;
          border: 1px solid rgba(186,108,184,0.22);
          background: rgba(10, 8, 28, 0.45);
        }

        .bubble-row { display: flex; width: 100%; }
        .bubble-row.user { justify-content: flex-end; }
        .bubble-row.bot { justify-content: flex-start; }
        .bubble-row.system { justify-content: center; }

        .bubble {
          max-width: 84%;
          padding: 10px 14px;
          border-radius: 16px;
          font-size: 14px;
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .bubble.user {
          background: linear-gradient(135deg, var(--accent-2), var(--accent));
          color: #ffffff;
          border-bottom-right-radius: 6px;
          border: 1px solid rgba(255,255,255,0.14);
        }
        .bubble.bot {
          background: rgba(10, 8, 28, 0.84);
          color: var(--text-1);
          border: 1px solid rgba(186,108,184,0.26);
          border-bottom-left-radius: 6px;
        }
        .bubble.system {
          background: transparent;
          border: none;
          color: rgba(249,245,255,0.55);
          font-size: 12px;
          text-align: center;
        }

        .chat-form {
          padding: 12px 14px;
          border-top: 1px solid rgba(255,255,255,0.08);
          display: flex;
          gap: 10px;
          background: rgba(10, 8, 28, 0.88);
          flex-wrap: wrap;
        }
        .chat-form input[type="text"] { border-radius: 999px; flex: 1; min-width: 240px; }
        .chat-form .btn { border-radius: 999px; padding: 10px 18px; }

        .small-note { font-size: 12px; opacity: 0.85; margin-top: 8px; color: var(--text-2); }

        @media (max-width: 920px) {
          body {
            align-items: stretch;
            justify-content: flex-start;
            min-height: 100dvh;
          }
          .app {
            height: 100dvh;
            max-height: 100dvh;
            max-width: 100%;
            border-radius: 0;
          }
          .main { flex: 1; min-height: 0; }
          .chat-layout {
            display: flex !important;
            flex-direction: column !important;
            height: 100%;
            gap: 10px;
          }
          #chatSection .card:first-child {
            flex: 1;
            min-height: 0;
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }
          #chat { flex: 1; min-height: 0; }
          .chat-form { flex-shrink: 0; }
        }
      </style>

      <div class="app">
        <header>
          <h1>📖 Alyana Luz · Bible AI</h1>
          <small>pray • learn • walk in the Light</small>
          <span class="js-pill" id="jsStatus">JS: loading…</span>
        </header>

        <div class="top-cta">
          <button class="support-btn" id="supportBtn" type="button" title="Support Alyana Luz">❤️ Support Alyana Luz</button>

          <div class="account-row" aria-label="Account and billing">
            <span class="pill" id="authPill">Account: checking…</span>
            <button class="btn btn-ghost" id="manageBillingBtn" type="button" disabled>Manage billing</button>
          </div>

          <p class="support-note">
            Your support helps maintain and grow Alyana Luz — continually improving development and expanding this ministry.
            <br />
            To access premium features, subscribe with Support, or restore access using the email you used on Stripe.
          </p>

          <div class="row" style="max-width:760px; width:100%; justify-content:center;">
            <div style="flex:1; min-width:240px; max-width:360px;">
              <input id="loginEmail" type="text" placeholder="Email used for Stripe…" />
            </div>
            <div style="flex:0; min-width:180px;">
              <button class="btn btn-primary" id="loginBtn" type="button" style="width:100%;">Restore access</button>
            </div>
          </div>

          <div class="muted" id="authHint" style="width:100%; text-align:center; display:none;"></div>
        </div>

        <nav class="menu-bar">
          <button class="menu-btn active" data-target="chatSection" type="button">Chat</button>
          <button class="menu-btn" data-target="bibleSection" type="button">Read Bible</button>
          <button class="menu-btn" data-target="devotionalSection" type="button">Devotional</button>
          <button class="menu-btn" data-target="prayerSection" type="button">Daily Prayer</button>
        </nav>

        <div class="main">

          <!-- CHAT -->
          <section id="chatSection" class="app-section active">
            <div class="chat-layout">
              <div class="card" style="display:flex; flex-direction:column; overflow:hidden;">
                <div class="row" style="align-items:center; margin-bottom:10px;">
                  <div style="flex:2;">
                    <h3 style="margin:0 0 4px 0;">Chat</h3>
                    <div class="muted">Saved chat logs are stored on this device.</div>
                  </div>

                  <div style="display:flex; justify-content:flex-end; gap:10px; flex-wrap:wrap; align-items:center;">
                    <label style="min-width:170px;">
                      <span class="muted" style="display:block; margin-bottom:4px;">Chat Language</span>
                      <select id="chatLangSelect">
                        <option value="auto" selected>Auto (based on what they type)</option>
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                      </select>
                    </label>
                    <span class="pill" id="chatVoicePill">Voice: loading…</span>
                  </div>
                </div>

                <div id="chat"></div>

                <form id="chatForm" class="chat-form">
                  <input id="chatInput" type="text" autocomplete="off" placeholder="Ask for a prayer, verse, or ‘verses about forgiveness’…" />
                  <button class="btn btn-primary" type="submit" id="chatSendBtn">Send</button>
                  <button class="btn btn-ghost" type="button" id="chatNewBtn">New</button>
                  <button class="btn btn-green" type="button" id="chatSaveBtn">Save</button>
                </form>
              </div>

              <div class="card" style="overflow:auto;">
                <h4 style="margin-bottom:6px;">Saved Chats</h4>
                <div class="muted">Load or delete any saved chat.</div>
                <div class="saved-list" id="chatSavedList" style="margin-top:10px;">
                  <small style="opacity:0.75;">No saved chats yet.</small>
                </div>
              </div>
            </div>
          </section>

          <!-- BIBLE -->
          <section id="bibleSection" class="app-section">
            <div class="section-body">
              <div class="card">
                <div class="row" style="align-items:flex-end;">
                  <div style="flex:2; min-width:260px;">
                    <h3 style="margin-bottom:6px;">Bible Reader (Listen)</h3>
                    <div class="muted">Pick a book/chapter and verse range, or Full Chapter.</div>
                  </div>
                  <div style="display:flex; justify-content:flex-end;">
                    <span class="pill" id="ttsStatus">Voice: loading…</span>
                  </div>
                </div>

                <div class="row" style="margin-top:12px;">
                  <div style="flex:2;">
                    <label>Book</label>
                    <select id="bookSelect"><option value="">Loading…</option></select>
                  </div>
                  <div>
                    <label>Chapter</label>
                    <select id="chapterSelect"><option value="">—</option></select>
                  </div>
                  <div>
                    <label>Verse (start)</label>
                    <select id="verseStartSelect"><option value="">—</option></select>
                  </div>
                  <div>
                    <label>Verse (end)</label>
                    <select id="verseEndSelect"><option value="">(optional)</option></select>
                  </div>
                </div>

                <div class="row" style="margin-top:12px; align-items:flex-end;">
                  <div>
                    <label>Reader Language</label>
                    <select id="readingVoice">
                      <option value="en" selected>English</option>
                      <option value="es">Spanish</option>
                    </select>
                    <div class="small-note">Only two voices, locked for consistency.</div>
                  </div>

                  <div style="min-width:220px;">
                    <label style="display:flex; gap:10px; align-items:center;">
                      <input type="checkbox" id="fullChapter" />
                      Full Chapter
                    </label>
                    <div class="small-note">If Full Chapter is on, verses are ignored.</div>
                  </div>

                  <div>
                    <label>Version label (English only)</label>
                    <select id="versionSelect">
                      <option value="KJV" selected>KJV</option>
                      <option value="NKJV">NKJV</option>
                      <option value="NIV">NIV</option>
                      <option value="NLT">NLT</option>
                      <option value="ESV">ESV</option>
                      <option value="NASB">NASB</option>
                      <option value="CSB">CSB</option>
                      <option value="AMP">AMP</option>
                      <option value="MSG">MSG</option>
                    </select>
                    <div class="small-note">For Spanish voice, we do not speak the version label.</div>
                  </div>
                </div>

                <div class="row" style="margin-top:12px;">
                  <button class="btn btn-primary" id="listenBible" type="button">Listen</button>
                  <button class="btn btn-danger" id="stopBible" type="button">Stop</button>
                </div>

                <div class="small-note">
                  Spanish voice reads ONLY verse text (no English labels), so it stays pure Spanish.
                </div>
              </div>

              <div class="card">
                <h4>Bible DB Status</h4>
                <div class="muted" id="bibleDbStatus">Checking…</div>
              </div>

              <div class="card">
                <h4>Passage</h4>
                <div class="muted" id="passageRef">—</div>
                <div id="passageText" style="white-space:pre-wrap; margin-top:10px;">—</div>
              </div>
            </div>
          </section>

          <!-- DEVOTIONAL -->
          <section id="devotionalSection" class="app-section">
            <div class="section-body">
              <div class="card">
                <div class="row" style="align-items:flex-end;">
                  <div style="flex:2;">
                    <h3 style="margin:0 0 6px 0;">Devotional</h3>
                    <div class="muted" id="devIntro">—</div>
                  </div>

                  <div style="display:flex; justify-content:flex-end; gap:10px; align-items:center; flex-wrap:wrap;">
                    <label style="min-width:170px;">
                      <span class="muted" style="display:block; margin-bottom:4px;">Language</span>
                      <select id="devUiLang">
                        <option value="en" selected>English</option>
                        <option value="es">Español</option>
                      </select>
                    </label>

                    <span class="pill" id="devStreakPill">Streak: 0</span>
                    <button class="btn btn-ghost" id="devStreakBtn" type="button">I did it today</button>

                    <button class="btn btn-primary" id="devotionalBtn" type="button">Generate</button>
                    <button class="btn btn-green" id="devSaveBtn" type="button">Save</button>
                  </div>
                </div>

                <div class="block" style="margin-top:12px;">
                  <div class="muted" id="devLabelTheme" style="margin-bottom:6px;">—</div>
                  <div id="devTheme" style="white-space:pre-wrap;">—</div>
                </div>

                <div class="block">
                  <div class="muted" id="devLabelScripture" style="margin-bottom:6px;">—</div>
                  <div id="devScriptureRef" class="muted" style="margin-bottom:8px;">—</div>
                  <div id="devScriptureText" style="white-space:pre-wrap;">—</div>
                </div>

                <div class="divider"></div>

                <div class="block">
                  <div class="muted" id="devLabelCtxA" style="margin-bottom:6px;">—</div>
                  <div id="devStarterContext" style="white-space:pre-wrap;">—</div>
                  <div class="small-note" id="devNow1">—</div>
                  <textarea id="devMyContext" placeholder="Context / Observation (What’s happening? Who is speaking? Why does it matter?)"></textarea>
                </div>

                <div class="block">
                  <div class="muted" id="devLabelRefA" style="margin-bottom:6px;">—</div>
                  <div id="devStarterReflection" style="white-space:pre-wrap;">—</div>
                  <div class="small-note" id="devNow2">—</div>
                  <textarea id="devMyReflection" placeholder="Reflection / Insight (What does this reveal about God? About me?)"></textarea>
                </div>

                <div class="block">
                  <div class="muted" id="devLabelAppA" style="margin-bottom:6px;">—</div>
                  <div id="devStarterApplication" style="white-space:pre-wrap;">—</div>
                  <div class="small-note" id="devNow3">—</div>
                  <textarea id="devMyApplication" placeholder="Application (What will I do today because of this?)"></textarea>
                </div>

                <div class="block">
                  <div class="muted" id="devLabelPrA" style="margin-bottom:6px;">—</div>
                  <div id="devStarterPrayer" style="white-space:pre-wrap;">—</div>
                  <div class="small-note" id="devNow4">—</div>
                  <textarea id="devMyPrayer" placeholder="Prayer (write your real prayer here)"></textarea>
                </div>

                <div class="block">
                  <div class="muted" id="devLabelNotes" style="margin-bottom:6px;">—</div>
                  <textarea id="devMyNotes" placeholder="Notes…"></textarea>
                </div>

                <div class="small-note" id="devReqNote" style="margin-top:10px;">—</div>
              </div>

              <div class="card">
                <h4 id="devSavedTitle">Saved Devotionals</h4>
                <div class="muted" id="devSavedHint">Load or delete past devotionals saved on this device.</div>
                <div class="saved-list" id="devSavedList" style="margin-top:10px;">
                  <small style="opacity:0.75;">No saved devotionals yet.</small>
                </div>
              </div>
            </div>
          </section>

          <!-- DAILY PRAYER -->
          <section id="prayerSection" class="app-section">
            <div class="section-body">
              <div class="card">
                <div class="row" style="align-items:flex-end;">
                  <div style="flex:2;">
                    <h3 style="margin:0 0 6px 0;">Daily Prayer</h3>
                    <div class="muted" id="prIntro">—</div>
                  </div>

                  <div style="display:flex; justify-content:flex-end; gap:10px; align-items:center; flex-wrap:wrap;">
                    <label style="min-width:170px;">
                      <span class="muted" style="display:block; margin-bottom:4px;">Language</span>
                      <select id="prUiLang">
                        <option value="en" selected>English</option>
                        <option value="es">Español</option>
                      </select>
                    </label>

                    <span class="pill" id="prStreakPill">Streak: 0</span>
                    <button class="btn btn-ghost" id="prStreakBtn" type="button">I did it today</button>

                    <button class="btn btn-primary" id="prayerBtn" type="button">Generate Starters</button>
                    <button class="btn btn-green" id="prSaveBtn" type="button">Save</button>
                  </div>
                </div>

                <div class="block" style="margin-top:12px;">
                  <div class="muted" id="prLabelA" style="margin-bottom:6px;">Alyana Starter — Adoration</div>
                  <div id="pA" style="white-space:pre-wrap;">—</div>
                  <div class="small-note" id="prNow1">Now write your own:</div>
                  <textarea id="myAdoration" placeholder="Adoration (praise God for who He is)…"></textarea>
                </div>

                <div class="block">
                  <div class="muted" id="prLabelC" style="margin-bottom:6px;">Alyana Starter — Confession</div>
                  <div id="pC" style="white-space:pre-wrap;">—</div>
                  <div class="small-note" id="prNow2">Now write your own:</div>
                  <textarea id="myConfession" placeholder="Confession (what I need to confess)…"></textarea>
                </div>

                <div class="block">
                  <div class="muted" id="prLabelT" style="margin-bottom:6px;">Alyana Starter — Thanksgiving</div>
                  <div id="pT" style="white-space:pre-wrap;">—</div>
                  <div class="small-note" id="prNow3">Now write your own:</div>
                  <textarea id="myThanksgiving" placeholder="Thanksgiving (what I’m grateful for)…"></textarea>
                </div>

                <div class="block">
                  <div class="muted" id="prLabelS" style="margin-bottom:6px;">Alyana Starter — Supplication</div>
                  <div id="pS" style="white-space:pre-wrap;">—</div>
                  <div class="small-note" id="prNow4">Now write your own:</div>
                  <textarea id="mySupplication" placeholder="Supplication (requests for myself/others)…"></textarea>
                </div>

                <div class="block">
                  <div class="muted" id="prLabelN" style="margin-bottom:6px;">Notes</div>
                  <textarea id="prayerNotes" placeholder="Notes…"></textarea>
                </div>
              </div>

              <div class="card">
                <h4 id="prSavedTitle">Saved Prayers</h4>
                <div class="muted" id="prSavedHint">Load or delete past prayers saved on this device.</div>
                <div class="saved-list" id="prSavedList" style="margin-top:10px;">
                  <small style="opacity:0.75;">No saved prayers yet.</small>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>
    `;
  }

  // -----------------------------
  // Navigation
  // -----------------------------
  function setupTabs() {
    const buttons = document.querySelectorAll(".menu-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        buttons.forEach((b) => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".app-section").forEach((sec) => {
          sec.classList.toggle("active", sec.id === target);
        });
      });
    });
  }

  // -----------------------------
  // Account check (simple)
  // -----------------------------
  async function checkMe() {
    const pill = $("#authPill");
    if (!pill) return;
    pill.textContent = I18N.en.checking;
    pill.classList.remove("ok", "warn", "bad");
    pill.classList.add("warn");

    try {
      const data = await apiGet("/me");
      if (data && data.ok) {
        pill.textContent = I18N.en.localMode;
        pill.classList.remove("warn", "bad");
        pill.classList.add("ok");
      } else {
        pill.textContent = "Account: unknown";
        pill.classList.remove("ok");
        pill.classList.add("warn");
      }
    } catch (e) {
      pill.textContent = "Account: offline";
      pill.classList.remove("ok");
      pill.classList.add("warn");
    }
  }

  // -----------------------------
  // Chat
  // -----------------------------
  function defaultChatSession() {
    return {
      id: cryptoRandomId(),
      createdAt: Date.now(),
      title: "Chat",
      messages: [
        { role: "system", text: "Saved chat logs are stored on this device.", ts: Date.now() },
      ],
    };
  }

  function cryptoRandomId() {
    if (window.crypto?.getRandomValues) {
      const a = new Uint32Array(4);
      window.crypto.getRandomValues(a);
      return Array.from(a).map((n) => n.toString(16)).join("");
    }
    return String(Math.random()).slice(2) + String(Date.now());
  }

  function getChatSessions() {
    return loadLS(LS.chatSessions, []);
  }

  function saveChatSessions(list) {
    saveLS(LS.chatSessions, list);
  }

  function getActiveChatId() {
    return localStorage.getItem(LS.chatActive) || "";
  }

  function setActiveChatId(id) {
    localStorage.setItem(LS.chatActive, id);
  }

  function ensureActiveChat() {
    const sessions = getChatSessions();
    let activeId = getActiveChatId();
    let active = sessions.find((s) => s.id === activeId);

    if (!active) {
      active = defaultChatSession();
      sessions.unshift(active);
      saveChatSessions(sessions);
      setActiveChatId(active.id);
    }
    return active;
  }

  function renderChat() {
    const chatEl = $("#chat");
    if (!chatEl) return;

    const session = ensureActiveChat();
    chatEl.innerHTML = session.messages
      .map((m) => {
        const cls = m.role === "user" ? "user" : m.role === "system" ? "system" : "bot";
        const safe = escapeHtml(m.text);
        return `<div class="bubble-row ${cls}"><div class="bubble ${cls}">${safe}</div></div>`;
      })
      .join("");

    chatEl.scrollTop = chatEl.scrollHeight;
    renderChatSavedList();
  }

  function renderChatSavedList() {
    const box = $("#chatSavedList");
    if (!box) return;

    const sessions = getChatSessions();
    if (!sessions.length) {
      box.innerHTML = `<small style="opacity:0.75;">${I18N.en.noSaved}</small>`;
      return;
    }

    const activeId = getActiveChatId();

    box.innerHTML = sessions
      .map((s) => {
        const dt = new Date(s.createdAt || Date.now());
        const label = `${s.title || "Chat"} — ${dt.toLocaleString()}`;
        const isActive = s.id === activeId;
        return `
          <button class="btn ${isActive ? "btn-primary" : "btn-ghost"}" data-id="${escapeHtml(s.id)}" type="button">
            ${escapeHtml(label)}
          </button>
          <button class="btn btn-danger" data-del="${escapeHtml(s.id)}" type="button">Delete</button>
        `;
      })
      .join('<div class="divider"></div>');

    box.querySelectorAll("button[data-id]").forEach((b) => {
      b.addEventListener("click", () => {
        setActiveChatId(b.getAttribute("data-id"));
        renderChat();
      });
    });

    box.querySelectorAll("button[data-del]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-del");
        let sessions2 = getChatSessions().filter((x) => x.id !== id);
        saveChatSessions(sessions2);
        if (getActiveChatId() === id) {
          localStorage.removeItem(LS.chatActive);
        }
        renderChat();
      });
    });
  }

  function setupChatHandlers() {
    const form = $("#chatForm");
    const input = $("#chatInput");
    const btnNew = $("#chatNewBtn");
    const btnSave = $("#chatSaveBtn");

    if (input) input.placeholder = I18N.en.chatPlaceholder;

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msg = (input?.value || "").trim();
        if (!msg) return;

        const sessions = getChatSessions();
        const active = ensureActiveChat();
        const idx = sessions.findIndex((s) => s.id === active.id);
        if (idx < 0) sessions.unshift(active);

        active.messages.push({ role: "user", text: msg, ts: Date.now() });
        if (input) input.value = "";

        // Save immediately (so reload won't lose message)
        const updated = getChatSessions().map((s) => (s.id === active.id ? active : s));
        saveChatSessions(updated);
        renderChat();

        // Determine chat language (auto/en/es)
        const mode = ($("#chatLangSelect")?.value || "auto").toLowerCase();
        let langHint = "en";
        if (mode === "es") langHint = "es";
        else if (mode === "en") langHint = "en";
        else {
          // very small heuristic: if contains accented/ñ or common Spanish words
          const t = msg.toLowerCase();
          langHint =
            /[áéíóúñ¿¡]/.test(t) || /\b(dios|oración|versículo|perdón|gracias|señor)\b/.test(t)
              ? "es"
              : "en";
        }

        try {
          const resp = await apiPost("/chat", { message: msg, lang: langHint });
          const reply = resp?.reply || "(no reply)";
          active.messages.push({ role: "bot", text: reply, ts: Date.now() });
        } catch (err) {
          active.messages.push({
            role: "system",
            text: `Error: ${String(err?.message || err)}`,
            ts: Date.now(),
          });
        }

        const sessions3 = getChatSessions().map((s) => (s.id === active.id ? active : s));
        saveChatSessions(sessions3);
        renderChat();
      });
    }

    if (btnNew) {
      btnNew.addEventListener("click", () => {
        const sessions = getChatSessions();
        const n = defaultChatSession();
        sessions.unshift(n);
        saveChatSessions(sessions);
        setActiveChatId(n.id);
        renderChat();
      });
    }

    if (btnSave) {
      btnSave.addEventListener("click", () => {
        // Save = create a named snapshot
        const sessions = getChatSessions();
        const active = ensureActiveChat();
        const title = prompt("Name this chat session:", active.title || "Chat");
        if (title) active.title = title.trim() || active.title;

        const sessions2 = sessions.map((s) => (s.id === active.id ? active : s));
        saveChatSessions(sessions2);
        renderChat();
      });
    }
  }

  // -----------------------------
  // Bible Reader
  // -----------------------------
  async function initBible() {
    // status
    try {
      const st = await apiGet("/bible/status");
      const ok = st?.ok ? "OK" : "Unknown";
      setText("bibleDbStatus", `Bible DB ${ok} • ${st?.version || DEFAULT_BIBLE_VERSION} • verses: ${st?.verses ?? "?"}`);
    } catch (e) {
      setText("bibleDbStatus", "Bible DB status unavailable (server offline?)");
    }

    // books
    try {
      const books = await apiGet(`/bible/books?version=${encodeURIComponent(DEFAULT_BIBLE_VERSION)}`);
      const sel = $("#bookSelect");
      if (!sel) return;
      sel.innerHTML = `<option value="">Select…</option>` + books
        .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`)
        .join("");

      sel.addEventListener("change", () => onBookChange(sel.value));
    } catch (e) {
      const sel = $("#bookSelect");
      if (sel) sel.innerHTML = `<option value="">(error loading books)</option>`;
    }

    $("#listenBible")?.addEventListener("click", onListenBible);
    $("#stopBible")?.addEventListener("click", () => stopTTS());
    $("#fullChapter")?.addEventListener("change", () => {
      const full = $("#fullChapter")?.checked;
      const vs1 = $("#verseStartSelect");
      const vs2 = $("#verseEndSelect");
      if (vs1) vs1.disabled = !!full;
      if (vs2) vs2.disabled = !!full;
    });
  }

  async function onBookChange(bookId) {
    const chapSel = $("#chapterSelect");
    const vStart = $("#verseStartSelect");
    const vEnd = $("#verseEndSelect");

    if (chapSel) chapSel.innerHTML = `<option value="">Loading…</option>`;
    if (vStart) vStart.innerHTML = `<option value="">—</option>`;
    if (vEnd) vEnd.innerHTML = `<option value="">(optional)</option>`;

    if (!bookId) return;

    try {
      const chapters = await apiGet(`/bible/chapters?version=${encodeURIComponent(DEFAULT_BIBLE_VERSION)}&book_id=${encodeURIComponent(bookId)}`);
      if (!chapSel) return;

      chapSel.innerHTML = `<option value="">Select…</option>` + chapters
        .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
        .join("");

      chapSel.addEventListener("change", () => onChapterChange(bookId, chapSel.value));
    } catch (e) {
      if (chapSel) chapSel.innerHTML = `<option value="">(error loading chapters)</option>`;
    }
  }

  async function onChapterChange(bookId, chapter) {
    const vStart = $("#verseStartSelect");
    const vEnd = $("#verseEndSelect");
    if (!vStart || !vEnd) return;

    vStart.innerHTML = `<option value="">Loading…</option>`;
    vEnd.innerHTML = `<option value="">(optional)</option>`;

    if (!bookId || !chapter) return;

    try {
      // Ask API for verses list by requesting full text metadata is not available.
      // Many Bible APIs include verse ranges; if yours doesn't, we keep a simple 1..50 fallback.
      const info = await apiGet(`/bible/verses?version=${encodeURIComponent(DEFAULT_BIBLE_VERSION)}&book_id=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}`)
        .catch(() => null);

      let maxVerse = 50;
      if (info?.maxVerse) maxVerse = Number(info.maxVerse) || maxVerse;
      if (Array.isArray(info?.verses) && info.verses.length) maxVerse = Math.max(...info.verses.map(Number));

      const options = [];
      for (let i = 1; i <= maxVerse; i++) options.push(i);

      vStart.innerHTML = `<option value="">Select…</option>` + options.map((n) => `<option value="${n}">${n}</option>`).join("");
      vEnd.innerHTML = `<option value="">(optional)</option>` + options.map((n) => `<option value="${n}">${n}</option>`).join("");

    } catch (e) {
      // fallback
      const options = [];
      for (let i = 1; i <= 50; i++) options.push(i);
      vStart.innerHTML = `<option value="">Select…</option>` + options.map((n) => `<option value="${n}">${n}</option>`).join("");
      vEnd.innerHTML = `<option value="">(optional)</option>` + options.map((n) => `<option value="${n}">${n}</option>`).join("");
    }
  }

  async function onListenBible() {
    const bookId = $("#bookSelect")?.value || "";
    const chapter = $("#chapterSelect")?.value || "";
    const vstart = $("#verseStartSelect")?.value || "";
    const vend = $("#verseEndSelect")?.value || "";
    const full = !!$("#fullChapter")?.checked;

    if (!bookId || !chapter) {
      alert("Pick a book and chapter first.");
      return;
    }

    try {
      const url =
        `/bible/text?version=${encodeURIComponent(DEFAULT_BIBLE_VERSION)}` +
        `&book_id=${encodeURIComponent(bookId)}` +
        `&chapter=${encodeURIComponent(chapter)}` +
        `&full=${full ? "1" : "0"}` +
        (full ? "" : `&vstart=${encodeURIComponent(vstart || "1")}`) +
        (full ? "" : vend ? `&vend=${encodeURIComponent(vend)}` : "");

      const data = await apiGet(url);

      const ref = data?.reference || data?.ref || `${bookId} ${chapter}`;
      const text = data?.text || data?.passage || data?.scripture || "—";

      setText("passageRef", ref);
      setText("passageText", text);

      const voiceLang = ($("#readingVoice")?.value || "en").toLowerCase();
      const versionLabel = $("#versionSelect")?.value || "KJV";

      // English: speak a short label + scripture. Spanish: speak only scripture text.
      const speak =
        voiceLang === "es"
          ? `${text}`
          : `${ref}. ${versionLabel}. ${text}`;

      speakText(speak, voiceLang);
    } catch (e) {
      alert(`Bible error: ${String(e?.message || e)}`);
    }
  }

  // -----------------------------
  // Devotional
  // -----------------------------
  function getDevEntries() {
    return loadLS(LS.devEntries, []);
  }
  function setDevEntries(list) {
    saveLS(LS.devEntries, list);
  }
  function getDevStreak() {
    return Number(localStorage.getItem(LS.devStreak) || "0") || 0;
  }
  function setDevStreak(n) {
    localStorage.setItem(LS.devStreak, String(Number(n || 0)));
  }
  function getDevLastDay() {
    return localStorage.getItem(LS.devLastDay) || "";
  }
  function setDevLastDay(day) {
    localStorage.setItem(LS.devLastDay, day || "");
  }

  function devHasRequired() {
    const a = ($("#devMyContext")?.value || "").trim();
    const b = ($("#devMyReflection")?.value || "").trim();
    const c = ($("#devMyApplication")?.value || "").trim();
    const d = ($("#devMyPrayer")?.value || "").trim();
    return a.length > 0 && b.length > 0 && c.length > 0 && d.length > 0;
  }

  function updateDevStreakPill() {
    const lang = getUILang("devUiLang", "en");
    const t = I18N[lang];
    setText("devStreakPill", `${t.streak}: ${getDevStreak()}`);
  }

  function applyDevLangUI() {
    const lang = getUILang("devUiLang", "en");
    const t = I18N[lang];

    setText("devIntro", t.devIntro);
    setText("devLabelTheme", t.themeTitle);
    setText("devLabelScripture", t.scriptureA);

    setText("devLabelCtxA", t.starterContext);
    setText("devLabelRefA", t.starterReflection);
    setText("devLabelAppA", t.starterApplication);
    setText("devLabelPrA", t.starterPrayer);

    setText("devNow1", t.nowWrite);
    setText("devNow2", t.nowWrite);
    setText("devNow3", t.nowWrite);
    setText("devNow4", t.nowWritePrayer);

    setText("devLabelNotes", t.notesOpt);
    setText("devReqNote", t.requiredNote);

    $("#devotionalBtn").textContent = t.generate;
    $("#devSaveBtn").textContent = t.save;
    $("#devStreakBtn").textContent = t.didToday;

    $("#devSavedTitle").textContent = t.savedDev;

    updateDevStreakPill();

    // placeholders in Spanish
    if (lang === "es") {
      $("#devMyContext").placeholder = "Contexto / Observación (¿Qué está pasando? ¿Quién habla? ¿Por qué importa?)";
      $("#devMyReflection").placeholder = "Reflexión / Enseñanza (¿Qué revela esto sobre Dios? ¿Sobre mí?)";
      $("#devMyApplication").placeholder = "Aplicación (¿Qué haré hoy por causa de esto?)";
      $("#devMyPrayer").placeholder = "Oración (escribe aquí tu oración real)";
      $("#devMyNotes").placeholder = "Notas…";
    } else {
      $("#devMyContext").placeholder = "Context / Observation (What’s happening? Who is speaking? Why does it matter?)";
      $("#devMyReflection").placeholder = "Reflection / Insight (What does this reveal about God? About me?)";
      $("#devMyApplication").placeholder = "Application (What will I do today because of this?)";
      $("#devMyPrayer").placeholder = "Prayer (write your real prayer here)";
      $("#devMyNotes").placeholder = "Notes…";
    }
  }

  async function generateDevotional() {
    const lang = getUILang("devUiLang", "en");
    applyDevLangUI();

    try {
      const data = await apiGet(`/devotional?lang=${encodeURIComponent(lang)}&version=${encodeURIComponent(DEFAULT_BIBLE_VERSION)}`);

      setText("devTheme", data?.theme || "—");
      setText("devScriptureRef", data?.reference || "—");
      setText("devScriptureText", data?.scripture || "—");

      setText("devStarterContext", data?.starters?.context || "—");
      setText("devStarterReflection", data?.starters?.reflection || "—");
      setText("devStarterApplication", data?.starters?.application || "—");
      setText("devStarterPrayer", data?.starters?.prayer || "—");
    } catch (e) {
      // Fallback if server is down
      setText("devTheme", lang === "es" ? "Confiar en Dios hoy" : "Trusting God Today");
      setText("devScriptureRef", "—");
      setText("devScriptureText", "—");

      setText("devStarterContext", lang === "es"
        ? "Ejemplo: Este pasaje me invita a depender de Dios y no de mis fuerzas."
        : "Example: This passage calls me to look to God instead of my own strength."
      );
      setText("devStarterReflection", lang === "es"
        ? "Ejemplo: Dios es fiel aun cuando yo me siento inseguro."
        : "Example: God is faithful even when I feel unsure."
      );
      setText("devStarterApplication", lang === "es"
        ? "Ejemplo: Hoy elegiré obedecer a Dios en una decisión específica."
        : "Example: Today I will obey God in one specific area."
      );
      setText("devStarterPrayer", lang === "es"
        ? "Ejemplo: “Señor, ayúdame a confiar en Ti hoy…”"
        : "Example: “Lord, help me trust You today…”"
      );
    }
  }

  function renderDevSavedList() {
    const lang = getUILang("devUiLang", "en");
    const t = I18N[lang];

    const box = $("#devSavedList");
    if (!box) return;

    const items = getDevEntries();
    if (!items.length) {
      box.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
      return;
    }

    box.innerHTML = items
      .map((it, idx) => {
        const label = `${it.day} — ${it.reference || "—"}`;
        return `
          <button class="btn btn-ghost" data-load="${idx}" type="button">${escapeHtml(label)}</button>
          <button class="btn btn-danger" data-del="${idx}" type="button">Delete</button>
        `;
      })
      .join('<div class="divider"></div>');

    box.querySelectorAll("button[data-load]").forEach((b) => {
      b.addEventListener("click", () => {
        const idx = Number(b.getAttribute("data-load"));
        const it = getDevEntries()[idx];
        if (!it) return;

        setText("devTheme", it.theme || "—");
        setText("devScriptureRef", it.reference || "—");
        setText("devScriptureText", it.scripture || "—");
        setText("devStarterContext", it.starters?.context || "—");
        setText("devStarterReflection", it.starters?.reflection || "—");
        setText("devStarterApplication", it.starters?.application || "—");
        setText("devStarterPrayer", it.starters?.prayer || "—");

        $("#devMyContext").value = it.mine?.context || "";
        $("#devMyReflection").value = it.mine?.reflection || "";
        $("#devMyApplication").value = it.mine?.application || "";
        $("#devMyPrayer").value = it.mine?.prayer || "";
        $("#devMyNotes").value = it.mine?.notes || "";
      });
    });

    box.querySelectorAll("button[data-del]").forEach((b) => {
      b.addEventListener("click", () => {
        const idx = Number(b.getAttribute("data-del"));
        const items2 = getDevEntries().filter((_, i) => i !== idx);
        setDevEntries(items2);
        renderDevSavedList();
      });
    });
  }

  function saveDevotional() {
    const lang = getUILang("devUiLang", "en");
    const t = I18N[lang];

    if (!devHasRequired()) {
      alert(t.requiredNote);
      return;
    }

    const day = nowDayKeyLocal();

    const entry = {
      day,
      lang,
      theme: $("#devTheme")?.textContent || "",
      reference: $("#devScriptureRef")?.textContent || "",
      scripture: $("#devScriptureText")?.textContent || "",
      starters: {
        context: $("#devStarterContext")?.textContent || "",
        reflection: $("#devStarterReflection")?.textContent || "",
        application: $("#devStarterApplication")?.textContent || "",
        prayer: $("#devStarterPrayer")?.textContent || "",
      },
      mine: {
        context: $("#devMyContext")?.value || "",
        reflection: $("#devMyReflection")?.value || "",
        application: $("#devMyApplication")?.value || "",
        prayer: $("#devMyPrayer")?.value || "",
        notes: $("#devMyNotes")?.value || "",
      },
      savedAt: Date.now(),
    };

    const items = getDevEntries();
    items.unshift(entry);
    setDevEntries(items);

    // streak: only increment once per day
    if (getDevLastDay() !== day) {
      setDevStreak(getDevStreak() + 1);
      setDevLastDay(day);
    }

    updateDevStreakPill();
    renderDevSavedList();
    alert(lang === "es" ? "Guardado." : "Saved.");
  }

  function devDidItToday() {
    const day = nowDayKeyLocal();
    if (getDevLastDay() !== day) {
      setDevStreak(getDevStreak() + 1);
      setDevLastDay(day);
      updateDevStreakPill();
    }
  }

  function setupDevotional() {
    $("#devUiLang")?.addEventListener("change", () => {
      applyDevLangUI();
      renderDevSavedList();
    });

    $("#devotionalBtn")?.addEventListener("click", generateDevotional);
    $("#devSaveBtn")?.addEventListener("click", saveDevotional);
    $("#devStreakBtn")?.addEventListener("click", devDidItToday);

    applyDevLangUI();
    updateDevStreakPill();
    renderDevSavedList();
  }

  // -----------------------------
  // Daily Prayer
  // -----------------------------
  function getPrEntries() {
    return loadLS(LS.prEntries, []);
  }
  function setPrEntries(list) {
    saveLS(LS.prEntries, list);
  }
  function getPrStreak() {
    return Number(localStorage.getItem(LS.prStreak) || "0") || 0;
  }
  function setPrStreak(n) {
    localStorage.setItem(LS.prStreak, String(Number(n || 0)));
  }
  function getPrLastDay() {
    return localStorage.getItem(LS.prLastDay) || "";
  }
  function setPrLastDay(day) {
    localStorage.setItem(LS.prLastDay, day || "");
  }

  function updatePrStreakPill() {
    const lang = getUILang("prUiLang", "en");
    const t = I18N[lang];
    setText("prStreakPill", `${t.streak}: ${getPrStreak()}`);
  }

  function applyPrayerLangUI() {
    const lang = getUILang("prUiLang", "en");
    const t = I18N[lang];

    setText("prIntro", t.prIntro);
    $("#prayerBtn").textContent = t.generateStarters;
    $("#prSaveBtn").textContent = t.save;
    $("#prStreakBtn").textContent = t.didToday;
    $("#prSavedTitle").textContent = t.savedPr;

    updatePrStreakPill();

    if (lang === "es") {
      setText("prLabelA", "Ejemplo de Alyana — Adoración");
      setText("prLabelC", "Ejemplo de Alyana — Confesión");
      setText("prLabelT", "Ejemplo de Alyana — Gratitud");
      setText("prLabelS", "Ejemplo de Alyana — Peticiones");
      setText("prLabelN", "Notas");

      setText("prNow1", "Ahora escribe la tuya:");
      setText("prNow2", "Ahora escribe la tuya:");
      setText("prNow3", "Ahora escribe la tuya:");
      setText("prNow4", "Ahora escribe la tuya:");

      $("#myAdoration").placeholder = "Adoración (alaba a Dios por quién Él es)…";
      $("#myConfession").placeholder = "Confesión (lo que necesito confesar)…";
      $("#myThanksgiving").placeholder = "Gratitud (por lo que estoy agradecido)…";
      $("#mySupplication").placeholder = "Peticiones (por mí y por otros)…";
      $("#prayerNotes").placeholder = "Notas…";
    } else {
      setText("prLabelA", "Alyana Starter — Adoration");
      setText("prLabelC", "Alyana Starter — Confession");
      setText("prLabelT", "Alyana Starter — Thanksgiving");
      setText("prLabelS", "Alyana Starter — Supplication");
      setText("prLabelN", "Notes");

      setText("prNow1", "Now write your own:");
      setText("prNow2", "Now write your own:");
      setText("prNow3", "Now write your own:");
      setText("prNow4", "Now write your own:");

      $("#myAdoration").placeholder = "Adoration (praise God for who He is)…";
      $("#myConfession").placeholder = "Confession (what I need to confess)…";
      $("#myThanksgiving").placeholder = "Thanksgiving (what I’m grateful for)…";
      $("#mySupplication").placeholder = "Supplication (requests for myself/others)…";
      $("#prayerNotes").placeholder = "Notes…";
    }
  }

  function generatePrayerStarters() {
    const lang = getUILang("prUiLang", "en");
    applyPrayerLangUI();

    if (lang === "es") {
      setText("pA", "Ejemplo: Padre Celestial, Tú eres santo, fiel y bueno.");
      setText("pC", "Ejemplo: Perdóname por mis fallas en pensamientos, palabras o acciones.");
      setText("pT", "Ejemplo: Gracias por este nuevo día y por tu cuidado constante.");
      setText("pS", "Ejemplo: Guía a mi familia y fortalece a quienes están sufriendo hoy.");
    } else {
      setText("pA", "Example: Heavenly Father, You are holy, faithful, and good.");
      setText("pC", "Example: Forgive me for where I have fallen short in thoughts, words, or actions.");
      setText("pT", "Example: Thank You for this new day and Your constant care.");
      setText("pS", "Example: Guide my family and strengthen those who are suffering today.");
    }
  }

  function renderPrSavedList() {
    const lang = getUILang("prUiLang", "en");
    const t = I18N[lang];

    const box = $("#prSavedList");
    if (!box) return;

    const items = getPrEntries();
    if (!items.length) {
      box.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
      return;
    }

    box.innerHTML = items
      .map((it, idx) => {
        const label = `${it.day} — Prayer`;
        return `
          <button class="btn btn-ghost" data-load="${idx}" type="button">${escapeHtml(label)}</button>
          <button class="btn btn-danger" data-del="${idx}" type="button">Delete</button>
        `;
      })
      .join('<div class="divider"></div>');

    box.querySelectorAll("button[data-load]").forEach((b) => {
      b.addEventListener("click", () => {
        const idx = Number(b.getAttribute("data-load"));
        const it = getPrEntries()[idx];
        if (!it) return;

        setText("pA", it.starters?.adoration || "—");
        setText("pC", it.starters?.confession || "—");
        setText("pT", it.starters?.thanksgiving || "—");
        setText("pS", it.starters?.supplication || "—");

        $("#myAdoration").value = it.mine?.adoration || "";
        $("#myConfession").value = it.mine?.confession || "";
        $("#myThanksgiving").value = it.mine?.thanksgiving || "";
        $("#mySupplication").value = it.mine?.supplication || "";
        $("#prayerNotes").value = it.mine?.notes || "";
      });
    });

    box.querySelectorAll("button[data-del]").forEach((b) => {
      b.addEventListener("click", () => {
        const idx = Number(b.getAttribute("data-del"));
        const items2 = getPrEntries().filter((_, i) => i !== idx);
        setPrEntries(items2);
        renderPrSavedList();
      });
    });
  }

  function savePrayer() {
    const lang = getUILang("prUiLang", "en");
    const day = nowDayKeyLocal();

    const entry = {
      day,
      lang,
      starters: {
        adoration: $("#pA")?.textContent || "",
        confession: $("#pC")?.textContent || "",
        thanksgiving: $("#pT")?.textContent || "",
        supplication: $("#pS")?.textContent || "",
      },
      mine: {
        adoration: $("#myAdoration")?.value || "",
        confession: $("#myConfession")?.value || "",
        thanksgiving: $("#myThanksgiving")?.value || "",
        supplication: $("#mySupplication")?.value || "",
        notes: $("#prayerNotes")?.value || "",
      },
      savedAt: Date.now(),
    };

    const items = getPrEntries();
    items.unshift(entry);
    setPrEntries(items);

    // streak: only once per day
    if (getPrLastDay() !== day) {
      setPrStreak(getPrStreak() + 1);
      setPrLastDay(day);
    }

    updatePrStreakPill();
    renderPrSavedList();

    alert(lang === "es" ? "Guardado." : "Saved.");
  }

  function prDidItToday() {
    const day = nowDayKeyLocal();
    if (getPrLastDay() !== day) {
      setPrStreak(getPrStreak() + 1);
      setPrLastDay(day);
      updatePrStreakPill();
    }
  }

  function setupDailyPrayer() {
    $("#prUiLang")?.addEventListener("change", () => {
      applyPrayerLangUI();
      renderPrSavedList();
    });

    $("#prayerBtn")?.addEventListener("click", generatePrayerStarters);
    $("#prSaveBtn")?.addEventListener("click", savePrayer);
    $("#prStreakBtn")?.addEventListener("click", prDidItToday);

    applyPrayerLangUI();
    updatePrStreakPill();
    renderPrSavedList();
  }

  // -----------------------------
  // Global: Make top navigation labels switch (optional)
  // -----------------------------
  function applyTopTabLangFromDevOrPrayer() {
    // We keep menu in English by default; you can extend later to have one "global language".
    // For now, Devotional + Daily Prayer have their own language switches.
  }

  // -----------------------------
  // Service worker
  // -----------------------------
  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch {}
  }

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    renderAppShell();
    setupTabs();

    setText("jsStatus", "JS: ready");

    // Voices
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = () => {
        loadVoices();
        updateTtsPills();
      };
    }
    updateTtsPills();

    // Core features
    setupChatHandlers();
    renderChat();

    setupDevotional();
    setupDailyPrayer();

    await checkMe();
    await initBible();

    await registerServiceWorker();
  }

  // Run
  try {
    init();
  } catch (e) {
    console.error(e);
    // If something fails hard, show a visible error
    const mount = document.getElementById("app");
    if (mount) {
      mount.innerHTML = `<pre style="padding:16px; white-space:pre-wrap; color:#fff; background:#1b0b2a;">
App failed to start:
${escapeHtml(String(e?.stack || e))}
</pre>`;
    }
  }
})();





























