/* frontend/app.js
   Alyana Luz • Bible AI
   - IMPORTANT: This file DOES NOT rewrite the DOM.
   - It assumes your full UI is already in frontend/index.html
*/

(function () {
  "use strict";

  // -----------------------------
  // Small helpers
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function setText(el, text) {
    if (!el) return;
    el.textContent = text;
  }

  function show(el, on) {
    if (!el) return;
    el.style.display = on ? "" : "none";
  }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    const ct = res.headers.get("content-type") || "";
    const isJson = ct.includes("application/json");
    const data = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
    if (!res.ok) {
      const msg = isJson && data && data.detail ? data.detail : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function todayKeyLocal() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function readLS(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeLS(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // -----------------------------
  // Init guard: if required elements are missing, don't crash
  // -----------------------------
  function requiredIdsExist() {
    // If these are missing, you're not serving the full UI index.html
    return !!($("jsStatus") && $("chatSection") && $("devotionalSection") && $("prayerSection"));
  }

  // -----------------------------
  // Navigation (tabs)
  // -----------------------------
  function initNavigation() {
    const buttons = qsa(".menu-btn");
    const sections = qsa(".app-section");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-target");
        buttons.forEach((b) => b.classList.toggle("active", b === btn));
        sections.forEach((s) => s.classList.toggle("active", s.id === target));
      });
    });
  }

  // -----------------------------
  // CHAT (simple stub + local save)
  // -----------------------------
  const CHAT_LS_KEY = "alyana_chat_saves_v1";

  function renderChatBubble(role, text) {
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

  function getChatTranscriptText() {
    const chat = $("chat");
    if (!chat) return "";
    const rows = qsa(".bubble-row", chat);
    const parts = rows.map((r) => {
      const isUser = r.classList.contains("user");
      const isBot = r.classList.contains("bot");
      const who = isUser ? "You" : isBot ? "Alyana" : "System";
      const bubble = qs(".bubble", r);
      return `${who}: ${bubble ? bubble.textContent : ""}`;
    });
    return parts.join("\n");
  }

  function renderSavedChats() {
    const list = $("chatSavedList");
    if (!list) return;

    const saves = readLS(CHAT_LS_KEY, []);
    list.innerHTML = "";

    if (!saves.length) {
      list.innerHTML = `<small style="opacity:0.75;">No saved chats yet.</small>`;
      return;
    }

    saves.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = saves.length - 1 - idxFromEnd;
      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${item.title || "Chat"} • ${item.day || ""}`;

      btn.addEventListener("click", () => {
        const chat = $("chat");
        if (chat) chat.innerHTML = "";
        renderChatBubble("system", `Loaded: ${item.title || "Chat"}`);
        (item.lines || []).forEach((ln) => {
          const role = ln.role || "bot";
          renderChatBubble(role, ln.text || "");
        });
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.textContent = "Delete";
      del.style.marginTop = "8px";

      del.addEventListener("click", () => {
        const next = readLS(CHAT_LS_KEY, []);
        next.splice(idx, 1);
        writeLS(CHAT_LS_KEY, next);
        renderSavedChats();
      });

      const wrap = document.createElement("div");
      wrap.className = "block";
      wrap.appendChild(btn);
      wrap.appendChild(del);
      list.appendChild(wrap);
    });
  }

  function initChat() {
    const form = $("chatForm");
    const input = $("chatInput");
    const newBtn = $("chatNewBtn");
    const saveBtn = $("chatSaveBtn");

    if (!form || !input || !newBtn || !saveBtn) return;

    renderChatBubble("system", "Welcome. Ask for a prayer, verses, or guidance.");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = (input.value || "").trim();
      if (!msg) return;
      input.value = "";

      renderChatBubble("user", msg);

      try {
        const data = await fetchJSON("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg }),
        });
        renderChatBubble("bot", data.reply || "…");
      } catch (err) {
        renderChatBubble("system", `Error: ${err.message || err}`);
      }
    });

    newBtn.addEventListener("click", () => {
      const chat = $("chat");
      if (chat) chat.innerHTML = "";
      renderChatBubble("system", "New chat started.");
    });

    saveBtn.addEventListener("click", () => {
      const day = todayKeyLocal();
      const transcript = qsa(".bubble-row", $("chat") || document).map((r) => {
        const role = r.classList.contains("user") ? "user" : r.classList.contains("bot") ? "bot" : "system";
        const bubble = qs(".bubble", r);
        return { role, text: bubble ? bubble.textContent : "" };
      });

      const title = `Chat ${day}`;
      const saves = readLS(CHAT_LS_KEY, []);
      saves.push({ day, title, lines: transcript });
      writeLS(CHAT_LS_KEY, saves);

      renderSavedChats();
      renderChatBubble("system", "Saved chat to this device.");
    });

    renderSavedChats();
  }

  // -----------------------------
  // DEVOTIONAL (sections + user inputs + save + streak)
  // -----------------------------
  const DEV_LS_KEY = "alyana_devotionals_v2";
  const DEV_STREAK_KEY = "alyana_devotional_streak_v1";

  function calcStreak(daysSet) {
    // daysSet = { "YYYY-MM-DD": true }
    let streak = 0;
    let d = new Date();
    // count backwards from today
    while (true) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (daysSet[key]) {
        streak += 1;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function updateDevStreakUI() {
    const pill = $("devStreakPill");
    const data = readLS(DEV_STREAK_KEY, { days: {} });
    const streak = calcStreak(data.days || {});
    setText(pill, `Streak: ${streak}`);
  }

  function renderDevSavedList() {
    const list = $("devSavedList");
    if (!list) return;

    const saves = readLS(DEV_LS_KEY, []);
    list.innerHTML = "";

    if (!saves.length) {
      list.innerHTML = `<small style="opacity:0.75;">No saved devotionals yet.</small>`;
      return;
    }

    saves.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = saves.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${item.day || ""} • ${item.theme || "Devotional"}`;

      btn.addEventListener("click", () => {
        setText($("devTheme"), item.theme || "—");
        setText($("devScriptureRef"), item.reference || "—");
        setText($("devScriptureText"), item.scripture || "—");

        setText($("devStarterContext"), item.starters?.context || "—");
        setText($("devStarterReflection"), item.starters?.reflection || "—");
        setText($("devStarterApplication"), item.starters?.application || "—");
        setText($("devStarterPrayer"), item.starters?.prayer || "—");

        $("devMyContext").value = item.my?.context || "";
        $("devMyReflection").value = item.my?.reflection || "";
        $("devMyApplication").value = item.my?.application || "";
        $("devMyPrayer").value = item.my?.prayer || "";
        $("devMyNotes").value = item.my?.notes || "";
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.textContent = "Delete";
      del.style.marginTop = "8px";

      del.addEventListener("click", () => {
        const next = readLS(DEV_LS_KEY, []);
        next.splice(idx, 1);
        writeLS(DEV_LS_KEY, next);
        renderDevSavedList();
      });

      const wrap = document.createElement("div");
      wrap.className = "block";
      wrap.appendChild(btn);
      wrap.appendChild(del);
      list.appendChild(wrap);
    });
  }

  function setDevLangUI(lang) {
    const intro = $("devIntro");
    const req = $("devReqNote");
    if (lang === "es") {
      setText(intro, "Alyana te da ejemplos breves. Tú escribes y guardas tu devocional real.");
      setText(req, "Requerido para guardar (racha): Contexto + Reflexión + Aplicación + Oración.");
      setText($("devNow1"), "Ahora escribe el tuyo:");
      setText($("devNow2"), "Ahora escribe el tuyo:");
      setText($("devNow3"), "Ahora escribe el tuyo:");
      setText($("devNow4"), "Ahora escribe tu oración real:");
    } else {
      setText(intro, "Alyana gives short starter examples. You write and save your real devotional.");
      setText(req, "Required to save (streak): Context + Reflection + Application + Prayer.");
      setText($("devNow1"), "Now write yours:");
      setText($("devNow2"), "Now write yours:");
      setText($("devNow3"), "Now write yours:");
      setText($("devNow4"), "Now write your real prayer:");
    }
  }

  async function generateDevotional() {
    const uiLangSel = $("devUiLang");
    const lang = (uiLangSel ? uiLangSel.value : "en") || "en";
    setDevLangUI(lang);

    // version: you can wire a selector later; for now match your backend default
    const version = "en_default";

    setText($("devTheme"), "Loading…");
    setText($("devScriptureRef"), "Loading…");
    setText($("devScriptureText"), "Loading…");
    setText($("devStarterContext"), "Loading…");
    setText($("devStarterReflection"), "Loading…");
    setText($("devStarterApplication"), "Loading…");
    setText($("devStarterPrayer"), "Loading…");

    const data = await fetchJSON(`/devotional?lang=${encodeURIComponent(lang)}&version=${encodeURIComponent(version)}`);

    setText($("devTheme"), data.theme || "—");
    setText($("devScriptureRef"), data.reference || "—");
    setText($("devScriptureText"), data.scripture || "—");

    setText($("devStarterContext"), data.starters?.context || "—");
    setText($("devStarterReflection"), data.starters?.reflection || "—");
    setText($("devStarterApplication"), data.starters?.application || "—");
    setText($("devStarterPrayer"), data.starters?.prayer || "—");

    // clear user inputs for the day (user still writes)
    $("devMyContext").value = "";
    $("devMyReflection").value = "";
    $("devMyApplication").value = "";
    $("devMyPrayer").value = "";
    $("devMyNotes").value = "";
  }

  function saveDevotional() {
    const theme = ($("devTheme")?.textContent || "").trim();
    const reference = ($("devScriptureRef")?.textContent || "").trim();
    const scripture = ($("devScriptureText")?.textContent || "").trim();

    const starters = {
      context: ($("devStarterContext")?.textContent || "").trim(),
      reflection: ($("devStarterReflection")?.textContent || "").trim(),
      application: ($("devStarterApplication")?.textContent || "").trim(),
      prayer: ($("devStarterPrayer")?.textContent || "").trim(),
    };

    const my = {
      context: ($("devMyContext")?.value || "").trim(),
      reflection: ($("devMyReflection")?.value || "").trim(),
      application: ($("devMyApplication")?.value || "").trim(),
      prayer: ($("devMyPrayer")?.value || "").trim(),
      notes: ($("devMyNotes")?.value || "").trim(),
    };

    // streak requirements
    if (!my.context || !my.reflection || !my.application || !my.prayer) {
      alert("To save (and count a streak), please fill: Context + Reflection + Application + Prayer.");
      return;
    }

    const day = todayKeyLocal();
    const saves = readLS(DEV_LS_KEY, []);
    saves.push({ day, theme, reference, scripture, starters, my });
    writeLS(DEV_LS_KEY, saves);

    const streakData = readLS(DEV_STREAK_KEY, { days: {} });
    streakData.days = streakData.days || {};
    streakData.days[day] = true;
    writeLS(DEV_STREAK_KEY, streakData);

    updateDevStreakUI();
    renderDevSavedList();
    alert("Saved devotional. Streak updated.");
  }

  function initDevotional() {
    const langSel = $("devUiLang");
    const genBtn = $("devotionalBtn");
    const saveBtn = $("devSaveBtn");
    if (!langSel || !genBtn || !saveBtn) return;

    langSel.addEventListener("change", () => setDevLangUI(langSel.value));
    setDevLangUI(langSel.value || "en");

    genBtn.addEventListener("click", async () => {
      try {
        await generateDevotional();
      } catch (err) {
        alert(`Devotional error: ${err.message || err}`);
      }
    });

    saveBtn.addEventListener("click", saveDevotional);

    updateDevStreakUI();
    renderDevSavedList();
  }

  // -----------------------------
  // DAILY PRAYER (ACTS sections + user inputs + save + streak)
  // -----------------------------
  const PR_LS_KEY = "alyana_prayers_v2";
  const PR_STREAK_KEY = "alyana_prayer_streak_v1";

  function updatePrayerStreakUI() {
    const pill = $("prStreakPill");
    const data = readLS(PR_STREAK_KEY, { days: {} });
    const streak = calcStreak(data.days || {});
    setText(pill, `Streak: ${streak}`);
  }

  function renderPrayerSavedList() {
    const list = $("prSavedList");
    if (!list) return;

    const saves = readLS(PR_LS_KEY, []);
    list.innerHTML = "";

    if (!saves.length) {
      list.innerHTML = `<small style="opacity:0.75;">No saved prayers yet.</small>`;
      return;
    }

    saves.slice().reverse().forEach((item, idxFromEnd) => {
      const idx = saves.length - 1 - idxFromEnd;

      const btn = document.createElement("button");
      btn.className = "btn btn-ghost";
      btn.type = "button";
      btn.textContent = `${item.day || ""} • Prayer`;

      btn.addEventListener("click", () => {
        setText($("pA"), item.starters?.adoration || "—");
        setText($("pC"), item.starters?.confession || "—");
        setText($("pT"), item.starters?.thanksgiving || "—");
        setText($("pS"), item.starters?.supplication || "—");

        $("myAdoration").value = item.my?.adoration || "";
        $("myConfession").value = item.my?.confession || "";
        $("myThanksgiving").value = item.my?.thanksgiving || "";
        $("mySupplication").value = item.my?.supplication || "";
        $("prayerNotes").value = item.my?.notes || "";
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger";
      del.type = "button";
      del.textContent = "Delete";
      del.style.marginTop = "8px";

      del.addEventListener("click", () => {
        const next = readLS(PR_LS_KEY, []);
        next.splice(idx, 1);
        writeLS(PR_LS_KEY, next);
        renderPrayerSavedList();
      });

      const wrap = document.createElement("div");
      wrap.className = "block";
      wrap.appendChild(btn);
      wrap.appendChild(del);
      list.appendChild(wrap);
    });
  }

  function setPrayerLangUI(lang) {
    const intro = $("prIntro");
    if (lang === "es") {
      setText(intro, "Alyana te da un ejemplo breve. Tú escribes y guardas tu oración real.");
      setText($("prNow1"), "Ahora escribe la tuya:");
      setText($("prNow2"), "Ahora escribe la tuya:");
      setText($("prNow3"), "Ahora escribe la tuya:");
      setText($("prNow4"), "Ahora escribe la tuya:");
    } else {
      setText(intro, "Alyana gives a short starter example. You write and save your real prayer.");
      setText($("prNow1"), "Now write your own:");
      setText($("prNow2"), "Now write your own:");
      setText($("prNow3"), "Now write your own:");
      setText($("prNow4"), "Now write your own:");
    }
  }

  async function generatePrayerStarters() {
    const langSel = $("prUiLang");
    const lang = (langSel ? langSel.value : "en") || "en";
    setPrayerLangUI(lang);

    const version = "en_default";

    setText($("pA"), "Loading…");
    setText($("pC"), "Loading…");
    setText($("pT"), "Loading…");
    setText($("pS"), "Loading…");

    const data = await fetchJSON(`/daily_prayer?lang=${encodeURIComponent(lang)}&version=${encodeURIComponent(version)}`);

    setText($("pA"), data.starters?.adoration || "—");
    setText($("pC"), data.starters?.confession || "—");
    setText($("pT"), data.starters?.thanksgiving || "—");
    setText($("pS"), data.starters?.supplication || "—");

    // clear user inputs (they write the real prayer)
    $("myAdoration").value = "";
    $("myConfession").value = "";
    $("myThanksgiving").value = "";
    $("mySupplication").value = "";
    $("prayerNotes").value = "";
  }

  function savePrayer() {
    const starters = {
      adoration: ($("pA")?.textContent || "").trim(),
      confession: ($("pC")?.textContent || "").trim(),
      thanksgiving: ($("pT")?.textContent || "").trim(),
      supplication: ($("pS")?.textContent || "").trim(),
    };

    const my = {
      adoration: ($("myAdoration")?.value || "").trim(),
      confession: ($("myConfession")?.value || "").trim(),
      thanksgiving: ($("myThanksgiving")?.value || "").trim(),
      supplication: ($("mySupplication")?.value || "").trim(),
      notes: ($("prayerNotes")?.value || "").trim(),
    };

    // require all 4 sections for streak integrity
    if (!my.adoration || !my.confession || !my.thanksgiving || !my.supplication) {
      alert("To save (and count a streak), please fill: Adoration + Confession + Thanksgiving + Supplication.");
      return;
    }

    const day = todayKeyLocal();
    const saves = readLS(PR_LS_KEY, []);
    saves.push({ day, starters, my });
    writeLS(PR_LS_KEY, saves);

    const streakData = readLS(PR_STREAK_KEY, { days: {} });
    streakData.days = streakData.days || {};
    streakData.days[day] = true;
    writeLS(PR_STREAK_KEY, streakData);

    updatePrayerStreakUI();
    renderPrayerSavedList();
    alert("Saved prayer. Streak updated.");
  }

  function initPrayer() {
    const langSel = $("prUiLang");
    const genBtn = $("prayerBtn");
    const saveBtn = $("prSaveBtn");

    if (!langSel || !genBtn || !saveBtn) return;

    langSel.addEventListener("change", () => setPrayerLangUI(langSel.value));
    setPrayerLangUI(langSel.value || "en");

    genBtn.addEventListener("click", async () => {
      try {
        await generatePrayerStarters();
      } catch (err) {
        alert(`Daily Prayer error: ${err.message || err}`);
      }
    });

    saveBtn.addEventListener("click", savePrayer);

    updatePrayerStreakUI();
    renderPrayerSavedList();
  }

  // -----------------------------
  // Bible DB status (optional little indicator)
  // -----------------------------
  async function initBibleDbStatus() {
    const el = $("bibleDbStatus");
    if (!el) return;
    try {
      const data = await fetchJSON("/bible/status?version=en_default");
      setText(el, `Bible DB OK • ${data.version} • verses: ${data.verse_count}`);
    } catch (err) {
      setText(el, `Bible DB error: ${err.message || err}`);
    }
  }

  // -----------------------------
  // Boot
  // -----------------------------
  window.addEventListener("load", async () => {
    const jsPill = $("jsStatus");
    if (jsPill) setText(jsPill, "JS: running");

    if (!requiredIdsExist()) {
      // If you see this in console, you're not serving the full UI index.html
      console.error("Alyana UI elements missing. Are you serving the full frontend/index.html?");
      if (jsPill) setText(jsPill, "JS: wrong index.html");
      return;
    }

    try {
      initNavigation();
      initChat();
      initDevotional();
      initPrayer();
      await initBibleDbStatus();

      if (jsPill) setText(jsPill, "JS: ready");
    } catch (err) {
      console.error(err);
      if (jsPill) setText(jsPill, "JS: error");
    }
  });
})();

























