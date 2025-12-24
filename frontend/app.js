/* frontend/app.js
   Alyana Luz • Bible AI
   - New layout + old color scheme
   - Chat bubbles + Listen
   - Read Bible + Listen
   - Language toggle + full voice dropdown
   - Devotional/Prayer guided UI + Save + Streak (localStorage)
   - FIXES:
     ✅ Spanish AI output everywhere: sends {lang} and server enforces language
     ✅ Devotional & Prayer: parses server {data/json} formats
     ✅ Bible versions (FREE, local DBs): dropdown + passes ?version=KJV/RVR1909
     ✅ Bible routes aligned with server.py: /bible/status, /bible/books, /bible/chapters, /bible/text, /bible/versions
*/

(() => {
  // -----------------------------
  // CONFIG
  // -----------------------------
  const APP_TITLE = "Alyana Luz • Bible AI";

  const API = {
    me: "/me",
    chat: "/chat",
    bibleStatus: "/bible/status",
    bibleBooks: "/bible/books",
    bibleChapters: "/bible/chapters",
    bibleText: "/bible/text",
    bibleVersions: "/bible/versions",
    devotional: "/devotional",
    dailyPrayer: "/daily_prayer",
  };

  // -----------------------------
  // THEME (old-style colors)
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
    lang: loadLS("alyana_lang", "en"), // "en" | "es"

    voices: [],
    voiceSelected: loadLS("alyana_voice_selected", { en: null, es: null }),

    account: { status: "unknown", email: null },

    chat: {
      messages: loadLS("alyana_chat_messages", []),
      sending: false,
      error: null,
    },

    bible: {
      // versions
      versions: null,        // from /bible/versions
      version: loadLS("alyana_bible_version", "KJV"),

      status: null,
      books: null,
      book: loadLS("alyana_bible_book", "Genesis"),
      chapterCount: null,
      chapter: Number(loadLS("alyana_bible_chapter", 1)) || 1,
      startVerse: loadLS("alyana_bible_start", ""),
      endVerse: loadLS("alyana_bible_end", ""),
      text: "",
      loading: false,
      error: null,
    },

    devotional: {
      suggestion: "",
      userText: loadLS("alyana_devotional_draft", ""),
      saved: loadLS("alyana_devotional_saved", []),
      streak: loadLS("alyana_devotional_streak", { count: 0, lastDate: null }),
      error: null,
      loading: false,
    },

    prayer: {
      suggestion: "",
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
      // if older saved values were plain strings
      try {
        const raw = localStorage.getItem(key);
        return raw ?? fallback;
      } catch {
        return fallback;
      }
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
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
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
    state.lang = lang;
    saveLS("alyana_lang", state.lang);
    render();
  }

  function setBibleVersion(v) {
    state.bible.version = v || "KJV";
    saveLS("alyana_bible_version", state.bible.version);

    // reset selection & reload related info
    state.bible.text = "";
    state.bible.error = null;
    state.bible.chapter = 1;
    saveLS("alyana_bible_chapter", state.bible.chapter);
    render();

    // reload everything for that version
    loadBibleStatus();
    loadBooksIfPossible().then(() => loadChapterCount(state.bible.book));
  }

  // -----------------------------
  // TEXT TO SPEECH
  // -----------------------------
  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;

    const voices = window.speechSynthesis.getVoices() || [];
    state.voices = voices;

    // Auto-pick English voice (if not set)
    if (!state.voiceSelected.en) {
      const anyEn = voices.find(v => (v.lang || "").toLowerCase().startsWith("en"));
      state.voiceSelected.en = (anyEn || null)?.name || null;
    }

    // Auto-pick Spanish voice (if not set)
    if (!state.voiceSelected.es) {
      const anyEs = voices.find(v => (v.lang || "").toLowerCase().startsWith("es"));
      state.voiceSelected.es = (anyEs || null)?.name || null;
    }

    saveLS("alyana_voice_selected", state.voiceSelected);
    render();
  }

  function getSelectedVoiceName() {
    return state.lang === "es" ? state.voiceSelected.es : state.voiceSelected.en;
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(String(text || ""));
    u.lang = state.lang === "es" ? "es-ES" : "en-US";

    const voiceName = getSelectedVoiceName();
    const voice = state.voices.find(v => v.name === voiceName);
    if (voice) u.voice = voice;

    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
  }

  // -----------------------------
  // DATA LOADERS
  // -----------------------------
  async function loadAccount() {
    try {
      const me = await apiFetch(API.me, { method: "GET" });
      const email = me?.email || me?.user?.email || null;
      const active = typeof me?.active === "boolean" ? me.active : (me?.status === "active");
      state.account = { status: active ? "active" : "error", email };
    } catch {
      state.account = { status: "error", email: null };
    }
    render();
  }

  async function loadBibleVersions() {
    try {
      const data = await apiFetch(API.bibleVersions, { method: "GET" });
      // expected {versions:[{code,label,exists}], default_db:"..."}
      state.bible.versions = data?.versions || null;

      // If saved version isn't available, fall back to first existing, else KJV.
      const existing = Array.isArray(state.bible.versions)
        ? state.bible.versions.filter(v => v && v.exists)
        : [];

      const saved = String(state.bible.version || "KJV").toUpperCase();
      const stillExists = existing.some(v => String(v.code).toUpperCase() === saved);

      if (!stillExists) {
        const first = existing[0]?.code || "KJV";
        state.bible.version = first;
        saveLS("alyana_bible_version", state.bible.version);
      }
    } catch {
      state.bible.versions = null;
    }
    render();
  }

  async function loadBibleStatus() {
    try {
      const v = encodeURIComponent(state.bible.version || "KJV");
      state.bible.status = await apiFetch(`${API.bibleStatus}?version=${v}`, { method: "GET" });
    } catch (e) {
      state.bible.status = { status: "error", detail: e.message };
    }
    render();
  }

  const FALLBACK_BOOKS = [
    "Genesis","Exodus","Leviticus","Numbers","Deuteronomy",
    "Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings",
    "1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms",
    "Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations",
    "Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum",
    "Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
    "Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians",
    "Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians",
    "1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter",
    "1 John","2 John","3 John","Jude","Revelation"
  ];

  async function loadBooksIfPossible() {
    try {
      const v = encodeURIComponent(state.bible.version || "KJV");
      const data = await apiFetch(`${API.bibleBooks}?version=${v}`, { method: "GET" });

      // server returns {version, books:[{id,name,...}]}
      const arr = data?.books || (Array.isArray(data) ? data : null);

      // normalize to string list of names for dropdown
      const names = Array.isArray(arr)
        ? arr.map(x => (typeof x === "string" ? x : (x?.name || ""))).filter(Boolean)
        : null;

      state.bible.books = (names && names.length) ? names : FALLBACK_BOOKS.slice();

      // keep current book if present; else pick first
      if (!state.bible.books.includes(state.bible.book)) {
        state.bible.book = state.bible.books[0] || "Genesis";
        saveLS("alyana_bible_book", state.bible.book);
      }
    } catch {
      state.bible.books = FALLBACK_BOOKS.slice();
    }
    render();
  }

  async function loadChapterCount(book) {
    state.bible.chapterCount = null;
    try {
      const v = encodeURIComponent(state.bible.version || "KJV");
      const data = await apiFetch(
        `${API.bibleChapters}?version=${v}&book=${encodeURIComponent(book)}`,
        { method: "GET" }
      );

      // server returns {chapters:[...], count:maxChapter}
      const count = data?.count || (Array.isArray(data?.chapters) ? Math.max(...data.chapters) : null);
      state.bible.chapterCount = Number(count) || null;
    } catch {
      state.bible.chapterCount = null;
    }
    render();
  }

  async function loadBibleText({ book, chapter, startVerse, endVerse, mode }) {
    state.bible.loading = true;
    state.bible.error = null;
    state.bible.text = "";
    render();

    try {
      const v = encodeURIComponent(state.bible.version || "KJV");
      const qs =
        `version=${v}` +
        `&book=${encodeURIComponent(book)}` +
        `&chapter=${encodeURIComponent(chapter)}` +
        `&start=${encodeURIComponent(startVerse || "")}` +
        `&end=${encodeURIComponent(endVerse || "")}` +
        `&mode=${encodeURIComponent(mode || "")}`;

      const data = await apiFetch(`${API.bibleText}?${qs}`, { method: "GET" });

      // server returns {reference, text, version}
      if (typeof data === "string") {
        state.bible.text = data;
      } else if (data?.text) {
        const ref = data?.reference ? `${data.reference}\n\n` : "";
        state.bible.text = ref + data.text;
      } else {
        state.bible.text = JSON.stringify(data, null, 2);
      }
    } catch (e) {
      state.bible.error =
        `Bible request failed: ${e.message}\n\n` +
        `Tip: make sure your server has /bible/text and the DB exists for version=${state.bible.version}.`;
    } finally {
      state.bible.loading = false;
      render();
    }
  }

  function formatDevotionalFromServer(data) {
    // server returns {data:{scripture, brief_explanation}} plus {json:"..."} as backup
    const obj = data?.data || safeJsonParse(data?.json || "");
    if (obj && (obj.scripture || obj.brief_explanation)) {
      const s1 = obj.scripture ? `📖 ${obj.scripture}` : "";
      const s2 = obj.brief_explanation ? `\n\n${obj.brief_explanation}` : "";
      return (s1 + s2).trim();
    }
    // fallback
    if (typeof data === "string") return data;
    if (data?.text) return data.text;
    if (data?.json) return data.json;
    return JSON.stringify(data, null, 2);
  }

  function formatPrayerFromServer(data) {
    const obj = data?.data || safeJsonParse(data?.json || "");
    if (obj && (obj.example_adoration || obj.example_confession || obj.example_thanksgiving || obj.example_supplication)) {
      const lines = [];
      if (obj.example_adoration) lines.push(`Adoration: ${obj.example_adoration}`);
      if (obj.example_confession) lines.push(`Confession: ${obj.example_confession}`);
      if (obj.example_thanksgiving) lines.push(`Thanksgiving: ${obj.example_thanksgiving}`);
      if (obj.example_supplication) lines.push(`Supplication: ${obj.example_supplication}`);
      return lines.join("\n");
    }
    if (typeof data === "string") return data;
    if (data?.text) return data.text;
    if (data?.json) return data.json;
    return JSON.stringify(data, null, 2);
  }

  async function generateDevotionalSuggestion() {
    state.devotional.loading = true;
    state.devotional.error = null;
    render();
    try {
      const data = await apiFetch(API.devotional, {
        method: "POST",
        body: JSON.stringify({ lang: state.lang }),
      });
      state.devotional.suggestion = formatDevotionalFromServer(data);
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
    render();
    try {
      const data = await apiFetch(API.dailyPrayer, {
        method: "POST",
        body: JSON.stringify({ lang: state.lang }),
      });
      state.prayer.suggestion = formatPrayerFromServer(data);
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
  // CHAT
  // -----------------------------
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
      // Server accepts {message, lang} OR {prompt, history}. We'll send message+lang (simple).
      const data = await apiFetch(API.chat, {
        method: "POST",
        body: JSON.stringify({ message: text, lang: state.lang }),
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
        padding: 10px 14px; border-radius: 999px;
        font-weight: 800; font-size: 13px;
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
        flex: 1; min-width: 160px;
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
      .scroll{ height: 360px; overflow:auto; padding-right: 6px; }
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
      .list{ display:flex; flex-direction: column; gap: 10px; max-height: 360px; overflow:auto; }
      .item{
        border:1px solid var(--border);
        border-radius: 14px;
        background: rgba(255,255,255,0.05);
        padding: 10px 12px;
      }
      .item .meta{ font-size: 12px; color: var(--muted); margin-bottom: 6px; }
      .item .text{ font-size: 13px; white-space: pre-wrap; }
    `;
  }

  function render() {
    document.title = APP_TITLE;

    // Ensure #app exists if index.html didn’t include it
    if (!$("#app")) {
      const div = document.createElement("div");
      div.id = "app";
      document.body.innerHTML = "";
      document.body.appendChild(div);
    }

    const accountLabel =
      state.account.status === "active"
        ? `Account: active (${state.account.email || "signed in"})`
        : "Account: error";

    const bibleStatusLine =
      state.bible.status?.status === "ok"
        ? `Bible DB: OK • verses: ${state.bible.status?.verse_count ?? "?"} • ${state.bible.status?.label || state.bible.version}`
        : state.bible.status?.status === "error"
          ? `Bible DB: error`
          : `Bible DB: checking`;

    const voiceOptionsHtml = state.voices.length
      ? state.voices
          .map(v => {
            const label = `${v.name} (${v.lang})`;
            const selected = v.name === getSelectedVoiceName() ? "selected" : "";
            return `<option value="${escapeHtml(v.name)}" ${selected}>${escapeHtml(label)}</option>`;
          })
          .join("")
      : `<option value="">(No voices found yet — click here again)</option>`;

    const langValue = state.lang;

    const versionOptionsHtml = (() => {
      const list = Array.isArray(state.bible.versions) ? state.bible.versions : null;
      if (!list || !list.length) {
        // fallback to KJV only
        return `<option value="KJV" selected>KJV</option>`;
      }
      return list.map(v => {
        const code = (v?.code || "KJV");
        const label = v?.label || code;
        const exists = !!v?.exists;
        const selected = String(code).toUpperCase() === String(state.bible.version).toUpperCase() ? "selected" : "";
        const suffix = exists ? "" : " (missing file)";
        return `<option value="${escapeHtml(code)}" ${selected}>${escapeHtml(label + suffix)}</option>`;
      }).join("");
    })();

    const contentHtml = (() => {
      if (state.tab === "chat") return renderChat();
      if (state.tab === "bible") return renderBible();
      if (state.tab === "devotional") return renderDevotional();
      if (state.tab === "prayer") return renderPrayer();
      return "";
    })();

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
                <option value="en" ${langValue === "en" ? "selected" : ""}>English</option>
                <option value="es" ${langValue === "es" ? "selected" : ""}>Español</option>
              </select>

              <select id="voiceSel" class="field" style="min-width:280px; flex:0;">
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

    // Wire events
    document.querySelectorAll(".tab").forEach(el => {
      el.addEventListener("click", () => setTab(el.getAttribute("data-tab")));
    });

    $("#langSel").addEventListener("change", (e) => setLang(e.target.value));

    $("#voiceSel").addEventListener("click", () => {
      refreshVoices();
    });

    $("#voiceSel").addEventListener("change", (e) => {
      const name = e.target.value || null;
      if (state.lang === "es") state.voiceSelected.es = name;
      else state.voiceSelected.en = name;
      saveLS("alyana_voice_selected", state.voiceSelected);
      render();
    });

    $("#stopSpeakBtn").addEventListener("click", stopSpeaking);

    wireContentEvents();

    // Always keep drafts stored
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
      const s = state.bible.status || {};
      const ok = s?.status === "ok";
      const title = "Status";
      const line1 = ok ? `Health: ok` : `Health: ${escapeHtml(s?.status || "unknown")}`;
      const line2 = ok
        ? `DB OK • verses: ${escapeHtml(String(s?.verse_count ?? "?"))}`
        : escapeHtml(s?.detail || "—");

      return `
        <div class="card">
          <h2>${title}</h2>
          <div class="sub">Bible database connection.</div>
          <div class="hint">${line1}</div>
          <div class="divider"></div>
          <div class="${ok ? "ok" : "error"}">${line2}</div>
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
        <div class="sub">Chat + voice. (AI language is forced by the server.)</div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">Language: <strong>${state.lang === "es" ? "Español" : "English"}</strong></div>
          <div class="row">
            <button id="listenChatBtn" class="btn btnAccent miniBtn" ${listenText ? "" : "disabled"}>Listen (last reply)</button>
          </div>
        </div>

        <div class="divider"></div>

        <div id="chatScroll" class="scroll">
          ${state.chat.messages.map(m => `
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
          <input id="chatInput" class="field" placeholder="${state.lang === "es" ? "Pide una oración, un versículo, o “versículos sobre el perdón”..." : "Ask for a prayer, verse, or 'verses about forgiveness'..."}" />
          <button id="sendChatBtn" class="btn btnAccent">Send</button>
        </div>
      </div>
    `;
  }

  function renderBible() {
    const books = state.bible.books || FALLBACK_BOOKS;
    const bookOptions = books
      .map(b => `<option value="${escapeHtml(b)}" ${b === state.bible.book ? "selected" : ""}>${escapeHtml(b)}</option>`)
      .join("");

    const maxCh = state.bible.chapterCount || 150;
    const chapterOptions = Array.from({ length: maxCh }, (_, i) => i + 1)
      .map(n => `<option value="${n}" ${n === Number(state.bible.chapter) ? "selected" : ""}>Chapter ${n}</option>`)
      .join("");

    return `
      <div class="card">
        <h2>Read Bible</h2>
        <div class="sub">Choose a local Bible version. Load chapter/passage. Listen reads the loaded text.</div>

        <div class="row">
          <select id="versionSel" class="field">${(state.bible.versions ? "" : "")}${versionOptionsHtml()}</select>
        </div>

        <div class="row" style="margin-top:10px;">
          <select id="bookSel" class="field">${bookOptions}</select>
          <select id="chapterSel" class="field">${chapterOptions}</select>
          <button id="loadChapterBtn" class="btn btnAccent">Load chapter</button>
        </div>

        <div class="row" style="margin-top:10px;">
          <input id="startVerse" class="field" placeholder="Start verse (optional)" value="${escapeHtml(state.bible.startVerse)}" />
          <input id="endVerse" class="field" placeholder="End verse (optional)" value="${escapeHtml(state.bible.endVerse)}" />
          <button id="loadPassageBtn" class="btn">Load passage</button>
        </div>

        <div class="divider"></div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">${state.bible.loading ? "Loading..." : (state.bible.text ? "Loaded." : "Select a book and chapter.")}</div>
          <div class="row">
            <button id="listenBibleBtn" class="btn btnAccent miniBtn" ${state.bible.text ? "" : "disabled"}>Listen</button>
          </div>
        </div>

        ${state.bible.error ? `<div class="error">${escapeHtml(state.bible.error)}</div>` : ""}

        <div class="divider"></div>

        <div class="card" style="background:var(--card2);">
          <div class="hint">Text</div>
          <div style="white-space:pre-wrap; line-height:1.45; font-size:13px;">${escapeHtml(state.bible.text || "")}</div>
        </div>
      </div>
    `;

    function versionOptionsHtml() {
      const list = Array.isArray(state.bible.versions) ? state.bible.versions : null;
      if (!list || !list.length) return `<option value="KJV" selected>KJV</option>`;
      return list.map(v => {
        const code = (v?.code || "KJV");
        const label = v?.label || code;
        const exists = !!v?.exists;
        const selected = String(code).toUpperCase() === String(state.bible.version).toUpperCase() ? "selected" : "";
        const suffix = exists ? "" : " (missing file)";
        return `<option value="${escapeHtml(code)}" ${selected}>${escapeHtml(label + suffix)}</option>`;
      }).join("");
    }
  }

  function devotionalCopy() {
    if (state.lang === "es") {
      return {
        title: "Devocional",
        desc: "Un devocional breve para ayudarte a reflexionar y aplicar la Palabra hoy.",
        example: "Ejemplo: “Hoy elijo perdonar y pedirle a Dios paciencia. Puedo dar un paso pequeño: enviar un mensaje de reconciliación.”",
        prompt: "Escribe tu reflexión devocional aquí…",
        genHint: "Opcional: genera una sugerencia (luego escribe la tuya abajo).",
      };
    }
    return {
      title: "Devotional",
      desc: "A short devotional to help you reflect and apply Scripture today.",
      example: "Example: “Today I choose forgiveness and ask God for patience. My small step: reach out with kindness.”",
      prompt: "Write your devotional reflection here…",
      genHint: "Optional: generate a suggestion (then write your own below).",
    };
  }

  function prayerCopy() {
    if (state.lang === "es") {
      return {
        title: "Oración Diaria",
        desc: "Una guía breve para escribir tu oración (ACTS: Adoración, Confesión, Gratitud, Súplica).",
        example: "Ejemplo: “Señor, te adoro por tu fidelidad… Perdóname… Gracias por… Te pido que…”",
        prompt: "Escribe tu oración aquí…",
        genHint: "Opcional: genera iniciadores (luego escribe la tuya abajo).",
      };
    }
    return {
      title: "Daily Prayer",
      desc: "A short guide to write your prayer (ACTS: Adoration, Confession, Thanksgiving, Supplication).",
      example: "Example: “Lord, I adore You for… Forgive me for… Thank You for… I ask You for…”",
      prompt: "Write your prayer here…",
      genHint: "Optional: generate starters (then write your own below).",
    };
  }

  function renderDevotional() {
    const c = devotionalCopy();
    return `
      <div class="card">
        <h2>${escapeHtml(c.title)}</h2>
        <div class="sub">${escapeHtml(c.desc)}</div>

        <div class="ok">${escapeHtml(c.example)}</div>

        <div class="divider"></div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">${escapeHtml(c.genHint)}</div>
          <button id="genDevBtn" class="btn btnAccent" ${state.devotional.loading ? "disabled" : ""}>
            ${state.devotional.loading ? (state.lang === "es" ? "Generando..." : "Generating...") : (state.lang === "es" ? "Generar" : "Generate")}
          </button>
        </div>

        ${state.devotional.error ? `<div class="error">${escapeHtml(state.devotional.error)}</div>` : ""}

        ${
          state.devotional.suggestion
            ? `<div class="card" style="background:var(--card2); margin-top:10px;">
                 <div class="hint">${escapeHtml(state.lang === "es" ? "Sugerencia de Alyana" : "Alyana suggestion")}</div>
                 <div style="white-space:pre-wrap; font-size:13px; line-height:1.45;">${escapeHtml(state.devotional.suggestion)}</div>
               </div>`
            : ""
        }

        <div class="divider"></div>

        <textarea id="devText" class="field" placeholder="${escapeHtml(c.prompt)}">${escapeHtml(state.devotional.userText || "")}</textarea>

        <div class="row" style="justify-content:space-between; margin-top:10px;">
          <div class="kpi">
            <div class="pill">Streak: <strong>${state.devotional.streak?.count || 0}</strong></div>
          </div>
          <button id="saveDevBtn" class="btn btnAccent">${escapeHtml(state.lang === "es" ? "Guardar" : "Save")}</button>
        </div>
      </div>
    `;
  }

  function renderPrayer() {
    const c = prayerCopy();
    return `
      <div class="card">
        <h2>${escapeHtml(c.title)}</h2>
        <div class="sub">${escapeHtml(c.desc)}</div>

        <div class="ok">${escapeHtml(c.example)}</div>

        <div class="divider"></div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">${escapeHtml(c.genHint)}</div>
          <button id="genPrayerBtn" class="btn btnAccent" ${state.prayer.loading ? "disabled" : ""}>
            ${state.prayer.loading ? (state.lang === "es" ? "Generando..." : "Generating...") : (state.lang === "es" ? "Generar" : "Generate")}
          </button>
        </div>

        ${state.prayer.error ? `<div class="error">${escapeHtml(state.prayer.error)}</div>` : ""}

        ${
          state.prayer.suggestion
            ? `<div class="card" style="background:var(--card2); margin-top:10px;">
                 <div class="hint">${escapeHtml(state.lang === "es" ? "Iniciadores de Alyana" : "Alyana starters")}</div>
                 <div style="white-space:pre-wrap; font-size:13px; line-height:1.45;">${escapeHtml(state.prayer.suggestion)}</div>
               </div>`
            : ""
        }

        <div class="divider"></div>

        <textarea id="prayText" class="field" placeholder="${escapeHtml(c.prompt)}">${escapeHtml(state.prayer.userText || "")}</textarea>

        <div class="row" style="justify-content:space-between; margin-top:10px;">
          <div class="kpi">
            <div class="pill">Streak: <strong>${state.prayer.streak?.count || 0}</strong></div>
          </div>
          <button id="savePrayerBtn" class="btn btnAccent">${escapeHtml(state.lang === "es" ? "Guardar" : "Save")}</button>
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
      const versionSel = $("#versionSel");
      const bookSel = $("#bookSel");
      const chapterSel = $("#chapterSel");
      const startVerse = $("#startVerse");
      const endVerse = $("#endVerse");

      if (versionSel) versionSel.addEventListener("change", async (e) => {
        const v = e.target.value || "KJV";
        setBibleVersion(v);
      });

      if (bookSel) bookSel.addEventListener("change", async (e) => {
        state.bible.book = e.target.value;
        saveLS("alyana_bible_book", state.bible.book);

        state.bible.chapter = 1;
        saveLS("alyana_bible_chapter", state.bible.chapter);

        state.bible.text = "";
        state.bible.error = null;
        render();
        await loadChapterCount(state.bible.book);
      });

      if (chapterSel) chapterSel.addEventListener("change", (e) => {
        state.bible.chapter = Number(e.target.value);
        saveLS("alyana_bible_chapter", state.bible.chapter);
      });

      if (startVerse) startVerse.addEventListener("input", (e) => {
        state.bible.startVerse = e.target.value;
        saveLS("alyana_bible_start", state.bible.startVerse);
      });
      if (endVerse) endVerse.addEventListener("input", (e) => {
        state.bible.endVerse = e.target.value;
        saveLS("alyana_bible_end", state.bible.endVerse);
      });

      const loadChapterBtn = $("#loadChapterBtn");
      if (loadChapterBtn) loadChapterBtn.addEventListener("click", () => {
        loadBibleText({
          book: state.bible.book,
          chapter: state.bible.chapter,
          startVerse: "",
          endVerse: "",
          mode: "chapter",
        });
      });

      const loadPassageBtn = $("#loadPassageBtn");
      if (loadPassageBtn) loadPassageBtn.addEventListener("click", () => {
        loadBibleText({
          book: state.bible.book,
          chapter: state.bible.chapter,
          startVerse: state.bible.startVerse,
          endVerse: state.bible.endVerse,
          mode: "passage",
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
  function init() {
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

    // backend checks (non-fatal)
    loadAccount();
    loadBibleVersions().then(() => {
      loadBibleStatus();
      loadBooksIfPossible().then(() => loadChapterCount(state.bible.book));
    });
  }

  init();
})();

















