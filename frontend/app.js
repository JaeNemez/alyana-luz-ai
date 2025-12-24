/* frontend/app.js
   Alyana Luz • Bible AI
   FIXES INCLUDED:
   1) Spanish AI responses everywhere (Chat / Devotional / Daily Prayer)
   2) Bible endpoints now match your *server.py* routes:
        - /bible/health
        - /bible/books
        - /bible/chapters?book=...
        - /bible/passage?book=...&chapter=...&full_chapter=...&start=...&end=...
   3) Fix “[object Object]” in Bible output (we now render reference/text correctly)
   4) Devotional + Daily Prayer parsing fixed (server returns { json: "<stringified JSON>" })
   5) Voices restricted to ONLY:
        - English: Karen (en-AU)
        - Spanish: Paulina (es-MX)
      (with safe fallback if the browser doesn’t have those exact voices)
*/

(() => {
  // -----------------------------
  // CONFIG
  // -----------------------------
  const APP_TITLE = "Alyana Luz • Bible AI";

  // IMPORTANT: match your FastAPI server.py routes
  const API = {
    me: "/me",
    chat: "/chat",
    devotional: "/devotional",
    dailyPrayer: "/daily_prayer",

    bibleHealth: "/bible/health",
    bibleBooks: "/bible/books",
    bibleChapters: "/bible/chapters",
    biblePassage: "/bible/passage",
  };

  // -----------------------------
  // THEME
  // -----------------------------
  const THEME = {
    bg1: "#2b0a50",
    bg2: "#0b1a3a",
    card: "rgba(9, 18, 43, 0.72)",
    card2: "rgba(9, 18, 43, 0.58)",
    border: "rgba(255,255,255,0.12)",
    text: "#e8eaf2",
    muted: "rgba(232,234,242,0.72)",
    accent: "#f59e0b",
    accent2: "#ffb020",
    danger: "#ef4444",
    ok: "#22c55e",
    bubbleUser: "rgba(245, 158, 11, 0.24)",
    bubbleBot: "rgba(255,255,255,0.06)",
  };

  // -----------------------------
  // STATE
  // -----------------------------
  const state = {
    tab: "chat",
    lang: "en", // "en" | "es"

    voices: [],
    voiceSelected: { en: null, es: null },

    account: { status: "unknown", email: null },

    chat: {
      messages: loadLS("alyana_chat_messages", []),
      sending: false,
      error: null,
    },

    bible: {
      health: null,
      books: null,
      book: "Genesis",
      chapters: [],
      chapter: 1,

      fullChapter: true,
      startVerse: "",
      endVerse: "",

      reference: "",
      text: "",
      loading: false,
      error: null,
    },

    devotional: {
      suggestionObj: null,   // {scripture, brief_explanation}
      suggestionRaw: "",     // fallback string
      userText: loadLS("alyana_devotional_draft", ""),
      saved: loadLS("alyana_devotional_saved", []),
      streak: loadLS("alyana_devotional_streak", { count: 0, lastDate: null }),
      error: null,
      loading: false,
    },

    prayer: {
      suggestionObj: null,   // {example_adoration, example_confession, ...}
      suggestionRaw: "",
      userText: loadLS("alyana_prayer_draft", ""),
      saved: loadLS("alyana_prayer_saved", []),
      streak: loadLS("alyana_prayer_streak", { count: 0, lastDate: null }),
      error: null,
      loading: false,
    },
  };

  // -----------------------------
  // HELPERS
  // -----------------------------
  function $(sel) { return document.querySelector(sel); }

  function loadLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveLS(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function apiFetch(url, opts = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const res = await fetch(url, { ...opts, headers });
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

    if (!res.ok) {
      const detail =
        (data && typeof data === "object" && (data.detail || data.error || data.message)) ||
        (typeof data === "string" ? data : null) ||
        `Request failed (${res.status})`;
      throw new Error(detail);
    }
    return data;
  }

  function setTab(tab) {
    state.tab = tab;
    render();
  }

  function setLang(lang) {
    state.lang = lang === "es" ? "es" : "en";
    render();
  }

  function tryParseJsonString(maybeString) {
    if (typeof maybeString !== "string") return null;
    const s = maybeString.trim();
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  }

  function languageInstruction() {
    // Ensures Spanish output everywhere for AI endpoints (especially /chat)
    return state.lang === "es"
      ? "IMPORTANT: Reply only in Spanish."
      : "IMPORTANT: Reply only in English.";
  }

  // -----------------------------
  // TEXT TO SPEECH (ONLY 2 VOICES)
  // -----------------------------
  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;

    const voices = window.speechSynthesis.getVoices() || [];
    state.voices = voices;

    // We only expose:
    // - Karen (en-AU)
    // - Paulina (es-MX)
    // If not found, we fall back to any en / any es.
    const findKaren = () => {
      const v = voices.find(v =>
        (v.name || "").toLowerCase().includes("karen") &&
        (v.lang || "").toLowerCase().startsWith("en")
      );
      return v || voices.find(v => (v.lang || "").toLowerCase().startsWith("en")) || null;
    };

    const findPaulina = () => {
      const v = voices.find(v =>
        (v.name || "").toLowerCase().includes("paulina") &&
        (v.lang || "").toLowerCase().startsWith("es")
      );
      return v || voices.find(v => (v.lang || "").toLowerCase().startsWith("es")) || null;
    };

    const karen = findKaren();
    const paulina = findPaulina();

    state.voiceSelected.en = karen ? karen.name : null;
    state.voiceSelected.es = paulina ? paulina.name : null;

    render();
  }

  function getSelectedVoiceName() {
    return state.lang === "es" ? state.voiceSelected.es : state.voiceSelected.en;
  }

  function getAllowedVoicesForLang() {
    const voices = state.voices || [];
    if (!voices.length) return [];

    if (state.lang === "es") {
      const paulina = voices.find(v =>
        (v.name || "").toLowerCase().includes("paulina") &&
        (v.lang || "").toLowerCase().startsWith("es")
      );
      const anyEs = voices.find(v => (v.lang || "").toLowerCase().startsWith("es"));
      return [paulina || anyEs].filter(Boolean);
    }

    // en
    const karen = voices.find(v =>
      (v.name || "").toLowerCase().includes("karen") &&
      (v.lang || "").toLowerCase().startsWith("en")
    );
    const anyEn = voices.find(v => (v.lang || "").toLowerCase().startsWith("en"));
    return [karen || anyEn].filter(Boolean);
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(String(text || ""));

    // Hard-pin the language to match your requirement
    u.lang = state.lang === "es" ? "es-MX" : "en-AU";

    const voiceName = getSelectedVoiceName();
    const voice = (state.voices || []).find(v => v.name === voiceName);
    if (voice) u.voice = voice;

    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
  }

  // -----------------------------
  // LOADERS
  // -----------------------------
  async function loadAccount() {
    try {
      const me = await apiFetch(API.me, { method: "GET" });
      const email = me?.email || null;
      const active = typeof me?.active === "boolean" ? me.active : false;
      state.account = { status: active ? "active" : "error", email };
    } catch {
      state.account = { status: "error", email: null };
    }
    render();
  }

  async function loadBibleHealth() {
    try {
      state.bible.health = await apiFetch(API.bibleHealth, { method: "GET" });
    } catch (e) {
      state.bible.health = { status: "error", detail: e.message };
    }
    render();
  }

  async function loadBooks() {
    try {
      const data = await apiFetch(API.bibleBooks, { method: "GET" });
      // server returns {books:[{id,name,key}]}
      const books = Array.isArray(data?.books) ? data.books : null;
      state.bible.books = books && books.length ? books : null;
    } catch {
      state.bible.books = null;
    }
    render();
  }

  async function loadChapters(book) {
    try {
      const data = await apiFetch(`${API.bibleChapters}?book=${encodeURIComponent(book)}`, { method: "GET" });
      // server returns {book_id, chapters:[...]}
      const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
      state.bible.chapters = chapters;
      if (chapters.length) state.bible.chapter = chapters[0];
    } catch {
      state.bible.chapters = [];
    }
    render();
  }

  async function loadBiblePassage({ book, chapter, fullChapter, start, end }) {
    state.bible.loading = true;
    state.bible.error = null;
    state.bible.text = "";
    state.bible.reference = "";
    render();

    try {
      const qs =
        `book=${encodeURIComponent(book)}` +
        `&chapter=${encodeURIComponent(chapter)}` +
        `&full_chapter=${encodeURIComponent(fullChapter ? "true" : "false")}` +
        `&start=${encodeURIComponent(start || "1")}` +
        (end ? `&end=${encodeURIComponent(end)}` : "");

      const data = await apiFetch(`${API.biblePassage}?${qs}`, { method: "GET" });

      // server returns {reference, text}
      state.bible.reference = typeof data?.reference === "string" ? data.reference : "";
      state.bible.text = typeof data?.text === "string" ? data.text : (typeof data === "string" ? data : JSON.stringify(data, null, 2));
    } catch (e) {
      state.bible.error = e.message;
    } finally {
      state.bible.loading = false;
      render();
    }
  }

  // -----------------------------
  // DEVOTIONAL / PRAYER (server returns { json: "<json string>" })
  // -----------------------------
  async function generateDevotionalSuggestion() {
    state.devotional.loading = true;
    state.devotional.error = null;
    state.devotional.suggestionObj = null;
    state.devotional.suggestionRaw = "";
    render();

    try {
      const data = await apiFetch(API.devotional, {
        method: "POST",
        body: JSON.stringify({ lang: state.lang }),
      });

      // server returns { json: "<stringified JSON>", cached: bool }
      const parsed = tryParseJsonString(data?.json);
      if (parsed && typeof parsed === "object") {
        state.devotional.suggestionObj = {
          scripture: String(parsed.scripture || ""),
          brief_explanation: String(parsed.brief_explanation || ""),
        };
      } else {
        state.devotional.suggestionRaw = typeof data === "string" ? data : (data?.json || JSON.stringify(data, null, 2));
      }
    } catch (e) {
      state.devotional.error = e.message;
    } finally {
      state.devotional.loading = false;
      render();
    }
  }

  async function generatePrayerSuggestion() {
    state.prayer.loading = true;
    state.prayer.error = null;
    state.prayer.suggestionObj = null;
    state.prayer.suggestionRaw = "";
    render();

    try {
      const data = await apiFetch(API.dailyPrayer, {
        method: "POST",
        body: JSON.stringify({ lang: state.lang }),
      });

      const parsed = tryParseJsonString(data?.json);
      if (parsed && typeof parsed === "object") {
        state.prayer.suggestionObj = {
          example_adoration: String(parsed.example_adoration || ""),
          example_confession: String(parsed.example_confession || ""),
          example_thanksgiving: String(parsed.example_thanksgiving || ""),
          example_supplication: String(parsed.example_supplication || ""),
        };
      } else {
        state.prayer.suggestionRaw = typeof data === "string" ? data : (data?.json || JSON.stringify(data, null, 2));
      }
    } catch (e) {
      state.prayer.error = e.message;
    } finally {
      state.prayer.loading = false;
      render();
    }
  }

  // -----------------------------
  // STREAK + SAVE
  // -----------------------------
  function bumpStreak(streakObjKey) {
    const t = todayISO();
    const st = loadLS(streakObjKey, { count: 0, lastDate: null });

    if (st.lastDate === t) return st;

    if (!st.lastDate) {
      st.count = 1;
      st.lastDate = t;
      return st;
    }

    const last = new Date(st.lastDate + "T00:00:00");
    const now = new Date(t + "T00:00:00");
    const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) st.count += 1;
    else st.count = 1;

    st.lastDate = t;
    return st;
  }

  function saveDevotionalEntry() {
    const text = (state.devotional.userText || "").trim();
    if (!text) return;

    const entry = { date: todayISO(), lang: state.lang, text };
    state.devotional.saved.unshift(entry);
    saveLS("alyana_devotional_saved", state.devotional.saved);

    state.devotional.streak = bumpStreak("alyana_devotional_streak");
    saveLS("alyana_devotional_streak", state.devotional.streak);

    render();
  }

  function savePrayerEntry() {
    const text = (state.prayer.userText || "").trim();
    if (!text) return;

    const entry = { date: todayISO(), lang: state.lang, text };
    state.prayer.saved.unshift(entry);
    saveLS("alyana_prayer_saved", state.prayer.saved);

    state.prayer.streak = bumpStreak("alyana_prayer_streak");
    saveLS("alyana_prayer_streak", state.prayer.streak);

    render();
  }

  // -----------------------------
  // CHAT (server expects {prompt, history})
  // -----------------------------
  function buildChatHistoryForServer() {
    // server expects: [{role:"user"|"assistant", content:"..."}]
    // Keep it lightweight, last ~16 messages.
    const msgs = (state.chat.messages || []).slice(-16);
    return msgs
      .filter(m => m && (m.role === "user" || m.role === "assistant") && (m.text || "").trim())
      .map(m => ({ role: m.role, content: String(m.text || "") }));
  }

  async function sendChat() {
    const input = $("#chatInput");
    if (!input) return;

    const text = (input.value || "").trim();
    if (!text || state.chat.sending) return;

    state.chat.error = null;
    state.chat.sending = true;

    state.chat.messages.push({ role: "user", text, ts: Date.now() });
    saveLS("alyana_chat_messages", state.chat.messages);

    input.value = "";
    render();

    try {
      const prompt = `${languageInstruction()}\n\n${text}`;

      const data = await apiFetch(API.chat, {
        method: "POST",
        body: JSON.stringify({
          prompt,
          history: buildChatHistoryForServer(),
        }),
      });

      const reply =
        data?.message ||
        data?.reply ||
        data?.text ||
        (typeof data === "string" ? data : JSON.stringify(data, null, 2));

      state.chat.messages.push({ role: "assistant", text: reply, ts: Date.now() });
      saveLS("alyana_chat_messages", state.chat.messages);
    } catch (e) {
      state.chat.error = e.message;
      state.chat.messages.push({ role: "assistant", text: `Error: ${e.message}`, ts: Date.now() });
      saveLS("alyana_chat_messages", state.chat.messages);
    } finally {
      state.chat.sending = false;
      render();

      const el = $("#chatScroll");
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  function lastAssistantMessage() {
    for (let i = state.chat.messages.length - 1; i >= 0; i--) {
      if (state.chat.messages[i].role === "assistant") return state.chat.messages[i].text;
    }
    return "";
  }

  // -----------------------------
  // RENDER
  // -----------------------------
  function styles() {
    return `
      :root{
        --bg1:${THEME.bg1};
        --bg2:${THEME.bg2};
        --card:${THEME.card};
        --card2:${THEME.card2};
        --border:${THEME.border};
        --text:${THEME.text};
        --muted:${THEME.muted};
        --accent:${THEME.accent};
        --accent2:${THEME.accent2};
        --danger:${THEME.danger};
        --ok:${THEME.ok};
        --bubbleUser:${THEME.bubbleUser};
        --bubbleBot:${THEME.bubbleBot};
      }
      *{ box-sizing:border-box; }
      body{
        margin:0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
        color:var(--text);
        background: radial-gradient(1200px 600px at 20% 0%, rgba(255,255,255,0.08), transparent 60%),
                    linear-gradient(135deg, var(--bg1), var(--bg2));
        min-height:100vh;
      }
      .wrap{ max-width: 1100px; margin: 28px auto; padding: 0 16px; }
      .shell{
        border:1px solid var(--border);
        border-radius: 22px;
        background: rgba(0,0,0,0.22);
        backdrop-filter: blur(12px);
        box-shadow: 0 30px 90px rgba(0,0,0,0.45);
        overflow:hidden;
      }
      .topbar{
        display:flex; align-items:center; justify-content:space-between;
        padding: 16px 18px;
        border-bottom:1px solid var(--border);
        background: rgba(0,0,0,0.16);
        gap: 12px;
        flex-wrap: wrap;
      }
      .brand{ display:flex; gap:12px; align-items:center; }
      .logo{
        width:38px; height:38px; border-radius: 12px;
        background: rgba(255,255,255,0.10);
        border:1px solid var(--border);
        display:flex; align-items:center; justify-content:center;
        font-weight:800;
      }
      .brand h1{ font-size: 16px; margin:0; line-height: 1.1; }
      .brand .tag{ font-size: 12px; color: var(--muted); margin-top: 3px; }
      .actions{ display:flex; gap:10px; align-items:center; flex-wrap: wrap; }
      .pill{
        border:1px solid var(--border);
        background: rgba(255,255,255,0.06);
        color: var(--text);
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 12px;
        white-space: nowrap;
      }
      .pill strong{ color: var(--accent2); }
      .btn{
        border:1px solid var(--border);
        background: rgba(255,255,255,0.08);
        color: var(--text);
        border-radius: 12px;
        padding: 10px 12px;
        font-weight: 700;
        cursor:pointer;
      }
      .btn:hover{ border-color: rgba(255,255,255,0.18); }
      .btnAccent{
        background: linear-gradient(180deg, rgba(245,158,11,0.26), rgba(245,158,11,0.12));
        border-color: rgba(245,158,11,0.45);
      }
      .btnDanger{
        background: rgba(239,68,68,0.20);
        border-color: rgba(239,68,68,0.45);
      }
      .main{ padding: 16px; }
      .tabs{
        display:flex; gap:10px; padding: 12px;
        border:1px solid var(--border);
        border-radius: 18px;
        background: rgba(255,255,255,0.05);
      }
      .tab{
        padding: 10px 14px;
        border-radius: 999px;
        font-weight: 800;
        font-size: 13px;
        border:1px solid transparent;
        cursor:pointer;
        color: var(--muted);
        user-select:none;
      }
      .tab.active{
        color: var(--text);
        border-color: rgba(245,158,11,0.55);
        background: rgba(245,158,11,0.16);
      }
      .grid{
        display:grid;
        grid-template-columns: 1.3fr 0.7fr;
        gap: 14px;
        margin-top: 14px;
      }
      @media (max-width: 900px){
        .grid{ grid-template-columns: 1fr; }
      }
      .card{
        border:1px solid var(--border);
        border-radius: 18px;
        background: var(--card);
        padding: 14px;
      }
      .card h2{ margin:0 0 6px 0; font-size: 16px; }
      .sub{ color: var(--muted); font-size: 12px; margin-bottom: 10px; }
      .row{ display:flex; gap:10px; align-items:center; flex-wrap: wrap; }
      .field{
        flex: 1;
        min-width: 160px;
        background: rgba(0,0,0,0.22);
        border:1px solid var(--border);
        color: var(--text);
        border-radius: 12px;
        padding: 10px 12px;
        outline:none;
      }
      select.field{ cursor:pointer; }
      textarea.field{ min-height: 110px; resize: vertical; }
      .divider{ height:1px; background: var(--border); margin: 12px 0; }
      .hint{ font-size: 12px; color: var(--muted); }
      .error{
        color: #ffd6d6;
        background: rgba(239,68,68,0.12);
        border:1px solid rgba(239,68,68,0.30);
        padding: 10px 12px;
        border-radius: 12px;
        margin-top: 10px;
        white-space: pre-wrap;
      }
      .ok{
        color: #d7ffe6;
        background: rgba(34,197,94,0.10);
        border:1px solid rgba(34,197,94,0.28);
        padding: 10px 12px;
        border-radius: 12px;
        margin-top: 10px;
        white-space: pre-wrap;
      }
      .scroll{
        height: 360px;
        overflow:auto;
        padding-right: 6px;
      }
      .bubbleRow{ display:flex; margin: 10px 0; }
      .bubbleRow.user{ justify-content:flex-end; }
      .bubbleRow.assistant{ justify-content:flex-start; }
      .bubble{
        max-width: 78%;
        border:1px solid var(--border);
        padding: 10px 12px;
        border-radius: 18px;
        background: var(--bubbleBot);
        white-space: pre-wrap;
        line-height: 1.35;
        font-size: 13px;
      }
      .bubble.user{
        background: var(--bubbleUser);
        border-color: rgba(245,158,11,0.35);
      }
      .miniBtn{ font-size: 12px; padding: 8px 10px; border-radius: 10px; }
      .kpi{ display:flex; gap:10px; flex-wrap:wrap; }
      .kpi .pill{ padding: 8px 10px; }
      .list{
        display:flex;
        flex-direction: column;
        gap: 10px;
        max-height: 360px;
        overflow:auto;
      }
      .item{
        border:1px solid var(--border);
        border-radius: 14px;
        background: rgba(255,255,255,0.05);
        padding: 10px 12px;
      }
      .item .meta{ font-size: 12px; color: var(--muted); margin-bottom: 6px; }
      .item .text{ font-size: 13px; white-space: pre-wrap; }
      .checkRow{
        display:flex; align-items:center; gap:10px;
        font-size: 12px; color: var(--muted);
      }
    `;
  }

  function render() {
    document.title = APP_TITLE;

    if (!$("#app")) {
      const div = document.createElement("div");
      div.id = "app";
      document.body.innerHTML = "";
      document.body.appendChild(div);
    }

    const accountLabel =
      state.account.status === "active"
        ? `Account: active (${state.account.email || "signed in"})`
        : "Account: not active";

    const allowedVoices = getAllowedVoicesForLang();
    const voiceOptionsHtml = allowedVoices.length
      ? allowedVoices
          .map(v => {
            const label = `${v.name} (${v.lang})`;
            const selected = v.name === getSelectedVoiceName() ? "selected" : "";
            return `<option value="${escapeHtml(v.name)}" ${selected}>${escapeHtml(label)}</option>`;
          })
          .join("")
      : `<option value="">(No voices found yet — click again)</option>`;

    const health = state.bible.health;
    const bibleStatusLine =
      health?.status === "ok"
        ? `Bible DB OK • verses: ${health.verse_count ?? "?"}`
        : health?.detail
          ? `Bible DB error: ${health.detail}`
          : `Bible DB: checking`;

    const contentHtml =
      state.tab === "chat" ? renderChat() :
      state.tab === "bible" ? renderBible() :
      state.tab === "devotional" ? renderDevotional() :
      state.tab === "prayer" ? renderPrayer() :
      "";

    $("#app").innerHTML = `
      <style>${styles()}</style>

      <div class="wrap">
        <div class="shell">
          <div class="topbar">
            <div class="brand">
              <div class="logo">AL</div>
              <div>
                <h1>${escapeHtml(APP_TITLE)}</h1>
                <div class="tag">pray • learn • walk in the Light</div>
              </div>
            </div>

            <div class="actions">
              <div class="pill">${escapeHtml(accountLabel)}</div>

              <select id="langSel" class="field" style="min-width:160px; flex:0;">
                <option value="en" ${state.lang === "en" ? "selected" : ""}>English</option>
                <option value="es" ${state.lang === "es" ? "selected" : ""}>Español</option>
              </select>

              <select id="voiceSel" class="field" style="min-width:260px; flex:0;">
                ${voiceOptionsHtml}
              </select>

              <button id="stopSpeakBtn" class="btn btnDanger">Stop</button>
            </div>
          </div>

          <div class="main">
            <div class="tabs">
              <div class="tab ${state.tab === "chat" ? "active" : ""}" data-tab="chat">Chat</div>
              <div class="tab ${state.tab === "bible" ? "active" : ""}" data-tab="bible">Read Bible</div>
              <div class="tab ${state.tab === "devotional" ? "active" : ""}" data-tab="devotional">Devotional</div>
              <div class="tab ${state.tab === "prayer" ? "active" : ""}" data-tab="prayer">Daily Prayer</div>
            </div>

            <div class="grid">
              ${contentHtml}
              ${renderSavedSide()}
            </div>

            <div class="divider"></div>
            <div class="hint">${escapeHtml(bibleStatusLine)}</div>
          </div>
        </div>
      </div>
    `;

    // Wire global events
    document.querySelectorAll(".tab").forEach(el => {
      el.addEventListener("click", () => setTab(el.getAttribute("data-tab")));
    });

    $("#langSel").addEventListener("change", (e) => setLang(e.target.value));

    $("#voiceSel").addEventListener("click", () => {
      // some browsers populate voices after user interaction
      refreshVoices();
    });

    $("#voiceSel").addEventListener("change", (e) => {
      const name = e.target.value || null;
      if (state.lang === "es") state.voiceSelected.es = name;
      else state.voiceSelected.en = name;
      render();
    });

    $("#stopSpeakBtn").addEventListener("click", stopSpeaking);

    wireContentEvents();

    saveLS("alyana_devotional_draft", state.devotional.userText);
    saveLS("alyana_prayer_draft", state.prayer.userText);
  }

  function renderSavedSide() {
    if (state.tab === "chat") {
      return `
        <div class="card">
          <h2>Saved Chats</h2>
          <div class="sub">Stored on this device (localStorage).</div>
          <div class="hint">Messages: ${state.chat.messages.length}</div>
          <div class="divider"></div>
          <button id="clearChatBtn" class="btn btnDanger">Clear chat</button>
        </div>
      `;
    }

    if (state.tab === "bible") {
      const h = state.bible.health;
      const line = h?.status === "ok"
        ? `Health: ok • verses: ${h.verse_count ?? "?"}`
        : h?.detail
          ? `Health: error • ${h.detail}`
          : "Health: checking…";

      return `
        <div class="card">
          <h2>Status</h2>
          <div class="sub">Bible database connection.</div>
          <div class="hint">${escapeHtml(line)}</div>
          ${h?.status === "ok" ? `<div class="ok" style="margin-top:10px;">DB OK • verses: ${escapeHtml(h.verse_count ?? "?")}</div>` : ""}
          ${h?.status === "error" ? `<div class="error" style="margin-top:10px;">${escapeHtml(h.detail || "Bible DB error")}</div>` : ""}
        </div>
      `;
    }

    if (state.tab === "devotional") {
      return `
        <div class="card">
          <h2>Saved Devotionals</h2>
          <div class="sub">Load or review saved entries.</div>
          <div class="kpi">
            <div class="pill">Streak: <strong>${state.devotional.streak?.count || 0}</strong></div>
            <div class="pill">Total: <strong>${state.devotional.saved.length}</strong></div>
          </div>
          <div class="divider"></div>
          <div class="list">
            ${
              state.devotional.saved.length
                ? state.devotional.saved.slice(0, 20).map(e => `
                    <div class="item">
                      <div class="meta">${escapeHtml(e.date)} • ${escapeHtml(e.lang)}</div>
                      <div class="text">${escapeHtml(e.text)}</div>
                    </div>
                  `).join("")
                : `<div class="hint">No saved devotionals yet.</div>`
            }
          </div>
          <div class="divider"></div>
          <button id="clearDevBtn" class="btn btnDanger">Clear saved devotionals</button>
        </div>
      `;
    }

    if (state.tab === "prayer") {
      return `
        <div class="card">
          <h2>Saved Prayers</h2>
          <div class="sub">Load or review saved entries.</div>
          <div class="kpi">
            <div class="pill">Streak: <strong>${state.prayer.streak?.count || 0}</strong></div>
            <div class="pill">Total: <strong>${state.prayer.saved.length}</strong></div>
          </div>
          <div class="divider"></div>
          <div class="list">
            ${
              state.prayer.saved.length
                ? state.prayer.saved.slice(0, 20).map(e => `
                    <div class="item">
                      <div class="meta">${escapeHtml(e.date)} • ${escapeHtml(e.lang)}</div>
                      <div class="text">${escapeHtml(e.text)}</div>
                    </div>
                  `).join("")
                : `<div class="hint">No saved prayers yet.</div>`
            }
          </div>
          <div class="divider"></div>
          <button id="clearPrayerBtn" class="btn btnDanger">Clear saved prayers</button>
        </div>
      `;
    }

    return `<div class="card"></div>`;
  }

  function renderChat() {
    const listenText = lastAssistantMessage();
    return `
      <div class="card">
        <h2>Chat</h2>
        <div class="sub">Chat + voice. AI replies follow the language selector.</div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">Language: <strong>${state.lang === "es" ? "Español" : "English"}</strong></div>
          <div class="row">
            <button id="listenChatBtn" class="btn btnAccent miniBtn" ${listenText ? "" : "disabled"}>Listen (last reply)</button>
          </div>
        </div>

        <div class="divider"></div>

        <div id="chatScroll" class="scroll">
          ${(state.chat.messages || []).map(m => `
            <div class="bubbleRow ${m.role}">
              <div class="bubble ${m.role === "user" ? "user" : ""}">
                ${escapeHtml(m.text)}
              </div>
            </div>
          `).join("")}
        </div>

        ${state.chat.error ? `<div class="error">${escapeHtml(state.chat.error)}</div>` : ""}

        <div class="divider"></div>

        <div class="row">
          <input id="chatInput" class="field" placeholder="${state.lang === "es" ? "Pide una oración, un versículo, o “versículos sobre perdón”…" : "Ask for a prayer, verse, or 'verses about forgiveness'..."}" />
          <button id="sendChatBtn" class="btn btnAccent" ${state.chat.sending ? "disabled" : ""}>
            ${state.chat.sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    `;
  }

  function renderBible() {
    const books = state.bible.books || [];
    const bookOptions = books.length
      ? books.map(b => `<option value="${escapeHtml(b.name)}" ${b.name === state.bible.book ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("")
      : `<option value="${escapeHtml(state.bible.book)}">${escapeHtml(state.bible.book)}</option>`;

    const chapters = state.bible.chapters && state.bible.chapters.length ? state.bible.chapters : Array.from({ length: 150 }, (_, i) => i + 1);
    const chapterOptions = chapters
      .map(n => `<option value="${n}" ${n === Number(state.bible.chapter) ? "selected" : ""}>Chapter ${n}</option>`)
      .join("");

    const loadedHint = state.bible.loading
      ? (state.lang === "es" ? "Cargando..." : "Loading...")
      : (state.bible.text ? (state.lang === "es" ? "Listo." : "Loaded.") : (state.lang === "es" ? "Elige un libro y capítulo." : "Select a book and chapter."));

    return `
      <div class="card">
        <h2>${state.lang === "es" ? "Leer Biblia" : "Read Bible"}</h2>
        <div class="sub">${state.lang === "es" ? "Carga un capítulo o pasaje. 'Escuchar' lee el texto cargado." : "Load a chapter or passage. Listen reads the loaded text."}</div>

        <div class="row">
          <select id="bookSel" class="field">${bookOptions}</select>
          <select id="chapterSel" class="field">${chapterOptions}</select>
          <button id="loadChapterBtn" class="btn btnAccent">${state.lang === "es" ? "Cargar capítulo" : "Load chapter"}</button>
        </div>

        <div class="row" style="margin-top:10px;">
          <input id="startVerse" class="field" placeholder="${state.lang === "es" ? "Verso inicial (opcional)" : "Start verse (optional)"}" value="${escapeHtml(state.bible.startVerse)}" ${state.bible.fullChapter ? "disabled" : ""} />
          <input id="endVerse" class="field" placeholder="${state.lang === "es" ? "Verso final (opcional)" : "End verse (optional)"}" value="${escapeHtml(state.bible.endVerse)}" ${state.bible.fullChapter ? "disabled" : ""} />
          <button id="loadPassageBtn" class="btn">${state.lang === "es" ? "Cargar pasaje" : "Load passage"}</button>
          <label class="checkRow">
            <input id="fullChapterChk" type="checkbox" ${state.bible.fullChapter ? "checked" : ""} />
            ${state.lang === "es" ? "Capítulo completo" : "Full chapter"}
          </label>
        </div>

        <div class="divider"></div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">${escapeHtml(loadedHint)}</div>
          <div class="row">
            <button id="listenBibleBtn" class="btn btnAccent miniBtn" ${state.bible.text ? "" : "disabled"}>${state.lang === "es" ? "Escuchar" : "Listen"}</button>
          </div>
        </div>

        ${state.bible.error ? `<div class="error">${escapeHtml(state.bible.error)}</div>` : ""}

        ${state.bible.reference ? `<div class="ok">${escapeHtml(state.bible.reference)}</div>` : ""}

        <div class="divider"></div>

        <div class="card" style="background:var(--card2);">
          <div class="hint">${state.lang === "es" ? "Texto" : "Text"}</div>
          <div style="white-space:pre-wrap; line-height:1.45; font-size:13px;">${escapeHtml(state.bible.text || "")}</div>
        </div>

        ${
          state.lang === "es"
            ? `<div class="hint" style="margin-top:10px;">
                 Nota: tu <strong>bible.db</strong> actual parece ser inglés (KJV). Para mostrar Biblia en español dentro de “Read Bible”, el servidor necesita una base local en español (otro .db) y que el backend permita elegir versión.
               </div>`
            : `<div class="hint" style="margin-top:10px;">
                 Note: your current <strong>bible.db</strong> appears to be English (KJV). To show Spanish Bible text inside “Read Bible”, the server needs a Spanish local DB (another .db) and backend support to switch versions.
               </div>`
        }
      </div>
    `;
  }

  function devotionalCopy() {
    if (state.lang === "es") {
      return {
        title: "Devocional",
        desc: "Un devocional breve para reflexionar y aplicar la Palabra hoy.",
        prompt: "Escribe tu reflexión devocional aquí…",
      };
    }
    return {
      title: "Devotional",
      desc: "A short devotional to help you reflect and apply Scripture today.",
      prompt: "Write your devotional reflection here…",
    };
  }

  function prayerCopy() {
    if (state.lang === "es") {
      return {
        title: "Oración Diaria",
        desc: "Guía breve para tu oración ACTS (Adoración, Confesión, Gratitud, Súplica).",
        prompt: "Escribe tu oración aquí…",
      };
    }
    return {
      title: "Daily Prayer",
      desc: "A short guide to write your ACTS prayer (Adoration, Confession, Thanksgiving, Supplication).",
      prompt: "Write your prayer here…",
    };
  }

  function renderDevotional() {
    const c = devotionalCopy();
    const s = state.devotional.suggestionObj;

    return `
      <div class="card">
        <h2>${escapeHtml(c.title)}</h2>
        <div class="sub">${escapeHtml(c.desc)}</div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">${state.lang === "es" ? "Opcional: Genera una sugerencia (en el idioma seleccionado)." : "Optional: generate a suggestion (in the selected language)."}</div>
          <button id="genDevBtn" class="btn btnAccent" ${state.devotional.loading ? "disabled" : ""}>
            ${state.devotional.loading ? (state.lang === "es" ? "Generando..." : "Generating...") : (state.lang === "es" ? "Generar" : "Generate")}
          </button>
        </div>

        ${state.devotional.error ? `<div class="error">${escapeHtml(state.devotional.error)}</div>` : ""}

        ${
          s
            ? `<div class="card" style="background:var(--card2); margin-top:10px;">
                 <div class="hint">${state.lang === "es" ? "Sugerencia de Alyana" : "Alyana suggestion"}</div>
                 <div style="white-space:pre-wrap; font-size:13px; line-height:1.45;">
                   <strong>${escapeHtml(s.scripture)}</strong>\n\n${escapeHtml(s.brief_explanation)}
                 </div>
               </div>`
            : (state.devotional.suggestionRaw
                ? `<div class="card" style="background:var(--card2); margin-top:10px;">
                     <div class="hint">${state.lang === "es" ? "Sugerencia (raw)" : "Suggestion (raw)"}</div>
                     <div style="white-space:pre-wrap; font-size:13px; line-height:1.45;">${escapeHtml(state.devotional.suggestionRaw)}</div>
                   </div>`
                : "")
        }

        <div class="divider"></div>

        <textarea id="devText" class="field" placeholder="${escapeHtml(c.prompt)}">${escapeHtml(state.devotional.userText || "")}</textarea>

        <div class="row" style="justify-content:space-between; margin-top:10px;">
          <div class="kpi">
            <div class="pill">Streak: <strong>${state.devotional.streak?.count || 0}</strong></div>
          </div>
          <button id="saveDevBtn" class="btn btnAccent">${state.lang === "es" ? "Guardar" : "Save"}</button>
        </div>
      </div>
    `;
  }

  function renderPrayer() {
    const c = prayerCopy();
    const s = state.prayer.suggestionObj;

    return `
      <div class="card">
        <h2>${escapeHtml(c.title)}</h2>
        <div class="sub">${escapeHtml(c.desc)}</div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">${state.lang === "es" ? "Opcional: Genera starters (en el idioma seleccionado)." : "Optional: generate starters (in the selected language)."}</div>
          <button id="genPrayerBtn" class="btn btnAccent" ${state.prayer.loading ? "disabled" : ""}>
            ${state.prayer.loading ? (state.lang === "es" ? "Generando..." : "Generating...") : (state.lang === "es" ? "Generar" : "Generate")}
          </button>
        </div>

        ${state.prayer.error ? `<div class="error">${escapeHtml(state.prayer.error)}</div>` : ""}

        ${
          s
            ? `<div class="card" style="background:var(--card2); margin-top:10px;">
                 <div class="hint">${state.lang === "es" ? "Starters de Alyana" : "Alyana starters"}</div>
                 <div style="white-space:pre-wrap; font-size:13px; line-height:1.45;">
                   <strong>${state.lang === "es" ? "Adoración" : "Adoration"}:</strong> ${escapeHtml(s.example_adoration)}\n
                   <strong>${state.lang === "es" ? "Confesión" : "Confession"}:</strong> ${escapeHtml(s.example_confession)}\n
                   <strong>${state.lang === "es" ? "Gratitud" : "Thanksgiving"}:</strong> ${escapeHtml(s.example_thanksgiving)}\n
                   <strong>${state.lang === "es" ? "Súplica" : "Supplication"}:</strong> ${escapeHtml(s.example_supplication)}
                 </div>
               </div>`
            : (state.prayer.suggestionRaw
                ? `<div class="card" style="background:var(--card2); margin-top:10px;">
                     <div class="hint">${state.lang === "es" ? "Starters (raw)" : "Starters (raw)"}</div>
                     <div style="white-space:pre-wrap; font-size:13px; line-height:1.45;">${escapeHtml(state.prayer.suggestionRaw)}</div>
                   </div>`
                : "")
        }

        <div class="divider"></div>

        <textarea id="prayText" class="field" placeholder="${escapeHtml(c.prompt)}">${escapeHtml(state.prayer.userText || "")}</textarea>

        <div class="row" style="justify-content:space-between; margin-top:10px;">
          <div class="kpi">
            <div class="pill">Streak: <strong>${state.prayer.streak?.count || 0}</strong></div>
          </div>
          <button id="savePrayerBtn" class="btn btnAccent">${state.lang === "es" ? "Guardar" : "Save"}</button>
        </div>
      </div>
    `;
  }

  function wireContentEvents() {
    // Chat
    if (state.tab === "chat") {
      const sendBtn = $("#sendChatBtn");
      const input = $("#chatInput");
      if (sendBtn) sendBtn.addEventListener("click", sendChat);
      if (input) input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendChat();
      });

      const listenChatBtn = $("#listenChatBtn");
      if (listenChatBtn) listenChatBtn.addEventListener("click", () => {
        const t = lastAssistantMessage();
        if (t) speak(t);
      });

      const clearBtn = $("#clearChatBtn");
      if (clearBtn) clearBtn.addEventListener("click", () => {
        state.chat.messages = [];
        saveLS("alyana_chat_messages", state.chat.messages);
        render();
      });

      const el = $("#chatScroll");
      if (el) el.scrollTop = el.scrollHeight;
    }

    // Bible
    if (state.tab === "bible") {
      const bookSel = $("#bookSel");
      const chapterSel = $("#chapterSel");
      const startVerse = $("#startVerse");
      const endVerse = $("#endVerse");
      const fullChk = $("#fullChapterChk");

      if (bookSel) bookSel.addEventListener("change", async (e) => {
        state.bible.book = e.target.value;
        state.bible.chapter = 1;
        state.bible.text = "";
        state.bible.reference = "";
        state.bible.error = null;
        render();
        await loadChapters(state.bible.book);
      });

      if (chapterSel) chapterSel.addEventListener("change", (e) => {
        state.bible.chapter = Number(e.target.value);
      });

      if (fullChk) fullChk.addEventListener("change", (e) => {
        state.bible.fullChapter = !!e.target.checked;
        render();
      });

      if (startVerse) startVerse.addEventListener("input", (e) => {
        state.bible.startVerse = e.target.value;
      });

      if (endVerse) endVerse.addEventListener("input", (e) => {
        state.bible.endVerse = e.target.value;
      });

      const loadChapterBtn = $("#loadChapterBtn");
      if (loadChapterBtn) loadChapterBtn.addEventListener("click", () => {
        loadBiblePassage({
          book: state.bible.book,
          chapter: state.bible.chapter,
          fullChapter: true,
          start: "1",
          end: "",
        });
      });

      const loadPassageBtn = $("#loadPassageBtn");
      if (loadPassageBtn) loadPassageBtn.addEventListener("click", () => {
        const start = String(state.bible.startVerse || "1").trim();
        const end = String(state.bible.endVerse || "").trim();

        loadBiblePassage({
          book: state.bible.book,
          chapter: state.bible.chapter,
          fullChapter: !!state.bible.fullChapter,
          start,
          end,
        });
      });

      const listenBibleBtn = $("#listenBibleBtn");
      if (listenBibleBtn) listenBibleBtn.addEventListener("click", () => {
        if (state.bible.text) speak(state.bible.text);
      });
    }

    // Devotional
    if (state.tab === "devotional") {
      const devText = $("#devText");
      if (devText) devText.addEventListener("input", (e) => {
        state.devotional.userText = e.target.value;
        saveLS("alyana_devotional_draft", state.devotional.userText);
      });

      const genBtn = $("#genDevBtn");
      if (genBtn) genBtn.addEventListener("click", generateDevotionalSuggestion);

      const saveBtn = $("#saveDevBtn");
      if (saveBtn) saveBtn.addEventListener("click", saveDevotionalEntry);

      const clearBtn = $("#clearDevBtn");
      if (clearBtn) clearBtn.addEventListener("click", () => {
        state.devotional.saved = [];
        saveLS("alyana_devotional_saved", state.devotional.saved);
        state.devotional.streak = { count: 0, lastDate: null };
        saveLS("alyana_devotional_streak", state.devotional.streak);
        render();
      });
    }

    // Prayer
    if (state.tab === "prayer") {
      const prayText = $("#prayText");
      if (prayText) prayText.addEventListener("input", (e) => {
        state.prayer.userText = e.target.value;
        saveLS("alyana_prayer_draft", state.prayer.userText);
      });

      const genBtn = $("#genPrayerBtn");
      if (genBtn) genBtn.addEventListener("click", generatePrayerSuggestion);

      const saveBtn = $("#savePrayerBtn");
      if (saveBtn) saveBtn.addEventListener("click", savePrayerEntry);

      const clearBtn = $("#clearPrayerBtn");
      if (clearBtn) clearBtn.addEventListener("click", () => {
        state.prayer.saved = [];
        saveLS("alyana_prayer_saved", state.prayer.saved);
        state.prayer.streak = { count: 0, lastDate: null };
        saveLS("alyana_prayer_streak", state.prayer.streak);
        render();
      });
    }
  }

  // -----------------------------
  // INIT
  // -----------------------------
  async function init() {
    if (!document.querySelector("#app")) {
      const div = document.createElement("div");
      div.id = "app";
      document.body.appendChild(div);
    }

    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
      refreshVoices();
      setTimeout(refreshVoices, 400);
    }

    render();

    // backend checks
    loadAccount();
    loadBibleHealth();
    await loadBooks();

    // initialize book list + chapters
    if (state.bible.books && state.bible.books.length) {
      state.bible.book = state.bible.books[0].name || state.bible.book;
    }
    await loadChapters(state.bible.book);
  }

  init();
})();



















