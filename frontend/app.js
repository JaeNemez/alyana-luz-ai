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

  function addClass(el, c, on) {
    if (!el) return;
    el.classList.toggle(c, !!on);
  }

  // ------------------------------
  // Support button
  // ------------------------------
  const supportBtn = $("supportBtn");
  if (supportBtn) {
    supportBtn.addEventListener("click", () => window.open("https://buy.stripe.com/", "_blank"));
  }

  // ------------------------------
  // Tabs (Chat / Read / Devotional / Daily Prayer)
  // ------------------------------
  const sections = Array.from(document.querySelectorAll(".app-section"));
  const menuButtons = Array.from(document.querySelectorAll(".menu-btn"));

  function showSection(id) {
    sections.forEach(s => addClass(s, "active", s.id === id));
    menuButtons.forEach(b => addClass(b, "active", b.dataset.target === id));
  }

  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => showSection(btn.dataset.target));
  });

  // Default
  showSection("chatSection");

  // ------------------------------
  // TTS (two voices) — optional
  // ------------------------------
  const TTS = { voices: [], ready: false, isSpeaking: false };
  const chatVoicePill = $("chatVoicePill");

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    TTS.voices = window.speechSynthesis.getVoices() || [];
    TTS.ready = TTS.voices.length > 0;
    updateVoicePill();
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
      return { voice: v || null, lang: "es-MX" };
    }

    const v =
      voices.find(v => (v.lang === "en-AU") && (v.name || "").toLowerCase().includes("karen")) ||
      voices.find(v => (v.lang || "").toLowerCase() === "en-au") ||
      voices.find(v => (v.lang || "").toLowerCase().startsWith("en"));
    return { voice: v || null, lang: "en-AU" };
  }

  function stopSpeaking() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    TTS.isSpeaking = false;
    updateVoicePill();
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
    if (!("speechSynthesis" in window)) return;
    stopSpeaking();

    const { voice, lang } = pickVoice(langKey) || {};
    const chunks = chunkText(text, 220);
    if (!chunks.length) return;

    TTS.isSpeaking = true;
    updateVoicePill();

    let idx = 0;
    const speakNext = () => {
      if (!TTS.isSpeaking) return;
      if (idx >= chunks.length) {
        TTS.isSpeaking = false;
        updateVoicePill();
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

  function updateVoicePill() {
    if (!chatVoicePill) return;
    const ready = ("speechSynthesis" in window) ? (TTS.ready ? "ready" : "loading…") : "not supported";
    chatVoicePill.textContent = `Voice: ${ready}${TTS.isSpeaking ? " (speaking)" : ""}`;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => refreshVoices();
    setTimeout(refreshVoices, 250);
    setTimeout(refreshVoices, 1200);
  } else {
    if (chatVoicePill) chatVoicePill.textContent = "Voice: not supported";
  }

  // ------------------------------
  // CHAT (Send / Enter / New / Save / Listen)
  // ------------------------------
  const chatLangSelect = $("chatLangSelect");
  const chatEl = $("chat");
  const chatForm = $("chatForm");
  const chatInput = $("chatInput");
  const chatSendBtn = $("chatSendBtn");
  const chatNewBtn = $("chatNewBtn");
  const chatSaveBtn = $("chatSaveBtn");
  const chatListenBtn = $("chatListenBtn"); // may exist in your old HTML
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
    addBubble('Hi! Try "Verses about peace", "Pray for my family", or "Read John 1:1".', "system");
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
    if (!msgs.length) {
      alert("Nothing to save yet.");
      return;
    }
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
      chatInput.focus();
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

    if (chatNewBtn) {
      chatNewBtn.addEventListener("click", () => {
        stopSpeaking();
        chatHistory.length = 0;
        chatEl.innerHTML = "";
        lastBotMessage = "";
        addWelcome();
        chatInput.focus();
      });
    }

    if (chatSaveBtn) chatSaveBtn.addEventListener("click", saveCurrentChat);

    if (chatListenBtn) {
      chatListenBtn.addEventListener("click", () => {
        if (!lastBotMessage) { alert("Nothing to read yet."); return; }
        const langKey = resolveChatLangForListen();
        let txt = lastBotMessage;
        if (langKey === "es") txt = txt.replace(/\b(KJV|NKJV|NIV|ESV|NASB|CSB|AMP|MSG)\b/gi, "").trim();
        if (TTS.isSpeaking) stopSpeaking();
        else speakText(txt, langKey);
      });
    }
  }

  // ------------------------------
  // DEVOTIONAL: Alyana gives scripture + brief explanation,
  // user writes: their own explanation/application/prayer/reflection
  // Saved locally
  // ------------------------------
  // If your current HTML still has the old devotional blocks, we support both.
  const devotionalBtn = $("devotionalBtn");
  const devotionalListenBtn = $("devotionalListenBtn");
  const devotionalLang = $("devotionalLang");
  const devotionalScripture = $("devotionalScripture");
  const devotionalExplain = $("devotionalExplain");

  // Create user-input areas dynamically if your HTML doesn’t have them yet
  function ensureDevotionalInputs() {
    const host = document.querySelector("#devotionalSection .card");
    if (!host) return;

    if (!$("devUserExplain")) {
      const wrap = document.createElement("div");
      wrap.className = "block";
      wrap.innerHTML = `
        <div class="muted" style="margin-bottom:6px;">Your Explanation</div>
        <textarea id="devUserExplain" placeholder="Write what you believe this scripture means…"></textarea>
      `;
      host.appendChild(wrap);
    }
    if (!$("devUserApply")) {
      const wrap = document.createElement("div");
      wrap.className = "block";
      wrap.innerHTML = `
        <div class="muted" style="margin-bottom:6px;">Your Application</div>
        <textarea id="devUserApply" placeholder="How can you apply this to your life today?"></textarea>
      `;
      host.appendChild(wrap);
    }
    if (!$("devUserPrayer")) {
      const wrap = document.createElement("div");
      wrap.className = "block";
      wrap.innerHTML = `
        <div class="muted" style="margin-bottom:6px;">Your Prayer</div>
        <textarea id="devUserPrayer" placeholder="Write a prayer about this scripture…"></textarea>
      `;
      host.appendChild(wrap);
    }
    if (!$("devUserReflect")) {
      const wrap = document.createElement("div");
      wrap.className = "block";
      wrap.innerHTML = `
        <div class="muted" style="margin-bottom:6px;">Reflection</div>
        <textarea id="devUserReflect" placeholder="Reflection / notes…"></textarea>
      `;
      host.appendChild(wrap);
    }

    // Save/Clear buttons if missing
    if (!$("devSaveBtn") || !$("devClearBtn")) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "12px";
      row.innerHTML = `
        <button class="btn btn-green" id="devSaveBtn" type="button">Save Today</button>
        <button class="btn btn-danger" id="devClearBtn" type="button">Clear</button>
      `;
      host.appendChild(row);
    }
  }

  const DEV_STORAGE = "alyana_devotionals_v1";

  function loadDevotionals() {
    try { return JSON.parse(localStorage.getItem(DEV_STORAGE) || "[]"); }
    catch { return []; }
  }
  function saveDevotionals(list) {
    localStorage.setItem(DEV_STORAGE, JSON.stringify(list));
  }

  function saveDevotionalEntry() {
    ensureDevotionalInputs();

    const entry = {
      id: "dev_" + Date.now(),
      createdAt: new Date().toISOString().slice(0,10),
      scripture: (devotionalScripture?.textContent || "").trim(),
      alyana_brief_explanation: (devotionalExplain?.textContent || "").trim(),
      user_explanation: ($("devUserExplain")?.value || "").trim(),
      user_application: ($("devUserApply")?.value || "").trim(),
      user_prayer: ($("devUserPrayer")?.value || "").trim(),
      reflection: ($("devUserReflect")?.value || "").trim(),
    };

    const list = loadDevotionals();
    list.push(entry);
    saveDevotionals(list);
    alert("Saved devotional.");
  }

  function clearDevotionalForm() {
    if (devotionalScripture) devotionalScripture.textContent = "—";
    if (devotionalExplain) devotionalExplain.textContent = "—";
    const ids = ["devUserExplain","devUserApply","devUserPrayer","devUserReflect"];
    ids.forEach(id => { const el = $(id); if (el) el.value = ""; });
  }

  let devotionalLastText = "";

  if (document.getElementById("devotionalSection")) {
    ensureDevotionalInputs();

    // Hook save/clear
    setTimeout(() => {
      const devSaveBtn = $("devSaveBtn");
      const devClearBtn = $("devClearBtn");
      if (devSaveBtn) devSaveBtn.addEventListener("click", saveDevotionalEntry);
      if (devClearBtn) devClearBtn.addEventListener("click", clearDevotionalForm);
    }, 0);

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
        const langKey = (devotionalLang?.value || "en");
        if (TTS.isSpeaking) stopSpeaking();
        else speakText(devotionalLastText, langKey);
      });
    }
  }

  // ------------------------------
  // DAILY PRAYER: user writes ACTS, Alyana provides starters
  // Saved locally
  // ------------------------------
  const prayerBtn = $("prayerBtn");
  const prayerListenBtn = $("prayerListenBtn");
  const prayerLang = $("prayerLang");
  const pA = $("pA");
  const pC = $("pC");
  const pT = $("pT");
  const pS = $("pS");

  function ensurePrayerInputs() {
    const host = document.querySelector("#prayerSection .card");
    if (!host) return;

    // Replace/augment blocks with textareas for user input
    const ensure = (id, title, placeholder) => {
      if ($(id)) return;
      const wrap = document.createElement("div");
      wrap.className = "block";
      wrap.innerHTML = `
        <div class="muted" style="margin-bottom:6px;">${title}</div>
        <textarea id="${id}" placeholder="${placeholder}"></textarea>
      `;
      host.appendChild(wrap);
    };

    ensure("userAdoration", "Your Adoration", "Start with praise: “God, You are…”");
    ensure("userConfession", "Your Confession", "Be honest: “Lord, forgive me for…”");
    ensure("userThanks", "Your Thanksgiving", "Name blessings: “Thank You for…”");
    ensure("userSupplication", "Your Supplication", "Ask boldly: “Please help…”");
    ensure("userPrayerNotes", "Notes", "Anything else on your heart…");

    if (!$("prSaveBtn") || !$("prClearBtn")) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "12px";
      row.innerHTML = `
        <button class="btn btn-green" id="prSaveBtn" type="button">Save Today</button>
        <button class="btn btn-danger" id="prClearBtn" type="button">Clear</button>
      `;
      host.appendChild(row);
    }
  }

  const PR_STORAGE = "alyana_daily_prayers_v1";

  function loadPrayers() {
    try { return JSON.parse(localStorage.getItem(PR_STORAGE) || "[]"); }
    catch { return []; }
  }
  function savePrayers(list) {
    localStorage.setItem(PR_STORAGE, JSON.stringify(list));
  }

  function savePrayerEntry() {
    ensurePrayerInputs();
    const entry = {
      id: "pr_" + Date.now(),
      createdAt: new Date().toISOString().slice(0,10),
      starters: {
        adoration: (pA?.textContent || "").trim(),
        confession: (pC?.textContent || "").trim(),
        thanksgiving: (pT?.textContent || "").trim(),
        supplication: (pS?.textContent || "").trim(),
      },
      user: {
        adoration: ($("userAdoration")?.value || "").trim(),
        confession: ($("userConfession")?.value || "").trim(),
        thanksgiving: ($("userThanks")?.value || "").trim(),
        supplication: ($("userSupplication")?.value || "").trim(),
        notes: ($("userPrayerNotes")?.value || "").trim(),
      }
    };
    const list = loadPrayers();
    list.push(entry);
    savePrayers(list);
    alert("Saved daily prayer.");
  }

  function clearPrayerForm() {
    const ids = ["userAdoration","userConfession","userThanks","userSupplication","userPrayerNotes"];
    ids.forEach(id => { const el = $(id); if (el) el.value = ""; });
  }

  let prayerLastText = "";

  if (document.getElementById("prayerSection")) {
    ensurePrayerInputs();

    setTimeout(() => {
      const prSaveBtn = $("prSaveBtn");
      const prClearBtn = $("prClearBtn");
      if (prSaveBtn) prSaveBtn.addEventListener("click", savePrayerEntry);
      if (prClearBtn) prClearBtn.addEventListener("click", clearPrayerForm);
    }, 0);

    // Generate starters (use your existing /daily_prayer endpoint)
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
          if (pA) pA.textContent = "Error generating starters.";
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
        if (!prayerLastText) { alert("Generate starters first."); return; }
        const langKey = (prayerLang?.value || "en");
        if (TTS.isSpeaking) stopSpeaking();
        else speakText(prayerLastText, langKey);
      });
    }
  }

})();
