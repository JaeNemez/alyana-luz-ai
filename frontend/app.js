/* frontend/app.js
   Alyana Luz • Bible AI
   - New layout + old color scheme
   - Chat bubbles + Listen
   - Read Bible + Listen
   - Language toggle + full voice dropdown (auto-pick Paulina + Spanish)
   - Devotional/Prayer guided UI + Save + Streak (localStorage)
*/

(() => {
  // -----------------------------
  // CONFIG
  // -----------------------------
  const APP_TITLE = "Alyana Luz • Bible AI";

  // Backend endpoints (adjust here if your server uses different routes)
  const API = {
    me: "/me",
    chat: "/chat",
    bibleStatus: "/bible/status",
    bibleBooks: "/bible/books",           // optional; if missing we fall back to a built-in list
    bibleChapters: "/bible/chapters",     // optional; expects ?book=Genesis -> {count: 50}
    bibleText: "/bible/text",             // optional; expects ?book=Genesis&chapter=1&start=&end=
    devotional: "/devotional",            // optional; expects POST {lang} -> {text}
    dailyPrayer: "/daily_prayer",         // optional; expects POST {lang} -> {text}
  };

  // -----------------------------
  // THEME (old-style colors)
  // -----------------------------
  const THEME = {
    bg1: "#2b0a50",               // purple
    bg2: "#0b1a3a",               // deep blue
    card: "rgba(9, 18, 43, 0.72)",
    card2: "rgba(9, 18, 43, 0.58)",
    border: "rgba(255,255,255,0.12)",
    text: "#e8eaf2",
    muted: "rgba(232,234,242,0.72)",
    accent: "#f59e0b",            // orange highlight
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
    voiceSelected: {
      en: null,
      es: null,
    },
    account: { status: "unknown", email: null },

    chat: {
      messages: loadLS("alyana_chat_messages", []),
      sending: false,
      error: null,
    },

    bible: {
      status: null,
      books: null,
      book: "Genesis",
      chapterCount: null,
      chapter: 1,
      startVerse: "",
      endVerse: "",
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
    return String(s)
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
    state.lang = lang;
    render();
  }

  // -----------------------------
  // TEXT TO SPEECH
  // -----------------------------
  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;

    const voices = window.speechSynthesis.getVoices() || [];
    state.voices = voices;

    // Auto-pick English: prefer Paulina if exists
    if (!state.voiceSelected.en) {
      const paulina = voices.find(v => (v.name || "").toLowerCase().includes("paulina") && (v.lang || "").toLowerCase().startsWith("en"));
      const anyEn = voices.find(v => (v.lang || "").toLowerCase().startsWith("en"));
      state.voiceSelected.en = (paulina || anyEn || null)?.name || null;
    }

    // Auto-pick Spanish: first es-
    if (!state.voiceSelected.es) {
      const anyEs = voices.find(v => (v.lang || "").toLowerCase().startsWith("es"));
      state.voiceSelected.es = (anyEs || null)?.name || null;
    }

    render(); // so dropdown populates
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
      // supports {email, active} or {status, email}
      const email = me?.email || me?.user?.email || null;
      const active = typeof me?.active === "boolean" ? me.active : (me?.status === "active");
      state.account = { status: active ? "active" : "error", email };
    } catch {
      state.account = { status: "error", email: null };
    }
    render();
  }

  async function loadBibleStatus() {
    try {
      state.bible.status = await apiFetch(API.bibleStatus, { method: "GET" });
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
      const data = await apiFetch(API.bibleBooks, { method: "GET" });
      // supports {books:[...]} or [...]
      state.bible.books = Array.isArray(data) ? data : (data?.books || null);
      if (!state.bible.books || !state.bible.books.length) throw new Error("No books list");
    } catch {
      state.bible.books = FALLBACK_BOOKS.slice();
    }
    render();
  }

  async function loadChapterCount(book) {
    state.bible.chapterCount = null;
    try {
      const data = await apiFetch(`${API.bibleChapters}?book=${encodeURIComponent(book)}`, { method: "GET" });
      const count = data?.count || data?.chapters || data?.chapter_count || null;
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
      // Prefer structured endpoint if exists
      const qs =
        `book=${encodeURIComponent(book)}` +
        `&chapter=${encodeURIComponent(chapter)}` +
        `&start=${encodeURIComponent(startVerse || "")}` +
        `&end=${encodeURIComponent(endVerse || "")}` +
        `&mode=${encodeURIComponent(mode || "")}`;

      const data = await apiFetch(`${API.bibleText}?${qs}`, { method: "GET" });

      // supports {text:"..."} or {verses:[...]} or plain string
      if (typeof data === "string") {
        state.bible.text = data;
      } else if (data?.text) {
        state.bible.text = data.text;
      } else if (Array.isArray(data?.verses)) {
        state.bible.text = data.verses.map(v => v.text || v).join("\n");
      } else {
        state.bible.text = JSON.stringify(data, null, 2);
      }
    } catch (e) {
      state.bible.error =
        `Bible request failed: ${e.message}\n\n` +
        `If your backend uses a different route, tell me what URL works when you load a chapter, and I’ll match it.`;
    } finally {
      state.bible.loading = false;
      render();
    }
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
      state.devotional.suggestion = data?.text || data?.devotional || (typeof data === "string" ? data : JSON.stringify(data, null, 2));
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
      state.prayer.suggestion = data?.text || data?.prayer || (typeof data === "string" ? data : JSON.stringify(data, null, 2));
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

    if (st.lastDate === t) {
      // already saved today; keep streak
      return st;
    }

    if (!st.lastDate) {
      st.count = 1;
      st.lastDate = t;
      return st;
    }

    // compare lastDate to yesterday
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
      const data = await apiFetch(API.chat, {
        method: "POST",
        body: JSON.stringify({ message: text, lang: state.lang }),
      });

      const reply =
        data?.reply ||
        data?.text ||
        data?.message ||
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

      // scroll to bottom
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
      .wrap{
        max-width: 1100px;
        margin: 28px auto;
        padding: 0 16px;
      }
      .shell{
        border:1px solid var(--border);
        border-radius: 22px;
        background: rgba(0,0,0,0.22);
        backdrop-filter: blur(12px);
        box-shadow: 0 30px 90px rgba(0,0,0,0.45);
        overflow:hidden;
      }
      .topbar{
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding: 16px 18px;
        border-bottom:1px solid var(--border);
        background: rgba(0,0,0,0.16);
      }
      .brand{
        display:flex; gap:12px; align-items:center;
      }
      .logo{
        width:38px; height:38px;
        border-radius: 12px;
        background: rgba(255,255,255,0.10);
        border:1px solid var(--border);
        display:flex; align-items:center; justify-content:center;
        font-weight:800;
      }
      .brand h1{
        font-size: 16px;
        margin:0;
        line-height: 1.1;
      }
      .brand .tag{
        font-size: 12px;
        color: var(--muted);
        margin-top: 3px;
      }
      .actions{
        display:flex; gap:10px; align-items:center;
        flex-wrap: wrap;
      }
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
      .main{
        padding: 16px;
      }
      .tabs{
        display:flex;
        gap:10px;
        padding: 12px;
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
      .card h2{
        margin:0 0 6px 0;
        font-size: 16px;
      }
      .sub{
        color: var(--muted);
        font-size: 12px;
        margin-bottom: 10px;
      }
      .row{
        display:flex;
        gap:10px;
        align-items:center;
        flex-wrap: wrap;
      }
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
      textarea.field{
        min-height: 110px;
        resize: vertical;
      }
      .divider{
        height:1px; background: var(--border);
        margin: 12px 0;
      }
      .hint{
        font-size: 12px;
        color: var(--muted);
      }
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
      .bubbleRow{
        display:flex;
        margin: 10px 0;
      }
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
      .miniBtn{
        font-size: 12px;
        padding: 8px 10px;
        border-radius: 10px;
      }
      .kpi{
        display:flex; gap:10px; flex-wrap:wrap;
      }
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
      .item .meta{
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .item .text{
        font-size: 13px;
        white-space: pre-wrap;
      }
    `;
  }

  function render() {
    document.title = APP_TITLE;
    const root = $("#app") || document.body;

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
        ? `Bible DB: OK`
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
      // Some browsers populate voices only after user interaction
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

    // Always keep drafts stored
    saveLS("alyana_devotional_draft", state.devotional.userText);
    saveLS("alyana_prayer_draft", state.prayer.userText);
  }

  function renderSavedSide() {
    // right column: Saved Chats / Devotionals / Prayers depending on tab
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
      return `
        <div class="card">
          <h2>Saved</h2>
          <div class="sub">You can add save features here later if you want bookmarks.</div>
          <div class="hint">Bible status: ${escapeHtml(state.bible.status?.status || "unknown")}</div>
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
        <div class="sub">WhatsApp/iMessage style chat + voice.</div>

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
          <input id="chatInput" class="field" placeholder="Ask for a prayer, verse, or 'verses about forgiveness'..." />
          <button id="sendChatBtn" class="btn btnAccent">Send</button>
        </div>
      </div>
    `;
  }

  function renderBible() {
    const books = state.bible.books || FALLBACK_BOOKS;
    const bookOptions = books.map(b => `<option value="${escapeHtml(b)}" ${b === state.bible.book ? "selected" : ""}>${escapeHtml(b)}</option>`).join("");

    // If chapterCount known, build options; else 1..150 as safe max
    const maxCh = state.bible.chapterCount || 150;
    const chapterOptions = Array.from({ length: maxCh }, (_, i) => i + 1)
      .map(n => `<option value="${n}" ${n === Number(state.bible.chapter) ? "selected" : ""}>Chapter ${n}</option>`)
      .join("");

    return `
      <div class="card">
        <h2>Read Bible</h2>
        <div class="sub">Load a chapter or passage. Listen reads the loaded text.</div>

        <div class="row">
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
  }

  function devotionalCopy() {
    if (state.lang === "es") {
      return {
        title: "Devocional",
        desc: "Un devocional breve para ayudarte a reflexionar y aplicar la Palabra hoy.",
        example: "Ejemplo: “Hoy elijo perdonar y pedirle a Dios paciencia. Puedo dar un paso pequeño: enviar un mensaje de reconciliación.”",
        prompt: "Escribe tu reflexión devocional aquí…",
      };
    }
    return {
      title: "Devotional",
      desc: "A short devotional to help you reflect and apply Scripture today.",
      example: "Example: “Today I choose forgiveness and ask God for patience. My small step: reach out with kindness.”",
      prompt: "Write your devotional reflection here…",
    };
  }

  function prayerCopy() {
    if (state.lang === "es") {
      return {
        title: "Oración Diaria",
        desc: "Una guía breve para escribir tu oración (ACTS: Adoración, Confesión, Gratitud, Súplica).",
        example: "Ejemplo: “Señor, te adoro por tu fidelidad… Perdóname… Gracias por… Te pido que…”",
        prompt: "Escribe tu oración aquí…",
      };
    }
    return {
      title: "Daily Prayer",
      desc: "A short guide to write your prayer (ACTS: Adoration, Confession, Thanksgiving, Supplication).",
      example: "Example: “Lord, I adore You for… Forgive me for… Thank You for… I ask You for…”",
      prompt: "Write your prayer here…",
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
          <div class="hint">Optional: generate a devotional suggestion (then write your own below).</div>
          <button id="genDevBtn" class="btn btnAccent" ${state.devotional.loading ? "disabled" : ""}>
            ${state.devotional.loading ? "Generating..." : "Generate"}
          </button>
        </div>

        ${state.devotional.error ? `<div class="error">${escapeHtml(state.devotional.error)}</div>` : ""}

        ${
          state.devotional.suggestion
            ? `<div class="card" style="background:var(--card2); margin-top:10px;">
                 <div class="hint">Alyana suggestion</div>
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
          <button id="saveDevBtn" class="btn btnAccent">Save</button>
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
          <div class="hint">Optional: generate prayer starters (then write your own below).</div>
          <button id="genPrayerBtn" class="btn btnAccent" ${state.prayer.loading ? "disabled" : ""}>
            ${state.prayer.loading ? "Generating..." : "Generate"}
          </button>
        </div>

        ${state.prayer.error ? `<div class="error">${escapeHtml(state.prayer.error)}</div>` : ""}

        ${
          state.prayer.suggestion
            ? `<div class="card" style="background:var(--card2); margin-top:10px;">
                 <div class="hint">Alyana starters</div>
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
          <button id="savePrayerBtn" class="btn btnAccent">Save</button>
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

      // Auto-scroll
      const el = $("#chatScroll");
      if (el) el.scrollTop = el.scrollHeight;
    }

    // Bible
    if (state.tab === "bible") {
      const bookSel = $("#bookSel");
      const chapterSel = $("#chapterSel");
      const startVerse = $("#startVerse");
      const endVerse = $("#endVerse");

      if (bookSel) bookSel.addEventListener("change", async (e) => {
        state.bible.book = e.target.value;
        state.bible.chapter = 1;
        state.bible.text = "";
        state.bible.error = null;
        render();
        await loadChapterCount(state.bible.book);
      });

      if (chapterSel) chapterSel.addEventListener("change", (e) => {
        state.bible.chapter = Number(e.target.value);
      });

      if (startVerse) startVerse.addEventListener("input", (e) => {
        state.bible.startVerse = e.target.value;
      });
      if (endVerse) endVerse.addEventListener("input", (e) => {
        state.bible.endVerse = e.target.value;
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
    // ensure container
    if (!document.querySelector("#app")) {
      const div = document.createElement("div");
      div.id = "app";
      document.body.appendChild(div);
    }

    // voices: some browsers require one extra tick to populate
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
      refreshVoices();
      // also refresh after a short delay
      setTimeout(refreshVoices, 400);
    }

    render();

    // backend checks (non-fatal)
    loadAccount();
    loadBibleStatus();
    loadBooksIfPossible().then(() => loadChapterCount(state.bible.book));
  }

  init();
})();















