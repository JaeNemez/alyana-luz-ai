(() => {
  const $ = (id) => document.getElementById(id);

  // ------------------------------
  // Status proof
  // ------------------------------
  const jsStatus = $("jsStatus");
  if (jsStatus) jsStatus.textContent = "JS: running";

  // ------------------------------
  // Helpers
  // ------------------------------
  async function apiJSON(url, opts) {
    const res = await fetch(url, {
      credentials: "include", // IMPORTANT: send auth cookie to /me, portal, logout, etc.
      ...opts,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`API ${res.status} for ${url}: ${txt}`);
    }
    return await res.json();
  }

  function safeJSONFromModel(text) {
    if (!text) return null;
    let t = String(text).trim();
    t = t.replace(/```json/gi, "```");
    if (t.includes("```")) {
      const parts = t.split("```");
      if (parts.length >= 3) t = parts[1].trim();
      else t = t.replace(/```/g, "").trim();
    }
    const first = t.indexOf("{");
    const last = t.lastIndexOf("}");
    if (first >= 0 && last > first) t = t.slice(first, last + 1);
    try { return JSON.parse(t); } catch { return null; }
  }

  function looksSpanish(s) {
    const t = (s || "").toLowerCase();
    if (/[áéíóúñü¿¡]/i.test(t)) return true;
    const hits = ["que","porque","para","pero","gracias","dios","señor","hoy","oración","oracion","versículo","versiculo","biblia"];
    let score = 0;
    hits.forEach(w => { if (t.includes(" " + w + " ") || t.startsWith(w + " ") || t.endsWith(" " + w)) score++; });
    return score >= 2;
  }

  // ==============================
  // AUTH / BILLING UI (NEW)
  // ==============================
  const authPill = $("authPill");
  const manageBillingBtn = $("manageBillingBtn");
  const logoutBtn = $("logoutBtn");
  const authHint = $("authHint");

  function setPill(state, text) {
    if (!authPill) return;
    authPill.classList.remove("ok", "warn", "bad");
    if (state) authPill.classList.add(state);
    authPill.textContent = text;
  }

  function setHint(text) {
    if (!authHint) return;
    if (!text) {
      authHint.style.display = "none";
      authHint.textContent = "";
      return;
    }
    authHint.style.display = "block";
    authHint.textContent = text;
  }

  let lastMe = { logged_in: false, email: null, active: false, status: null };

  async function refreshMe() {
    try {
      setPill("warn", "Account: checking…");
      setHint("");

      const me = await apiJSON("/me", { method: "GET" });
      lastMe = me || lastMe;

      const loggedIn = !!me.logged_in;
      const active = !!me.active;
      const email = me.email || "";

      if (!loggedIn) {
        setPill("warn", "Account: not logged in");
        if (manageBillingBtn) manageBillingBtn.disabled = false; // allow it to act like "Subscribe"
        if (logoutBtn) logoutBtn.style.display = "none";
        setHint("To access premium features, tap Support to subscribe (Stripe Checkout).");
        return;
      }

      // logged in
      if (logoutBtn) logoutBtn.style.display = "inline-block";

      if (active) {
        setPill("ok", `Active: ${email}`);
        if (manageBillingBtn) manageBillingBtn.disabled = false;
        setHint("");
      } else {
        setPill("bad", `Inactive: ${email}`);
        if (manageBillingBtn) manageBillingBtn.disabled = false; // allow user to manage billing OR re-subscribe
        setHint("Your subscription is inactive. Tap Support to subscribe again, or Manage billing if a customer exists.");
      }
    } catch (e) {
      console.error("refreshMe failed:", e);
      setPill("bad", "Account: error");
      if (manageBillingBtn) manageBillingBtn.disabled = false;
      setHint("Could not load account status. Try refreshing the page.");
    }
  }

  // ------------------------------
  // Support button (Stripe Checkout)
  // ------------------------------
  const supportBtn = $("supportBtn");

  async function startStripeCheckout() {
    if (!supportBtn) return;

    const originalText = supportBtn.textContent;
    supportBtn.disabled = true;
    supportBtn.textContent = "Redirecting to secure checkout…";

    try {
      const res = await fetch("/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Checkout error ${res.status}: ${txt}`);
      }

      const data = await res.json();
      if (!data.url) throw new Error("No checkout URL returned by server.");

      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      alert("Sorry — checkout failed. Please try again.");
      supportBtn.disabled = false;
      supportBtn.textContent = originalText || "❤️ Support Alyana Luz";
    }
  }

  if (supportBtn) {
    supportBtn.addEventListener("click", startStripeCheckout);
  }

  // NEW: Manage billing button
  async function openBillingPortalOrCheckout() {
    try {
      if (!manageBillingBtn) return;
      manageBillingBtn.disabled = true;

      // If not logged in, treat Manage billing as Subscribe
      if (!lastMe.logged_in) {
        await startStripeCheckout();
        return;
      }

      // Logged in -> try billing portal
      const data = await apiJSON("/stripe/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}) // server reads cookie email first
      });

      if (!data.url) throw new Error("No portal URL returned.");
      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      // If portal fails (no customer yet), fallback to checkout
      const msg = String(e && e.message ? e.message : e);
      if (msg.includes("No Stripe customer") || msg.includes("404")) {
        await startStripeCheckout();
      } else {
        alert("Could not open billing portal. Try Support instead.");
      }
    } finally {
      if (manageBillingBtn) manageBillingBtn.disabled = false;
    }
  }

  if (manageBillingBtn) {
    manageBillingBtn.addEventListener("click", openBillingPortalOrCheckout);
  }

  // NEW: Logout
  async function doLogout() {
    try {
      if (logoutBtn) logoutBtn.disabled = true;
      await apiJSON("/logout", { method: "POST" });
      await refreshMe();
      // Optional: hard refresh to clear any cached state
      window.location.href = "/";
    } catch (e) {
      console.error(e);
      alert("Logout failed. Try again.");
    } finally {
      if (logoutBtn) logoutBtn.disabled = false;
    }
  }

  if (logoutBtn) logoutBtn.addEventListener("click", doLogout);

  // ==============================
  // Local storage keys + streak helpers
  // ==============================
  const DEV_STORAGE = "alyana_devotionals_v1";
  const PR_STORAGE  = "alyana_prayers_v1";
  const DEV_STREAK  = "alyana_dev_streak_v1";
  const PR_STREAK   = "alyana_pr_streak_v1";

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function daysBetween(aISO, bISO) {
    const a = new Date(aISO + "T00:00:00");
    const b = new Date(bISO + "T00:00:00");
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }

  function loadList(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  }

  function saveList(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
  }

  function loadObj(key, fallback = {}) {
    try { return JSON.parse(localStorage.getItem(key) || "") || fallback; }
    catch { return fallback; }
  }

  function saveObj(key, obj) {
    localStorage.setItem(key, JSON.stringify(obj));
  }

  function markStreakDone(streakKey) {
    const t = todayISO();
    const s = loadObj(streakKey, { count: 0, last: null });

    if (!s.last) {
      s.count = 1;
      s.last = t;
      saveObj(streakKey, s);
      return s;
    }

    if (s.last === t) return s;

    const diff = daysBetween(s.last, t);
    if (diff === 1) s.count += 1;
    else s.count = 1;

    s.last = t;
    saveObj(streakKey, s);
    return s;
  }

  // ------------------------------
  // Tabs
  // ------------------------------
  const sections = Array.from(document.querySelectorAll(".app-section"));
  const menuButtons = Array.from(document.querySelectorAll(".menu-btn"));

  function showSection(id) {
    sections.forEach(s => s.classList.toggle("active", s.id === id));
    menuButtons.forEach(b => b.classList.toggle("active", b.dataset.target === id));
  }

  menuButtons.forEach(btn => btn.addEventListener("click", () => showSection(btn.dataset.target)));
  showSection("chatSection");

  // ------------------------------
  // TTS (2 voices) - Chat + Bible Reader only
  // ------------------------------
  const TTS = { voices: [], ready: false, isSpeaking: false };
  const ttsStatus = $("ttsStatus");
  const chatVoicePill = $("chatVoicePill");

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    TTS.voices = window.speechSynthesis.getVoices() || [];
    TTS.ready = TTS.voices.length > 0;
    updateVoicePills();
  }

  function pickVoice(langKey) {
    const voices = (TTS.voices && TTS.voices.length)
      ? TTS.voices
      : ("speechSynthesis" in window ? window.speechSynthesis.getVoices() : []);

    if (langKey === "es") {
      const v =
        voices.find(v => (v.lang === "es-MX") && (v.name || "").toLowerCase().includes("paulina")) ||
        voices.find(v => (v.lang || "").toLowerCase() === "es-mx") ||
        voices.find(v => (v.lang || "").toLowerCase().startsWith("es"));
      return { voice: v || null, lang: "es-MX", label: "Paulina (es-MX)" };
    }

    const v =
      voices.find(v => (v.lang === "en-AU") && (v.name || "").toLowerCase().includes("karen")) ||
      voices.find(v => (v.lang || "").toLowerCase() === "en-au") ||
      voices.find(v => (v.lang || "").toLowerCase().startsWith("en"));
    return { voice: v || null, lang: "en-AU", label: "Karen (en-AU)" };
  }

  function stopSpeaking() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    TTS.isSpeaking = false;
    updateVoicePills();
  }

  function chunkText(text, maxLen = 220) {
    const t = String(text || "").trim();
    if (!t) return [];
    const parts = [];
    let cur = "";
    for (const token of t.split(/\s+/)) {
      if ((cur + " " + token).trim().length > maxLen) {
        parts.push(cur.trim());
        cur = token;
      } else {
        cur = (cur + " " + token).trim();
      }
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function speakText(text, langKey) {
    if (!("speechSynthesis" in window)) {
      alert("Speech synthesis is not supported in this browser.");
      return;
    }
    stopSpeaking();

    const { voice, lang } = pickVoice(langKey) || {};
    const chunks = chunkText(text, 220);
    if (!chunks.length) return;

    TTS.isSpeaking = true;
    updateVoicePills();

    let idx = 0;
    const speakNext = () => {
      if (!TTS.isSpeaking) return;
      if (idx >= chunks.length) {
        TTS.isSpeaking = false;
        updateVoicePills();
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[idx]);
      u.lang = lang || (langKey === "es" ? "es-MX" : "en-AU");
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onend = () => { idx++; speakNext(); };
      u.onerror = () => { idx++; speakNext(); };
      window.speechSynthesis.speak(u);
    };

    speakNext();
  }

  function updateVoicePills() {
    const ready = ("speechSynthesis" in window) ? (TTS.ready ? "ready" : "loading…") : "not supported";
    if (ttsStatus) ttsStatus.textContent = `Voice: ${ready}${TTS.isSpeaking ? " (speaking)" : ""}`;
    if (chatVoicePill) chatVoicePill.textContent = `Voice: ${ready}${TTS.isSpeaking ? " (speaking)" : ""}`;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => refreshVoices();
    setTimeout(refreshVoices, 250);
    setTimeout(refreshVoices, 1200);
  } else {
    updateVoicePills();
  }

  // ------------------------------
  // CHAT + saved chats
  // ------------------------------
  const chatLangSelect = $("chatLangSelect");
  const chatEl = $("chat");
  const chatForm = $("chatForm");
  const chatInput = $("chatInput");
  const chatSendBtn = $("chatSendBtn");
  const chatListenBtn = $("chatListenBtn");
  const chatNewBtn = $("chatNewBtn");
  const chatSaveBtn = $("chatSaveBtn");
  const chatSavedList = $("chatSavedList");

  const CHAT_STORAGE = "alyana_chat_logs_v1";
  const chatHistory = [];
  let lastBotMessage = "";

  function addBubble(text, who="bot") {
    const row = document.createElement("div");
    row.className = "bubble-row " + who;

    const b = document.createElement("div");
    b.className = "bubble " + (who === "user" ? "user" : who === "system" ? "system" : "bot");
    b.textContent = text;

    row.appendChild(b);
    chatEl.appendChild(row);
    chatEl.scrollTop = chatEl.scrollHeight;
    return b;
  }

  function addWelcome() {
    addBubble('Hi! Try "Read John 1:1", "Verses about peace", or "Pray for my family".', "system");
  }

  function loadChatLogs() {
    try { return JSON.parse(localStorage.getItem(CHAT_STORAGE) || "[]"); }
    catch { return []; }
  }
  function saveChatLogs(list) {
    localStorage.setItem(CHAT_STORAGE, JSON.stringify(list));
  }

  function renderChatSavedList() {
    if (!chatSavedList) return;
    const list = loadChatLogs();
    chatSavedList.innerHTML = "";
    if (!list.length) {
      chatSavedList.innerHTML = `<small style="opacity:0.75;">No saved chats yet.</small>`;
      return;
    }

    list
      .slice()
      .sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .forEach(item => {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.gap = "8px";
        wrap.style.marginTop = "8px";

        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.style.flex = "1";
        btn.style.textAlign = "left";
        btn.textContent = `${item.title || "Chat"} — ${item.createdAt || ""}`;
        btn.addEventListener("click", () => {
          stopSpeaking();
          chatHistory.length = 0;
          chatEl.innerHTML = "";
          (item.messages || []).forEach(m => {
            chatHistory.push(m);
            addBubble(m.text, m.role === "user" ? "user" : "bot");
            if (m.role === "assistant") lastBotMessage = m.text;
          });
          if (!chatHistory.length) addWelcome();
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = "Delete";
        del.style.width = "92px";
        del.addEventListener("click", () => {
          const next = loadChatLogs().filter(x => x.id !== item.id);
          saveChatLogs(next);
          renderChatSavedList();
        });

        wrap.appendChild(btn);
        wrap.appendChild(del);
        chatSavedList.appendChild(wrap);
      });
  }

  function saveCurrentChat() {
    const msgs = chatHistory.slice();
    if (!msgs.length) { alert("Nothing to save yet."); return; }

    const createdAt = new Date().toISOString().slice(0,16).replace("T"," ");
    const title = (msgs.find(m => m.role === "user")?.text || "Chat").slice(0, 48);

    const item = { id: "chat_" + Date.now(), createdAt, title, messages: msgs };
    const list = loadChatLogs();
    list.push(item);
    saveChatLogs(list);
    renderChatSavedList();
    alert("Saved chat.");
  }

  function resolveChatLangForListen() {
    const sel = chatLangSelect?.value || "auto";
    if (sel === "en" || sel === "es") return sel;
    const lastUser = [...chatHistory].reverse().find(m => m.role === "user")?.text || "";
    return looksSpanish(lastUser) ? "es" : "en";
  }

  if (chatEl && chatForm && chatInput) {
    addWelcome();
    renderChatSavedList();

    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userText = chatInput.value.trim();
      if (!userText) return;

      addBubble(userText, "user");
      chatInput.value = "";
      chatHistory.push({ role: "user", text: userText });

      const loading = addBubble("Thinking…", "bot");
      if (chatSendBtn) chatSendBtn.disabled = true;

      try {
        const historyText = chatHistory
          .map(m => (m.role === "user" ? `User: ${m.text}` : `Alyana: ${m.text}`))
          .join("\n");

        const fullPrompt = historyText + "\n\nContinue responding as Alyana Luz, a gentle Bible AI assistant.";

        const data = await apiJSON("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: fullPrompt })
        });

        const text = data.message || "Sorry, I couldn't respond right now.";
        loading.textContent = text;
        chatHistory.push({ role: "assistant", text });
        lastBotMessage = text;
      } catch (err) {
        console.error(err);
        loading.textContent = "Network error talking to the Bible AI server.";
      } finally {
        if (chatSendBtn) chatSendBtn.disabled = false;
      }
    });

    if (chatNewBtn) chatNewBtn.addEventListener("click", () => {
      stopSpeaking();
      chatHistory.length = 0;
      chatEl.innerHTML = "";
      lastBotMessage = "";
      addWelcome();
      chatInput.focus();
    });

    if (chatSaveBtn) chatSaveBtn.addEventListener("click", saveCurrentChat);

    if (chatListenBtn) chatListenBtn.addEventListener("click", () => {
      if (!lastBotMessage) { alert("Nothing to read yet."); return; }
      const langKey = resolveChatLangForListen();
      let txt = lastBotMessage;
      if (langKey === "es") txt = txt.replace(/\b(KJV|NKJV|NIV|ESV|NASB|CSB|AMP|MSG)\b/gi, "").trim();
      if (TTS.isSpeaking) stopSpeaking();
      else speakText(txt, langKey);
    });
  }

  // ------------------------------
  // BIBLE READER
  // ------------------------------
  const bibleDbStatus = $("bibleDbStatus");
  const bookSelect = $("bookSelect");
  const chapterSelect = $("chapterSelect");
  const verseStartSelect = $("verseStartSelect");
  const verseEndSelect = $("verseEndSelect");
  const fullChapterChk = $("fullChapter");
  const listenBtn = $("listenBible");
  const stopBtn = $("stopBible");
  const readingVoice = $("readingVoice");
  const versionSelect = $("versionSelect");

  function fillSelect(selectEl, items, { placeholder = null, labelKey = null, valueKey = null } = {}) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    if (placeholder) {
      const o = document.createElement("option");
      o.value = "";
      o.textContent = placeholder;
      selectEl.appendChild(o);
    }
    items.forEach(it => {
      const o = document.createElement("option");
      if (valueKey && it && typeof it === "object") o.value = String(it[valueKey]);
      else o.value = String(it);
      if (labelKey && it && typeof it === "object") o.textContent = String(it[labelKey]);
      else o.textContent = String(it);
      selectEl.appendChild(o);
    });
  }

  async function loadBibleHealth() {
    if (!bibleDbStatus) return;
    try {
      const data = await apiJSON("/bible/health");
      bibleDbStatus.textContent = `OK — verses: ${data.verse_count} — db: ${data.db_path}`;
    } catch (e) {
      console.error(e);
      bibleDbStatus.textContent = "Bible DB error. Make sure data/bible.db exists on the server.";
    }
  }

  async function loadBooks() {
    if (!bookSelect) return;
    const data = await apiJSON("/bible/books");
    const books = data.books || [];
    fillSelect(bookSelect, books, { placeholder: "Select a book…", labelKey: "name", valueKey: "id" });
  }

  async function loadChapters(bookId) {
    if (!chapterSelect) return;
    const data = await apiJSON(`/bible/chapters?book=${encodeURIComponent(bookId)}`);
    fillSelect(chapterSelect, (data.chapters || []), { placeholder: "Chapter…" });
  }

  async function loadVerses(bookId, chapter) {
    if (!verseStartSelect || !verseEndSelect) return;
    const data = await apiJSON(`/bible/verses?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}`);
    const verses = data.verses || [];
    fillSelect(verseStartSelect, verses, { placeholder: "Start…" });
    fillSelect(verseEndSelect, verses, { placeholder: "(optional)" });
  }

  async function fetchPassageText() {
    const bookId = bookSelect?.value;
    const chapter = chapterSelect?.value;
    if (!bookId || !chapter) throw new Error("Missing book/chapter");

    if (fullChapterChk?.checked) {
      const data = await apiJSON(`/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=true`);
      return { reference: data.reference || "", text: data.text || "" };
    }

    const vStart = verseStartSelect?.value;
    const vEnd = verseEndSelect?.value;
    if (!vStart) throw new Error("Missing start verse");

    const end = (vEnd && Number(vEnd) >= Number(vStart)) ? vEnd : vStart;
    const data = await apiJSON(`/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=false&start=${encodeURIComponent(vStart)}&end=${encodeURIComponent(end)}`);
    return { reference: data.reference || "", text: data.text || "" };
  }

  function bindBibleReader() {
    if (!bookSelect || !chapterSelect || !listenBtn) return;

    bookSelect.addEventListener("change", async () => {
      stopSpeaking();
      listenBtn.textContent = "Listen";

      const bookId = bookSelect.value;
      if (!bookId) return;

      try {
        await loadChapters(bookId);
        const first = chapterSelect.options[1]?.value || "";
        if (first) {
          chapterSelect.value = first;
          await loadVerses(bookId, first);
        }
      } catch (e) {
        console.error(e);
        alert("Could not load chapters for that book.");
      }
    });

    chapterSelect.addEventListener("change", async () => {
      stopSpeaking();
      listenBtn.textContent = "Listen";

      const bookId = bookSelect.value;
      const ch = chapterSelect.value;
      if (!bookId || !ch) return;

      try {
        await loadVerses(bookId, ch);
      } catch (e) {
        console.error(e);
        alert("Could not load verses for that chapter.");
      }
    });

    if (fullChapterChk) {
      fullChapterChk.addEventListener("change", () => {
        const on = fullChapterChk.checked;
        if (verseStartSelect) verseStartSelect.disabled = on;
        if (verseEndSelect) verseEndSelect.disabled = on;
      });
    }

    listenBtn.addEventListener("click", async () => {
      try {
        if (!("speechSynthesis" in window)) {
          alert("Speech synthesis is not supported in this browser.");
          return;
        }

        if (TTS.isSpeaking) {
          stopSpeaking();
          listenBtn.textContent = "Listen";
          return;
        }

        const { reference, text } = await fetchPassageText();
        if (!text) { alert("No text returned."); return; }

        const langKey = readingVoice?.value || "en";
        let spokenText = "";

        if (langKey === "es") {
          spokenText = String(text)
            .replace(/\b(KJV|NKJV|NIV|ESV|NASB|CSB|AMP|MSG)\b/gi, "")
            .trim();
        } else {
          const version = versionSelect?.value || "KJV";
          spokenText = `${version}. ${reference}. ${text}`.trim();
        }

        listenBtn.textContent = "Stop";
        speakText(spokenText, langKey);

        const watch = setInterval(() => {
          if (!TTS.isSpeaking) {
            clearInterval(watch);
            listenBtn.textContent = "Listen";
          }
        }, 250);

      } catch (e) {
        console.error(e);
        alert("Could not read passage. Make sure book/chapter/verses are selected.");
      }
    });

    if (stopBtn) {
      stopBtn.addEventListener("click", () => {
        stopSpeaking();
        listenBtn.textContent = "Listen";
      });
    }
  }

  (async function initBible() {
    if (!document.getElementById("bibleSection")) return;
    if (!bookSelect) return;

    try {
      await loadBibleHealth();
      await loadBooks();

      const firstBook = bookSelect.options[1]?.value || "";
      if (firstBook) {
        bookSelect.value = firstBook;
        await loadChapters(firstBook);
        const firstCh = chapterSelect?.options[1]?.value || "";
        if (firstCh) {
          chapterSelect.value = firstCh;
          await loadVerses(firstBook, firstCh);
        }
      }

      if (fullChapterChk) fullChapterChk.dispatchEvent(new Event("change"));
      bindBibleReader();
      updateVoicePills();
    } catch (e) {
      console.error(e);
      updateVoicePills();
    }
  })();

  // ==================================================
  // DEVOTIONAL (no listen, add save/streak/list + bilingual UI hints)
  // ==================================================
  const devotionalBtn = $("devotionalBtn");
  const devUiLang = $("devUiLang");
  const devStreakPill = $("devStreakPill");
  const devStreakBtn = $("devStreakBtn");
  const devSaveBtn = $("devSaveBtn");
  const devSavedList = $("devSavedList");

  const devotionalScripture = $("devotionalScripture");
  const devotionalExplain = $("devotionalExplain");

  const devDesc = document.querySelector("#devotionalSection .muted");
  const devLabel3 = document.querySelector('#devotionalSection .block:nth-of-type(3) .muted');
  const devLabel4 = document.querySelector('#devotionalSection .block:nth-of-type(4) .muted');
  const devLabel5 = document.querySelector('#devotionalSection .block:nth-of-type(5) .muted');
  const devLabel6 = document.querySelector('#devotionalSection .block:nth-of-type(6) .muted');

  function applyDevUiLang() {
    const lang = devUiLang?.value || "en";
    if (devDesc) {
      devDesc.textContent = (lang === "es")
        ? "Alyana te da un versículo + una breve explicación. Tú escribes tu propia explicación, aplicación y oración."
        : "Alyana gives Scripture + a brief explanation. You write your own explanation, application, and prayer.";
    }
    if (devStreakBtn) devStreakBtn.textContent = (lang === "es") ? "Lo hice hoy" : "I did it today";
    if (devSaveBtn) devSaveBtn.textContent = (lang === "es") ? "Guardar" : "Save";

    if (devLabel3) devLabel3.textContent = (lang === "es")
      ? "3) Mi explicación (escribe lo que TÚ crees que significa)"
      : "3) My Explanation (write what YOU think it means)";
    if (devLabel4) devLabel4.textContent = (lang === "es")
      ? "4) Mi aplicación (cómo lo puedo aplicar hoy)"
      : "4) My Application (how I can apply it today)";
    if (devLabel5) devLabel5.textContent = (lang === "es")
      ? "5) Mi oración (ora sobre este pasaje)"
      : "5) My Prayer (pray about this Scripture)";
    if (devLabel6) devLabel6.textContent = (lang === "es")
      ? "6) Reflexión (notas / lo que Dios me está enseñando)"
      : "6) Reflection (notes / what God is teaching me)";

    const t1 = $("devotionalMyExplanation");
    const t2 = $("devotionalMyApplication");
    const t3 = $("devotionalMyPrayer");
    const t4 = $("devotionalReflection");

    if (t1) t1.placeholder = (lang === "es") ? "¿Qué creo que está diciendo este pasaje?" : "What do I think this Scripture is saying?";
    if (t2) t2.placeholder = (lang === "es") ? "¿Cómo puedo vivir esto hoy?" : "How can I live this out today?";
    if (t3) t3.placeholder = (lang === "es") ? "Señor, ayúdame…" : "Lord, help me…";
    if (t4) t4.placeholder = (lang === "es") ? "Reflexión…" : "Reflection…";
  }

  function refreshDevStreakUI() {
    const s = loadObj(DEV_STREAK, { count: 0, last: null });
    if (devStreakPill) devStreakPill.textContent = `Streak: ${s.count || 0}`;
  }

  function renderDevSaved() {
    if (!devSavedList) return;
    const list = loadList(DEV_STORAGE);
    devSavedList.innerHTML = "";

    if (!list.length) {
      devSavedList.innerHTML = `<small style="opacity:0.75;">No saved devotionals yet.</small>`;
      return;
    }

    list
      .slice()
      .sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .forEach(item => {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.gap = "8px";
        wrap.style.marginTop = "8px";

        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.style.flex = "1";
        btn.style.textAlign = "left";
        btn.textContent = `${item.title || "Devotional"} — ${item.createdAt || ""}`;
        btn.addEventListener("click", () => {
          if (devotionalScripture) devotionalScripture.textContent = item.scripture || "—";
          if (devotionalExplain) devotionalExplain.textContent = item.brief_explanation || "—";
          if ($("devotionalMyExplanation")) $("devotionalMyExplanation").value = item.my_explanation || "";
          if ($("devotionalMyApplication")) $("devotionalMyApplication").value = item.my_application || "";
          if ($("devotionalMyPrayer")) $("devotionalMyPrayer").value = item.my_prayer || "";
          if ($("devotionalReflection")) $("devotionalReflection").value = item.reflection || "";
          if (devUiLang && item.lang) {
            devUiLang.value = item.lang;
            applyDevUiLang();
          }
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = "Delete";
        del.style.width = "92px";
        del.addEventListener("click", () => {
          const next = loadList(DEV_STORAGE).filter(x => x.id !== item.id);
          saveList(DEV_STORAGE, next);
          renderDevSaved();
        });

        wrap.appendChild(btn);
        wrap.appendChild(del);
        devSavedList.appendChild(wrap);
      });
  }

  function saveDevotionalEntry() {
    const scripture = devotionalScripture?.textContent || "";
    const brief_explanation = devotionalExplain?.textContent || "";

    const my_explanation = $("devotionalMyExplanation")?.value || "";
    const my_application = $("devotionalMyApplication")?.value || "";
    const my_prayer = $("devotionalMyPrayer")?.value || "";
    const reflection = $("devotionalReflection")?.value || "";

    if (!scripture.trim() && !my_explanation.trim() && !my_prayer.trim()) {
      alert("Nothing to save yet.");
      return;
    }

    const createdAt = new Date().toISOString().slice(0,16).replace("T"," ");
    const lang = devUiLang?.value || "en";
    const title = (scripture || my_explanation || "Devotional").slice(0, 48);

    const item = {
      id: "dev_" + Date.now(),
      createdAt,
      lang,
      title,
      scripture,
      brief_explanation,
      my_explanation,
      my_application,
      my_prayer,
      reflection
    };

    const list = loadList(DEV_STORAGE);
    list.push(item);
    saveList(DEV_STORAGE, list);
    renderDevSaved();
    alert("Saved devotional.");
  }

  async function generateDevotional() {
    if (!devotionalBtn) return;

    devotionalBtn.disabled = true;
    if (devotionalScripture) devotionalScripture.textContent = "Loading…";
    if (devotionalExplain) devotionalExplain.textContent = "Loading…";

    try {
      const lang = devUiLang?.value || "en";

      let data;
      try {
        data = await apiJSON("/devotional", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang })
        });
      } catch {
        data = await apiJSON("/devotional", { method: "POST" });
      }

      const obj = safeJSONFromModel(data.json || "");
      if (!obj) throw new Error("Bad JSON from model");

      if (devotionalScripture) devotionalScripture.textContent = obj.scripture || "—";
      if (devotionalExplain) devotionalExplain.textContent = obj.brief_explanation || "—";
    } catch (e) {
      console.error(e);
      if (devotionalScripture) devotionalScripture.textContent = "Error generating devotional.";
      if (devotionalExplain) devotionalExplain.textContent = "Please try again.";
    } finally {
      devotionalBtn.disabled = false;
    }
  }

  if (devUiLang) devUiLang.addEventListener("change", applyDevUiLang);
  if (devotionalBtn) devotionalBtn.addEventListener("click", generateDevotional);
  if (devSaveBtn) devSaveBtn.addEventListener("click", saveDevotionalEntry);
  if (devStreakBtn) devStreakBtn.addEventListener("click", () => {
    markStreakDone(DEV_STREAK);
    refreshDevStreakUI();
  });

  applyDevUiLang();
  renderDevSaved();
  refreshDevStreakUI();

  // ==================================================
  // DAILY PRAYER
  // ==================================================
  const prayerBtn = $("prayerBtn");
  const prUiLang = $("prUiLang");
  const prStreakPill = $("prStreakPill");
  const prStreakBtn = $("prStreakBtn");
  const prSaveBtn = $("prSaveBtn");
  const prSavedList = $("prSavedList");

  const pA = $("pA");
  const pC = $("pC");
  const pT = $("pT");
  const pS = $("pS");

  const prDesc = document.querySelector("#prayerSection .muted");

  function applyPrUiLang() {
    const lang = prUiLang?.value || "en";

    if (prDesc) {
      prDesc.textContent = (lang === "es")
        ? "Alyana te da frases cortas para empezar. Tú escribes tu oración ACTS."
        : "Alyana gives short starters. You write your own ACTS prayer.";
    }

    if (prStreakBtn) prStreakBtn.textContent = (lang === "es") ? "Lo hice hoy" : "I did it today";
    if (prSaveBtn) prSaveBtn.textContent = (lang === "es") ? "Guardar" : "Save";
    if (prayerBtn) prayerBtn.textContent = (lang === "es") ? "Generar frases" : "Generate Starters";

    const ta1 = $("myAdoration");
    const ta2 = $("myConfession");
    const ta3 = $("myThanksgiving");
    const ta4 = $("mySupplication");
    const notes = $("prayerNotes");

    if (ta1) ta1.placeholder = (lang === "es") ? "Adoración (alaba a Dios por quién es)…" : "Adoration (praise God for who He is)…";
    if (ta2) ta2.placeholder = (lang === "es") ? "Confesión (lo que necesito confesar)…" : "Confession (what I need to confess)…";
    if (ta3) ta3.placeholder = (lang === "es") ? "Acción de gracias (por lo que estoy agradecido)…" : "Thanksgiving (what I’m grateful for)…";
    if (ta4) ta4.placeholder = (lang === "es") ? "Súplica (peticiones por mí/otros)…" : "Supplication (requests for myself/others)…";
    if (notes) notes.placeholder = (lang === "es") ? "Notas…" : "Notes…";
  }

  function refreshPrStreakUI() {
    const s = loadObj(PR_STREAK, { count: 0, last: null });
    if (prStreakPill) prStreakPill.textContent = `Streak: ${s.count || 0}`;
  }

  function renderPrSaved() {
    if (!prSavedList) return;
    const list = loadList(PR_STORAGE);
    prSavedList.innerHTML = "";

    if (!list.length) {
      prSavedList.innerHTML = `<small style="opacity:0.75;">No saved prayers yet.</small>`;
      return;
    }

    list
      .slice()
      .sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .forEach(item => {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.gap = "8px";
        wrap.style.marginTop = "8px";

        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.style.flex = "1";
        btn.style.textAlign = "left";
        btn.textContent = `${item.title || "Prayer"} — ${item.createdAt || ""}`;
        btn.addEventListener("click", () => {
          if (pA) pA.textContent = item.example_adoration || "—";
          if (pC) pC.textContent = item.example_confession || "—";
          if (pT) pT.textContent = item.example_thanksgiving || "—";
          if (pS) pS.textContent = item.example_supplication || "—";

          if ($("myAdoration")) $("myAdoration").value = item.my_adoration || "";
          if ($("myConfession")) $("myConfession").value = item.my_confession || "";
          if ($("myThanksgiving")) $("myThanksgiving").value = item.my_thanksgiving || "";
          if ($("mySupplication")) $("mySupplication").value = item.my_supplication || "";
          if ($("prayerNotes")) $("prayerNotes").value = item.notes || "";

          if (prUiLang && item.lang) {
            prUiLang.value = item.lang;
            applyPrUiLang();
          }
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = "Delete";
        del.style.width = "92px";
        del.addEventListener("click", () => {
          const next = loadList(PR_STORAGE).filter(x => x.id !== item.id);
          saveList(PR_STORAGE, next);
          renderPrSaved();
        });

        wrap.appendChild(btn);
        wrap.appendChild(del);
        prSavedList.appendChild(wrap);
      });
  }

  function savePrayerEntry() {
    const lang = prUiLang?.value || "en";
    const createdAt = new Date().toISOString().slice(0,16).replace("T"," ");
    const title = `${todayISO()} Prayer`;

    const item = {
      id: "pr_" + Date.now(),
      createdAt,
      lang,
      title,

      example_adoration: pA?.textContent || "",
      example_confession: pC?.textContent || "",
      example_thanksgiving: pT?.textContent || "",
      example_supplication: pS?.textContent || "",

      my_adoration: $("myAdoration")?.value || "",
      my_confession: $("myConfession")?.value || "",
      my_thanksgiving: $("myThanksgiving")?.value || "",
      my_supplication: $("mySupplication")?.value || "",
      notes: $("prayerNotes")?.value || ""
    };

    const hasSomething =
      item.example_adoration.trim() || item.my_adoration.trim() ||
      item.example_confession.trim() || item.my_confession.trim() ||
      item.example_thanksgiving.trim() || item.my_thanksgiving.trim() ||
      item.example_supplication.trim() || item.my_supplication.trim() ||
      item.notes.trim();

    if (!hasSomething) {
      alert("Nothing to save yet.");
      return;
    }

    const list = loadList(PR_STORAGE);
    list.push(item);
    saveList(PR_STORAGE, list);
    renderPrSaved();
    alert("Saved prayer.");
  }

  async function generatePrayerStarters() {
    if (!prayerBtn) return;

    prayerBtn.disabled = true;
    if (pA) pA.textContent = "Loading…";
    if (pC) pC.textContent = "Loading…";
    if (pT) pT.textContent = "Loading…";
    if (pS) pS.textContent = "Loading…";

    try {
      const lang = prUiLang?.value || "en";

      let data;
      try {
        data = await apiJSON("/daily_prayer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang })
        });
      } catch {
        data = await apiJSON("/daily_prayer", { method: "POST" });
      }

      const obj = safeJSONFromModel(data.json || "");
      if (!obj) throw new Error("Bad JSON from model");

      if (pA) pA.textContent = obj.example_adoration || "—";
      if (pC) pC.textContent = obj.example_confession || "—";
      if (pT) pT.textContent = obj.example_thanksgiving || "—";
      if (pS) pS.textContent = obj.example_supplication || "—";
    } catch (e) {
      console.error(e);
      if (pA) pA.textContent = "Error generating starters.";
      if (pC) pC.textContent = "Please try again.";
      if (pT) pT.textContent = "—";
      if (pS) pS.textContent = "—";
    } finally {
      prayerBtn.disabled = false;
    }
  }

  if (prUiLang) prUiLang.addEventListener("change", applyPrUiLang);
  if (prayerBtn) prayerBtn.addEventListener("click", generatePrayerStarters);
  if (prSaveBtn) prSaveBtn.addEventListener("click", savePrayerEntry);
  if (prStreakBtn) prStreakBtn.addEventListener("click", () => {
    markStreakDone(PR_STREAK);
    refreshPrStreakUI();
  });

  applyPrUiLang();
  renderPrSaved();
  refreshPrStreakUI();

  // ==============================
  // FINAL: run auth check once page is ready
  // ==============================
  refreshMe();

})();

