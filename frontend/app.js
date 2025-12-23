/* Alyana Luz · Bible AI — frontend/app.js
   - Matches server.py endpoints
   - Chat bubbles + memory (history passed to backend)
   - Bible reader + Listen
   - Devotional/Prayer guided UI + Save + Streak (localStorage)
   - Voice dropdown (full list first), language toggle (EN/ES), auto-pick "Paulina" if present
*/

(() => {
  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const safeJsonParse = (s) => {
    try { return JSON.parse(s); } catch { return null; }
  };

  const todayISO = () => new Date().toISOString().slice(0, 10);

  const ls = {
    get(key, fallback = null) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, val) {
      localStorage.setItem(key, JSON.stringify(val));
    },
    del(key) {
      localStorage.removeItem(key);
    }
  };

  const escapeHtml = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

  const fmtTime = () => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  // ---------------------------
  // Tabs / Views
  // ---------------------------
  const tabs = qsa(".tab");
  const views = {
    chat: $("view-chat"),
    bible: $("view-bible"),
    devotional: $("view-devotional"),
    prayer: $("view-prayer")
  };

  function showTab(name) {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    Object.entries(views).forEach(([k, el]) => {
      if (!el) return;
      el.style.display = (k === name) ? "" : "none";
    });
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  // ---------------------------
  // Account / Billing
  // ---------------------------
  const accountPill = $("accountPill");
  const btnSupport = $("btnSupport");
  const btnBilling = $("btnBilling");

  async function api(path, options = {}) {
    const opts = {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      ...options
    };
    const res = await fetch(path, opts);
    const ct = res.headers.get("content-type") || "";
    let data = null;
    if (ct.includes("application/json")) data = await res.json().catch(() => null);
    else data = await res.text().catch(() => null);

    if (!res.ok) {
      const msg =
        (data && data.detail) ||
        (typeof data === "string" && data) ||
        `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function refreshMe() {
    try {
      const me = await api("/me");
      if (!me || !me.logged_in) {
        accountPill.textContent = "Account: not logged in";
        accountPill.style.borderColor = "rgba(255,255,255,.12)";
        btnBilling.textContent = "Login";
        return me;
      }

      if (me.active) {
        accountPill.textContent = `Account: active (${me.email})`;
        accountPill.style.borderColor = "rgba(40,209,124,.34)";
      } else {
        accountPill.textContent = `Account: inactive (${me.email})`;
        accountPill.style.borderColor = "rgba(255,77,109,.34)";
      }
      btnBilling.textContent = "Manage billing";
      return me;
    } catch (e) {
      accountPill.textContent = "Account: error";
      accountPill.style.borderColor = "rgba(255,77,109,.34)";
      btnBilling.textContent = "Login";
      return null;
    }
  }

  btnSupport.addEventListener("click", async () => {
    // If logged in but inactive, still allow checkout.
    let email = "";
    try {
      const me = await api("/me");
      email = me?.email || "";
    } catch {}
    if (!email) email = (prompt("Email used for Stripe subscription:") || "").trim().toLowerCase();
    if (!email) return;

    try {
      const out = await api("/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      if (out?.url) window.location.href = out.url;
    } catch (e) {
      alert(e.message || "Checkout failed.");
    }
  });

  btnBilling.addEventListener("click", async () => {
    // If not logged in, do /login. Otherwise portal.
    const email = (prompt("Enter your subscription email to login:") || "").trim().toLowerCase();
    if (!email) return;

    try {
      await api("/login", { method: "POST", body: JSON.stringify({ email }) });
      await refreshMe();
      // Now open portal
      const out = await api("/stripe/create-portal-session", { method: "POST", body: JSON.stringify({ email }) });
      if (out?.url) window.location.href = out.url;
    } catch (e) {
      // If login fails, offer checkout
      const ok = confirm(`${e.message || "Login failed."}\n\nDo you want to open Support/Checkout instead?`);
      if (ok) btnSupport.click();
    }
  });

  // ---------------------------
  // Voice / TTS (Listen)
  // ---------------------------
  const TTS = {
    voices: [],
    ready: false,
    selectedVoiceURI: ls.get("alyana_voice_uri", ""),
    selectedLang: ls.get("alyana_lang", "en"), // "en" or "es"

    init() {
      if (!("speechSynthesis" in window)) return;

      const load = () => {
        this.voices = window.speechSynthesis.getVoices() || [];
        this.ready = this.voices.length > 0;
        this.onVoicesChanged && this.onVoicesChanged();
      };

      window.speechSynthesis.onvoiceschanged = load;
      load();
    },

    pickDefaultVoice() {
      // Prefer saved
      if (this.selectedVoiceURI) {
        const v = this.voices.find(x => x.voiceURI === this.selectedVoiceURI);
        if (v) return v;
      }

      // Prefer "Paulina" (common Spanish voice name on some systems)
      const paulina = this.voices.find(v => (v.name || "").toLowerCase().includes("paulina"));
      if (paulina) return paulina;

      // Prefer by language
      const want = this.selectedLang === "es" ? "es" : "en";
      const byLang = this.voices.find(v => (v.lang || "").toLowerCase().startsWith(want));
      if (byLang) return byLang;

      return this.voices[0] || null;
    },

    speak(text, opts = {}) {
      if (!("speechSynthesis" in window)) {
        alert("Text-to-speech is not supported in this browser.");
        return;
      }
      if (!text || !text.trim()) return;

      window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      const v = this.pickDefaultVoice();
      if (v) {
        u.voice = v;
        u.lang = v.lang || (this.selectedLang === "es" ? "es-ES" : "en-US");
      } else {
        u.lang = this.selectedLang === "es" ? "es-ES" : "en-US";
      }

      if (typeof opts.rate === "number") u.rate = opts.rate;
      if (typeof opts.pitch === "number") u.pitch = opts.pitch;
      if (typeof opts.volume === "number") u.volume = opts.volume;

      window.speechSynthesis.speak(u);
    },

    stop() {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    }
  };

  // Inject voice + language UI into Chat + Bible sections
  function injectVoiceControls() {
    // CHAT
    const chatH2 = qs("#view-chat h2");
    if (chatH2 && !qs("#voiceRowChat")) {
      const row = document.createElement("div");
      row.id = "voiceRowChat";
      row.className = "row";
      row.style.marginTop = "10px";
      row.innerHTML = `
        <select id="langSelect" title="Language (affects voice filtering)">
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        <select id="voiceSelect" title="Voice">
          <option value="">Loading voices...</option>
        </select>
        <button class="btn" id="stopSpeakBtn" title="Stop speaking">Stop</button>
      `;
      chatH2.insertAdjacentElement("afterend", row);
    }

    // BIBLE
    const bibleH2 = qs("#view-bible h2");
    if (bibleH2 && !qs("#voiceRowBible")) {
      const row = document.createElement("div");
      row.id = "voiceRowBible";
      row.className = "row";
      row.style.marginTop = "10px";
      row.innerHTML = `
        <div class="small" style="flex:2; min-width:220px;">
          Voice & language apply to <b>Listen</b> in Bible + Chat.
        </div>
        <button class="btn" id="stopSpeakBtn2" title="Stop speaking">Stop</button>
      `;
      bibleH2.insertAdjacentElement("afterend", row);
    }

    // Wire controls
    const langSelect = $("langSelect");
    const voiceSelect = $("voiceSelect");
    const stop1 = $("stopSpeakBtn");
    const stop2 = $("stopSpeakBtn2");

    if (langSelect) {
      langSelect.value = TTS.selectedLang;
      langSelect.addEventListener("change", () => {
        TTS.selectedLang = langSelect.value;
        ls.set("alyana_lang", TTS.selectedLang);
        populateVoiceSelect();
      });
    }
    if (stop1) stop1.addEventListener("click", () => TTS.stop());
    if (stop2) stop2.addEventListener("click", () => TTS.stop());

    function populateVoiceSelect() {
      if (!voiceSelect) return;
      const voices = TTS.voices || [];
      voiceSelect.innerHTML = "";

      if (!voices.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No voices found (browser/device)";
        voiceSelect.appendChild(opt);
        return;
      }

      // Show full list first (as you asked).
      // We still auto-pick by lang/Paulina if nothing saved.
      voices.forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} — ${v.lang}`;
        voiceSelect.appendChild(opt);
      });

      // Set selection
      const defaultVoice = TTS.pickDefaultVoice();
      if (defaultVoice) {
        voiceSelect.value = defaultVoice.voiceURI;
        TTS.selectedVoiceURI = defaultVoice.voiceURI;
        ls.set("alyana_voice_uri", TTS.selectedVoiceURI);
      }

      voiceSelect.addEventListener("change", () => {
        TTS.selectedVoiceURI = voiceSelect.value;
        ls.set("alyana_voice_uri", TTS.selectedVoiceURI);
      });
    }

    // Hook voice updates
    TTS.onVoicesChanged = populateVoiceSelect;
    populateVoiceSelect();
  }

  TTS.init();
  injectVoiceControls();

  // ---------------------------
  // Chat (with memory)
  // ---------------------------
  const messagesEl = $("messages");
  const chatInput = $("chatInput");
  const sendBtn = $("sendBtn");
  const newBtn = $("newBtn");
  const saveBtn = $("saveBtn");
  const chatStatus = $("chatStatus");
  const savedList = $("savedList");

  const CHAT_KEY_ACTIVE = "alyana_chat_active";
  const CHAT_KEY_SAVED = "alyana_saved_chats"; // array {id,name,ts,messages}

  let chatMessages = ls.get(CHAT_KEY_ACTIVE, []); // [{role:"user"/"assistant", content, time}]
  function setStatus(s, isError = false) {
    chatStatus.textContent = s || "";
    chatStatus.className = "small " + (isError ? "danger" : "");
  }

  function renderMessage(msg, idx) {
    const row = document.createElement("div");
    row.className = "msg-row " + (msg.role === "user" ? "me" : "bot");

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = escapeHtml(msg.content || "");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = msg.time ? msg.time : "";

    // Listen controls on bot messages
    if (msg.role !== "user") {
      const listenWrap = document.createElement("div");
      listenWrap.style.marginTop = "8px";
      listenWrap.style.display = "flex";
      listenWrap.style.gap = "8px";

      const listenBtn = document.createElement("button");
      listenBtn.className = "btn";
      listenBtn.style.padding = "6px 10px";
      listenBtn.textContent = "Listen";

      const stopBtn = document.createElement("button");
      stopBtn.className = "btn";
      stopBtn.style.padding = "6px 10px";
      stopBtn.textContent = "Stop";

      listenBtn.addEventListener("click", () => {
        // Strip any accidental extra whitespace
        TTS.speak((msg.content || "").trim());
      });
      stopBtn.addEventListener("click", () => TTS.stop());

      listenWrap.appendChild(listenBtn);
      listenWrap.appendChild(stopBtn);
      bubble.appendChild(listenWrap);
    }

    bubble.appendChild(meta);
    row.appendChild(bubble);
    return row;
  }

  function redrawChat() {
    messagesEl.innerHTML = "";
    chatMessages.forEach((m, i) => messagesEl.appendChild(renderMessage(m, i)));
    messagesEl.scrollTop = messagesEl.scrollHeight;
    ls.set(CHAT_KEY_ACTIVE, chatMessages);
  }

  function newChat() {
    chatMessages = [];
    redrawChat();
    setStatus("New chat started.");
  }

  async function sendChat() {
    const text = (chatInput.value || "").trim();
    if (!text) return;

    setStatus("Sending...");
    sendBtn.disabled = true;

    // Add user message
    chatMessages.push({ role: "user", content: text, time: fmtTime() });
    redrawChat();
    chatInput.value = "";

    // Build history for backend memory (lightweight)
    const history = chatMessages
      .slice(-16)
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const out = await api("/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: text, history })
      });

      const reply = out?.message || "Sorry, I couldn't respond right now.";
      chatMessages.push({ role: "assistant", content: reply, time: fmtTime() });
      redrawChat();
      setStatus("");
    } catch (e) {
      chatMessages.push({ role: "assistant", content: `Error: ${e.message}`, time: fmtTime() });
      redrawChat();
      setStatus(e.message || "Chat failed.", true);
    } finally {
      sendBtn.disabled = false;
    }
  }

  function renderSavedChats() {
    const saved = ls.get(CHAT_KEY_SAVED, []);
    savedList.innerHTML = "";

    if (!saved.length) {
      savedList.innerHTML = `<div class="muted">No saved chats yet.</div>`;
      return;
    }

    saved
      .slice()
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .forEach((item) => {
        const row = document.createElement("div");
        row.className = "saved-item";

        const left = document.createElement("div");
        left.innerHTML = `<div class="name">${escapeHtml(item.name || "Saved chat")}</div><div class="small">${new Date(item.ts).toLocaleString()}</div>`;

        const actions = document.createElement("div");
        actions.className = "actions";

        const load = document.createElement("button");
        load.className = "btn";
        load.textContent = "Load";
        load.addEventListener("click", () => {
          chatMessages = item.messages || [];
          redrawChat();
          showTab("chat");
          setStatus(`Loaded: ${item.name}`);
        });

        const del = document.createElement("button");
        del.className = "btn";
        del.textContent = "Delete";
        del.addEventListener("click", () => {
          const all = ls.get(CHAT_KEY_SAVED, []).filter(x => x.id !== item.id);
          ls.set(CHAT_KEY_SAVED, all);
          renderSavedChats();
        });

        actions.appendChild(load);
        actions.appendChild(del);

        row.appendChild(left);
        row.appendChild(actions);
        savedList.appendChild(row);
      });
  }

  function saveChat() {
    if (!chatMessages.length) return alert("Nothing to save yet.");
    const name = (prompt("Name this chat:", `Chat ${new Date().toLocaleDateString()}`) || "").trim();
    if (!name) return;

    const saved = ls.get(CHAT_KEY_SAVED, []);
    saved.push({
      id: String(Date.now()),
      name,
      ts: Date.now(),
      messages: chatMessages
    });
    ls.set(CHAT_KEY_SAVED, saved);
    renderSavedChats();
    setStatus("Chat saved.");
  }

  sendBtn.addEventListener("click", sendChat);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });
  newBtn.addEventListener("click", newChat);
  saveBtn.addEventListener("click", saveChat);

  redrawChat();
  renderSavedChats();

  // ---------------------------
  // Bible Reader (backend-aligned)
  // ---------------------------
  const bookSelect = $("bookSelect");
  const chapterSelect = $("chapterSelect");
  const loadChapterBtn = $("loadChapterBtn");
  const loadPassageBtn = $("loadPassageBtn");
  const startVerse = $("startVerse");
  const endVerse = $("endVerse");
  const bibleOut = $("bibleOut");

  let lastBibleText = ""; // for Listen

  function setBibleOut(html) {
    bibleOut.innerHTML = html;
  }

  async function loadBooks() {
    try {
      const out = await api("/bible/books");
      const books = out?.books || [];
      bookSelect.innerHTML = "";
      books.forEach((b) => {
        const opt = document.createElement("option");
        opt.value = b.name;
        opt.textContent = b.name;
        bookSelect.appendChild(opt);
      });
      if (books.length) {
        await loadChapters();
      }
    } catch (e) {
      setBibleOut(`<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`);
    }
  }

  async function loadChapters() {
    const book = bookSelect.value;
    if (!book) return;

    chapterSelect.innerHTML = `<option>Loading...</option>`;
    try {
      const out = await api(`/bible/chapters?book=${encodeURIComponent(book)}`);
      const chapters = out?.chapters || [];
      chapterSelect.innerHTML = "";
      chapters.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = String(c);
        opt.textContent = `Chapter ${c}`;
        chapterSelect.appendChild(opt);
      });
    } catch (e) {
      chapterSelect.innerHTML = "";
      setBibleOut(`<div class="danger">Chapters error: ${escapeHtml(e.message)}</div>`);
    }
  }

  async function loadChapter() {
    const book = bookSelect.value;
    const chapter = parseInt(chapterSelect.value || "1", 10);
    if (!book || !chapter) return;

    setBibleOut(`<div class="muted">Loading chapter...</div>`);
    try {
      const out = await api(`/bible/passage?book=${encodeURIComponent(book)}&chapter=${chapter}&full_chapter=true`);
      const ref = out?.reference || `${book} ${chapter}`;
      const text = out?.text || "";
      lastBibleText = `${ref}\n\n${text}`;

      setBibleOut(`
        <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
          <div><b>${escapeHtml(ref)}</b></div>
          <div style="display:flex; gap:8px;">
            <button class="btn" id="bibleListenBtn">Listen</button>
            <button class="btn" id="bibleStopBtn">Stop</button>
          </div>
        </div>
        <div style="margin-top:10px; white-space:pre-wrap; line-height:1.45;">${escapeHtml(text)}</div>
      `);

      $("bibleListenBtn").addEventListener("click", () => TTS.speak(lastBibleText));
      $("bibleStopBtn").addEventListener("click", () => TTS.stop());
    } catch (e) {
      setBibleOut(`<div class="danger">Passage error: ${escapeHtml(e.message)}</div>`);
    }
  }

  async function loadPassage() {
    const book = bookSelect.value;
    const chapter = parseInt(chapterSelect.value || "1", 10);
    if (!book || !chapter) return;

    const s = parseInt((startVerse.value || "").trim() || "1", 10);
    const e = parseInt((endVerse.value || "").trim() || String(s), 10);
    const start = Number.isFinite(s) ? s : 1;
    const end = Number.isFinite(e) ? e : start;

    setBibleOut(`<div class="muted">Loading passage...</div>`);
    try {
      const out = await api(`/bible/passage?book=${encodeURIComponent(book)}&chapter=${chapter}&start=${start}&end=${end}`);
      const ref = out?.reference || `${book} ${chapter}:${start}-${end}`;
      const text = out?.text || "";
      lastBibleText = `${ref}\n\n${text}`;

      setBibleOut(`
        <div style="display:flex; gap:10px; align-items:center; justify-content:space-between; flex-wrap:wrap;">
          <div><b>${escapeHtml(ref)}</b></div>
          <div style="display:flex; gap:8px;">
            <button class="btn" id="bibleListenBtn">Listen</button>
            <button class="btn" id="bibleStopBtn">Stop</button>
          </div>
        </div>
        <div style="margin-top:10px; white-space:pre-wrap; line-height:1.45;">${escapeHtml(text)}</div>
      `);

      $("bibleListenBtn").addEventListener("click", () => TTS.speak(lastBibleText));
      $("bibleStopBtn").addEventListener("click", () => TTS.stop());
    } catch (e) {
      setBibleOut(`<div class="danger">Passage error: ${escapeHtml(e.message)}</div>`);
    }
  }

  bookSelect.addEventListener("change", loadChapters);
  loadChapterBtn.addEventListener("click", loadChapter);
  loadPassageBtn.addEventListener("click", loadPassage);

  loadBooks();

  // ---------------------------
  // Devotional (guided + save + streak)
  // ---------------------------
  const devLang = $("devLang");
  const devBtn = $("devBtn");
  const devOut = $("devOut");

  const DEV_SAVE_KEY = "alyana_saved_devotionals";
  const DEV_STREAK_KEY = "alyana_dev_streak";

  function bumpStreak(key) {
    const data = ls.get(key, { streak: 0, lastDate: "" });
    const today = todayISO();
    if (data.lastDate === today) return data; // already counted today

    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (data.lastDate === yesterday) data.streak += 1;
    else data.streak = 1;

    data.lastDate = today;
    ls.set(key, data);
    return data;
  }

  function getStreak(key) {
    return ls.get(key, { streak: 0, lastDate: "" });
  }

  function renderDevGuided(scripture, brief) {
    const streak = getStreak(DEV_STREAK_KEY);

    devOut.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
        <div><b>Scripture</b></div>
        <div class="pill" style="border-color:rgba(124,108,255,.35);">Streak: <b>${streak.streak || 0}</b></div>
      </div>
      <div style="margin-top:8px; white-space:pre-wrap; line-height:1.45;">${escapeHtml(scripture || "")}</div>

      <div style="margin-top:12px;"><b>Alyana’s brief thought</b></div>
      <div style="margin-top:6px; white-space:pre-wrap; line-height:1.45;">${escapeHtml(brief || "")}</div>

      <div style="margin-top:14px;"><b>Your reflection (write your own)</b></div>
      <textarea id="devUserText" placeholder="Write your devotional reflection here..."></textarea>

      <div class="row" style="margin-top:10px;">
        <button class="btn good" id="devSaveUserBtn">Save</button>
        <button class="btn" id="devListenBtn">Listen (Scripture + Alyana)</button>
      </div>

      <div class="small" id="devSavedStatus" style="margin-top:8px;"></div>
    `;

    $("devListenBtn").addEventListener("click", () => {
      const lang = (devLang.value || "en") === "es" ? "es" : "en";
      TTS.selectedLang = lang;
      ls.set("alyana_lang", lang);
      TTS.speak(`${scripture}\n\n${brief}`);
    });

    $("devSaveUserBtn").addEventListener("click", () => {
      const text = ($("devUserText").value || "").trim();
      if (!text) return alert("Write something first so we can save it.");

      const saved = ls.get(DEV_SAVE_KEY, []);
      saved.push({
        id: String(Date.now()),
        ts: Date.now(),
        lang: devLang.value || "en",
        scripture,
        brief,
        user_text: text
      });
      ls.set(DEV_SAVE_KEY, saved);

      const s = bumpStreak(DEV_STREAK_KEY);
      $("devSavedStatus").textContent = `Saved. Streak is now ${s.streak}.`;
    });
  }

  devBtn.addEventListener("click", async () => {
    devBtn.disabled = true;
    devOut.innerHTML = `<div class="muted">Generating devotional...</div>`;

    try {
      const out = await api("/devotional", {
        method: "POST",
        body: JSON.stringify({ lang: devLang.value || "en" })
      });

      // server returns: { json: "...." } where json is a STRING
      const obj = safeJsonParse(out?.json || "");
      if (!obj) throw new Error("Devotional returned invalid JSON.");

      renderDevGuided(obj.scripture || "", obj.brief_explanation || "");
    } catch (e) {
      devOut.innerHTML = `<div class="danger">Devotional error: ${escapeHtml(e.message)}</div>`;
    } finally {
      devBtn.disabled = false;
    }
  });

  // ---------------------------
  // Prayer (guided + save + streak)
  // ---------------------------
  const prayLang = $("prayLang");
  const prayBtn = $("prayBtn");
  const prayOut = $("prayOut");

  const PRAY_SAVE_KEY = "alyana_saved_prayers";
  const PRAY_STREAK_KEY = "alyana_pray_streak";

  function renderPrayerGuided(ex) {
    const streak = getStreak(PRAY_STREAK_KEY);

    const exampleText = [
      `Adoration: ${ex.example_adoration || ""}`,
      `Confession: ${ex.example_confession || ""}`,
      `Thanksgiving: ${ex.example_thanksgiving || ""}`,
      `Supplication: ${ex.example_supplication || ""}`
    ].join("\n");

    prayOut.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
        <div><b>Alyana’s ACTS starters</b></div>
        <div class="pill" style="border-color:rgba(124,108,255,.35);">Streak: <b>${streak.streak || 0}</b></div>
      </div>

      <div style="margin-top:10px; white-space:pre-wrap; line-height:1.45;">${escapeHtml(exampleText)}</div>

      <div style="margin-top:14px;"><b>Your prayer (write your own)</b></div>
      <textarea id="prayUserText" placeholder="Write your ACTS prayer here..."></textarea>

      <div class="row" style="margin-top:10px;">
        <button class="btn good" id="praySaveUserBtn">Save</button>
        <button class="btn" id="prayListenBtn">Listen (Alyana starters)</button>
      </div>

      <div class="small" id="praySavedStatus" style="margin-top:8px;"></div>
    `;

    $("prayListenBtn").addEventListener("click", () => {
      const lang = (prayLang.value || "en") === "es" ? "es" : "en";
      TTS.selectedLang = lang;
      ls.set("alyana_lang", lang);
      TTS.speak(exampleText);
    });

    $("praySaveUserBtn").addEventListener("click", () => {
      const text = ($("prayUserText").value || "").trim();
      if (!text) return alert("Write something first so we can save it.");

      const saved = ls.get(PRAY_SAVE_KEY, []);
      saved.push({
        id: String(Date.now()),
        ts: Date.now(),
        lang: prayLang.value || "en",
        starters: ex,
        user_text: text
      });
      ls.set(PRAY_SAVE_KEY, saved);

      const s = bumpStreak(PRAY_STREAK_KEY);
      $("praySavedStatus").textContent = `Saved. Streak is now ${s.streak}.`;
    });
  }

  prayBtn.addEventListener("click", async () => {
    prayBtn.disabled = true;
    prayOut.innerHTML = `<div class="muted">Generating prayer starters...</div>`;

    try {
      const out = await api("/daily_prayer", {
        method: "POST",
        body: JSON.stringify({ lang: prayLang.value || "en" })
      });

      const obj = safeJsonParse(out?.json || "");
      if (!obj) throw new Error("Prayer returned invalid JSON.");

      renderPrayerGuided(obj);
    } catch (e) {
      prayOut.innerHTML = `<div class="danger">Prayer error: ${escapeHtml(e.message)}</div>`;
    } finally {
      prayBtn.disabled = false;
    }
  });

  // ---------------------------
  // Boot
  // ---------------------------
  refreshMe();
  // Default to chat view
  showTab("chat");

})();








