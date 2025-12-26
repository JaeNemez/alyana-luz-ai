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
      restoreAccess: "Restore access",
      noSaved: "No saved items yet.",
      savedChats: "Saved chat logs are stored on this device.",
      chatPlaceholder: "Ask for a prayer, verse, or ‘verses about forgiveness’…",
      listen: "Listen",
      stop: "Stop",
      generate: "Generate",
      generateStarters: "Generate Starters",
      save: "Save",
      didIt: "I did it today",
      checking: "Checking…",
      loading: "Loading…",
      bibleDbChecking: "Checking…",
      voiceReady: "Voice: ready",
      voiceMissing:
        "Voice not found. Your browser must have 'Paulina (es-MX)' and 'Karen (en-AU)' installed.",
      bibleNotFound:
        "Bible DB not found. Confirm your Render deployment includes /data/bible.db and /data/bible_es_rvr.db.",
    },
    es: {
      restoreAccess: "Restaurar acceso",
      noSaved: "Todavía no hay elementos guardados.",
      savedChats: "Los chats guardados se almacenan en este dispositivo.",
      chatPlaceholder: "Pide una oración, un versículo, o ‘versículos sobre perdón’…",
      listen: "Escuchar",
      stop: "Detener",
      generate: "Generar",
      generateStarters: "Generar ejemplos",
      save: "Guardar",
      didIt: "Lo hice hoy",
      checking: "Verificando…",
      loading: "Cargando…",
      bibleDbChecking: "Verificando…",
      voiceReady: "Voz: lista",
      voiceMissing:
        "No se encontró la voz. Tu navegador debe tener instaladas 'Paulina (es-MX)' y 'Karen (en-AU)'.",
      bibleNotFound:
        "No se encontró la base de datos bíblica. Confirma que Render incluye /data/bible.db y /data/bible_es_rvr.db.",
    },
  };

  function getLang(selId, fallback = "en") {
    const el = $(selId);
    const v = (el && el.value) ? el.value : fallback;
    return (v === "es" ? "es" : v === "en" ? "en" : "en");
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
  // Speech (locked voices)
  // ---------------------------
  const VOICE_LOCK = {
    en: { wantNameIncludes: "karen", wantLangPrefix: "en" },
    es: { wantNameIncludes: "paulina", wantLangPrefix: "es" },
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

  async function pickLockedVoice(lang) {
    const voices = await getAllVoices();
    const spec = VOICE_LOCK[lang];

    const byName = voices.find(v => (v.name || "").toLowerCase().includes(spec.wantNameIncludes));
    if (byName && (byName.lang || "").toLowerCase().startsWith(spec.wantLangPrefix)) return byName;
    if (byName) return byName;

    const byLang = voices.find(v => (v.lang || "").toLowerCase().startsWith(spec.wantLangPrefix));
    return byLang || null;
  }

  function stopSpeak() {
    try { speechSynthesis.cancel(); } catch {}
  }

  async function speakText(text, lang, rate = 1.0) {
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
  // Chat
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

  function renderSavedChats() {
    const box = $("#chatSavedList");
    if (!box) return;

    const list = chatStorageLoad();
    box.innerHTML = "";

    if (!list.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = I18N.en.noSaved;
      box.appendChild(small);
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
      del.textContent = "Delete";
      del.style.marginTop = "8px";
      del.addEventListener("click", () => {
        const next = chatStorageLoad().filter((_, i) => i !== idx);
        chatStorageSave(next);
        renderSavedChats();
      });

      box.appendChild(btn);
      box.appendChild(del);
    });
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

  function initChat() {
    const form = $("#chatForm");
    const input = $("#chatInput");
    const newBtn = $("#chatNewBtn");
    const saveBtn = $("#chatSaveBtn");
    const sendBtn = $("#chatSendBtn");
    const stopBtn = $("#chatStopBtn");

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

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const msgs = getChatMessagesFromDOM();
        if (!msgs.length) return toast("Nothing to save yet.");
        const title = (msgs.find(m => m.kind === "user")?.text || "Chat").slice(0, 36);
        const list = chatStorageLoad();
        list.push({ ts: nowISO(), title, messages: msgs });
        chatStorageSave(list);
        renderSavedChats();
        toast("Saved.");
      });
    }

    const listenBtn = $("#chatListenBtn");
    if (listenBtn) {
      listenBtn.addEventListener("click", async () => {
        const last = getLastBotText() || "";
        if (!last) return toast("No bot message to read yet.");

        const langSel = $("#chatLangSelect");
        const chosen = (langSel && langSel.value) ? langSel.value : "auto";
        const lang = (chosen === "es") ? "es" : (chosen === "en") ? "en" : (/[áéíóúñ¿¡]/i.test(last) ? "es" : "en");

        try {
          await speakText(last, lang);
        } catch {
          toast(I18N[lang].voiceMissing);
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener("click", () => stopSpeak());
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

        sendBtn && (sendBtn.disabled = true);

        try {
          const resp = await apiPost("/chat", { message: msg });
          const reply = (resp && resp.reply) ? String(resp.reply) : "(No reply)";
          addBubble("bot", reply);
        } catch (err) {
          addBubble("system", `Error: ${String(err.message || err)}`);
        } finally {
          sendBtn && (sendBtn.disabled = false);
        }
      });
    }

    renderSavedChats();
  }

  // ---------------------------
  // Devotionals
  // ---------------------------
  function loadSavedDevs() {
    return safeJSON(localStorage.getItem(LS.savedDevs) || "[]", []);
  }
  function saveSavedDevs(list) {
    localStorage.setItem(LS.savedDevs, JSON.stringify(list || []));
  }

  function renderSavedDevs() {
    const box = $("#devSavedList");
    if (!box) return;

    const list = loadSavedDevs();
    box.innerHTML = "";

    if (!list.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = I18N.en.noSaved;
      box.appendChild(small);
      return;
    }

    list.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = list.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${(item.theme || "Devotional").slice(0, 40)} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
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
      del.textContent = "Delete";
      del.style.marginTop = "8px";
      del.addEventListener("click", () => {
        const next = loadSavedDevs().filter((_, i) => i !== idx);
        saveSavedDevs(next);
        renderSavedDevs();
      });

      box.appendChild(btn);
      box.appendChild(del);
    });
  }

  function initDevotional() {
    const generateBtn = $("#devotionalBtn");
    const saveBtn = $("#devSaveBtn");

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
        const my_context = ($("#devMyContext")?.value || "").trim();
        const my_reflection = ($("#devMyReflection")?.value || "").trim();
        const my_application = ($("#devMyApplication")?.value || "").trim();
        const my_prayer = ($("#devMyPrayer")?.value || "").trim();

        if (!my_context || !my_reflection || !my_application || !my_prayer) {
          return toast("To save: Context + Reflection + Application + Prayer are required.");
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
        renderSavedDevs();
        toast("Saved devotional.");
      });
    }

    renderSavedDevs();
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

  function renderSavedPrayers() {
    const box = $("#prSavedList");
    if (!box) return;

    const list = loadSavedPrayers();
    box.innerHTML = "";

    if (!list.length) {
      const small = document.createElement("small");
      small.style.opacity = "0.75";
      small.textContent = I18N.en.noSaved;
      box.appendChild(small);
      return;
    }

    list.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = list.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${(item.title || "Prayer").slice(0, 40)} • ${new Date(item.ts || nowISO()).toLocaleString()}`;
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
      del.textContent = "Delete";
      del.style.marginTop = "8px";
      del.addEventListener("click", () => {
        const next = loadSavedPrayers().filter((_, i) => i !== idx);
        saveSavedPrayers(next);
        renderSavedPrayers();
      });

      box.appendChild(btn);
      box.appendChild(del);
    });
  }

  function initPrayer() {
    const genBtn = $("#prayerBtn");
    const saveBtn = $("#prSaveBtn");

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
        const myA = ($("#myAdoration")?.value || "").trim();
        const myC = ($("#myConfession")?.value || "").trim();
        const myT = ($("#myThanksgiving")?.value || "").trim();
        const myS = ($("#mySupplication")?.value || "").trim();

        if (!myA || !myC || !myT || !myS) {
          return toast("To save: Adoration + Confession + Thanksgiving + Supplication are required.");
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
        renderSavedPrayers();
        toast("Saved prayer.");
      });
    }

    renderSavedPrayers();
  }

  // ---------------------------
  // Bible Reader (robust book_id OR book name)
  // ---------------------------
  function bibleVersionForReadingLang(readLang) {
    return (readLang === "es") ? "es" : "en_default";
  }

  function getBookSelection() {
    const bookSel = $("#bookSelect");
    if (!bookSel) return { kind: "none" };

    const raw = String(bookSel.value || "").trim();
    if (!raw) return { kind: "none" };

    // If value is numeric -> treat as book_id
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && String(asNum) === raw) {
      return { kind: "id", book_id: asNum };
    }

    // Otherwise treat as book name
    // If option values are names (e.g. "James"), this will work.
    return { kind: "name", book: raw };
  }

  async function refreshBibleStatus() {
    const el = $("#bibleDbStatus");
    if (!el) return;

    const readLang = getLang("#readingVoice", "en");
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

    const readLang = getLang("#readingVoice", "en");
    const version = bibleVersionForReadingLang(readLang);

    bookSel.innerHTML = `<option value="">${I18N.en.loading}</option>`;

    try {
      const j = await apiGet(`/bible/books?version=${encodeURIComponent(version)}`);
      const books = j.books || [];
      bookSel.innerHTML = `<option value="">Select…</option>`;

      books.forEach((b) => {
        const opt = document.createElement("option");

        // Keep numeric id as value (best case)
        opt.value = String(b.id);

        // Show name to user
        opt.textContent = b.name;
        bookSel.appendChild(opt);
      });

    } catch (e) {
      bookSel.innerHTML = `<option value="">(Error loading books)</option>`;
      const st = $("#bibleDbStatus");
      if (st) st.textContent = I18N.en.bibleNotFound;
    }
  }

  async function loadChaptersForBook() {
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    if (!chapSel || !vsStart || !vsEnd) return;

    chapSel.innerHTML = `<option value="">—</option>`;
    vsStart.innerHTML = `<option value="">—</option>`;
    vsEnd.innerHTML = `<option value="">(optional)</option>`;

    const pick = getBookSelection();
    if (pick.kind === "none") return;

    const readLang = getLang("#readingVoice", "en");
    const version = bibleVersionForReadingLang(readLang);

    try {
      const qs = new URLSearchParams();
      qs.set("version", version);

      if (pick.kind === "id") qs.set("book_id", String(pick.book_id));
      if (pick.kind === "name") qs.set("book", pick.book);

      const j = await apiGet(`/bible/chapters?${qs.toString()}`);
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
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    if (!chapSel || !vsStart || !vsEnd) return;

    vsStart.innerHTML = `<option value="">—</option>`;
    vsEnd.innerHTML = `<option value="">(optional)</option>`;

    const pick = getBookSelection();
    const ch = parseInt(chapSel.value || "0", 10);
    if (pick.kind === "none" || !ch) return;

    const readLang = getLang("#readingVoice", "en");
    const version = bibleVersionForReadingLang(readLang);

    try {
      // verses_max requires book_id in your backend, so we only call it if we have an id.
      // If the select is using names, we will skip max lookup and just allow "Full Chapter"
      // or verse selection remains empty.
      if (pick.kind !== "id") return;

      const j = await apiGet(`/bible/verses_max?version=${encodeURIComponent(version)}&book_id=${pick.book_id}&chapter=${ch}`);
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
    const chapSel = $("#chapterSelect");
    const vsStart = $("#verseStartSelect");
    const vsEnd = $("#verseEndSelect");
    const fullCh = $("#fullChapter");
    const passageRef = $("#passageRef");
    const passageText = $("#passageText");

    if (!chapSel || !passageRef || !passageText) return;

    const pick = getBookSelection();
    const ch = parseInt(chapSel.value || "0", 10);
    if (pick.kind === "none" || !ch) return toast("Pick a book and chapter first.");

    const readLang = getLang("#readingVoice", "en");
    const version = bibleVersionForReadingLang(readLang);
    const whole = !!(fullCh && fullCh.checked);

    const qs = new URLSearchParams();
    qs.set("version", version);
    qs.set("chapter", String(ch));

    if (pick.kind === "id") qs.set("book_id", String(pick.book_id));
    if (pick.kind === "name") qs.set("book", pick.book);

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
      readVoice.addEventListener("change", async () => {
        stopSpeak();
        await refreshBibleStatus();
        await loadBooks();

        // Reset selectors (safe)
        const c = $("#chapterSelect");
        const vs1 = $("#verseStartSelect");
        const vs2 = $("#verseEndSelect");
        if (c) c.innerHTML = `<option value="">—</option>`;
        if (vs1) vs1.innerHTML = `<option value="">—</option>`;
        if (vs2) vs2.innerHTML = `<option value="">(optional)</option>`;
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
    initChat();
    initDevotional();
    initPrayer();
    initBible();

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




































