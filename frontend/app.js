/* Alyana Luz · Bible AI — app.js (MATCHES your index.html IDs)
   Fixes:
   - Wire JS to your current HTML IDs (chatSection, listenBible, bookSelect, etc.)
   - Bible Listen is a toggle (Listen/Stop) and hides Stop button
   - Chat Listen Last is a toggle and hides Stop button (if present)
   - Spanish Bible translation returns verses only (no commentary)
*/

(() => {
  // -----------------------------
  // Helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);

  const LS = {
    chatCurrent: "alyana_chat_current_v3",
    chatSaved: "alyana_chat_saved_v3",
    lastBible: "alyana_bible_last_v2",
  };

  function safeJsonParse(str) {
    try {
      return JSON.parse(str);
    } catch {
      const start = str.indexOf("{");
      const end = str.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(str.slice(start, end + 1));
        } catch {}
      }
      return null;
    }
  }

  // -----------------------------
  // Speech (toggle-friendly)
  // -----------------------------
  const synth = window.speechSynthesis;
  let speakingOwner = null; // { type, btn, originalText }

  function loadVoices() {
    try {
      return synth ? synth.getVoices() : [];
    } catch {
      return [];
    }
  }

  function findVoiceFor(langKey) {
    // You wanted: Karen (en-AU), Paulina (es-MX)
    const voices = loadVoices();

    if (langKey === "es") {
      // prefer Paulina
      let v = voices.find((x) => /paulina/i.test(x.name) && /^es/i.test(x.lang));
      if (!v) v = voices.find((x) => /^es/i.test(x.lang));
      return v || null;
    }

    // English: prefer Karen
    let v = voices.find((x) => /karen/i.test(x.name) && /^en/i.test(x.lang));
    if (!v) v = voices.find((x) => /en-au/i.test(x.lang));
    if (!v) v = voices.find((x) => /^en/i.test(x.lang));
    return v || null;
  }

  function stopSpeaking() {
    try {
      if (synth) synth.cancel();
    } catch {}

    // reset any toggle button label
    if (speakingOwner?.btn) {
      speakingOwner.btn.textContent = speakingOwner.originalText;
      speakingOwner.btn.dataset.toggled = "0";
    }
    speakingOwner = null;
  }

  function speakToggle({ text, langKey, btn, onLabel, offLabel }) {
    const cleaned = (text || "").trim();
    if (!cleaned || !synth) return;

    // If this button is already toggled ON, stop.
    if (btn?.dataset.toggled === "1") {
      stopSpeaking();
      return;
    }

    // Stop anything else currently speaking
    stopSpeaking();

    // Start speaking
    const u = new SpeechSynthesisUtterance(cleaned);
    const v = findVoiceFor(langKey);
    if (v) u.voice = v;
    u.lang = langKey === "es" ? "es-MX" : "en-AU";
    u.rate = 0.92;
    u.pitch = 1.0;
    u.volume = 1.0;

    if (btn) {
      speakingOwner = { btn, originalText: onLabel };
      btn.textContent = offLabel;
      btn.dataset.toggled = "1";
    }

    u.onend = () => {
      if (btn) {
        btn.textContent = onLabel;
        btn.dataset.toggled = "0";
      }
      speakingOwner = null;
    };

    u.onerror = () => {
      if (btn) {
        btn.textContent = onLabel;
        btn.dataset.toggled = "0";
      }
      speakingOwner = null;
    };

    synth.speak(u);
  }

  // Ensure voice list loads in Firefox
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = () => loadVoices();
  }

  // -----------------------------
  // API calls
  // -----------------------------
  async function apiGet(url) {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function apiPost(url, body) {
    const r = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });

    if (!r.ok) {
      let msg = "";
      try {
        const j = await r.json();
        msg = j?.detail || j?.error || JSON.stringify(j);
      } catch {
        msg = await r.text();
      }
      throw new Error(msg || `Request failed (${r.status})`);
    }
    return r.json();
  }

  async function alyanaChat(prompt, history) {
    const j = await apiPost("/chat", { prompt, history: history || [] });
    return j?.message || "";
  }

  // -----------------------------
  // NAV tabs (menu-bar)
  // -----------------------------
  function initTabs() {
    const buttons = document.querySelectorAll(".menu-btn");
    const sections = document.querySelectorAll(".app-section");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.dataset.target;
        buttons.forEach((b) => b.classList.toggle("active", b === btn));
        sections.forEach((s) => s.classList.toggle("active", s.id === target));
      });
    });
  }

  // -----------------------------
  // CHAT
  // -----------------------------
  const chatEl = $("chat");
  const chatForm = $("chatForm");
  const chatInput = $("chatInput");
  const chatSendBtn = $("chatSendBtn");
  const chatNewBtn = $("chatNewBtn");
  const chatSaveBtn = $("chatSaveBtn");
  const chatSavedList = $("chatSavedList");
  const chatLangSelect = $("chatLangSelect"); // auto/en/es
  const chatVoicePill = $("chatVoicePill");

  function loadCurrentChat() {
    try {
      const raw = localStorage.getItem(LS.chatCurrent);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveCurrentChat(arr) {
    localStorage.setItem(LS.chatCurrent, JSON.stringify(arr || []));
  }

  function loadSavedChats() {
    try {
      const raw = localStorage.getItem(LS.chatSaved);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveSavedChats(arr) {
    localStorage.setItem(LS.chatSaved, JSON.stringify(arr || []));
  }

  function renderChat(arr) {
    if (!chatEl) return;
    chatEl.innerHTML = "";

    (arr || []).forEach((m) => {
      const row = document.createElement("div");
      row.className = "bubble-row " + (m.role === "user" ? "user" : "bot");

      const bubble = document.createElement("div");
      bubble.className = "bubble " + (m.role === "user" ? "user" : "bot");
      bubble.textContent = m.content || "";

      row.appendChild(bubble);
      chatEl.appendChild(row);
    });

    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function renderSavedList() {
    if (!chatSavedList) return;

    const saved = loadSavedChats();
    chatSavedList.innerHTML = "";

    if (!saved.length) {
      chatSavedList.innerHTML = `<small style="opacity:0.75;">No saved chats yet.</small>`;
      return;
    }

    saved.forEach((item) => {
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.gap = "8px";
      wrap.style.marginTop = "8px";

      const loadBtn = document.createElement("button");
      loadBtn.className = "btn btn-ghost";
      loadBtn.textContent = item.name || "Saved chat";
      loadBtn.style.flex = "1";
      loadBtn.onclick = () => {
        saveCurrentChat(item.chat || []);
        renderChat(item.chat || []);
      };

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-danger";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => {
        const next = loadSavedChats().filter((x) => x.id !== item.id);
        saveSavedChats(next);
        renderSavedList();
      };

      wrap.appendChild(loadBtn);
      wrap.appendChild(delBtn);
      chatSavedList.appendChild(wrap);
    });
  }

  function lastAssistantMessage(arr) {
    for (let i = (arr || []).length - 1; i >= 0; i--) {
      if (arr[i]?.role === "assistant" && (arr[i].content || "").trim()) return arr[i].content.trim();
    }
    return "";
  }

  async function sendChat() {
    const text = (chatInput?.value || "").trim();
    if (!text) return;

    stopSpeaking();

    const arr = loadCurrentChat();
    arr.push({ role: "user", content: text });
    saveCurrentChat(arr);
    renderChat(arr);
    chatInput.value = "";

    // Choose language for reply
    const sel = (chatLangSelect?.value || "auto").toLowerCase();
    const forceEs = sel === "es";
    const forceEn = sel === "en";

    const langInstruction = forceEs
      ? "Responde completamente en español (sin mezclar inglés)."
      : forceEn
      ? "Reply completely in English (do not mix Spanish)."
      : "Reply in the same language the user used (do not mix languages).";

    const history = arr.slice(-16).map((m) => ({ role: m.role, content: m.content }));

    try {
      const reply = await alyanaChat(`${langInstruction}\n\nUser: ${text}`, history);
      arr.push({ role: "assistant", content: reply || "" });
      saveCurrentChat(arr);
      renderChat(arr);
    } catch (e) {
      arr.push({ role: "assistant", content: `Error: ${String(e.message || e)}` });
      saveCurrentChat(arr);
      renderChat(arr);
    }
  }

  function newChat() {
    stopSpeaking();
    saveCurrentChat([]);
    renderChat([]);
  }

  function saveChat() {
    const arr = loadCurrentChat();
    if (!arr.length) return;

    const name = prompt("Name for this chat:");
    if (!name) return;

    const saved = loadSavedChats();
    saved.unshift({
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      name,
      createdAt: Date.now(),
      chat: arr,
    });
    saveSavedChats(saved.slice(0, 50));
    renderSavedList();
  }

  // Chat "Listen last" toggle (and hide any stop button)
  function initChatListenToggle() {
    // If you have a stop button in some version, hide it
    const possibleStop = $("stopSpeakBtn") || $("stopBtn") || document.querySelector("#chatSection .stop");
    if (possibleStop) possibleStop.style.display = "none";

    // If your UI doesn't have a listen button, we won't create one.
    // (Your current index.html doesn't include "Listen last", but your screenshots do in another build.)
    const listenLastBtn =
      $("listenLastBtn") ||
      document.querySelector("#chatSection button[data-action='listen-last']") ||
      document.querySelector("#chatSection .btn-listen-last");

    if (!listenLastBtn) return;

    listenLastBtn.addEventListener("click", () => {
      const arr = loadCurrentChat();
      const msg = lastAssistantMessage(arr);
      speakToggle({
        text: msg,
        langKey: (chatLangSelect?.value || "auto") === "es" ? "es" : "en",
        btn: listenLastBtn,
        onLabel: "Listen last",
        offLabel: "Stop",
      });
    });
  }

  // -----------------------------
  // BIBLE
  // -----------------------------
  const bookSelect = $("bookSelect");
  const chapterSelect = $("chapterSelect");
  const verseStartSelect = $("verseStartSelect");
  const verseEndSelect = $("verseEndSelect");
  const fullChapter = $("fullChapter");
  const readingVoice = $("readingVoice"); // en / es
  const versionSelect = $("versionSelect"); // label only in your UI
  const listenBibleBtn = $("listenBible");
  const stopBibleBtn = $("stopBible"); // will be hidden
  const passageRef = $("passageRef");
  const passageText = $("passageText");
  const bibleDbStatus = $("bibleDbStatus");

  let bibleCurrent = { reference: "", englishText: "", displayedText: "", lang: "en" };

  function setBibleDisplay(reference, text) {
    if (passageRef) passageRef.textContent = reference || "—";
    if (passageText) passageText.textContent = text || "—";
  }

  function stripToVersesOnly(text) {
    const t = String(text || "").trim();
    if (!t) return "";

    // Try to drop any preface before the first verse number like "1 " or "1."
    const lines = t.split("\n");
    const firstVerseIdx = lines.findIndex((ln) => /^\s*\d+\s/.test(ln) || /^\s*\d+\./.test(ln));
    if (firstVerseIdx > 0) return lines.slice(firstVerseIdx).join("\n").trim();

    // If it contains "**Mateo 1**" etc, remove heading lines until verse begins
    const idx2 = lines.findIndex((ln) => /^\s*\d+/.test(ln));
    if (idx2 > 0) return lines.slice(idx2).join("\n").trim();

    return t;
  }

  async function translateToSpanish(reference, englishText) {
    // Very strict prompt to prevent commentary
    const prompt = `
Traduce este pasaje bíblico al español (latinoamericano), con tono reverente.
REGLAS ESTRICTAS:
- Devuelve SOLAMENTE el texto del pasaje (sin introducción, sin explicación, sin conclusión).
- Mantén los números de versículo.
- No incluyas títulos, ni "aquí tienes", ni comentarios.
PASAJE:
${reference}
${englishText}
`.trim();

    const raw = await alyanaChat(prompt, []);
    return stripToVersesOnly(raw);
  }

  async function loadBooks() {
    try {
      const j = await apiGet("/bible/books");
      const books = j?.books || [];
      if (bookSelect) {
        bookSelect.innerHTML = books.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
      }
      if (bibleDbStatus) bibleDbStatus.textContent = "OK";
    } catch (e) {
      if (bibleDbStatus) bibleDbStatus.textContent = "Error loading Bible DB.";
    }
  }

  async function loadChapters(bookId) {
    try {
      const j = await apiGet(`/bible/chapters?book=${encodeURIComponent(bookId)}`);
      const chs = j?.chapters || [];
      if (chapterSelect) {
        chapterSelect.innerHTML = chs.map((c) => `<option value="${c}">Chapter ${c}</option>`).join("");
      }
    } catch {}
  }

  function populateVerses(max = 200) {
    // Keep it simple: 1..200 (works even if exact max differs)
    const makeOpts = (ph) => {
      const opts = [`<option value="">${ph}</option>`];
      for (let i = 1; i <= max; i++) opts.push(`<option value="${i}">${i}</option>`);
      return opts.join("");
    };
    if (verseStartSelect) verseStartSelect.innerHTML = makeOpts("—");
    if (verseEndSelect) verseEndSelect.innerHTML = makeOpts("(optional)");
  }

  async function fetchPassage() {
    const bookId = bookSelect?.value;
    const chapter = chapterSelect?.value;
    if (!bookId || !chapter) return null;

    const isFull = !!fullChapter?.checked;
    const s = parseInt(verseStartSelect?.value || "", 10);
    const e = parseInt(verseEndSelect?.value || "", 10);

    const hasS = Number.isFinite(s) && s > 0;
    const hasE = Number.isFinite(e) && e > 0;
    const start = hasS ? s : 1;
    const end = hasE ? e : start;

    const url = isFull
      ? `/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=true`
      : `/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=false&start=${encodeURIComponent(
          start
        )}&end=${encodeURIComponent(end)}`;

    const j = await apiGet(url);
    return { reference: j?.reference || "", text: j?.text || "" };
  }

  async function listenBibleToggle() {
    // Toggle off
    if (listenBibleBtn?.dataset.toggled === "1") {
      stopSpeaking();
      return;
    }

    stopSpeaking();

    // Load passage first
    setBibleDisplay("—", (readingVoice?.value || "en") === "es" ? "Traduciendo al español…" : "Loading…");

    let passage;
    try {
      passage = await fetchPassage();
    } catch (e) {
      setBibleDisplay("Error", String(e.message || e));
      return;
    }

    if (!passage?.text) {
      setBibleDisplay("—", "—");
      return;
    }

    const lang = (readingVoice?.value || "en").toLowerCase().startsWith("es") ? "es" : "en";

    bibleCurrent.reference = passage.reference;
    bibleCurrent.englishText = passage.text;
    bibleCurrent.lang = lang;

    if (lang === "es") {
      try {
        const translated = await translateToSpanish(passage.reference, passage.text);
        bibleCurrent.displayedText = translated || passage.text;
      } catch {
        bibleCurrent.displayedText = passage.text; // fallback
      }
    } else {
      bibleCurrent.displayedText = passage.text;
    }

    setBibleDisplay(bibleCurrent.reference, bibleCurrent.displayedText);

    // Speak toggle
    speakToggle({
      text: `${bibleCurrent.reference}\n\n${bibleCurrent.displayedText}`,
      langKey: lang,
      btn: listenBibleBtn,
      onLabel: lang === "es" ? "Escuchar" : "Listen",
      offLabel: lang === "es" ? "Detener" : "Stop",
    });

    // Save last bible
    try {
      localStorage.setItem(
        LS.lastBible,
        JSON.stringify({
          bookId: bookSelect?.value || "",
          chapter: chapterSelect?.value || "",
          start: verseStartSelect?.value || "",
          end: verseEndSelect?.value || "",
          full: !!fullChapter?.checked,
          lang,
          reference: bibleCurrent.reference,
          englishText: bibleCurrent.englishText,
          displayedText: bibleCurrent.displayedText,
          versionLabel: versionSelect?.value || "KJV",
        })
      );
    } catch {}
  }

  async function restoreLastBible() {
    try {
      const raw = localStorage.getItem(LS.lastBible);
      if (!raw) return;

      const last = JSON.parse(raw);
      if (!last) return;

      if (bookSelect && last.bookId) {
        bookSelect.value = String(last.bookId);
        await loadChapters(String(last.bookId));
      }
      if (chapterSelect && last.chapter) chapterSelect.value = String(last.chapter);
      if (verseStartSelect) verseStartSelect.value = last.start || "";
      if (verseEndSelect) verseEndSelect.value = last.end || "";
      if (fullChapter) fullChapter.checked = !!last.full;
      if (readingVoice) readingVoice.value = last.lang === "es" ? "es" : "en";

      setBibleDisplay(last.reference || "—", last.displayedText || "—");
    } catch {}
  }

  // -----------------------------
  // Boot / Bind
  // -----------------------------
  function bind() {
    initTabs();

    // CHAT binds
    if (chatForm) chatForm.addEventListener("submit", (e) => (e.preventDefault(), sendChat()));
    if (chatSendBtn) chatSendBtn.addEventListener("click", sendChat);
    if (chatNewBtn) chatNewBtn.addEventListener("click", newChat);
    if (chatSaveBtn) chatSaveBtn.addEventListener("click", saveChat);

    // Optional: show voice status
    if (chatVoicePill) chatVoicePill.textContent = "Voice: ready";

    initChatListenToggle();

    // BIBLE binds
    if (stopBibleBtn) stopBibleBtn.style.display = "none"; // hide Stop button (you wanted toggle)
    if (listenBibleBtn) {
      listenBibleBtn.dataset.toggled = "0";
      listenBibleBtn.addEventListener("click", listenBibleToggle);
    }
    if (stopBibleBtn) stopBibleBtn.addEventListener("click", stopSpeaking);

    if (bookSelect) {
      bookSelect.addEventListener("change", async () => {
        stopSpeaking();
        await loadChapters(bookSelect.value);
      });
    }

    // If language changes while speaking, stop
    if (readingVoice) readingVoice.addEventListener("change", () => stopSpeaking());
  }

  async function boot() {
    bind();

    // Chat initial render
    renderChat(loadCurrentChat());
    renderSavedList();

    // Bible init
    populateVerses(200);
    await loadBooks();
    if (bookSelect?.value) await loadChapters(bookSelect.value);
    await restoreLastBible();
  }

  boot();
})();














