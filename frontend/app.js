/* frontend/app.js
  Alyana Luz • Bible AI
  Fixes white screen if app.js was overwritten.
  Wires up UI IDs in index.html.
*/

(() => {
  "use strict";

  // -----------------------------
  // Utilities
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const nowLocalDateKey = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const safeJSONParse = (s, fallback) => {
    try { return JSON.parse(s); } catch { return fallback; }
  };

  const ls = {
    get(key, fallback) {
      const v = localStorage.getItem(key);
      if (v == null) return fallback;
      return safeJSONParse(v, fallback);
    },
    set(key, val) {
      localStorage.setItem(key, JSON.stringify(val));
    },
    del(key) {
      localStorage.removeItem(key);
    }
  };

  const api = {
    async get(path) {
      const res = await fetch(path, { method: "GET" });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { ok: false, detail: text }; }
      if (!res.ok) throw new Error(data?.detail || `GET ${path} failed`);
      return data;
    },
    async post(path, body) {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { ok: false, detail: text }; }
      if (!res.ok) throw new Error(data?.detail || `POST ${path} failed`);
      return data;
    }
  };

  function setPill(el, text, tone /* ok|warn|bad */) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("ok", "warn", "bad");
    if (tone) el.classList.add(tone);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  // -----------------------------
  // Service Worker
  // -----------------------------
  (function registerSW() {
    try {
      if (!("serviceWorker" in navigator)) return;
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/service-worker.js").catch(() => {});
      });
    } catch {}
  })();

  // -----------------------------
  // Global UI init checks
  // -----------------------------
  function markJSReady() {
    const jsPill = $("jsStatus");
    if (jsPill) jsPill.textContent = "JS: ready";
  }

  // -----------------------------
  // Menu switching
  // -----------------------------
  function initMenu() {
    const buttons = Array.from(document.querySelectorAll(".menu-btn"));
    const sections = Array.from(document.querySelectorAll(".app-section"));

    function activate(targetId) {
      for (const b of buttons) {
        b.classList.toggle("active", b.dataset.target === targetId);
      }
      for (const s of sections) {
        s.classList.toggle("active", s.id === targetId);
      }
    }

    buttons.forEach((b) => {
      b.addEventListener("click", () => {
        const t = b.dataset.target;
        if (!t) return;
        activate(t);
      });
    });
  }

  // -----------------------------
  // Streak helper
  // -----------------------------
  function getStreak(key) {
    return ls.get(key, { count: 0, lastDay: null });
  }

  function setStreak(key, obj) {
    ls.set(key, obj);
  }

  function bumpStreakIfNewDay(key) {
    const day = nowLocalDateKey();
    const s = getStreak(key);

    if (s.lastDay === day) return s; // already counted today

    // simple rule: if last day was yesterday -> +1, else reset to 1
    let nextCount = 1;
    if (s.lastDay) {
      const last = new Date(s.lastDay + "T00:00:00");
      const cur = new Date(day + "T00:00:00");
      const diffDays = Math.round((cur - last) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) nextCount = (s.count || 0) + 1;
      else nextCount = 1;
    }
    const out = { count: nextCount, lastDay: day };
    setStreak(key, out);
    return out;
  }

  // -----------------------------
  // Chat
  // -----------------------------
  const CHAT_STORE_KEY = "alyana_chat_saves_v1";

  function chatAddBubble(role, text) {
    const chat = $("chat");
    if (!chat) return;

    const row = document.createElement("div");
    row.className = `bubble-row ${role}`;

    const bubble = document.createElement("div");
    bubble.className = `bubble ${role === "user" ? "user" : role === "bot" ? "bot" : "system"}`;
    bubble.textContent = text;

    row.appendChild(bubble);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
  }

  function chatClear() {
    const chat = $("chat");
    if (chat) chat.innerHTML = "";
  }

  function chatGetTranscript() {
    const chat = $("chat");
    if (!chat) return [];
    const bubbles = Array.from(chat.querySelectorAll(".bubble-row"));
    return bubbles.map((row) => {
      const role = row.classList.contains("user") ? "user" : row.classList.contains("bot") ? "bot" : "system";
      const text = row.querySelector(".bubble")?.textContent || "";
      return { role, text };
    });
  }

  function chatRenderSavedList() {
    const wrap = $("chatSavedList");
    if (!wrap) return;

    const saved = ls.get(CHAT_STORE_KEY, []);
    wrap.innerHTML = "";

    if (!saved.length) {
      wrap.innerHTML = `<small style="opacity:0.75;">No saved chats yet.</small>`;
      return;
    }

    saved
      .slice()
      .reverse()
      .forEach((item, idxFromEnd) => {
        const idx = saved.length - 1 - idxFromEnd;

        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.type = "button";
        btn.textContent = `${item.title || "Chat"} — ${item.day || ""}`;

        btn.addEventListener("click", () => {
          chatClear();
          (item.messages || []).forEach((m) => chatAddBubble(m.role === "user" ? "user" : "bot", m.text));
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.type = "button";
        del.style.marginTop = "6px";
        del.textContent = "Delete";
        del.addEventListener("click", () => {
          const next = saved.filter((_, i) => i !== idx);
          ls.set(CHAT_STORE_KEY, next);
          chatRenderSavedList();
        });

        wrap.appendChild(btn);
        wrap.appendChild(del);
      });
  }

  function initChat() {
    const form = $("chatForm");
    const input = $("chatInput");
    const newBtn = $("chatNewBtn");
    const saveBtn = $("chatSaveBtn");

    if (!form || !input) return;

    chatAddBubble("system", "Alyana Luz is ready. Ask for a prayer, verse, or guidance.");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = (input.value || "").trim();
      if (!msg) return;

      input.value = "";
      chatAddBubble("user", msg);

      try {
        const data = await api.post("/chat", { message: msg });
        const reply = data?.reply ?? "(no reply)";
        chatAddBubble("bot", reply);
      } catch (err) {
        chatAddBubble("system", `Error: ${err.message}`);
      }
    });

    if (newBtn) {
      newBtn.addEventListener("click", () => {
        chatClear();
        chatAddBubble("system", "New chat started.");
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const messages = chatGetTranscript().filter((m) => m.role !== "system");
        if (!messages.length) {
          chatAddBubble("system", "Nothing to save yet.");
          return;
        }
        const saved = ls.get(CHAT_STORE_KEY, []);
        const day = nowLocalDateKey();
        const title = messages.find((m) => m.role === "user")?.text?.slice(0, 42) || "Chat";
        saved.push({ day, title, messages, savedAt: Date.now() });
        ls.set(CHAT_STORE_KEY, saved);
        chatAddBubble("system", "Saved.");
        chatRenderSavedList();
      });
    }

    chatRenderSavedList();
  }

  // -----------------------------
  // Bible Reader (API-driven)
  // -----------------------------
  let ttsUtterance = null;

  function stopTTS() {
    try {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
    ttsUtterance = null;
  }

  function speakText(text, lang) {
    if (!("speechSynthesis" in window)) return;
    stopTTS();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang === "es" ? "es-ES" : "en-US";
    ttsUtterance = utter;
    window.speechSynthesis.speak(utter);
  }

  async function initBible() {
    const statusEl = $("bibleDbStatus");
    const bookSel = $("bookSelect");
    const chapSel = $("chapterSelect");
    const vStartSel = $("verseStartSelect");
    const vEndSel = $("verseEndSelect");
    const fullChapter = $("fullChapter");
    const listenBtn = $("listenBible");
    const stopBtn = $("stopBible");
    const refEl = $("passageRef");
    const textEl = $("passageText");
    const voicePill = $("ttsStatus");
    const readingVoice = $("readingVoice");

    if (voicePill) setPill(voicePill, ("speechSynthesis" in window) ? "Voice: ready" : "Voice: unavailable", ("speechSynthesis" in window) ? "ok" : "bad");

    if (!bookSel || !chapSel || !vStartSel || !listenBtn || !stopBtn || !refEl || !textEl) return;

    // status (optional)
    try {
      const st = await api.get("/bible/status");
      const ok = st?.ok === true;
      setPill(statusEl, ok ? "Bible DB: ready" : "Bible DB: not ready", ok ? "ok" : "bad");
    } catch {
      // if endpoint doesn't exist, don't crash
      if (statusEl) statusEl.textContent = "Bible DB: (status endpoint not available)";
    }

    // books
    async function loadBooks() {
      bookSel.innerHTML = `<option value="">Loading…</option>`;
      try {
        const data = await api.get("/bible/books");
        const books = data?.books || data || [];
        bookSel.innerHTML = `<option value="">Select a book…</option>`;
        books.forEach((b) => {
          const opt = document.createElement("option");
          // support either {id,name} or plain strings
          opt.value = (typeof b === "object") ? String(b.id ?? b.book_id ?? b.name ?? "") : String(b);
          opt.textContent = (typeof b === "object") ? String(b.name ?? b.title ?? b.id ?? "Book") : String(b);
          bookSel.appendChild(opt);
        });
      } catch (err) {
        bookSel.innerHTML = `<option value="">Error loading books</option>`;
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
      }
    }

    async function loadChapters(bookId) {
      chapSel.innerHTML = `<option value="">—</option>`;
      vStartSel.innerHTML = `<option value="">—</option>`;
      vEndSel.innerHTML = `<option value="">(optional)</option>`;
      if (!bookId) return;

      try {
        const data = await api.get(`/bible/chapters?book_id=${encodeURIComponent(bookId)}`);
        const chapters = data?.chapters || data || [];
        chapSel.innerHTML = `<option value="">Select…</option>`;
        chapters.forEach((c) => {
          const n = (typeof c === "object") ? (c.number ?? c.chapter ?? c) : c;
          const opt = document.createElement("option");
          opt.value = String(n);
          opt.textContent = String(n);
          chapSel.appendChild(opt);
        });
      } catch (err) {
        if (statusEl) statusEl.textContent = `Error: ${err.message}`;
      }
    }

    async function loadVerses(bookId, chapter) {
      vStartSel.innerHTML = `<option value="">—</option>`;
      vEndSel.innerHTML = `<option value="">(optional)</option>`;
      if (!bookId || !chapter) return;

      // We don't know if your API has /bible/verses_count; simplest:
      // call /bible/text for full chapter and count lines, else fall back to 50.
      let count = 50;
      try {
        const data = await api.get(`/bible/text?book_id=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}&full_chapter=1`);
        const verses = data?.verses;
        if (Array.isArray(verses) && verses.length) count = verses.length;
      } catch {
        // ignore
      }

      vStartSel.innerHTML = `<option value="">Start…</option>`;
      for (let i = 1; i <= count; i++) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = String(i);
        vStartSel.appendChild(opt);
      }

      vEndSel.innerHTML = `<option value="">(optional)</option>`;
      for (let i = 1; i <= count; i++) {
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = String(i);
        vEndSel.appendChild(opt);
      }
    }

    async function readPassage() {
      const bookId = bookSel.value;
      const chapter = chapSel.value;
      const start = vStartSel.value;
      const end = vEndSel.value;

      if (!bookId || !chapter) {
        refEl.textContent = "—";
        textEl.textContent = "Select a book and chapter.";
        return;
      }

      const full = !!fullChapter?.checked;
      const params = new URLSearchParams();
      params.set("book_id", bookId);
      params.set("chapter", chapter);
      if (full) params.set("full_chapter", "1");
      else {
        if (start) params.set("verse_start", start);
        if (end) params.set("verse_end", end);
      }

      const data = await api.get(`/bible/text?${params.toString()}`);

      // Support multiple response shapes
      const ref = data?.reference || data?.ref || data?.label || `${bookSel.options[bookSel.selectedIndex]?.textContent || bookId} ${chapter}`;
      refEl.textContent = ref;

      let text = "";
      if (typeof data?.text === "string") text = data.text;
      else if (Array.isArray(data?.verses)) {
        text = data.verses.map((v) => {
          if (typeof v === "string") return v;
          const vn = v.verse ?? v.v ?? "";
          const vt = v.text ?? v.t ?? "";
          return vn ? `${vn}. ${vt}` : vt;
        }).join("\n");
      } else {
        text = JSON.stringify(data, null, 2);
      }

      textEl.textContent = text || "—";
      return { ref, text };
    }

    bookSel.addEventListener("change", () => loadChapters(bookSel.value));
    chapSel.addEventListener("change", () => loadVerses(bookSel.value, chapSel.value));

    if (listenBtn) {
      listenBtn.addEventListener("click", async () => {
        try {
          const passage = await readPassage();
          const lang = (readingVoice?.value || "en");
          if (!passage?.text) return;

          // Spanish voice: read only verse text (no English label)
          const speakBody = lang === "es" ? passage.text : `${passage.ref}\n\n${passage.text}`;
          speakText(speakBody, lang);
        } catch (err) {
          if (textEl) textEl.textContent = `Error: ${err.message}`;
        }
      });
    }

    if (stopBtn) stopBtn.addEventListener("click", stopTTS);

    await loadBooks();
  }

  // -----------------------------
  // Devotional
  // -----------------------------
  const DEV_STORE_KEY = "alyana_devotionals_v1";
  const DEV_STREAK_KEY = "alyana_dev_streak_v1";

  function devRenderSavedList() {
    const wrap = $("devSavedList");
    if (!wrap) return;

    const saved = ls.get(DEV_STORE_KEY, []);
    wrap.innerHTML = "";

    if (!saved.length) {
      wrap.innerHTML = `<small style="opacity:0.75;">No saved devotionals yet.</small>`;
      return;
    }

    saved.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = saved.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${item.reference || "Devotional"} — ${item.day || ""}`;
      btn.addEventListener("click", () => {
        if ($("devTheme")) $("devTheme").textContent = item.theme || "—";
        if ($("devScriptureRef")) $("devScriptureRef").textContent = item.reference || "—";
        if ($("devScriptureText")) $("devScriptureText").textContent = item.scripture || "—";

        if ($("devStarterContext")) $("devStarterContext").textContent = item.starters?.context || "—";
        if ($("devStarterReflection")) $("devStarterReflection").textContent = item.starters?.reflection || "—";
        if ($("devStarterApplication")) $("devStarterApplication").textContent = item.starters?.application || "—";
        if ($("devStarterPrayer")) $("devStarterPrayer").textContent = item.starters?.prayer || "—";

        if ($("devMyContext")) $("devMyContext").value = item.my?.context || "";
        if ($("devMyReflection")) $("devMyReflection").value = item.my?.reflection || "";
        if ($("devMyApplication")) $("devMyApplication").value = item.my?.application || "";
        if ($("devMyPrayer")) $("devMyPrayer").value = item.my?.prayer || "";
        if ($("devMyNotes")) $("devMyNotes").value = item.my?.notes || "";
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.style.marginTop = "6px";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        const next = saved.filter((_, i) => i !== idx);
        ls.set(DEV_STORE_KEY, next);
        devRenderSavedList();
      });

      wrap.appendChild(btn);
      wrap.appendChild(del);
    });
  }

  function devUpdateStreakUI() {
    const pill = $("devStreakPill");
    const s = getStreak(DEV_STREAK_KEY);
    if (pill) pill.textContent = `Streak: ${s.count || 0}`;
  }

  function setDevLangLabels(lang) {
    const devIntro = $("devIntro");
    if (devIntro) {
      devIntro.textContent =
        lang === "es"
          ? "Alyana te da un ejemplo breve. Tú escribes y guardas tu devocional real."
          : "Alyana gives a short starter example. You write and save your real devotional.";
    }
  }

  async function initDevotional() {
    const langSel = $("devUiLang");
    const genBtn = $("devotionalBtn");
    const saveBtn = $("devSaveBtn");
    const didBtn = $("devStreakBtn");

    if (langSel) {
      langSel.addEventListener("change", () => setDevLangLabels(langSel.value));
      setDevLangLabels(langSel.value);
    }

    if (genBtn) {
      genBtn.addEventListener("click", async () => {
        const lang = langSel?.value || "en";
        try {
          const data = await api.get(`/devotional?lang=${encodeURIComponent(lang)}&version=en_default`);
          if ($("devTheme")) $("devTheme").textContent = data.theme || "—";
          if ($("devScriptureRef")) $("devScriptureRef").textContent = data.reference || "—";
          if ($("devScriptureText")) $("devScriptureText").textContent = data.scripture || "—";

          if ($("devStarterContext")) $("devStarterContext").textContent = data.starters?.context || "—";
          if ($("devStarterReflection")) $("devStarterReflection").textContent = data.starters?.reflection || "—";
          if ($("devStarterApplication")) $("devStarterApplication").textContent = data.starters?.application || "—";
          if ($("devStarterPrayer")) $("devStarterPrayer").textContent = data.starters?.prayer || "—";
        } catch (err) {
          if ($("devTheme")) $("devTheme").textContent = `Error: ${err.message}`;
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const my = {
          context: ($("devMyContext")?.value || "").trim(),
          reflection: ($("devMyReflection")?.value || "").trim(),
          application: ($("devMyApplication")?.value || "").trim(),
          prayer: ($("devMyPrayer")?.value || "").trim(),
          notes: ($("devMyNotes")?.value || "").trim()
        };

        const missing = [];
        if (!my.context) missing.push("Context");
        if (!my.reflection) missing.push("Reflection");
        if (!my.application) missing.push("Application");
        if (!my.prayer) missing.push("Prayer");

        if (missing.length) {
          alert(`To save and count streak, please write: ${missing.join(", ")}`);
          return;
        }

        const payload = {
          day: nowLocalDateKey(),
          theme: $("devTheme")?.textContent || "",
          reference: $("devScriptureRef")?.textContent || "",
          scripture: $("devScriptureText")?.textContent || "",
          starters: {
            context: $("devStarterContext")?.textContent || "",
            reflection: $("devStarterReflection")?.textContent || "",
            application: $("devStarterApplication")?.textContent || "",
            prayer: $("devStarterPrayer")?.textContent || ""
          },
          my,
          savedAt: Date.now()
        };

        const saved = ls.get(DEV_STORE_KEY, []);
        saved.push(payload);
        ls.set(DEV_STORE_KEY, saved);
        devRenderSavedList();

        bumpStreakIfNewDay(DEV_STREAK_KEY);
        devUpdateStreakUI();

        alert("Saved devotional (and updated streak).");
      });
    }

    if (didBtn) {
      didBtn.addEventListener("click", () => {
        bumpStreakIfNewDay(DEV_STREAK_KEY);
        devUpdateStreakUI();
      });
    }

    devRenderSavedList();
    devUpdateStreakUI();
  }

  // -----------------------------
  // Daily Prayer (sectioned)
  // -----------------------------
  const PR_STORE_KEY = "alyana_prayers_v1";
  const PR_STREAK_KEY = "alyana_prayer_streak_v1";

  function prUpdateStreakUI() {
    const pill = $("prStreakPill");
    const s = getStreak(PR_STREAK_KEY);
    if (pill) pill.textContent = `Streak: ${s.count || 0}`;
  }

  function prRenderSavedList() {
    const wrap = $("prSavedList");
    if (!wrap) return;

    const saved = ls.get(PR_STORE_KEY, []);
    wrap.innerHTML = "";

    if (!saved.length) {
      wrap.innerHTML = `<small style="opacity:0.75;">No saved prayers yet.</small>`;
      return;
    }

    saved.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = saved.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${item.day || ""} — Prayer`;
      btn.addEventListener("click", () => {
        if ($("pA")) $("pA").textContent = item.starters?.adoration || "—";
        if ($("pC")) $("pC").textContent = item.starters?.confession || "—";
        if ($("pT")) $("pT").textContent = item.starters?.thanksgiving || "—";
        if ($("pS")) $("pS").textContent = item.starters?.supplication || "—";

        if ($("myAdoration")) $("myAdoration").value = item.my?.adoration || "";
        if ($("myConfession")) $("myConfession").value = item.my?.confession || "";
        if ($("myThanksgiving")) $("myThanksgiving").value = item.my?.thanksgiving || "";
        if ($("mySupplication")) $("mySupplication").value = item.my?.supplication || "";
        if ($("prayerNotes")) $("prayerNotes").value = item.my?.notes || "";
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.style.marginTop = "6px";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        const next = saved.filter((_, i) => i !== idx);
        ls.set(PR_STORE_KEY, next);
        prRenderSavedList();
      });

      wrap.appendChild(btn);
      wrap.appendChild(del);
    });
  }

  function setPrayerLangLabels(lang) {
    const prIntro = $("prIntro");
    if (prIntro) {
      prIntro.textContent =
        lang === "es"
          ? "Alyana te da un ejemplo breve. Tú escribes y guardas tu oración real."
          : "Alyana gives a short starter example. You write and save your real prayer.";
    }

    // Optional: translate placeholders lightly (keep your existing ones if you prefer)
    // Keeping placeholders as-is for now.
  }

  function startersPrayer(lang) {
    if (lang === "es") {
      return {
        adoration: "Ejemplo: Padre Celestial, Tú eres santo, fiel y bueno.",
        confession: "Ejemplo: Perdóname por mis fallas en pensamientos, palabras o acciones.",
        thanksgiving: "Ejemplo: Gracias por la vida, la protección y Tu misericordia hoy.",
        supplication: "Ejemplo: Dame sabiduría, paz y guía; bendice a mi familia y a los necesitados."
      };
    }
    return {
      adoration: "Example: Heavenly Father, You are holy, faithful, and good.",
      confession: "Example: Forgive me for where I have fallen short in thought, word, or action.",
      thanksgiving: "Example: Thank You for life, protection, and Your mercy today.",
      supplication: "Example: Give me wisdom, peace, and guidance; bless my family and those in need."
    };
  }

  async function initDailyPrayer() {
    const langSel = $("prUiLang");
    const genBtn = $("prayerBtn");
    const saveBtn = $("prSaveBtn");
    const didBtn = $("prStreakBtn");

    if (langSel) {
      langSel.addEventListener("change", () => setPrayerLangLabels(langSel.value));
      setPrayerLangLabels(langSel.value);
    }

    if (genBtn) {
      genBtn.addEventListener("click", () => {
        const lang = langSel?.value || "en";
        const s = startersPrayer(lang);
        if ($("pA")) $("pA").textContent = s.adoration;
        if ($("pC")) $("pC").textContent = s.confession;
        if ($("pT")) $("pT").textContent = s.thanksgiving;
        if ($("pS")) $("pS").textContent = s.supplication;
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const my = {
          adoration: ($("myAdoration")?.value || "").trim(),
          confession: ($("myConfession")?.value || "").trim(),
          thanksgiving: ($("myThanksgiving")?.value || "").trim(),
          supplication: ($("mySupplication")?.value || "").trim(),
          notes: ($("prayerNotes")?.value || "").trim()
        };

        const missing = [];
        if (!my.adoration) missing.push("Adoration");
        if (!my.confession) missing.push("Confession");
        if (!my.thanksgiving) missing.push("Thanksgiving");
        if (!my.supplication) missing.push("Supplication");

        if (missing.length) {
          alert(`To save and count streak, please write: ${missing.join(", ")}`);
          return;
        }

        const payload = {
          day: nowLocalDateKey(),
          starters: {
            adoration: $("pA")?.textContent || "",
            confession: $("pC")?.textContent || "",
            thanksgiving: $("pT")?.textContent || "",
            supplication: $("pS")?.textContent || ""
          },
          my,
          savedAt: Date.now()
        };

        const saved = ls.get(PR_STORE_KEY, []);
        saved.push(payload);
        ls.set(PR_STORE_KEY, saved);
        prRenderSavedList();

        bumpStreakIfNewDay(PR_STREAK_KEY);
        prUpdateStreakUI();

        alert("Saved prayer (and updated streak).");
      });
    }

    if (didBtn) {
      didBtn.addEventListener("click", () => {
        bumpStreakIfNewDay(PR_STREAK_KEY);
        prUpdateStreakUI();
      });
    }

    prRenderSavedList();
    prUpdateStreakUI();
  }

  // -----------------------------
  // Auth/Billing placeholders
  // -----------------------------
  async function initTopBar() {
    const authPill = $("authPill");
    const manage = $("manageBillingBtn");
    const logout = $("logoutBtn");
    const loginBtn = $("loginBtn");

    // You can wire these later. For now: show "Local mode"
    setPill(authPill, "Account: local mode", "warn");

    if (manage) manage.disabled = true;
    if (logout) logout.style.display = "none";

    if (loginBtn) {
      loginBtn.addEventListener("click", () => {
        alert("Restore access is not wired yet. This is a placeholder.");
      });
    }
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    markJSReady();
    initMenu();
    initTopBar();
    initChat();
    initBible();
    initDevotional();
    initDailyPrayer();
  }

  // Guard: never white-screen if DOM missing
  document.addEventListener("DOMContentLoaded", () => {
    try { boot(); }
    catch (err) {
      const jsPill = $("jsStatus");
      if (jsPill) jsPill.textContent = "JS: error";
      console.error(err);
      alert("App JS crashed. Open DevTools Console to see the error.");
    }
  });
})();




























