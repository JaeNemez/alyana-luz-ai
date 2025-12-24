/* frontend/app.js
   Alyana Luz • Bible AI

   Update: Daily Prayer now uses ACTS sections:
   - Adoration, Confession, Thanksgiving, Supplication (+ Notes)
   - Alyana generates short starters for each section
   - User writes real prayer in each section
   - Save combines sections into one saved entry + streak
*/

(() => {
  // -----------------------------
  // CONFIG
  // -----------------------------
  const APP_TITLE = "Alyana Luz • Bible AI";

  const API = {
    me: "/me",
    chat: "/chat",
    devotional: "/devotional",
    dailyPrayer: "/daily_prayer",

    bibleStatus: "/bible/status",
    bibleBooks: "/bible/books",
    bibleChapters: "/bible/chapters",
    bibleText: "/bible/text",
  };

  // -----------------------------
  // THEME (kept)
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

  function languageInstruction() {
    return state.lang === "es"
      ? "IMPORTANT: Reply only in Spanish."
      : "IMPORTANT: Reply only in English.";
  }

  function bibleVersionForLang() {
    return state.lang === "es" ? "rvr1909" : "en_default";
  }

  // -----------------------------
  // DAILY PRAYER PARSING
  // -----------------------------
  // We accept a single text blob (like your screenshot) and extract ACTS starters.
  function normalizeLine(s) {
    return String(s || "")
      .replace(/\u2014/g, "-")
      .replace(/\u2013/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripLabelPrefix(line) {
    // Remove bullets like "- " or "— " and label prefixes "Acknowledgment:" etc.
    let s = normalizeLine(line);
    s = s.replace(/^[-•\u2014]\s*/, "");
    return s.trim();
  }

  function parsePrayerStarterToACTS(text) {
    const out = {
      A: "",
      C: "",
      T: "",
      S: "",
    };

    const raw = String(text || "").trim();
    if (!raw) return out;

    // Split lines and try to map into A/C/T/S buckets.
    const lines = raw
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    // If first line is like "Heavenly Father," keep it as an Adoration starter seed.
    if (lines.length) {
      const first = normalizeLine(lines[0]);
      if (/father|lord|dios|padre/i.test(first) && first.length <= 40) {
        out.A = first;
      }
    }

    // bucket helpers
    const push = (key, value) => {
      const v = value.trim();
      if (!v) return;
      out[key] = out[key] ? `${out[key]}\n${v}` : v;
    };

    for (const l0 of lines) {
      const l = normalizeLine(l0);
      const lower = l.toLowerCase();

      // detect labels
      const hasA = /adoration|acknowledg|praise|who you are|santo|alaban|reverenc/i.test(lower);
      const hasC = /confess|confession|forgive|fallen short|perd[oó]n|confies/i.test(lower);
      const hasT = /thank|gratitude|thanksgiving|grateful|gracias|agradec/i.test(lower);
      const hasS = /supplication|petition|request|intercession|bless|help|grant|give me|protection|guide|wisdom|strength|peace|interces/i.test(lower);

      // Also: if the line begins with "— Acknowledgment:" etc.
      const cleaned = stripLabelPrefix(l0).replace(/^(Acknowledg(e)?ment|Adoration)\s*:\s*/i, "").trim();
      const cleanedC = stripLabelPrefix(l0).replace(/^(Reflection\/Confession|Confession|Reflection)\s*:\s*/i, "").trim();
      const cleanedT = stripLabelPrefix(l0).replace(/^(Gratitude|Thanksgiving)\s*:\s*/i, "").trim();
      const cleanedS = stripLabelPrefix(l0).replace(/^(Petition|Requests|Intercession|Supplication|Surrender)\s*:\s*/i, "").trim();

      // Decide bucket
      if (/^(acknowledg(e)?ment|adoration)\s*:/i.test(stripLabelPrefix(l0))) push("A", cleaned);
      else if (/^(reflection\/confession|confession|reflection)\s*:/i.test(stripLabelPrefix(l0))) push("C", cleanedC);
      else if (/^(gratitude|thanksgiving)\s*:/i.test(stripLabelPrefix(l0))) push("T", cleanedT);
      else if (/^(petition|requests|intercession|supplication|surrender)\s*:/i.test(stripLabelPrefix(l0))) push("S", cleanedS);
      else if (hasC) push("C", stripLabelPrefix(l0));
      else if (hasT) push("T", stripLabelPrefix(l0));
      else if (hasA) push("A", stripLabelPrefix(l0));
      else if (hasS) push("S", stripLabelPrefix(l0));
    }

    // If we never got anything into A and we had a strong opening line, keep it.
    // Otherwise leave as-is.

    return out;
  }

  function defaultPrayerDraft() {
    // New structured draft object
    return { A: "", C: "", T: "", S: "", N: "" };
  }

  function migratePrayerDraftIfNeeded(rawDraft) {
    // Older versions stored a single string. Convert it into Notes (N).
    if (typeof rawDraft === "string") {
      const s = rawDraft.trim();
      const d = defaultPrayerDraft();
      d.N = s;
      return d;
    }
    if (!rawDraft || typeof rawDraft !== "object") return defaultPrayerDraft();

    // Ensure keys exist
    return {
      A: String(rawDraft.A || ""),
      C: String(rawDraft.C || ""),
      T: String(rawDraft.T || ""),
      S: String(rawDraft.S || ""),
      N: String(rawDraft.N || ""),
    };
  }

  function buildCombinedPrayerTextFromSections(sections, lang) {
    const isEs = lang === "es";
    const lines = [];

    const title = isEs ? "Oración (ACTS)" : "Prayer (ACTS)";
    lines.push(title);
    lines.push("");

    const add = (labelEn, labelEs, key) => {
      const v = String(sections[key] || "").trim();
      if (!v) return;
      lines.push(isEs ? labelEs : labelEn);
      lines.push(v);
      lines.push("");
    };

    add("Adoration:", "Adoración:", "A");
    add("Confession:", "Confesión:", "C");
    add("Thanksgiving:", "Acción de gracias:", "T");
    add("Supplication:", "Súplica:", "S");

    const notes = String(sections.N || "").trim();
    if (notes) {
      lines.push(isEs ? "Notas:" : "Notes:");
      lines.push(notes);
      lines.push("");
    }

    return lines.join("\n").trim();
  }

  // -----------------------------
  // STATE
  // -----------------------------
  const state = {
    tab: "chat",
    lang: "en",

    voices: [],
    voiceSelected: { en: null, es: null },

    account: { status: "unknown", email: null },

    chat: {
      messages: loadLS("alyana_chat_messages", []),
      sending: false,
      error: null,
    },

    bible: {
      status: null,
      books: [],
      bookId: 1,
      bookName: "Genesis",
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
      suggestionRaw: "",
      userText: loadLS("alyana_devotional_draft", ""),
      saved: loadLS("alyana_devotional_saved", []),
      streak: loadLS("alyana_devotional_streak", { count: 0, lastDate: null }),
      error: null,
      loading: false,
      autoLoadedOnce: false,
    },

    prayer: {
      suggestionRaw: "",
      starters: { A: "", C: "", T: "", S: "" }, // parsed starters
      userSections: migratePrayerDraftIfNeeded(loadLS("alyana_prayer_draft", defaultPrayerDraft())),
      saved: loadLS("alyana_prayer_saved", []),
      streak: loadLS("alyana_prayer_streak", { count: 0, lastDate: null }),
      error: null,
      loading: false,
      autoLoadedOnce: false,
    },
  };

  // -----------------------------
  // TAB / LANG
  // -----------------------------
  function setTab(tab) {
    state.tab = tab;

    if (tab === "prayer") autoLoadPrayerStarterIfEmpty();
    if (tab === "devotional") autoLoadDevotionalIfEmpty();

    render();
  }

  function setLang(lang) {
    state.lang = lang === "es" ? "es" : "en";

    refreshBibleForLanguage().catch(() => {});

    if (state.tab === "prayer") {
      state.prayer.suggestionRaw = "";
      state.prayer.starters = { A: "", C: "", T: "", S: "" };
      state.prayer.error = null;
      state.prayer.autoLoadedOnce = false;
      autoLoadPrayerStarterIfEmpty();
    }

    render();
  }

  // -----------------------------
  // TTS
  // -----------------------------
  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;

    const voices = window.speechSynthesis.getVoices() || [];
    state.voices = voices;

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
      state.account = { status: me?.ok ? "active" : "error", email: me?.email || null };
    } catch {
      state.account = { status: "error", email: null };
    }
    render();
  }

  async function loadBibleStatus() {
    try {
      const v = bibleVersionForLang();
      state.bible.status = await apiFetch(`${API.bibleStatus}?version=${encodeURIComponent(v)}`, { method: "GET" });
    } catch (e) {
      state.bible.status = { status: "error", detail: e.message };
    }
    render();
  }

  async function loadBooks() {
    try {
      const v = bibleVersionForLang();
      const data = await apiFetch(`${API.bibleBooks}?version=${encodeURIComponent(v)}`, { method: "GET" });

      const books = Array.isArray(data?.books) ? data.books : [];
      state.bible.books = books;

      if (books.length) {
        const stillThere = books.find(b => Number(b.id) === Number(state.bible.bookId));
        const pick = stillThere || books[0];
        state.bible.bookId = Number(pick.id);
        state.bible.bookName = String(pick.name);
      }
    } catch (e) {
      state.bible.books = [];
      state.bible.error = e.message;
    }
    render();
  }

  async function loadChapters(bookId) {
    try {
      const v = bibleVersionForLang();
      const data = await apiFetch(
        `${API.bibleChapters}?version=${encodeURIComponent(v)}&book_id=${encodeURIComponent(bookId)}`,
        { method: "GET" }
      );

      const chapters = Array.isArray(data?.chapters) ? data.chapters : [];
      state.bible.chapters = chapters;

      if (chapters.length) {
        state.bible.chapter = chapters.includes(1) ? 1 : Number(chapters[0]);
      }
    } catch (e) {
      state.bible.chapters = [];
      state.bible.error = e.message;
    }
    render();
  }

  async function loadBibleText({ bookId, chapter, fullChapter, startVerse, endVerse }) {
    state.bible.loading = true;
    state.bible.error = null;
    state.bible.text = "";
    state.bible.reference = "";
    render();

    try {
      const v = bibleVersionForLang();

      const params = new URLSearchParams();
      params.set("version", v);
      params.set("book_id", String(bookId));
      params.set("chapter", String(chapter));
      params.set("whole_chapter", fullChapter ? "true" : "false");

      if (!fullChapter) {
        const sv = String(startVerse || "").trim();
        const ev = String(endVerse || "").trim();
        if (sv) params.set("verse_start", sv);
        if (ev) params.set("verse_end", ev);
      }

      const data = await apiFetch(`${API.bibleText}?${params.toString()}`, { method: "GET" });

      const bookName = data?.book || state.bible.bookName;
      const verses = Array.isArray(data?.verses) ? data.verses : [];

      if (!verses.length) throw new Error("No verses returned");

      if (fullChapter) {
        state.bible.reference = `${bookName} ${chapter}`;
      } else {
        const vnums = verses.map(x => Number(x.verse)).filter(n => Number.isFinite(n));
        const minV = Math.min(...vnums);
        const maxV = Math.max(...vnums);
        state.bible.reference = `${bookName} ${chapter}:${minV}-${maxV}`;
      }

      state.bible.text = verses.map(vv => `${vv.verse}. ${vv.text}`).join("\n");
    } catch (e) {
      state.bible.error = e.message;
    } finally {
      state.bible.loading = false;
      render();
    }
  }

  async function refreshBibleForLanguage() {
    state.bible.text = "";
    state.bible.reference = "";
    state.bible.error = null;

    await loadBibleStatus();
    await loadBooks();

    if (state.bible.bookId) {
      await loadChapters(state.bible.bookId);
    }
  }

  // -----------------------------
  // DEVOTIONAL / PRAYER
  // -----------------------------
  async function loadDevotionalStub() {
    state.devotional.loading = true;
    state.devotional.error = null;
    state.devotional.suggestionRaw = "";
    render();

    try {
      const data = await apiFetch(API.devotional, { method: "GET" });
      state.devotional.suggestionRaw =
        typeof data?.devotional === "string"
          ? data.devotional
          : (typeof data === "string" ? data : JSON.stringify(data, null, 2));
    } catch (e) {
      state.devotional.error = e.message;
    } finally {
      state.devotional.loading = false;
      render();
    }
  }

  async function loadPrayerStarter() {
    state.prayer.loading = true;
    state.prayer.error = null;
    state.prayer.suggestionRaw = "";
    state.prayer.starters = { A: "", C: "", T: "", S: "" };
    render();

    try {
      const lang = state.lang === "es" ? "es" : "en";
      const data = await apiFetch(`${API.dailyPrayer}?lang=${encodeURIComponent(lang)}`, { method: "GET" });

      const raw =
        typeof data?.prayer === "string"
          ? data.prayer
          : (typeof data === "string" ? data : JSON.stringify(data, null, 2));

      state.prayer.suggestionRaw = raw;

      // Parse into ACTS starters
      state.prayer.starters = parsePrayerStarterToACTS(raw);
    } catch (e) {
      state.prayer.error = e.message;
    } finally {
      state.prayer.loading = false;
      render();
    }
  }

  function autoLoadPrayerStarterIfEmpty() {
    if (state.prayer.autoLoadedOnce) return;
    if (state.prayer.loading) return;

    // If no starters yet, load
    const anyStarter =
      (state.prayer.suggestionRaw || "").trim() ||
      (state.prayer.starters.A || "").trim() ||
      (state.prayer.starters.C || "").trim() ||
      (state.prayer.starters.T || "").trim() ||
      (state.prayer.starters.S || "").trim();

    if (anyStarter) return;

    state.prayer.autoLoadedOnce = true;
    loadPrayerStarter().catch(() => {});
  }

  function autoLoadDevotionalIfEmpty() {
    if (state.devotional.autoLoadedOnce) return;
    if (state.devotional.loading) return;
    if ((state.devotional.suggestionRaw || "").trim()) return;

    state.devotional.autoLoadedOnce = true;
    loadDevotionalStub().catch(() => {});
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
    const sections = state.prayer.userSections || defaultPrayerDraft();
    const combined = buildCombinedPrayerTextFromSections(sections, state.lang).trim();

    // Require at least one ACTS field (not only blank)
    const hasAny =
      String(sections.A || "").trim() ||
      String(sections.C || "").trim() ||
      String(sections.T || "").trim() ||
      String(sections.S || "").trim() ||
      String(sections.N || "").trim();

    if (!hasAny) return;

    const entry = {
      date: todayISO(),
      lang: state.lang,
      sections: { ...sections },
      text: combined,
    };

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
      const message = `${languageInstruction()}\n\n${text}`;

      const data = await apiFetch(API.chat, {
        method: "POST",
        body: JSON.stringify({ message }),
      });

      const reply =
        data?.reply ||
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
  // STYLES + RENDER
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
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
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
      /* NEW: section blocks for prayer */
      .sectionBlock{
        border:1px solid var(--border);
        border-radius: 16px;
        padding: 12px;
        background: rgba(255,255,255,0.04);
        margin-top: 10px;
      }
      .sectionHead{
        display:flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 8px;
      }
      .sectionTitle{
        font-weight: 900;
        font-size: 13px;
      }
      .starter{
        background: rgba(34,197,94,0.08);
        border:1px solid rgba(34,197,94,0.26);
        border-radius: 12px;
        padding: 10px 12px;
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.35;
        margin-bottom: 10px;
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
        ? `Account: active`
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

    const status = state.bible.status;
    const bibleStatusLine =
      status?.status === "ok"
        ? `Bible DB OK • ${status.version} • verses: ${status.verse_count ?? "?"}`
        : status?.detail
          ? `Bible DB error: ${status.detail}`
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

    document.querySelectorAll(".tab").forEach(el => {
      el.addEventListener("click", () => setTab(el.getAttribute("data-tab")));
    });

    $("#langSel").addEventListener("change", (e) => setLang(e.target.value));

    $("#voiceSel").addEventListener("click", () => refreshVoices());

    $("#voiceSel").addEventListener("change", (e) => {
      const name = e.target.value || null;
      if (state.lang === "es") state.voiceSelected.es = name;
      else state.voiceSelected.en = name;
      render();
    });

    $("#stopSpeakBtn").addEventListener("click", stopSpeaking);

    wireContentEvents();

    saveLS("alyana_devotional_draft", state.devotional.userText);
    saveLS("alyana_prayer_draft", state.prayer.userSections);
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
      const s = state.bible.status;
      const line = s?.status === "ok"
        ? `Health: ok • ${s.version} • verses: ${s.verse_count ?? "?"}`
        : s?.detail
          ? `Health: error • ${s.detail}`
          : "Health: checking…";

      return `
        <div class="card">
          <h2>Status</h2>
          <div class="sub">Bible database connection.</div>
          <div class="hint">${escapeHtml(line)}</div>
          ${s?.status === "ok" ? `<div class="ok" style="margin-top:10px;">DB OK • verses: ${escapeHtml(s.verse_count ?? "?")}</div>` : ""}
          ${s?.status === "error" ? `<div class="error" style="margin-top:10px;">${escapeHtml(s.detail || "Bible DB error")}</div>` : ""}
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
          <input id="chatInput" class="field" placeholder="${state.lang === "es" ? "Escribe tu mensaje..." : "Type your message..."}" />
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
      ? books.map(b => {
          const selected = Number(b.id) === Number(state.bible.bookId) ? "selected" : "";
          return `<option value="${escapeHtml(String(b.id))}" ${selected}>${escapeHtml(b.name)}</option>`;
        }).join("")
      : `<option value="${escapeHtml(String(state.bible.bookId))}">${escapeHtml(state.bible.bookName)}</option>`;

    const chapters = state.bible.chapters && state.bible.chapters.length
      ? state.bible.chapters
      : Array.from({ length: 150 }, (_, i) => i + 1);

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

        <div class="hint" style="margin-top:10px;">
          Version: <strong>${escapeHtml(bibleVersionForLang())}</strong>
        </div>
      </div>
    `;
  }

  function renderDevotional() {
    const label = state.lang === "es" ? "Obtener ejemplo breve" : "Get starter example";
    const btn = state.lang === "es" ? "Generar" : "Generate";

    return `
      <div class="card">
        <h2>${state.lang === "es" ? "Devocional" : "Devotional"}</h2>
        <div class="sub">${state.lang === "es" ? "Borrador + guardado (stub por ahora)." : "Draft + save (stub for now)."}</div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">${label}</div>
          <button id="genDevBtn" class="btn btnAccent" ${state.devotional.loading ? "disabled" : ""}>
            ${state.devotional.loading ? (state.lang === "es" ? "Cargando..." : "Loading...") : btn}
          </button>
        </div>

        ${state.devotional.error ? `<div class="error">${escapeHtml(state.devotional.error)}</div>` : ""}
        ${state.devotional.suggestionRaw ? `<div class="ok">${escapeHtml(state.devotional.suggestionRaw)}</div>` : ""}

        <div class="divider"></div>

        <textarea id="devText" class="field" placeholder="${escapeHtml(state.lang === "es" ? "Escribe tu devocional aquí…" : "Write your devotional here…")}">${escapeHtml(state.devotional.userText || "")}</textarea>

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
    const label = state.lang === "es" ? "Obtener ejemplo breve" : "Get starter example";
    const btn = state.lang === "es" ? "Generar" : "Generate";

    const starterA = (state.prayer.starters.A || "").trim();
    const starterC = (state.prayer.starters.C || "").trim();
    const starterT = (state.prayer.starters.T || "").trim();
    const starterS = (state.prayer.starters.S || "").trim();

    const s = state.prayer.userSections;

    const titleA = state.lang === "es" ? "Adoración" : "Adoration";
    const titleC = state.lang === "es" ? "Confesión" : "Confession";
    const titleT = state.lang === "es" ? "Acción de gracias" : "Thanksgiving";
    const titleS = state.lang === "es" ? "Súplica" : "Supplication";
    const titleN = state.lang === "es" ? "Notas" : "Notes";

    const placeholderA = state.lang === "es" ? "Escribe tu adoración…" : "Write your adoration…";
    const placeholderC = state.lang === "es" ? "Escribe tu confesión…" : "Write your confession…";
    const placeholderT = state.lang === "es" ? "Escribe tu agradecimiento…" : "Write your thanksgiving…";
    const placeholderS = state.lang === "es" ? "Escribe tus peticiones…" : "Write your requests…";
    const placeholderN = state.lang === "es" ? "Notas (opcional)..." : "Notes (optional)...";

    return `
      <div class="card">
        <h2>${state.lang === "es" ? "Oración Diaria" : "Daily Prayer"}</h2>
        <div class="sub">${
          state.lang === "es"
            ? "Alyana te da un ejemplo breve. Tú escribes y guardas tu oración real."
            : "Alyana gives a short starter example. You write and save your real prayer."
        }</div>

        <div class="row" style="justify-content:space-between;">
          <div class="hint">${label}</div>
          <button id="genPrayerBtn" class="btn btnAccent" ${state.prayer.loading ? "disabled" : ""}>
            ${state.prayer.loading ? (state.lang === "es" ? "Cargando..." : "Loading...") : btn}
          </button>
        </div>

        ${state.prayer.error ? `<div class="error">${escapeHtml(state.prayer.error)}</div>` : ""}

        <!-- ACTS Sections -->
        <div class="sectionBlock">
          <div class="sectionHead">
            <div class="sectionTitle">${escapeHtml(titleA)}</div>
            <button id="listenA" class="btn miniBtn" ${starterA ? "" : "disabled"}>${state.lang === "es" ? "Escuchar" : "Listen"}</button>
          </div>
          ${starterA ? `<div class="starter">${escapeHtml(starterA)}</div>` : `<div class="hint">${escapeHtml(state.lang === "es" ? "Sin ejemplo todavía." : "No starter yet.")}</div>`}
          <textarea id="prayA" class="field" placeholder="${escapeHtml(placeholderA)}">${escapeHtml(s.A || "")}</textarea>
        </div>

        <div class="sectionBlock">
          <div class="sectionHead">
            <div class="sectionTitle">${escapeHtml(titleC)}</div>
            <button id="listenC" class="btn miniBtn" ${starterC ? "" : "disabled"}>${state.lang === "es" ? "Escuchar" : "Listen"}</button>
          </div>
          ${starterC ? `<div class="starter">${escapeHtml(starterC)}</div>` : `<div class="hint">${escapeHtml(state.lang === "es" ? "Sin ejemplo todavía." : "No starter yet.")}</div>`}
          <textarea id="prayC" class="field" placeholder="${escapeHtml(placeholderC)}">${escapeHtml(s.C || "")}</textarea>
        </div>

        <div class="sectionBlock">
          <div class="sectionHead">
            <div class="sectionTitle">${escapeHtml(titleT)}</div>
            <button id="listenT" class="btn miniBtn" ${starterT ? "" : "disabled"}>${state.lang === "es" ? "Escuchar" : "Listen"}</button>
          </div>
          ${starterT ? `<div class="starter">${escapeHtml(starterT)}</div>` : `<div class="hint">${escapeHtml(state.lang === "es" ? "Sin ejemplo todavía." : "No starter yet.")}</div>`}
          <textarea id="prayT" class="field" placeholder="${escapeHtml(placeholderT)}">${escapeHtml(s.T || "")}</textarea>
        </div>

        <div class="sectionBlock">
          <div class="sectionHead">
            <div class="sectionTitle">${escapeHtml(titleS)}</div>
            <button id="listenS" class="btn miniBtn" ${starterS ? "" : "disabled"}>${state.lang === "es" ? "Escuchar" : "Listen"}</button>
          </div>
          ${starterS ? `<div class="starter">${escapeHtml(starterS)}</div>` : `<div class="hint">${escapeHtml(state.lang === "es" ? "Sin ejemplo todavía." : "No starter yet.")}</div>`}
          <textarea id="prayS" class="field" placeholder="${escapeHtml(placeholderS)}">${escapeHtml(s.S || "")}</textarea>
        </div>

        <div class="sectionBlock">
          <div class="sectionHead">
            <div class="sectionTitle">${escapeHtml(titleN)}</div>
          </div>
          <textarea id="prayN" class="field" placeholder="${escapeHtml(placeholderN)}">${escapeHtml(s.N || "")}</textarea>
        </div>

        <div class="row" style="justify-content:space-between; margin-top:12px;">
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
        const newId = Number(e.target.value);
        state.bible.bookId = newId;

        const bookObj = (state.bible.books || []).find(b => Number(b.id) === newId);
        state.bible.bookName = bookObj ? String(bookObj.name) : state.bible.bookName;

        state.bible.chapter = 1;
        state.bible.text = "";
        state.bible.reference = "";
        state.bible.error = null;

        render();
        await loadChapters(state.bible.bookId);
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
        loadBibleText({
          bookId: state.bible.bookId,
          chapter: state.bible.chapter,
          fullChapter: true,
          startVerse: "",
          endVerse: "",
        });
      });

      const loadPassageBtn = $("#loadPassageBtn");
      if (loadPassageBtn) loadPassageBtn.addEventListener("click", () => {
        loadBibleText({
          bookId: state.bible.bookId,
          chapter: state.bible.chapter,
          fullChapter: !!state.bible.fullChapter,
          startVerse: state.bible.startVerse,
          endVerse: state.bible.endVerse,
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
      if (genBtn) genBtn.addEventListener("click", loadDevotionalStub);

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

    // Prayer (ACTS)
    if (state.tab === "prayer") {
      const a = $("#prayA");
      const c = $("#prayC");
      const t = $("#prayT");
      const s = $("#prayS");
      const n = $("#prayN");

      const persist = () => saveLS("alyana_prayer_draft", state.prayer.userSections);

      if (a) a.addEventListener("input", (e) => { state.prayer.userSections.A = e.target.value; persist(); });
      if (c) c.addEventListener("input", (e) => { state.prayer.userSections.C = e.target.value; persist(); });
      if (t) t.addEventListener("input", (e) => { state.prayer.userSections.T = e.target.value; persist(); });
      if (s) s.addEventListener("input", (e) => { state.prayer.userSections.S = e.target.value; persist(); });
      if (n) n.addEventListener("input", (e) => { state.prayer.userSections.N = e.target.value; persist(); });

      const genBtn = $("#genPrayerBtn");
      if (genBtn) genBtn.addEventListener("click", loadPrayerStarter);

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

      const listenA = $("#listenA");
      const listenC = $("#listenC");
      const listenT = $("#listenT");
      const listenS = $("#listenS");
      if (listenA) listenA.addEventListener("click", () => speak(state.prayer.starters.A || ""));
      if (listenC) listenC.addEventListener("click", () => speak(state.prayer.starters.C || ""));
      if (listenT) listenT.addEventListener("click", () => speak(state.prayer.starters.T || ""));
      if (listenS) listenS.addEventListener("click", () => speak(state.prayer.starters.S || ""));
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

    await loadAccount();
    await refreshBibleForLanguage();

    if (state.tab === "prayer") autoLoadPrayerStarterIfEmpty();
    if (state.tab === "devotional") autoLoadDevotionalIfEmpty();
  }

  init();
})();























