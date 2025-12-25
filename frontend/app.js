/* frontend/app.js */

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const $ = (sel) => document.querySelector(sel);

  const LS = {
    chatLang: "alyana.chat.lang",
    devLang: "alyana.dev.lang",
    prLang: "alyana.pr.lang",
    readingLang: "alyana.read.lang",
    bibleVersion: "alyana.bible.version",
    savedChats: "alyana.saved.chats",
    savedDevs: "alyana.saved.devs",
    savedPrayers: "alyana.saved.prayers",
    chatDraft: "alyana.chat.draft",
    devDraft: "alyana.dev.draft",
    prDraft: "alyana.pr.draft",
  };

  const safeJSON = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  const nowISO = () => new Date().toISOString();

  function showTopStatus(text) {
    const pill = $("#jsStatus");
    if (pill) pill.textContent = text;
  }

  function showInline(el, text, isError = false) {
    if (!el) return;
    el.style.display = "block";
    el.textContent = text;
    el.style.color = isError ? "rgba(255,140,140,0.95)" : "";
  }

  function toast(message) {
    const hint = $("#authHint");
    if (hint) {
      showInline(hint, message, false);
      setTimeout(() => { hint.style.display = "none"; }, 3500);
    } else {
      alert(message);
    }
  }

  async function apiGet(path) {
    const res = await fetch(path, { headers: { "Accept": "application/json" } });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`GET ${path} -> ${res.status} ${t}`);
    }
    return res.json();
  }

  async function apiPost(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`POST ${path} -> ${res.status} ${t}`);
    }
    return res.json();
  }

  // ---------------------------
  // UI language strings
  // ---------------------------
  const I18N = {
    en: {
      noSaved: "No saved items yet.",
      savedChats: "Saved chat logs are stored on this device.",
      chatPlaceholder: "Ask for a prayer, verse, or ‘verses about forgiveness’…",
      listen: "Listen",
      stop: "Stop",
      send: "Send",
      new: "New",
      save: "Save",
      delete: "Delete",
      loading: "Loading…",
      select: "Select…",
      optional: "(optional)",
      voiceReady: "Voice: ready",
      voiceMissing:
        "Voice not found. Your browser must have 'Paulina (es-MX)' and 'Karen (en-AU)' installed.",
      bibleNotFound:
        "Bible DB not found. Confirm your Render deployment includes /data/bible.db and /data/bible_es_rvr.db.",
      pickBookChapter: "Pick a book and chapter first.",
      nothingToSave: "Nothing to save yet.",
      saved: "Saved.",
      savedDev: "Saved devotional.",
      savedPrayer: "Saved prayer.",
      saveDevRequired: "To save: Context + Reflection + Application + Prayer are required.",
      savePrayerRequired: "To save: Adoration + Confession + Thanksgiving + Supplication are required.",
      noBotToRead: "No bot message to read yet.",
    },
    es: {
      noSaved: "Todavía no hay elementos guardados.",
      savedChats: "Los chats guardados se almacenan en este dispositivo.",
      chatPlaceholder: "Pide una oración, un versículo, o ‘versículos sobre perdón’…",
      listen: "Escuchar",
      stop: "Detener",
      send: "Enviar",
      new: "Nuevo",
      save: "Guardar",
      delete: "Borrar",
      loading: "Cargando…",
      select: "Elegir…",
      optional: "(opcional)",
      voiceReady: "Voz: lista",
      voiceMissing:
        "No se encontró la voz. Tu navegador debe tener instaladas 'Paulina (es-MX)' y 'Karen (en-AU)'.",
      bibleNotFound:
        "No se encontró la base de datos bíblica. Confirma que Render incluye /data/bible.db y /data/bible_es_rvr.db.",
      pickBookChapter: "Primero elige un libro y un capítulo.",
      nothingToSave: "Nada para guardar todavía.",
      saved: "Guardado.",
      savedDev: "Devocional guardado.",
      savedPrayer: "Oración guardada.",
      saveDevRequired: "Para guardar: Contexto + Reflexión + Aplicación + Oración son requeridos.",
      savePrayerRequired: "Para guardar: Adoración + Confesión + Gratitud + Petición son requeridos.",
      noBotToRead: "Todavía no hay mensaje de Alyana para leer.",
    },
  };

  function lang2(v, fallback = "en") {
    const x = (v || "").toLowerCase().trim();
    return x === "es" ? "es" : x === "en" ? "en" : fallback;
  }

  // ---------------------------
  // Tabs
  // ---------------------------
  function initTabs() {
    const buttons = document.querySelectorAll(".menu-btn");
    const sections = document.querySelectorAll(".app-section");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        sections.forEach((s) => s.classList.remove("active"));

        btn.classList.add("active");
        const target = btn.getAttribute("data-target");
        const sec = document.getElementById(target);
        if (sec) sec.classList.add("active");
      });
    });
  }

  // ---------------------------
  // Speech (LOCKED voices only)
  // ---------------------------
  const VOICE_LOCK = {
    en: { wantNameIncludes: "karen", wantLangPrefix: "en" },   // Karen en-AU
    es: { wantNameIncludes: "paulina", wantLangPrefix: "es" }, // Paulina es-MX
  };

  function getAllVoices() {
    return new Promise((resolve) => {
      let voices = speechSynthesis.getVoices();
      if (voices && voices.length) return resolve(voices);

      speechSynthesis.onvoiceschanged = () => {
        voices = speechSynthesis.getVoices();
        resolve(voices || []);
      };

      setTimeout(() => resolve(speechSynthesis.getVoices() || []), 800);
    });
  }

  async function pickLockedVoice(lang /* 'en'|'es' */) {
    const voices = await getAllVoices();
    const spec = VOICE_LOCK[lang];

    const byName = voices.find(v => (v.name || "").toLowerCase().includes(spec.wantNameIncludes));
    if (byName && (byName.lang || "").toLowerCase().startsWith(spec.wantLangPrefix)) return byName;

    // fallback: name match only
    if (byName) return byName;

    // fallback: language match only
    const byLang = voices.find(v => (v.lang || "").toLowerCase().startsWith(spec.wantLangPrefix));
    return byLang || null;
  }

  function stopSpeak() {
    try { speechSynthesis.cancel(); } catch {}
  }

  async function speakText(text, lang /* 'en'|'es' */, rate = 1.0) {
    stopSpeak();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = rate;
    utter.pitch = 1;

    const v = await pickLockedVoice(lang);
    if (!v) throw new Error("VOICE_NOT_FOUND");
    utter.voice = v;
    utter.lang = v.lang || (lang === "es" ? "es-MX" : "en-AU");

    return new Promise((resolve, reject) => {
      utter.onend = resolve;
      utter.onerror = reject;
      speechSynthesis.speak(utter);
    });
  }

  // ---------------------------
  // Global UI Translation (fix: your Spanish selector wasn’t wired)
  // ---------------------------
  function applyChatUiLang(lang) {
    const t = I18N[lang] || I18N.en;

    const input = $("#chatInput");
    if (input) input.placeholder = t.chatPlaceholder;

    const listenBtn = $("#chatListenBtn");
    const stopBtn = $("#chatStopBtn");
    const sendBtn = $("#chatSendBtn");
    const newBtn = $("#chatNewBtn");
    const saveBtn = $("#chatSaveBtn");

    if (listenBtn) listenBtn.textContent = t.listen;
    if (stopBtn) stopBtn.textContent = t.stop;
    if (sendBtn) sendBtn.textContent = t.send;
    if (newBtn) newBtn.textContent = t.new;
    if (saveBtn) saveBtn.textContent = t.save;

    const savedHint = document.querySelector("#chatSection .muted");
    if (savedHint) savedHint.textContent = t.savedChats;

    // Saved list empty-state
    const box = $("#chatSavedList");
    if (box && !box.querySelector("button")) {
      box.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
    }
  }

  function applyDevUiLang(lang) {
    // This updates the visible labels you already have IDs for (devLabelTheme, etc.)
    // If you want more labels translated later, we can extend this.
    const t = I18N[lang] || I18N.en;

    const genBtn = $("#devotionalBtn");
    const saveBtn = $("#devSaveBtn");
    const streakBtn = $("#devStreakBtn");
    if (genBtn) genBtn.textContent = lang === "es" ? "Generar" : "Generate";
    if (saveBtn) saveBtn.textContent = t.save;
    if (streakBtn) streakBtn.textContent = lang === "es" ? "Lo hice hoy" : "I did it today";

    const savedTitle = document.querySelector("#devotionalSection h4");
    if (savedTitle) savedTitle.textContent = lang === "es" ? "Devocionales guardados" : "Saved Devotionals";

    const box = $("#devSavedList");
    if (box && !box.querySelector("button")) {
      box.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
    }
  }

  function applyPrayerUiLang(lang) {
    const t = I18N[lang] || I18N.en;

    const genBtn = $("#prayerBtn");
    const saveBtn = $("#prSaveBtn");
    const streakBtn = $("#prStreakBtn");
    if (genBtn) genBtn.textContent = lang === "es" ? "Generar ejemplos" : "Generate Starters";
    if (saveBtn) saveBtn.textContent = t.save;
    if (streakBtn) streakBtn.textContent = lang === "es" ? "Lo hice hoy" : "I did it today";

    const savedTitle = document.querySelector("#prayerSection h4");
    if (savedTitle) savedTitle.textContent = lang === "es" ? "Oraciones guardadas" : "Saved Prayers";

    const box = $("#prSavedList");
    if (box && !box.querySelector("button")) {
      box.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
    }
  }

  function initLanguageWiring() {
    // Chat language selector controls BOTH: (1) reply language preference (later) AND (2) UI language
    const chatSel = $("#chatLangSelect");
    const devSel = $("#devUiLang");
    const prSel = $("#prUiLang");

    // Restore previous
    if (chatSel) chatSel.value = localStorage.getItem(LS.chatLang) || chatSel.value;
    if (devSel) devSel.value = localStorage.getItem(LS.devLang) || devSel.value;
    if (prSel) prSel.value = localStorage.getItem(LS.prLang) || prSel.value;

    // Apply on load
    applyChatUiLang(lang2(chatSel ? chatSel.value : "en", "en"));
    applyDevUiLang(lang2(devSel ? devSel.value : "en", "en"));
    applyPrayerUiLang(lang2(prSel ? prSel.value : "en", "en"));

    if (chatSel) {
      chatSel.addEventListener("change", () => {
        localStorage.setItem(LS.chatLang, chatSel.value || "auto");
        // For UI: if auto, default to English UI (you can change if you prefer)
        const uiLang = (chatSel.value === "es") ? "es" : "en";
        applyChatUiLang(uiLang);
      });
    }

    if (devSel) {
      devSel.addEventListener("change", () => {
        localStorage.setItem(LS.devLang, devSel.value || "en");
        applyDevUiLang(lang2(devSel.value, "en"));
      });
    }

    if (prSel) {
      prSel.addEventListener("change", () => {
        localStorage.setItem(LS.prLang, prSel.value || "en");
        applyPrayerUiLang(lang2(prSel.value, "en"));
      });
    }
  }

  // ---------------------------
  // Chat (with Listen + Stop wired)
  // ---------------------------
  function chatStorageLoad() {
    return safeJSON(localStorage.getItem(LS.savedChats) || "[]", []);
  }
  function chatStorageSave(list) {
    localStorage.setItem(LS.savedChats, JSON.stringify(list || []));
  }

  function addBubble(kind, text) {
    const chat = $("#chat");
    if (!chat) return;

    const row = document.createElement("div");
    row.className = `bubble-row ${kind}`;

    const bubble = document.createElement("div");
    bubble.className = `bubble ${kind}`;
    bubble.textContent = text;

    row.appendChild(bubble);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
  }

  function getLastBotText() {
    const chat = $("#chat");
    if (!chat) return "";
    const bots = chat.querySelectorAll(".bubble.bot");
    if (!bots.length) return "";
    return (bots[bots.length - 1].textContent || "").trim();
  }

  function getChatMessagesFromDOM() {
    const chat = $("#chat");
    if (!chat) return [];
    const rows = chat.querySelectorAll(".bubble-row");
    const msgs = [];
    rows.forEach(r => {
      const kind = r.classList.contains("user") ? "user" : r.classList.contains("bot") ? "bot" : "system";
      const b = r.querySelector(".bubble");
      const text = (b && b.textContent) ? b.textContent : "";
      msgs.push({ kind, text });
    });
    return msgs;
  }

  function renderSavedChats(uiLangForLabels = "en") {
    const box = $("#chatSavedList");
    if (!box) return;

    const t = I18N[uiLangForLabels] || I18N.en;
    const list = chatStorageLoad();
    box.innerHTML = "";

    if (!list.length) {
      box.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
      return;
    }

    list.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = list.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${item.title || "Chat"} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
      btn.addEventListener("click", () => {
        const chat = $("#chat");
        if (!chat) return;
        chat.innerHTML = "";
        (item.messages || []).forEach(m => addBubble(m.kind, m.text));
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.textContent = t.delete;
      del.style.marginTop = "8px";
      del.addEventListener("click", () => {
        const next = chatStorageLoad().filter((_, i) => i !== idx);
        chatStorageSave(next);
        renderSavedChats(uiLangForLabels);
      });

      box.appendChild(btn);
      box.appendChild(del);
    });
  }

  function initChat() {
    const form = $("#chatForm");
    const input = $("#chatInput");
    const newBtn = $("#chatNewBtn");
    const saveBtn = $("#chatSaveBtn");
    const sendBtn = $("#chatSendBtn");
    const listenBtn = $("#chatListenBtn"); // already in your HTML
    const stopBtn = $("#chatStopBtn");     // already in your HTML
    const langSel = $("#chatLangSelect");

    // Restore draft
    if (input) input.value = localStorage.getItem(LS.chatDraft) || "";
    if (input) {
      input.addEventListener("input", () => {
        localStorage.setItem(LS.chatDraft, input.value || "");
      });
    }

    if (newBtn) {
      newBtn.addEventListener("click", () => {
        const chat = $("#chat");
        if (chat) chat.innerHTML = "";
        if (input) input.value = "";
        localStorage.removeItem(LS.chatDraft);
        stopSpeak();
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener("click", () => stopSpeak());
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const uiLang = (langSel && langSel.value === "es") ? "es" : "en";
        const t = I18N[uiLang] || I18N.en;

        const msgs = getChatMessagesFromDOM();
        if (!msgs.length) return toast(t.nothingToSave);

        const title = (msgs.find(m => m.kind === "user")?.text || "Chat").slice(0, 36);
        const list = chatStorageLoad();
        list.push({ ts: nowISO(), title, messages: msgs });
        chatStorageSave(list);
        renderSavedChats(uiLang);
        toast(t.saved);
      });
    }

    if (listenBtn) {
      listenBtn.addEventListener("click", async () => {
        const last = getLastBotText() || "";
        const uiLang = (langSel && langSel.value === "es") ? "es" : "en";
        const t = I18N[uiLang] || I18N.en;

        if (!last) return toast(t.noBotToRead);

        // Choose voice language:
        // - If user selected Spanish, use Spanish voice.
        // - If English, use English voice.
        // - If Auto, use a small heuristic.
        const chosen = (langSel && langSel.value) ? langSel.value : "auto";
        const speakLang =
          (chosen === "es") ? "es" :
          (chosen === "en") ? "en" :
          (/[áéíóúñ¿¡]/i.test(last) ? "es" : "en");

        try {
          await speakText(last, speakLang);
        } catch {
          toast((I18N[speakLang] || I18N.en).voiceMissing);
        }
      });
    }

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!input) return;

        const msg = (input.value || "").trim();
        if (!msg) return;

        addBubble("user", msg);
        input.value = "";
        localStorage.removeItem(LS.chatDraft);

        if (sendBtn) sendBtn.disabled = true;

        try {
          // NOTE: backend /chat is still stub in your server.py
          const resp = await apiPost("/chat", { message: msg });
          const reply = (resp && resp.reply) ? String(resp.reply) : "(No reply)";
          addBubble("bot", reply);
        } catch (err) {
          addBubble("system", `Error: ${String(err.message || err)}`);
        } finally {
          if (sendBtn) sendBtn.disabled = false;
        }
      });
    }

    const uiLang = (langSel && langSel.value === "es") ? "es" : "en";
    renderSavedChats(uiLang);
  }

  // ---------------------------
  // Devotionals (fix: your saved content exists in localStorage; render must match UI language)
  // ---------------------------
  function loadSavedDevs() {
    return safeJSON(localStorage.getItem(LS.savedDevs) || "[]", []);
  }
  function saveSavedDevs(list) {
    localStorage.setItem(LS.savedDevs, JSON.stringify(list || []));
  }

  function renderSavedDevs(uiLangForLabels = "en") {
    const box = $("#devSavedList");
    if (!box) return;

    const t = I18N[uiLangForLabels] || I18N.en;
    const list = loadSavedDevs();
    box.innerHTML = "";

    if (!list.length) {
      box.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
      return;
    }

    list.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = list.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${(item.theme || (uiLangForLabels === "es" ? "Devocional" : "Devotional")).slice(0, 40)} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
      btn.addEventListener("click", () => {
        $("#devTheme").textContent = item.theme || "—";
        $("#devScriptureRef").textContent = item.scripture_ref || "—";
        $("#devScriptureText").textContent = item.scripture_text || "—";
        $("#devStarterContext").textContent = item.starter_context || "—";
        $("#devStarterReflection").textContent = item.starter_reflection || "—";
        $("#devStarterApplication").textContent = item.starter_application || "—";
        $("#devStarterPrayer").textContent = item.starter_prayer || "—";

        $("#devMyContext").value = item.my_context || "";
        $("#devMyReflection").value = item.my_reflection || "";
        $("#devMyApplication").value = item.my_application || "";
        $("#devMyPrayer").value = item.my_prayer || "";
        $("#devMyNotes").value = item.my_notes || "";
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.textContent = t.delete;
      del.style.marginTop = "8px";
      del.addEventListener("click", () => {
        const next = loadSavedDevs().filter((_, i) => i !== idx);
        saveSavedDevs(next);
        renderSavedDevs(uiLangForLabels);
      });

      box.appendChild(btn);
      box.appendChild(del);
    });
  }

  function initDevotional() {
    const generateBtn = $("#devotionalBtn");
    const saveBtn = $("#devSaveBtn");
    const devLangSel = $("#devUiLang");

    // restore drafts
    const draft = safeJSON(localStorage.getItem(LS.devDraft) || "{}", {});
    if ($("#devMyContext")) $("#devMyContext").value = draft.my_context || "";
    if ($("#devMyReflection")) $("#devMyReflection").value = draft.my_reflection || "";
    if ($("#devMyApplication")) $("#devMyApplication").value = draft.my_application || "";
    if ($("#devMyPrayer")) $("#devMyPrayer").value = draft.my_prayer || "";
    if ($("#devMyNotes")) $("#devMyNotes").value = draft.my_notes || "";

    const saveDraft = () => {
      const d = {
        my_context: $("#devMyContext")?.value || "",
        my_reflection: $("#devMyReflection")?.value || "",
        my_application: $("#devMyApplication")?.value || "",
        my_prayer: $("#devMyPrayer")?.value || "",
        my_notes: $("#devMyNotes")?.value || "",
      };
      localStorage.setItem(LS.devDraft, JSON.stringify(d));
    };

    ["#devMyContext","#devMyReflection","#devMyApplication","#devMyPrayer","#devMyNotes"].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener("input", saveDraft);
    });

    if (generateBtn) {
      generateBtn.addEventListener("click", async () => {
        generateBtn.disabled = true;
        try {
          // Still local placeholder generation (backend endpoint is stub).
          // You can later connect this to /devotional in server.py.
          $("#devTheme").textContent = "Walking in Peace";
          $("#devScriptureRef").textContent = "Philippians 4:6–7";
          $("#devScriptureText").textContent =
            "6. Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.\n" +
            "7. And the peace of God, which passeth all understanding, shall keep your hearts and minds through Christ Jesus.";

          $("#devStarterContext").textContent =
            "Paul is encouraging believers to bring every worry to God in prayer instead of carrying anxiety alone.";
          $("#devStarterReflection").textContent =
            "God’s peace is not based on circumstances. It is a guard over your heart when you trust Him.";
          $("#devStarterApplication").textContent =
            "Today, name the specific thing you’re anxious about, and hand it to God in prayer—then practice gratitude.";
          $("#devStarterPrayer").textContent =
            "Lord, teach me to bring my burdens to You. Replace my anxiety with Your peace. Amen.";
        } catch (e) {
          toast(String(e.message || e));
        } finally {
          generateBtn.disabled = false;
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const uiLang = lang2(devLangSel ? devLangSel.value : "en", "en");
        const t = I18N[uiLang] || I18N.en;

        const my_context = ($("#devMyContext")?.value || "").trim();
        const my_reflection = ($("#devMyReflection")?.value || "").trim();
        const my_application = ($("#devMyApplication")?.value || "").trim();
        const my_prayer = ($("#devMyPrayer")?.value || "").trim();

        if (!my_context || !my_reflection || !my_application || !my_prayer) {
          return toast(t.saveDevRequired);
        }

        const item = {
          ts: nowISO(),
          theme: $("#devTheme")?.textContent || "",
          scripture_ref: $("#devScriptureRef")?.textContent || "",
          scripture_text: $("#devScriptureText")?.textContent || "",
          starter_context: $("#devStarterContext")?.textContent || "",
          starter_reflection: $("#devStarterReflection")?.textContent || "",
          starter_application: $("#devStarterApplication")?.textContent || "",
          starter_prayer: $("#devStarterPrayer")?.textContent || "",
          my_context,
          my_reflection,
          my_application,
          my_prayer,
          my_notes: $("#devMyNotes")?.value || "",
        };

        const list = loadSavedDevs();
        list.push(item);
        saveSavedDevs(list);
        renderSavedDevs(uiLang);
        toast(t.savedDev);
      });
    }

    const uiLang = lang2(devLangSel ? devLangSel.value : "en", "en");
    renderSavedDevs(uiLang);
  }

  // ---------------------------
  // Daily Prayer
  // ---------------------------
  function loadSavedPrayers() {
    return safeJSON(localStorage.getItem(LS.savedPrayers) || "[]", []);
  }
  function saveSavedPrayers(list) {
    localStorage.setItem(LS.savedPrayers, JSON.stringify(list || []));
  }

  function renderSavedPrayers(uiLangForLabels = "en") {
    const box = $("#prSavedList");
    if (!box) return;

    const t = I18N[uiLangForLabels] || I18N.en;
    const list = loadSavedPrayers();
    box.innerHTML = "";

    if (!list.length) {
      box.innerHTML = `<small style="opacity:0.75;">${t.noSaved}</small>`;
      return;
    }

    list.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = list.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${(item.title || (uiLangForLabels === "es" ? "Oración" : "Prayer")).slice(0, 40)} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
      btn.addEventListener("click", () => {
        $("#pA").textContent = item.starterA || "—";
        $("#pC").textContent = item.starterC || "—";
        $("#pT").textContent = item.starterT || "—";
        $("#pS").textContent = item.starterS || "—";
        $("#myAdoration").value = item.myA || "";
        $("#myConfession").value = item.myC || "";
        $("#myThanksgiving").value = item.myT || "";
        $("#mySupplication").value = item.myS || "";
        $("#prayerNotes").value = item.notes || "";
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.textContent = t.delete;
      del.style.marginTop = "8px";
      del.addEventListener("click", () => {
        const next = loadSavedPrayers().filter((_, i) => i !== idx);
        saveSavedPrayers(next);
        renderSavedPrayers(uiLangForLabels);
      });

      box.appendChild(btn);
      box.appendChild(del);
    });
  }

  function initPrayer() {
    const genBtn = $("#prayerBtn");
    const saveBtn = $("#prSaveBtn");
    const prLangSel = $("#prUiLang");

    // restore draft
    const draft = safeJSON(localStorage.getItem(LS.prDraft) || "{}", {});
    if ($("#myAdoration")) $("#myAdoration").value = draft.myA || "";
    if ($("#myConfession")) $("#myConfession").value = draft.myC || "";
    if ($("#myThanksgiving")) $("#myThanksgiving").value = draft.myT || "";
    if ($("#mySupplication")) $("#mySupplication").value = draft.myS || "";
    if ($("#prayerNotes")) $("#prayerNotes").value = draft.notes || "";

    const saveDraft = () => {
      localStorage.setItem(LS.prDraft, JSON.stringify({
        myA: $("#myAdoration")?.value || "",
        myC: $("#myConfession")?.value || "",
        myT: $("#myThanksgiving")?.value || "",
        myS: $("#mySupplication")?.value || "",
        notes: $("#prayerNotes")?.value || "",
      }));
    };

    ["#myAdoration","#myConfession","#myThanksgiving","#mySupplication","#prayerNotes"].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener("input", saveDraft);
    });

    if (genBtn) {
      genBtn.addEventListener("click", () => {
        $("#pA").textContent = "Lord, You are holy, faithful, and near. I praise You for Your love and mercy.";
        $("#pC").textContent = "Father, forgive me for where I have fallen short. Cleanse my heart and renew my mind.";
        $("#pT").textContent = "Thank You for life, protection, provision, and the grace You give me each day.";
        $("#pS").textContent = "Please guide me today. Give me wisdom, strength, and peace. Help my family and those I love.";
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const uiLang = lang2(prLangSel ? prLangSel.value : "en", "en");
        const t = I18N[uiLang] || I18N.en;

        const myA = ($("#myAdoration")?.value || "").trim();
        const myC = ($("#myConfession")?.value || "").trim();
        const myT = ($("#myThanksgiving")?.value || "").trim();
        const myS = ($("#mySupplication")?.value || "").trim();

        if (!myA || !myC || !myT || !myS) {
          return toast(t.savePrayerRequired);
        }

        const item = {
          ts: nowISO(),
          title: "Daily Prayer",
          starterA: $("#pA")?.textContent || "",
          starterC: $("#pC")?.textContent || "",
          starterT: $("#pT")?.textContent || "",
          starterS: $("#pS")?.textContent || "",
          myA, myC, myT, myS,
          notes: $("#prayerNotes")?.value || "",
        };

        const list = loadSavedPrayers();
        list.push(item);
        saveSavedPrayers(list);
        renderSavedPrayers(uiLang);
        toast(t.savedPrayer);
      });
    }

    const uiLang = lang2(prLangSel ? prLangSel.value : "en", "en");
    renderSavedPrayers(uiLang);
  }

  // ---------------------------
  // Bible Reader (EN/ES DB)
  // ---------------------------
  function bibleVersionForReadingLang(readLang /* en|es */) {
    // Your DB names:
    // English: bible.db
    // Spanish: bible_es_rvr.db
    // Your bible_api maps:
    // en_default -> bible.db
    // es -> bible_es_rvr.db
    return (readLang === "es") ? "es" : "en_default";
  }

  async function refreshBibleStatus() {
    const el = $("#bibleDbStatus");
    if (!el) return;

    const readVoice = $("#readingVoice");
    const readLang = lang2(readVoice ? readVoice.value : "en", "en");
    const version = bibleVersionForReadingLang(readLang);

    try {
      const j = await apiGet(`/bible/status?version=${encodeURIComponent(version)}`);
      el.textContent = `OK • ${j.version} • verses: ${j.verse_count}`;
    } catch (e) {
      el.textContent = `Error: ${(e && e.message) ? e.message : String(e)}`;
    }
  }

  async function loadBooks() {
    const bookSel = $("#bookSelect");
    if (!bookSel) return;

    const readVoice = $("#readingVoice");
    const readLang = lang2(readVoice ? readVoice.value : "en", "en");
    const version = bibleVersionForReadingLang(readLang);

    const uiLang = (readLang === "es") ? "es" : "en";
    const t = I18N[uiLang] || I18N.en;

    bookSel.innerHTML = `<option value="">${t.loading}</option>`;

    try {
      const j = await apiGet(`/bible/books?version=${encodeURIComponent(version)}`);
      const books = j.books || [];
      bookSel.innerHTML = `<option value="">${t.select}</option>`;
      books.forEach((b) => {
        const opt = document.createElement("option");
        opt.value = String(b.id);
        opt.textContent = b.name;
        bookSel.appendChild(opt);
      });
    } catch (e) {
      bookSel.innerHTML = `<option value="">(Error loading books)</option>`;
      const status = $("#bibleDbStatus");
      if (status) status.textContent = t.bibleNotFound;
    }
  }

  async function loadChaptersForBook() {
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    if (!bookSel || !chapSel || !vsStart || !vsEnd) return;

    chapSel.innerHTML = `<option value="">—</option>`;
    vsStart.innerHTML = `<option value="">—</option>`;
    vsEnd.innerHTML = `<option value="">(optional)</option>`;

    const bid = parseInt(bookSel.value || "0", 10);
    if (!bid) return;

    const readVoice = $("#readingVoice");
    const readLang = lang2(readVoice ? readVoice.value : "en", "en");
    const version = bibleVersionForReadingLang(readLang);

    try {
      const j = await apiGet(`/bible/chapters?version=${encodeURIComponent(version)}&book_id=${bid}`);
      const chs = j.chapters || [];
      chapSel.innerHTML = `<option value="">Select…</option>`;
      chs.forEach((n) => {
        const opt = document.createElement("option");
        opt.value = String(n);
        opt.textContent = String(n);
        chapSel.appendChild(opt);
      });
    } catch (e) {
      chapSel.innerHTML = `<option value="">(Error)</option>`;
    }
  }

  async function loadVersesForChapter() {
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    if (!bookSel || !chapSel || !vsStart || !vsEnd) return;

    vsStart.innerHTML = `<option value="">—</option>`;
    vsEnd.innerHTML = `<option value="">(optional)</option>`;

    const bid = parseInt(bookSel.value || "0", 10);
    const ch = parseInt(chapSel.value || "0", 10);
    if (!bid || !ch) return;

    const readVoice = $("#readingVoice");
    const readLang = lang2(readVoice ? readVoice.value : "en", "en");
    const version = bibleVersionForReadingLang(readLang);

    try {
      const j = await apiGet(`/bible/verses_max?version=${encodeURIComponent(version)}&book_id=${bid}&chapter=${ch}`);
      const maxV = parseInt(j.max_verse || "0", 10);
      if (!maxV) return;

      vsStart.innerHTML = `<option value="">Select…</option>`;
      vsEnd.innerHTML = `<option value="">(optional)</option>`;
      for (let i = 1; i <= maxV; i++) {
        const o1 = document.createElement("option");
        o1.value = String(i);
        o1.textContent = String(i);
        vsStart.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = String(i);
        o2.textContent = String(i);
        vsEnd.appendChild(o2);
      }
    } catch (e) {
      // ignore
    }
  }

  async function listenBible() {
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    const fullCh = $("#fullChapter");
    const passageRef = $("#passageRef");
    const passageText = $("#passageText");

    if (!bookSel || !chapSel || !passageRef || !passageText) return;

    const bid = parseInt(bookSel.value || "0", 10);
    const ch = parseInt(chapSel.value || "0", 10);
    if (!bid || !ch) return toast(I18N.en.pickBookChapter);

    const readVoice = $("#readingVoice");
    const readLang = lang2(readVoice ? readVoice.value : "en", "en");
    const version = bibleVersionForReadingLang(readLang);
    const whole = !!(fullCh && fullCh.checked);

    const qs = new URLSearchParams();
    qs.set("version", version);
    qs.set("book_id", String(bid));
    qs.set("chapter", String(ch));
    if (whole) {
      qs.set("whole_chapter", "true");
    } else {
      const s = parseInt(vsStart?.value || "0", 10);
      const e = parseInt(vsEnd?.value || "0", 10);
      if (s) qs.set("verse_start", String(s));
      if (e) qs.set("verse_end", String(e));
    }

    try {
      const j = await apiGet(`/bible/text?${qs.toString()}`);
      passageRef.textContent = `${j.book} ${j.chapter}`;
      passageText.textContent = j.text || "—";

      const toSpeak = (j.text || "").trim();
      if (!toSpeak) return;

      await speakText(toSpeak, readLang, 1.0);
    } catch (e) {
      toast(String(e.message || e));
    }
  }

  function initBible() {
    const listenBtn = $("#listenBible");
    const stopBtn = $("#stopBible");
    const readVoice = $("#readingVoice");
    const bookSel = $("#bookSelect");
    const chapSel = $("#chapterSelect");

    if (listenBtn) listenBtn.addEventListener("click", listenBible);
    if (stopBtn) stopBtn.addEventListener("click", stopSpeak);

    if (readVoice) {
      // restore
      readVoice.value = localStorage.getItem(LS.readingLang) || readVoice.value;

      readVoice.addEventListener("change", async () => {
        localStorage.setItem(LS.readingLang, readVoice.value || "en");
        stopSpeak();
        await refreshBibleStatus();
        await loadBooks();
      });
    }

    if (bookSel) bookSel.addEventListener("change", async () => {
      await loadChaptersForBook();
    });

    if (chapSel) chapSel.addEventListener("change", async () => {
      await loadVersesForChapter();
    });

    refreshBibleStatus().catch(() => {});
    loadBooks().catch(() => {});
  }

  // ---------------------------
  // Init + safety
  // ---------------------------
  async function init() {
    showTopStatus("JS: starting…");

    initTabs();
    initLanguageWiring();
    initChat();
    initDevotional();
    initPrayer();
    initBible();

    // Voice pills: verify locked voices exist
    const ttsStatus = $("#ttsStatus");
    const chatVoicePill = $("#chatVoicePill");

    try {
      const vEn = await pickLockedVoice("en");
      const vEs = await pickLockedVoice("es");
      const ok = !!(vEn && vEs);
      const msg = ok ? I18N.en.voiceReady : I18N.en.voiceMissing;

      if (ttsStatus) ttsStatus.textContent = msg;
      if (chatVoicePill) chatVoicePill.textContent = msg;
    } catch {
      if (ttsStatus) ttsStatus.textContent = I18N.en.voiceMissing;
      if (chatVoicePill) chatVoicePill.textContent = I18N.en.voiceMissing;
    }

    showTopStatus("JS: ready");
  }

  window.addEventListener("error", (e) => {
    console.error("Global error:", e.error || e.message);
    showTopStatus("JS: error");
  });

  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled rejection:", e.reason);
    showTopStatus("JS: error");
  });

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error("Init failed:", e);
      showTopStatus("JS: error");
    });
  });

})();
































