/* Alyana Luz · Bible AI — app.js (full file)
   - Old purple theme (runtime CSS var override)
   - Chat bubbles + memory (history sent to backend)
   - Voices: Karen (en-AU), Paulina (es-MX)
   - Listen on Chat + Bible passage
   - Devotional/Prayer guided UI + Save + Streak (localStorage)
*/

(() => {
  // -----------------------------
  // Theme (force "old" purple colors)
  // -----------------------------
  function applyOldThemeColors() {
    const root = document.documentElement;
    // These match your older purple scheme feel.
    root.style.setProperty("--bg", "#050316");
    root.style.setProperty("--panel", "rgba(255,255,255,.06)");
    root.style.setProperty("--panel2", "rgba(255,255,255,.09)");
    root.style.setProperty("--stroke", "rgba(255,255,255,.12)");
    root.style.setProperty("--text", "rgba(255,255,255,.92)");
    root.style.setProperty("--muted", "rgba(255,255,255,.65)");
    root.style.setProperty("--accent", "#7c6cff");
    root.style.setProperty("--good", "#28d17c");
    root.style.setProperty("--bad", "#ff4d6d");
    root.style.setProperty("--shadow", "0 18px 50px rgba(0,0,0,.45)");

    // Also set theme-color meta if present
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", "#050316");
  }

  // -----------------------------
  // DOM helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => {
      if (c == null) return;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else node.appendChild(c);
    });
    return node;
  }

  // -----------------------------
  // API helper
  // -----------------------------
  async function api(path, { method = "GET", body, headers } = {}) {
    const opts = {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(headers || {}),
      },
      credentials: "include",
    };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const msg =
        (data && data.detail) ||
        (typeof data === "string" ? data : "") ||
        `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // -----------------------------
  // Speech (TTS)
  // -----------------------------
  const TTS = {
    voices: [],
    selectedVoiceName: null,
    lang: "en",
    speaking: false,

    wanted: [
      { key: "en", label: "Karen — en-AU", match: (v) => /karen/i.test(v.name) && /en[-_]?au/i.test(v.lang) },
      { key: "es", label: "Paulina — es-MX", match: (v) => /paulina/i.test(v.name) && /es[-_]?mx/i.test(v.lang) },
    ],

    loadVoices() {
      const all = window.speechSynthesis ? speechSynthesis.getVoices() : [];
      // Keep only Karen + Paulina if found; else fallback to language matches
      const selected = [];

      for (const w of TTS.wanted) {
        const found = all.find(w.match);
        if (found) selected.push(found);
      }

      // If missing, try fallback by lang
      if (!selected.find((v) => /en/i.test(v.lang))) {
        const anyEn = all.find((v) => /^en/i.test(v.lang));
        if (anyEn) selected.unshift(anyEn);
      }
      if (!selected.find((v) => /^es/i.test(v.lang))) {
        const anyEs = all.find((v) => /^es/i.test(v.lang));
        if (anyEs) selected.push(anyEs);
      }

      // De-dupe by name+lang
      const dedup = [];
      const seen = new Set();
      for (const v of selected) {
        const k = `${v.name}__${v.lang}`;
        if (!seen.has(k)) {
          seen.add(k);
          dedup.push(v);
        }
      }

      TTS.voices = dedup;
      // Default: Karen if lang=en, Paulina if lang=es
      TTS.autoPick();
    },

    autoPick() {
      if (!TTS.voices.length) return;
      if (TTS.lang === "es") {
        const paulina = TTS.voices.find((v) => /paulina/i.test(v.name)) || TTS.voices.find((v) => /^es/i.test(v.lang));
        if (paulina) TTS.selectedVoiceName = paulina.name;
      } else {
        const karen = TTS.voices.find((v) => /karen/i.test(v.name)) || TTS.voices.find((v) => /^en/i.test(v.lang));
        if (karen) TTS.selectedVoiceName = karen.name;
      }
    },

    stop() {
      try {
        if (window.speechSynthesis) speechSynthesis.cancel();
      } catch {}
      TTS.speaking = false;
    },

    speak(text) {
      if (!window.speechSynthesis) {
        alert("Text-to-speech is not supported in this browser.");
        return;
      }
      TTS.stop();
      const t = String(text || "").trim();
      if (!t) return;

      const u = new SpeechSynthesisUtterance(t);
      const v = TTS.voices.find((x) => x.name === TTS.selectedVoiceName) || null;
      if (v) u.voice = v;

      // Keep utterance language aligned
      u.lang = (v && v.lang) || (TTS.lang === "es" ? "es-MX" : "en-AU");

      u.onstart = () => (TTS.speaking = true);
      u.onend = () => (TTS.speaking = false);
      u.onerror = () => (TTS.speaking = false);

      speechSynthesis.speak(u);
    },
  };

  // -----------------------------
  // Local storage keys
  // -----------------------------
  const LS = {
    chats: "alyana_saved_chats_v4",
    current: "alyana_current_chat_v4",
    devotionals: "alyana_saved_devotionals_v2",
    prayers: "alyana_saved_prayers_v2",
    streaks: "alyana_streaks_v1",
    tts: "alyana_tts_v2",
    bibleVersion: "alyana_bible_version_v1",
  };

  function loadJson(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  }
  function saveJson(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  // -----------------------------
  // App state
  // -----------------------------
  let account = { logged_in: false, email: null, active: false };
  let bible = { books: [], chapters: [] };
  let currentTab = "chat";

  let currentChat = {
    id: String(Date.now()),
    title: "New chat",
    messages: [], // {role:"user"|"assistant", content, ts}
  };

  // -----------------------------
  // Mount extra controls into the existing HTML layout
  // (Your index.html already has core containers.)
  // -----------------------------
  function injectVoiceControls() {
    // Chat view: insert a row above the chatbox
    const viewChat = $("#view-chat");
    if (!viewChat) return;

    // Avoid double-inject
    if ($("#voiceRow")) return;

    const row = el("div", { class: "row", id: "voiceRow", style: "margin-top:10px; align-items:center;" });

    const langSel = el("select", { id: "uiLang" }, [
      el("option", { value: "en" }, ["English"]),
      el("option", { value: "es" }, ["Español"]),
    ]);

    const voiceSel = el("select", { id: "voiceSel" });

    const listenBtn = el("button", { class: "btn primary", id: "listenLastBtn", type: "button" }, ["Listen"]);
    const stopBtn = el("button", { class: "btn", id: "stopBtn", type: "button" }, ["Stop"]);

    const hint = el("div", { class: "small", style: "flex-basis:100%; min-width:100%;" }, [
      "Voice & language apply to Listen in Bible + Chat.",
    ]);

    row.appendChild(langSel);
    row.appendChild(voiceSel);
    row.appendChild(listenBtn);
    row.appendChild(stopBtn);
    row.appendChild(hint);

    // Insert under Chat title + muted line (before chatbox)
    const chatbox = viewChat.querySelector(".chatbox");
    viewChat.insertBefore(row, chatbox);

    // Wire events
    langSel.addEventListener("change", () => {
      TTS.lang = langSel.value;
      TTS.autoPick();
      persistTtsSettings();
      renderVoiceDropdown();
    });

    voiceSel.addEventListener("change", () => {
      TTS.selectedVoiceName = voiceSel.value;
      persistTtsSettings();
    });

    listenBtn.addEventListener("click", () => {
      const last = [...currentChat.messages].reverse().find((m) => m.role === "assistant");
      if (!last) return;
      TTS.speak(last.content);
    });

    stopBtn.addEventListener("click", () => TTS.stop());
  }

  function renderVoiceDropdown() {
    const voiceSel = $("#voiceSel");
    if (!voiceSel) return;

    voiceSel.innerHTML = "";
    if (!TTS.voices.length) {
      voiceSel.appendChild(el("option", { value: "" }, ["(No voices found)"]));
      voiceSel.disabled = true;
      return;
    }
    voiceSel.disabled = false;

    for (const v of TTS.voices) {
      const label =
        /karen/i.test(v.name) ? "Karen — en-AU" :
        /paulina/i.test(v.name) ? "Paulina — es-MX" :
        `${v.name} — ${v.lang}`;
      voiceSel.appendChild(el("option", { value: v.name }, [label]));
    }
    if (TTS.selectedVoiceName) voiceSel.value = TTS.selectedVoiceName;
  }

  function persistTtsSettings() {
    saveJson(LS.tts, { lang: TTS.lang, selectedVoiceName: TTS.selectedVoiceName });
  }

  function restoreTtsSettings() {
    const s = loadJson(LS.tts, null);
    if (s && (s.lang === "en" || s.lang === "es")) TTS.lang = s.lang;
    if (s && s.selectedVoiceName) TTS.selectedVoiceName = s.selectedVoiceName;

    const langSel = $("#uiLang");
    if (langSel) langSel.value = TTS.lang;
  }

  // -----------------------------
  // Tabs
  // -----------------------------
  function setTab(tab) {
    currentTab = tab;
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $("#view-chat").style.display = tab === "chat" ? "" : "none";
    $("#view-bible").style.display = tab === "bible" ? "" : "none";
    $("#view-devotional").style.display = tab === "devotional" ? "" : "none";
    $("#view-prayer").style.display = tab === "prayer" ? "" : "none";
  }

  // -----------------------------
  // Chat UI
  // -----------------------------
  function renderMessages() {
    const box = $("#messages");
    if (!box) return;
    box.innerHTML = "";

    for (let i = 0; i < currentChat.messages.length; i++) {
      const m = currentChat.messages[i];
      const row = el("div", { class: `msg-row ${m.role === "user" ? "me" : "bot"}` });
      const bubble = el("div", { class: "bubble" }, []);
      bubble.innerHTML = escapeHtml(m.content);

      // meta actions (Listen for assistant messages)
      const meta = el("div", { class: "meta" }, []);
      const ts = new Date(m.ts || Date.now()).toLocaleString();
      meta.appendChild(document.createTextNode(ts));

      if (m.role === "assistant") {
        const btnWrap = el("span", { style: "margin-left:10px;" });
        const listen = el("button", { class: "btn", type: "button", style: "padding:6px 9px; border-radius:10px;" }, ["Listen"]);
        listen.addEventListener("click", () => TTS.speak(m.content));
        btnWrap.appendChild(listen);

        const stop = el("button", { class: "btn", type: "button", style: "padding:6px 9px; border-radius:10px; margin-left:8px;" }, ["Stop"]);
        stop.addEventListener("click", () => TTS.stop());
        btnWrap.appendChild(stop);

        meta.appendChild(btnWrap);
      }

      bubble.appendChild(meta);
      row.appendChild(bubble);
      box.appendChild(row);
    }

    // scroll to bottom
    box.scrollTop = box.scrollHeight;
  }

  function setChatStatus(text, isError = false) {
    const s = $("#chatStatus");
    if (!s) return;
    s.className = isError ? "danger small" : "small";
    s.textContent = text || "";
  }

  function getHistoryForBackend() {
    // backend expects [{role, content}]
    // send last ~16 messages max
    const trimmed = currentChat.messages.slice(-16).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return trimmed;
  }

  async function sendChat() {
    const input = $("#chatInput");
    const sendBtn = $("#sendBtn");
    if (!input) return;

    const prompt = String(input.value || "").trim();
    if (!prompt) return;

    input.value = "";
    setChatStatus("Sending...");
    if (sendBtn) sendBtn.disabled = true;

    currentChat.messages.push({ role: "user", content: prompt, ts: Date.now() });
    renderMessages();
    persistCurrentChat();

    try {
      // NOTE: your server has /chat (free) and /premium/chat (paid). We'll use /chat.
      const data = await api("/chat", {
        method: "POST",
        body: { prompt, history: getHistoryForBackend() },
      });

      const reply = (data && (data.message || data?.json?.message)) || data?.message || "";
      currentChat.messages.push({ role: "assistant", content: reply || "(No response)", ts: Date.now() });

      // Title heuristic
      if (currentChat.title === "New chat") {
        currentChat.title = prompt.length > 28 ? prompt.slice(0, 28) + "…" : prompt;
      }

      setChatStatus("");
      renderMessages();
      persistCurrentChat();
      renderSavedChats();
    } catch (e) {
      setChatStatus(`Error: ${e.message}`, true);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  function newChat() {
    TTS.stop();
    currentChat = {
      id: String(Date.now()),
      title: "New chat",
      messages: [],
    };
    persistCurrentChat();
    renderMessages();
    setChatStatus("");
  }

  function saveChat() {
    const all = loadJson(LS.chats, []);
    const existsIdx = all.findIndex((c) => c.id === currentChat.id);
    const snapshot = {
      id: currentChat.id,
      title: currentChat.title || "Chat",
      messages: currentChat.messages || [],
      updatedAt: Date.now(),
    };
    if (existsIdx >= 0) all[existsIdx] = snapshot;
    else all.unshift(snapshot);

    // cap
    saveJson(LS.chats, all.slice(0, 50));
    renderSavedChats();
    setChatStatus("Saved on this device.");
    setTimeout(() => setChatStatus(""), 1200);
  }

  function persistCurrentChat() {
    saveJson(LS.current, currentChat);
  }

  function restoreCurrentChat() {
    const c = loadJson(LS.current, null);
    if (c && c.id && Array.isArray(c.messages)) {
      currentChat = c;
    }
  }

  function renderSavedChats() {
    const list = $("#savedList");
    if (!list) return;
    const all = loadJson(LS.chats, []);
    list.innerHTML = "";

    if (!all.length) {
      list.appendChild(el("div", { class: "muted" }, ["No saved chats yet."]));
      return;
    }

    for (const c of all) {
      const item = el("div", { class: "saved-item" });

      const left = el("div", {}, [
        el("div", { class: "name" }, [c.title || "Chat"]),
        el("div", { class: "small" }, [new Date(c.updatedAt || Date.now()).toLocaleString()]),
      ]);

      const actions = el("div", { class: "actions" });
      const loadBtn = el("button", { class: "btn", type: "button" }, ["Load"]);
      loadBtn.addEventListener("click", () => {
        TTS.stop();
        currentChat = {
          id: c.id,
          title: c.title || "Chat",
          messages: c.messages || [],
        };
        persistCurrentChat();
        setTab("chat");
        renderMessages();
        setChatStatus("");
      });

      const delBtn = el("button", { class: "btn", type: "button" }, ["Delete"]);
      delBtn.addEventListener("click", () => {
        const next = loadJson(LS.chats, []).filter((x) => x.id !== c.id);
        saveJson(LS.chats, next);
        renderSavedChats();
      });

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      item.appendChild(left);
      item.appendChild(actions);
      list.appendChild(item);
    }
  }

  // -----------------------------
  // Bible UI
  // -----------------------------
  function injectBibleVersionUI() {
    // Add a version dropdown above the Bible controls (UI-only unless backend supports multiple versions)
    const view = $("#view-bible");
    if (!view) return;

    if ($("#bibleVersionRow")) return;

    const versionRow = el("div", { class: "row", id: "bibleVersionRow", style: "margin-top:10px;" });
    const verSel = el("select", { id: "bibleVersionSel" });

    // If you later add backend support, you can wire this to request different endpoints/dbs.
    const versions = [
      { value: "default", label: "Bible Version: Default (current database)" },
      { value: "kjv", label: "KJV (coming soon)", disabled: true },
      { value: "niv", label: "NIV (coming soon)", disabled: true },
      { value: "rvr1960", label: "RVR1960 (coming soon)", disabled: true },
    ];

    for (const v of versions) {
      const opt = el("option", { value: v.value }, [v.label]);
      if (v.disabled) opt.disabled = true;
      verSel.appendChild(opt);
    }

    const saved = localStorage.getItem(LS.bibleVersion) || "default";
    verSel.value = saved;

    verSel.addEventListener("change", () => {
      localStorage.setItem(LS.bibleVersion, verSel.value);
      // UI-only. If you later support versions, reload books here.
    });

    const note = el("div", { class: "small", style: "flex-basis:100%; min-width:100%;" }, [
      "Bible version selection is UI-only right now (your backend currently serves one Bible database).",
    ]);

    versionRow.appendChild(verSel);
    versionRow.appendChild(note);

    // Insert at top of bible view (after h2)
    const h2 = view.querySelector("h2");
    h2.insertAdjacentElement("afterend", versionRow);
  }

  async function loadBooks() {
    const bookSelect = $("#bookSelect");
    if (!bookSelect) return;

    bookSelect.innerHTML = "";
    bookSelect.appendChild(el("option", { value: "" }, ["Loading books..."]));
    try {
      const data = await api("/bible/books");
      const books = (data && data.books) || [];
      bible.books = books;

      bookSelect.innerHTML = "";
      for (const b of books) {
        bookSelect.appendChild(el("option", { value: b.id }, [b.name]));
      }
      // Auto-select first book
      if (books.length) {
        bookSelect.value = String(books[0].id);
        await loadChapters();
      }
    } catch (e) {
      bookSelect.innerHTML = "";
      bookSelect.appendChild(el("option", { value: "" }, ["(Failed to load books)"]));
      $("#bibleOut").innerHTML = `<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function loadChapters() {
    const bookSelect = $("#bookSelect");
    const chapterSelect = $("#chapterSelect");
    if (!bookSelect || !chapterSelect) return;

    const book = bookSelect.value;
    if (!book) return;

    chapterSelect.innerHTML = "";
    chapterSelect.appendChild(el("option", { value: "" }, ["Loading chapters..."]));

    try {
      const data = await api(`/bible/chapters?book=${encodeURIComponent(book)}`);
      const chapters = (data && data.chapters) || [];
      bible.chapters = chapters;

      chapterSelect.innerHTML = "";
      for (const c of chapters) {
        chapterSelect.appendChild(el("option", { value: c }, [`Chapter ${c}`]));
      }
      if (chapters.length) chapterSelect.value = String(chapters[0]);
    } catch (e) {
      chapterSelect.innerHTML = "";
      chapterSelect.appendChild(el("option", { value: "" }, ["(Failed to load chapters)"]));
      $("#bibleOut").innerHTML = `<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`;
    }
  }

  function setBibleOut(reference, text) {
    const out = $("#bibleOut");
    if (!out) return;

    // Provide Listen/Stop inside the passage card (no standalone top stop)
    out.innerHTML = "";
    const head = el("div", { class: "row", style: "align-items:center; margin-bottom:10px;" });

    const title = el("div", { style: "flex:1; font-weight:800;" }, [reference || "Passage"]);
    const listen = el("button", { class: "btn primary", type: "button" }, ["Listen"]);
    const stop = el("button", { class: "btn", type: "button" }, ["Stop"]);

    listen.addEventListener("click", () => TTS.speak(text));
    stop.addEventListener("click", () => TTS.stop());

    head.appendChild(title);
    head.appendChild(listen);
    head.appendChild(stop);

    const body = el("div", { style: "white-space:pre-wrap; line-height:1.45;" }, [text || ""]);

    out.appendChild(head);
    out.appendChild(body);
  }

  async function loadFullChapter() {
    const book = $("#bookSelect").value;
    const chapter = $("#chapterSelect").value;
    if (!book || !chapter) return;

    $("#bibleOut").innerHTML = `<div class="muted">Loading...</div>`;
    try {
      const data = await api(
        `/bible/passage?book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(chapter)}&full_chapter=true`
      );
      setBibleOut(data.reference, data.text);
    } catch (e) {
      $("#bibleOut").innerHTML = `<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function loadPassage() {
    const book = $("#bookSelect").value;
    const chapter = $("#chapterSelect").value;
    const start = ($("#startVerse").value || "").trim();
    const end = ($("#endVerse").value || "").trim();
    if (!book || !chapter) return;

    const qs = new URLSearchParams();
    qs.set("book", book);
    qs.set("chapter", chapter);
    qs.set("full_chapter", "false");
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);

    $("#bibleOut").innerHTML = `<div class="muted">Loading...</div>`;
    try {
      const data = await api(`/bible/passage?${qs.toString()}`);
      setBibleOut(data.reference, data.text);
    } catch (e) {
      $("#bibleOut").innerHTML = `<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`;
    }
  }

  // -----------------------------
  // Guided Devotional / Prayer + streaks
  // -----------------------------
  function getStreaks() {
    return loadJson(LS.streaks, {
      devotional: { count: 0, lastDate: null },
      prayer: { count: 0, lastDate: null },
    });
  }

  function bumpStreak(kind) {
    const s = getStreaks();
    const today = new Date();
    const yyyyMmDd = today.toISOString().slice(0, 10);

    const entry = s[kind] || { count: 0, lastDate: null };
    const last = entry.lastDate;

    if (!last) {
      entry.count = 1;
      entry.lastDate = yyyyMmDd;
    } else {
      const lastDate = new Date(last + "T00:00:00");
      const diffDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // saved again same day: keep streak
        entry.lastDate = yyyyMmDd;
      } else if (diffDays === 1) {
        entry.count += 1;
        entry.lastDate = yyyyMmDd;
      } else {
        // broke streak
        entry.count = 1;
        entry.lastDate = yyyyMmDd;
      }
    }

    s[kind] = entry;
    saveJson(LS.streaks, s);
    return entry.count;
  }

  function injectGuidedDevotionalUI() {
    const view = $("#view-devotional");
    if (!view) return;
    if ($("#devGuided")) return;

    const wrap = el("div", { id: "devGuided", style: "margin-top:12px;" });

    const top = el("div", { class: "row", style: "margin-top:10px;" }, []);
    const desc = el("div", { class: "muted", style: "flex-basis:100%; min-width:100%;" }, [
      "Alyana will give a short devotional. Then you write your own reflection to save it and build your streak.",
    ]);

    const streak = el("div", { class: "pill", id: "devStreakPill", style: "margin-top:10px; display:inline-block;" }, [
      "Devotional streak: 0",
    ]);

    const promptLabel = el("div", { class: "small", style: "margin-top:12px;" }, ["Your reflection (2–6 sentences):"]);
    const input = el("textarea", { id: "devUserText", placeholder: "Write your reflection here..." });

    const actions = el("div", { class: "row", style: "margin-top:10px;" }, []);
    const saveBtn = el("button", { class: "btn good", id: "devSaveBtn", type: "button" }, ["Save reflection"]);
    const listenBtn = el("button", { class: "btn primary", id: "devListenBtn", type: "button" }, ["Listen"]);
    const stopBtn = el("button", { class: "btn", id: "devStopBtn", type: "button" }, ["Stop"]);

    actions.appendChild(saveBtn);
    actions.appendChild(listenBtn);
    actions.appendChild(stopBtn);

    wrap.appendChild(desc);
    wrap.appendChild(streak);
    wrap.appendChild(promptLabel);
    wrap.appendChild(input);
    wrap.appendChild(actions);

    view.appendChild(wrap);

    saveBtn.addEventListener("click", () => {
      const devOut = $("#devOut");
      const userText = String($("#devUserText").value || "").trim();
      if (!userText) {
        alert("Write your reflection first, then Save.");
        return;
      }

      const payload = {
        ts: Date.now(),
        lang: $("#devLang").value || "en",
        scripture: devOut?.dataset?.scripture || "",
        explanation: devOut?.dataset?.explanation || "",
        userText,
      };

      const all = loadJson(LS.devotionals, []);
      all.unshift(payload);
      saveJson(LS.devotionals, all.slice(0, 200));

      const count = bumpStreak("devotional");
      $("#devStreakPill").textContent = `Devotional streak: ${count}`;

      $("#devUserText").value = "";
      alert("Saved. Streak updated.");
    });

    listenBtn.addEventListener("click", () => {
      const devOut = $("#devOut");
      const scripture = devOut?.dataset?.scripture || "";
      const explanation = devOut?.dataset?.explanation || "";
      const t = [scripture, explanation].filter(Boolean).join("\n\n");
      TTS.speak(t);
    });

    stopBtn.addEventListener("click", () => TTS.stop());
  }

  function injectGuidedPrayerUI() {
    const view = $("#view-prayer");
    if (!view) return;
    if ($("#prayerGuided")) return;

    const wrap = el("div", { id: "prayerGuided", style: "margin-top:12px;" });

    const desc = el("div", { class: "muted", style: "margin-top:10px;" }, [
      "Alyana gives short ACTS starters. You write your own prayer and save it to build your streak.",
    ]);

    const streak = el("div", { class: "pill", id: "prayStreakPill", style: "margin-top:10px; display:inline-block;" }, [
      "Prayer streak: 0",
    ]);

    const labels = [
      { id: "prayA", title: "Adoration" },
      { id: "prayC", title: "Confession" },
      { id: "prayT", title: "Thanksgiving" },
      { id: "prayS", title: "Supplication" },
    ];

    const fields = labels.map((x) => {
      const box = el("div", { style: "margin-top:12px;" }, [
        el("div", { class: "small" }, [`Your ${x.title}:`]),
        el("textarea", { id: x.id, placeholder: `Write your ${x.title.toLowerCase()} here...` }),
      ]);
      return box;
    });

    const actions = el("div", { class: "row", style: "margin-top:10px;" }, []);
    const saveBtn = el("button", { class: "btn good", id: "praySaveBtn", type: "button" }, ["Save prayer"]);
    const listenBtn = el("button", { class: "btn primary", id: "prayListenBtn", type: "button" }, ["Listen starters"]);
    const stopBtn = el("button", { class: "btn", id: "prayStopBtn", type: "button" }, ["Stop"]);
    actions.appendChild(saveBtn);
    actions.appendChild(listenBtn);
    actions.appendChild(stopBtn);

    wrap.appendChild(desc);
    wrap.appendChild(streak);
    fields.forEach((f) => wrap.appendChild(f));
    wrap.appendChild(actions);

    view.appendChild(wrap);

    saveBtn.addEventListener("click", () => {
      const prayOut = $("#prayOut");
      const ad = String($("#prayA").value || "").trim();
      const co = String($("#prayC").value || "").trim();
      const th = String($("#prayT").value || "").trim();
      const su = String($("#prayS").value || "").trim();

      if (!ad && !co && !th && !su) {
        alert("Write at least one section, then Save.");
        return;
      }

      const payload = {
        ts: Date.now(),
        lang: $("#prayLang").value || "en",
        starters: {
          adoration: prayOut?.dataset?.adoration || "",
          confession: prayOut?.dataset?.confession || "",
          thanksgiving: prayOut?.dataset?.thanksgiving || "",
          supplication: prayOut?.dataset?.supplication || "",
        },
        user: { adoration: ad, confession: co, thanksgiving: th, supplication: su },
      };

      const all = loadJson(LS.prayers, []);
      all.unshift(payload);
      saveJson(LS.prayers, all.slice(0, 200));

      const count = bumpStreak("prayer");
      $("#prayStreakPill").textContent = `Prayer streak: ${count}`;

      $("#prayA").value = "";
      $("#prayC").value = "";
      $("#prayT").value = "";
      $("#prayS").value = "";
      alert("Saved. Streak updated.");
    });

    listenBtn.addEventListener("click", () => {
      const prayOut = $("#prayOut");
      const t = [
        prayOut?.dataset?.adoration ? `Adoration: ${prayOut.dataset.adoration}` : "",
        prayOut?.dataset?.confession ? `Confession: ${prayOut.dataset.confession}` : "",
        prayOut?.dataset?.thanksgiving ? `Thanksgiving: ${prayOut.dataset.thanksgiving}` : "",
        prayOut?.dataset?.supplication ? `Supplication: ${prayOut.dataset.supplication}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      TTS.speak(t);
    });

    stopBtn.addEventListener("click", () => TTS.stop());
  }

  function refreshStreakPills() {
    const s = getStreaks();
    if ($("#devStreakPill")) $("#devStreakPill").textContent = `Devotional streak: ${s.devotional?.count || 0}`;
    if ($("#prayStreakPill")) $("#prayStreakPill").textContent = `Prayer streak: ${s.prayer?.count || 0}`;
  }

  // -----------------------------
  // Devotional / Prayer fetch & render
  // -----------------------------
  function safeParseJsonFromServer(payload) {
    // server returns { json: "<json string>" }
    const raw = payload?.json;
    if (!raw || typeof raw !== "string") return null;
    try {
      return JSON.parse(raw);
    } catch {
      // try to salvage: extract first {...}
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          return JSON.parse(m[0]);
        } catch {}
      }
      return null;
    }
  }

  async function generateDevotional() {
    const lang = $("#devLang").value || "en";
    $("#devOut").innerHTML = `<div class="muted">Generating...</div>`;
    try {
      const data = await api("/devotional", { method: "POST", body: { lang } });
      const j = safeParseJsonFromServer(data);
      if (!j) throw new Error("Devotional returned invalid JSON.");

      const scripture = j.scripture || "";
      const explanation = j.brief_explanation || "";

      // store for listen/save
      $("#devOut").dataset.scripture = scripture;
      $("#devOut").dataset.explanation = explanation;

      const example =
        lang === "es"
          ? "Ejemplo: Hoy elijo confiar en Dios incluso cuando no entiendo el proceso. Él está conmigo y me guía."
          : "Example: Today I choose to trust God even when I don’t understand the process. He is with me and guiding me.";

      $("#devOut").innerHTML = `
        <div style="font-weight:800; margin-bottom:8px;">${escapeHtml(scripture)}</div>
        <div style="white-space:pre-wrap; line-height:1.45;">${escapeHtml(explanation)}</div>
        <div class="small" style="margin-top:10px;">${escapeHtml(example)}</div>
      `;
    } catch (e) {
      $("#devOut").innerHTML = `<div class="danger">Devotional error: ${escapeHtml(e.message)}</div>`;
    }
  }

  async function generatePrayerStarters() {
    const lang = $("#prayLang").value || "en";
    $("#prayOut").innerHTML = `<div class="muted">Generating...</div>`;
    try {
      const data = await api("/daily_prayer", { method: "POST", body: { lang } });
      const j = safeParseJsonFromServer(data);
      if (!j) throw new Error("Prayer starters returned invalid JSON.");

      const ad = j.example_adoration || "";
      const co = j.example_confession || "";
      const th = j.example_thanksgiving || "";
      const su = j.example_supplication || "";

      // store for listen/save
      $("#prayOut").dataset.adoration = ad;
      $("#prayOut").dataset.confession = co;
      $("#prayOut").dataset.thanksgiving = th;
      $("#prayOut").dataset.supplication = su;

      $("#prayOut").innerHTML = `
        <div style="display:grid; gap:10px;">
          <div><b>Adoration:</b> ${escapeHtml(ad)}</div>
          <div><b>Confession:</b> ${escapeHtml(co)}</div>
          <div><b>Thanksgiving:</b> ${escapeHtml(th)}</div>
          <div><b>Supplication:</b> ${escapeHtml(su)}</div>
        </div>
      `;
    } catch (e) {
      $("#prayOut").innerHTML = `<div class="danger">Prayer error: ${escapeHtml(e.message)}</div>`;
    }
  }

  // -----------------------------
  // Account + billing buttons
  // -----------------------------
  function setAccountPill() {
    const pill = $("#accountPill");
    if (!pill) return;

    if (!account.logged_in) {
      pill.textContent = "Account: not logged in";
      pill.style.borderColor = "rgba(255,255,255,.12)";
      return;
    }
    if (account.active) {
      pill.textContent = `Account: active (${account.email})`;
      pill.style.borderColor = "rgba(40,209,124,.34)";
      return;
    }
    pill.textContent = `Account: inactive (${account.email})`;
    pill.style.borderColor = "rgba(255,77,109,.34)";
  }

  async function refreshMe() {
    try {
      const data = await api("/me");
      account = {
        logged_in: !!data.logged_in,
        email: data.email || null,
        active: !!data.active,
      };
    } catch {
      account = { logged_in: false, email: null, active: false };
    } finally {
      setAccountPill();
    }
  }

  async function openBillingPortal() {
    try {
      const data = await api("/stripe/create-portal-session", { method: "POST", body: {} });
      if (data && data.url) window.location.href = data.url;
      else alert("Billing portal unavailable.");
    } catch (e) {
      alert(`Billing error: ${e.message}`);
    }
  }

  async function openSupportCheckout() {
    // This expects your backend to create a Stripe checkout URL
    try {
      const data = await api("/stripe/create-checkout-session", { method: "POST", body: {} });
      if (data && data.url) window.location.href = data.url;
      else alert("Checkout unavailable.");
    } catch (e) {
      alert(`Support error: ${e.message}`);
    }
  }

  // -----------------------------
  // Wire up events
  // -----------------------------
  function bindEvents() {
    // Tabs
    $$(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

    // Chat
    $("#sendBtn")?.addEventListener("click", sendChat);
    $("#chatInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChat();
    });
    $("#newBtn")?.addEventListener("click", newChat);
    $("#saveBtn")?.addEventListener("click", saveChat);

    // Bible
    $("#bookSelect")?.addEventListener("change", loadChapters);
    $("#loadChapterBtn")?.addEventListener("click", loadFullChapter);
    $("#loadPassageBtn")?.addEventListener("click", loadPassage);

    // Devotional / Prayer
    $("#devBtn")?.addEventListener("click", generateDevotional);
    $("#prayBtn")?.addEventListener("click", generatePrayerStarters);

    // Billing/support
    $("#btnBilling")?.addEventListener("click", openBillingPortal);
    $("#btnSupport")?.addEventListener("click", openSupportCheckout);
  }

  // -----------------------------
  // Init
  // -----------------------------
  function initTts() {
    if (!("speechSynthesis" in window)) return;

    // voices can be async-loaded by browser
    const boot = () => {
      TTS.loadVoices();
      restoreTtsSettings();
      // after restore, autoPick if no explicit voice
      if (!TTS.selectedVoiceName) TTS.autoPick();
      renderVoiceDropdown();

      const langSel = $("#uiLang");
      if (langSel) langSel.value = TTS.lang;

      persistTtsSettings();
    };

    boot();
    speechSynthesis.onvoiceschanged = () => {
      TTS.loadVoices();
      // keep selection if possible
      if (TTS.selectedVoiceName && !TTS.voices.find((v) => v.name === TTS.selectedVoiceName)) {
        TTS.autoPick();
      }
      renderVoiceDropdown();
      persistTtsSettings();
    };
  }

  async function init() {
    applyOldThemeColors();
    injectVoiceControls();
    injectBibleVersionUI();
    injectGuidedDevotionalUI();
    injectGuidedPrayerUI();

    restoreCurrentChat();
    renderMessages();
    renderSavedChats();
    refreshStreakPills();

    bindEvents();
    initTts();

    await refreshMe();
    await loadBooks();
    setTab("chat");
  }

  // Start
  init();
})();









