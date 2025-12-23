/* Alyana Luz · Bible AI — SAFE BOOT app.js
   Goals:
   - Never crash the entire app if one element/ID is missing
   - Restore tab switching
   - Restore core Chat + Bible load + Bible Listen toggle
   - Update #jsStatus so you can immediately see if JS is running
*/

(() => {
  // -----------------------------
  // Safe helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function setJsStatus(text, ok = true) {
    const el = $("jsStatus");
    if (!el) return;
    el.textContent = text;
    el.style.opacity = "1";
    el.style.borderColor = ok ? "rgba(34,197,94,0.55)" : "rgba(225,29,72,0.65)";
  }

  function safe(fn, label = "unknown") {
    try {
      return fn();
    } catch (e) {
      console.error(`[Alyana JS ERROR @ ${label}]`, e);
      setJsStatus(`JS: ERROR (${label})`, false);
      // Do not rethrow — keep app alive
      return null;
    }
  }

  // -----------------------------
  // Speech (toggle)
  // -----------------------------
  const synth = window.speechSynthesis;
  let activeBtn = null;
  let activeBtnLabel = "";

  function stopSpeaking() {
    try {
      if (synth) synth.cancel();
    } catch {}
    if (activeBtn) {
      activeBtn.textContent = activeBtnLabel;
      activeBtn.dataset.toggled = "0";
    }
    activeBtn = null;
    activeBtnLabel = "";
  }

  function pickVoice(langKey) {
    if (!synth) return null;
    const voices = synth.getVoices ? synth.getVoices() : [];
    if (!voices.length) return null;

    if (langKey === "es") {
      return (
        voices.find((v) => /paulina/i.test(v.name) && /^es/i.test(v.lang)) ||
        voices.find((v) => /^es/i.test(v.lang)) ||
        null
      );
    }
    return (
      voices.find((v) => /karen/i.test(v.name) && /^en/i.test(v.lang)) ||
      voices.find((v) => /en-au/i.test(v.lang)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      null
    );
  }

  function speakToggle(btn, text, langKey, onLabel, offLabel) {
    const cleaned = String(text || "").trim();
    if (!cleaned || !synth || !btn) return;

    // toggle off
    if (btn.dataset.toggled === "1") {
      stopSpeaking();
      return;
    }

    stopSpeaking();

    const u = new SpeechSynthesisUtterance(cleaned);
    const v = pickVoice(langKey);
    if (v) u.voice = v;
    u.lang = langKey === "es" ? "es-MX" : "en-AU";
    u.rate = 0.92;

    activeBtn = btn;
    activeBtnLabel = onLabel;
    btn.textContent = offLabel;
    btn.dataset.toggled = "1";

    u.onend = () => stopSpeaking();
    u.onerror = () => stopSpeaking();

    synth.speak(u);
  }

  // Make sure voices load in Firefox
  if (synth) {
    try {
      synth.onvoiceschanged = () => {};
    } catch {}
  }

  // -----------------------------
  // API
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
  // Tabs (YOUR index.html structure)
  // -----------------------------
  function initTabs() {
    const buttons = qsa(".menu-btn");
    const sections = qsa(".app-section");

    if (!buttons.length || !sections.length) return;

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        buttons.forEach((b) => b.classList.toggle("active", b === btn));
        sections.forEach((s) => s.classList.toggle("active", s.id === target));
      });
    });
  }

  // -----------------------------
  // Chat (minimal: Send/New/Save)
  // -----------------------------
  const LS = {
    chatCurrent: "alyana_chat_current_v4",
    chatSaved: "alyana_chat_saved_v4",
    lastBible: "alyana_bible_last_v3",
  };

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJson(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  }

  function renderChatMessages(arr) {
    const chat = $("chat");
    if (!chat) return;
    chat.innerHTML = "";
    (arr || []).forEach((m) => {
      const row = document.createElement("div");
      row.className = "bubble-row " + (m.role === "user" ? "user" : "bot");
      const bubble = document.createElement("div");
      bubble.className = "bubble " + (m.role === "user" ? "user" : "bot");
      bubble.textContent = m.content || "";
      row.appendChild(bubble);
      chat.appendChild(row);
    });
    chat.scrollTop = chat.scrollHeight;
  }

  function renderSavedChats() {
    const list = $("chatSavedList");
    if (!list) return;
    const saved = loadJson(LS.chatSaved, []);
    list.innerHTML = "";
    if (!saved.length) {
      list.innerHTML = `<small style="opacity:0.75;">No saved chats yet.</small>`;
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
        saveJson(LS.chatCurrent, item.chat || []);
        renderChatMessages(item.chat || []);
      };

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-danger";
      delBtn.textContent = "Delete";
      delBtn.onclick = () => {
        const next = saved.filter((x) => x.id !== item.id);
        saveJson(LS.chatSaved, next);
        renderSavedChats();
      };

      wrap.appendChild(loadBtn);
      wrap.appendChild(delBtn);
      list.appendChild(wrap);
    });
  }

  function lastAssistantMessage(arr) {
    for (let i = (arr || []).length - 1; i >= 0; i--) {
      if (arr[i]?.role === "assistant" && (arr[i].content || "").trim()) return arr[i].content.trim();
    }
    return "";
  }

  async function sendChat() {
    const input = $("chatInput");
    if (!input) return;

    const text = String(input.value || "").trim();
    if (!text) return;

    stopSpeaking();

    const arr = loadJson(LS.chatCurrent, []);
    arr.push({ role: "user", content: text });
    saveJson(LS.chatCurrent, arr);
    renderChatMessages(arr);
    input.value = "";

    const langSel = $("chatLangSelect");
    const sel = (langSel?.value || "auto").toLowerCase();
    const instruction =
      sel === "es"
        ? "Responde completamente en español (sin mezclar inglés)."
        : sel === "en"
        ? "Reply completely in English (do not mix Spanish)."
        : "Reply in the same language the user used (do not mix languages).";

    const history = arr.slice(-16).map((m) => ({ role: m.role, content: m.content }));

    try {
      const reply = await alyanaChat(`${instruction}\n\nUser: ${text}`, history);
      arr.push({ role: "assistant", content: reply || "" });
      saveJson(LS.chatCurrent, arr);
      renderChatMessages(arr);
    } catch (e) {
      arr.push({ role: "assistant", content: `Error: ${String(e.message || e)}` });
      saveJson(LS.chatCurrent, arr);
      renderChatMessages(arr);
    }
  }

  function newChat() {
    stopSpeaking();
    saveJson(LS.chatCurrent, []);
    renderChatMessages([]);
  }

  function saveChat() {
    const arr = loadJson(LS.chatCurrent, []);
    if (!arr.length) return;

    const name = prompt("Name for this chat:");
    if (!name) return;

    const saved = loadJson(LS.chatSaved, []);
    saved.unshift({
      id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      name,
      createdAt: Date.now(),
      chat: arr,
    });
    saveJson(LS.chatSaved, saved.slice(0, 50));
    renderSavedChats();
  }

  // Optional: if you still have a "Listen last" button somewhere, make it toggle.
  function bindOptionalListenLast() {
    const btn =
      $("listenLastBtn") ||
      qs("#chatSection button[data-action='listen-last']") ||
      qs("#chatSection .btn-listen-last");

    if (!btn) return;

    btn.addEventListener("click", () => {
      const arr = loadJson(LS.chatCurrent, []);
      const msg = lastAssistantMessage(arr);
      const langSel = $("chatLangSelect");
      const langKey = (langSel?.value || "auto") === "es" ? "es" : "en";
      speakToggle(btn, msg, langKey, btn.dataset.onlabel || "Listen last", "Stop");
    });
  }

  // -----------------------------
  // Bible (wire YOUR IDs)
  // -----------------------------
  async function loadBooks() {
    const bookSelect = $("bookSelect");
    if (!bookSelect) return;

    const status = $("bibleDbStatus");
    if (status) status.textContent = "Checking…";

    const j = await apiGet("/bible/books");
    const books = j?.books || [];
    bookSelect.innerHTML = books.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
    if (status) status.textContent = "OK";
  }

  async function loadChaptersForBook(bookId) {
    const chapterSelect = $("chapterSelect");
    if (!chapterSelect) return;

    const j = await apiGet(`/bible/chapters?book=${encodeURIComponent(bookId)}`);
    const chs = j?.chapters || [];
    chapterSelect.innerHTML = chs.map((c) => `<option value="${c}">Chapter ${c}</option>`).join("");
  }

  function setBibleOutput(reference, text) {
    const refEl = $("passageRef");
    const txtEl = $("passageText");
    if (refEl) refEl.textContent = reference || "—";
    if (txtEl) txtEl.textContent = text || "—";
  }

  function stripToVersesOnly(text) {
    const t = String(text || "").trim();
    if (!t) return "";
    const lines = t.split("\n");
    const firstVerse = lines.findIndex((ln) => /^\s*\d+(\s|\.)/.test(ln));
    if (firstVerse >= 0) return lines.slice(firstVerse).join("\n").trim();
    return t;
  }

  async function translateToSpanish(reference, englishText) {
    const prompt = `
Traduce este pasaje bíblico al español (latinoamericano), con tono reverente.
REGLAS ESTRICTAS:
- Devuelve SOLAMENTE el texto del pasaje (sin introducción, sin explicación, sin conclusión).
- Mantén los números de versículo.
PASAJE:
${reference}
${englishText}
`.trim();

    const raw = await alyanaChat(prompt, []);
    return stripToVersesOnly(raw);
  }

  async function fetchBiblePassage({ full }) {
    const bookId = $("bookSelect")?.value;
    const chapter = $("chapterSelect")?.value;
    if (!bookId || !chapter) return null;

    const s = parseInt($("verseStartSelect")?.value || "", 10);
    const e = parseInt($("verseEndSelect")?.value || "", 10);
    const hasS = Number.isFinite(s) && s > 0;
    const hasE = Number.isFinite(e) && e > 0;
    const start = hasS ? s : 1;
    const end = hasE ? e : start;

    const url = full
      ? `/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=true`
      : `/bible/passage?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=false&start=${encodeURIComponent(
          start
        )}&end=${encodeURIComponent(end)}`;

    const j = await apiGet(url);
    return { reference: j?.reference || "", text: j?.text || "" };
  }

  async function loadBibleToScreen() {
    stopSpeaking();

    const full = !!$("fullChapter")?.checked;
    setBibleOutput("—", "Loading…");

    const passage = await fetchBiblePassage({ full });
    if (!passage?.text) {
      setBibleOutput("—", "—");
      return;
    }

    const lang = ($("readingVoice")?.value || "en").startsWith("es") ? "es" : "en";
    let shown = passage.text;

    if (lang === "es") {
      setBibleOutput(passage.reference, "Traduciendo al español…");
      try {
        shown = await translateToSpanish(passage.reference, passage.text);
      } catch {
        shown = passage.text;
      }
    }

    setBibleOutput(passage.reference, shown);

    // persist
    saveJson(LS.lastBible, {
      bookId: $("bookSelect")?.value || "",
      chapter: $("chapterSelect")?.value || "",
      start: $("verseStartSelect")?.value || "",
      end: $("verseEndSelect")?.value || "",
      full,
      lang,
      reference: passage.reference,
      englishText: passage.text,
      displayedText: shown,
    });
  }

  async function listenBibleToggle() {
    const btn = $("listenBible");
    if (!btn) return;

    // Toggle off if already speaking from this button
    if (btn.dataset.toggled === "1") {
      stopSpeaking();
      return;
    }

    // Ensure we have content loaded; if not, load then speak
    const last = loadJson(LS.lastBible, null);
    const currentText = $("passageText")?.textContent || "";
    const currentRef = $("passageRef")?.textContent || "";

    let ref = currentRef;
    let text = currentText;

    if (!text || text === "—" || text.includes("Loading") || text.includes("Traduciendo")) {
      await loadBibleToScreen();
      ref = $("passageRef")?.textContent || "";
      text = $("passageText")?.textContent || "";
    } else if (last && (!ref || ref === "—")) {
      ref = last.reference || ref;
      text = last.displayedText || text;
    }

    const lang = ($("readingVoice")?.value || "en").startsWith("es") ? "es" : "en";
    speakToggle(btn, `${ref}\n\n${text}`, lang, lang === "es" ? "Escuchar" : "Listen", lang === "es" ? "Detener" : "Stop");
  }

  async function restoreLastBible() {
    const last = loadJson(LS.lastBible, null);
    if (!last) return;

    if ($("bookSelect") && last.bookId) {
      $("bookSelect").value = String(last.bookId);
      await loadChaptersForBook(String(last.bookId));
    }
    if ($("chapterSelect") && last.chapter) $("chapterSelect").value = String(last.chapter);
    if ($("verseStartSelect")) $("verseStartSelect").value = last.start || "";
    if ($("verseEndSelect")) $("verseEndSelect").value = last.end || "";
    if ($("fullChapter")) $("fullChapter").checked = !!last.full;
    if ($("readingVoice")) $("readingVoice").value = last.lang === "es" ? "es" : "en";

    setBibleOutput(last.reference || "—", last.displayedText || "—");
  }

  // -----------------------------
  // Bind events (ONLY after DOM exists)
  // -----------------------------
  function bindEvents() {
    // Tabs
    initTabs();

    // Chat
    const chatForm = $("chatForm");
    const sendBtn = $("chatSendBtn");
    const newBtn = $("chatNewBtn");
    const saveBtn = $("chatSaveBtn");

    if (chatForm) chatForm.addEventListener("submit", (e) => (e.preventDefault(), safe(sendChat, "sendChat")));
    if (sendBtn) sendBtn.addEventListener("click", () => safe(sendChat, "sendChatClick"));
    if (newBtn) newBtn.addEventListener("click", () => safe(newChat, "newChat"));
    if (saveBtn) saveBtn.addEventListener("click", () => safe(saveChat, "saveChat"));

    bindOptionalListenLast();

    // Bible
    const stopBible = $("stopBible");
    if (stopBible) stopBible.style.display = "none"; // you wanted no Stop button

    const listenBible = $("listenBible");
    if (listenBible) {
      listenBible.dataset.toggled = "0";
      listenBible.addEventListener("click", () => safe(listenBibleToggle, "listenBibleToggle"));
    }

    const loadBtn = $("loadChapterBtn") || $("loadChapter") || $("listenBible"); // (fallback)
    // NOTE: your index.html uses button id="listenBible" for listen, but there is no "loadChapterBtn".
    // So we wire to the buttons you actually have:
    const loadChapterBtn = $("loadChapterBtn") || $("loadChapter");
    const loadPassageBtn = $("loadPassageBtn") || $("loadPassage");

    // Your index.html does NOT have loadChapter/loadPassage IDs; it uses the selects + Listen.
    // So instead, we load on Listen click (above). Still, if you later add buttons, this will work.
    if (loadChapterBtn) loadChapterBtn.addEventListener("click", () => safe(loadBibleToScreen, "loadBibleToScreen"));
    if (loadPassageBtn) loadPassageBtn.addEventListener("click", () => safe(loadBibleToScreen, "loadBibleToScreen"));

    const bookSelect = $("bookSelect");
    if (bookSelect) {
      bookSelect.addEventListener("change", () =>
        safe(async () => {
          stopSpeaking();
          await loadChaptersForBook(bookSelect.value);
        }, "bookChange")
      );
    }

    const readingVoice = $("readingVoice");
    if (readingVoice) readingVoice.addEventListener("change", () => stopSpeaking());

    // Render chat on load
    renderChatMessages(loadJson(LS.chatCurrent, []));
    renderSavedChats();
  }

  // -----------------------------
  // BOOT
  // -----------------------------
  async function boot() {
    setJsStatus("JS: starting…", true);

    bindEvents();

    // Bible init
    await safe(async () => {
      await loadBooks();
      const bookId = $("bookSelect")?.value;
      if (bookId) await loadChaptersForBook(bookId);
      await restoreLastBible();
    }, "bibleInit");

    setJsStatus("JS: OK", true);
  }

  safe(boot, "boot");
})();















