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
    const res = await fetch(url, opts);
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
  // Support button
  // ------------------------------
  const supportBtn = $("supportBtn");
  if (supportBtn) supportBtn.addEventListener("click", () => window.open("https://buy.stripe.com/", "_blank"));

  // ------------------------------
  // TTS (2 voices)
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
  // BIBLE READER (THIS IS WHAT YOU ARE MISSING)
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

        // Toggle stop if currently speaking
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
          // Keep Spanish voice pure
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

  // Initialize Bible Reader if that section exists in your HTML
  (async function initBible() {
    if (!document.getElementById("bibleSection")) return;
    if (!bookSelect) return; // Bible UI not present in your current index.html

    try {
      await loadBibleHealth();
      await loadBooks();

      // Auto-select first book/chapter/verses
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

  // ------------------------------
  // DEVOTIONAL (kept simple for now)
  // ------------------------------
  const devotionalBtn = $("devotionalBtn");
  const devotionalListenBtn = $("devotionalListenBtn");
  const devotionalLang = $("devotionalLang");
  const devotionalScripture = $("devotionalScripture");
  const devotionalExplain = $("devotionalExplain");
  let devotionalLastText = "";

  if (devotionalBtn) {
    devotionalBtn.addEventListener("click", async () => {
      devotionalBtn.disabled = true;
      if (devotionalScripture) devotionalScripture.textContent = "Loading…";
      if (devotionalExplain) devotionalExplain.textContent = "Loading…";
      devotionalLastText = "";

      try {
        const data = await apiJSON("/devotional", { method: "POST" });
        const obj = safeJSONFromModel(data.json || "");
        if (!obj) throw new Error("Bad JSON from model");
        if (devotionalScripture) devotionalScripture.textContent = obj.scripture || "—";
        if (devotionalExplain) devotionalExplain.textContent = obj.brief_explanation || "—";
        devotionalLastText = `${obj.scripture || ""}\n\n${obj.brief_explanation || ""}`.trim();
      } catch (e) {
        console.error(e);
        if (devotionalScripture) devotionalScripture.textContent = "Error generating devotional.";
        if (devotionalExplain) devotionalExplain.textContent = "Please try again.";
      } finally {
        devotionalBtn.disabled = false;
      }
    });
  }

  if (devotionalListenBtn) {
    devotionalListenBtn.addEventListener("click", () => {
      if (!devotionalLastText) { alert("Generate a devotional first."); return; }
      const langKey = devotionalLang?.value || "en";
      if (TTS.isSpeaking) stopSpeaking();
      else speakText(devotionalLastText, langKey);
    });
  }

  // ------------------------------
  // DAILY PRAYER (starter generation)
  // ------------------------------
  const prayerBtn = $("prayerBtn");
  const prayerListenBtn = $("prayerListenBtn");
  const prayerLang = $("prayerLang");
  const pA = $("pA");
  const pC = $("pC");
  const pT = $("pT");
  const pS = $("pS");
  let prayerLastText = "";

  if (prayerBtn) {
    prayerBtn.addEventListener("click", async () => {
      prayerBtn.disabled = true;
      if (pA) pA.textContent = "Loading…";
      if (pC) pC.textContent = "Loading…";
      if (pT) pT.textContent = "Loading…";
      if (pS) pS.textContent = "Loading…";
      prayerLastText = "";

      try {
        const data = await apiJSON("/daily_prayer", { method: "POST" });
        const obj = safeJSONFromModel(data.json || "");
        if (!obj) throw new Error("Bad JSON from model");
        if (pA) pA.textContent = obj.example_adoration || "—";
        if (pC) pC.textContent = obj.example_confession || "—";
        if (pT) pT.textContent = obj.example_thanksgiving || "—";
        if (pS) pS.textContent = obj.example_supplication || "—";

        prayerLastText = [
          "Adoration: " + (obj.example_adoration || ""),
          "Confession: " + (obj.example_confession || ""),
          "Thanksgiving: " + (obj.example_thanksgiving || ""),
          "Supplication: " + (obj.example_supplication || "")
        ].join("\n\n").trim();
      } catch (e) {
        console.error(e);
        if (pA) pA.textContent = "Error generating prayer.";
        if (pC) pC.textContent = "Please try again.";
        if (pT) pT.textContent = "—";
        if (pS) pS.textContent = "—";
      } finally {
        prayerBtn.disabled = false;
      }
    });
  }

  if (prayerListenBtn) {
    prayerListenBtn.addEventListener("click", () => {
      if (!prayerLastText) { alert("Generate a daily prayer first."); return; }
      const langKey = prayerLang?.value || "en";
      if (TTS.isSpeaking) stopSpeaking();
      else speakText(prayerLastText, langKey);
    });
  }

})();

