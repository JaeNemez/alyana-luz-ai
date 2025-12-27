/* frontend/app.js
   Fixes Spanish/English switching for Devotional + Daily Prayer by:
   - calling GET /devotional?lang=en|es
   - calling GET /daily_prayer?lang=en|es
   - mapping returned fields to the correct DOM ids
*/

(() => {
  "use strict";

  // -----------------------
  // Helpers
  // -----------------------
  const $ = (id) => document.getElementById(id);
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function setText(id, value) {
    const el = $(id);
    if (!el) return;
    el.textContent = (value === undefined || value === null || value === "") ? "—" : String(value);
  }

  function setValue(id, value) {
    const el = $(id);
    if (!el) return;
    el.value = (value === undefined || value === null) ? "" : String(value);
  }

  function show(el, on = true) {
    if (!el) return;
    el.style.display = on ? "" : "none";
  }

  async function apiGet(url, opts = {}) {
    const res = await fetch(url, { method: "GET", ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.detail || data?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  async function apiPost(url, body, opts = {}) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(opts.headers || {}) },
      body: JSON.stringify(body || {}),
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.detail || data?.error || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function getBearer() {
    return localStorage.getItem("alyana_token") || "";
  }

  function setBearer(tok) {
    if (tok) localStorage.setItem("alyana_token", tok);
    else localStorage.removeItem("alyana_token");
  }

  function authHeaders() {
    const tok = getBearer();
    return tok ? { authorization: `Bearer ${tok}` } : {};
  }

  function detectLangForDevPrayer() {
    // Your HTML has been in two variants:
    // Variant A: devotional has #devUiLang and prayer has #prUiLang
    // Variant B: only top has #uiLangSelect
    const dev = $("devUiLang");
    const pr = $("prUiLang");
    const ui = $("uiLangSelect");
    // If you are on Devotional tab, prefer devUiLang if exists
    // If you are on Prayer tab, prefer prUiLang if exists
    // Otherwise use uiLangSelect
    // We'll return a function so each click resolves correctly.
    return {
      getDev: () => (dev?.value || ui?.value || "en"),
      getPr:  () => (pr?.value  || ui?.value || "en"),
    };
  }

  // -----------------------
  // Tabs
  // -----------------------
  function initTabs() {
    const buttons = qsa(".menu-btn[data-target]");
    const sections = qsa(".app-section");

    function activate(targetId) {
      sections.forEach((s) => s.classList.toggle("active", s.id === targetId));
      buttons.forEach((b) => b.classList.toggle("active", b.getAttribute("data-target") === targetId));
    }

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => activate(btn.getAttribute("data-target")));
    });
  }

  // -----------------------
  // JS status pill
  // -----------------------
  function setJsReady() {
    const pill = $("jsStatus");
    if (pill) pill.textContent = "JS: ready";
  }

  // -----------------------
  // Stripe/Auth UI basics
  // -----------------------
  async function refreshMe() {
    const authPill = $("authPill");
    const manageBillingBtn = $("manageBillingBtn");
    const logoutBtn = $("logoutBtn");

    try {
      const me = await apiGet("/me", { headers: authHeaders() });

      if (!me?.authed) {
        if (authPill) {
          authPill.textContent = "Account: inactive";
          authPill.classList.remove("ok", "bad");
          authPill.classList.add("warn");
        }
        if (manageBillingBtn) manageBillingBtn.disabled = true;
        if (logoutBtn) show(logoutBtn, false);
        return;
      }

      const active = !!me?.subscribed;
      if (authPill) {
        authPill.textContent = active ? "Account: active" : "Account: inactive";
        authPill.classList.remove("ok", "warn", "bad");
        authPill.classList.add(active ? "ok" : "warn");
      }
      if (manageBillingBtn) manageBillingBtn.disabled = false;
      if (logoutBtn) show(logoutBtn, true);
    } catch (e) {
      // if /me fails, do not break app
      if (authPill) {
        authPill.textContent = "Account: inactive";
        authPill.classList.remove("ok", "bad");
        authPill.classList.add("warn");
      }
      if ($("manageBillingBtn")) $("manageBillingBtn").disabled = true;
      if ($("logoutBtn")) show($("logoutBtn"), false);
    }
  }

  function initStripeButtons() {
    const supportBtn = $("supportBtn");
    const loginBtn = $("loginBtn");
    const loginEmail = $("loginEmail");
    const manageBillingBtn = $("manageBillingBtn");
    const logoutBtn = $("logoutBtn");
    const authHint = $("authHint");

    if (supportBtn) {
      supportBtn.addEventListener("click", async () => {
        try {
          const email = (loginEmail?.value || "").trim().toLowerCase();
          const data = await apiPost("/stripe/checkout", { email });
          if (data?.url) window.location.href = data.url;
        } catch (e) {
          if (authHint) {
            authHint.textContent = String(e?.message || e);
            show(authHint, true);
          }
        }
      });
    }

    if (loginBtn) {
      loginBtn.addEventListener("click", async () => {
        try {
          const email = (loginEmail?.value || "").trim().toLowerCase();
          const data = await apiPost("/stripe/restore", { email });
          if (data?.token) setBearer(data.token);
          if (authHint) {
            authHint.textContent = "Restored. You can manage billing now.";
            show(authHint, true);
          }
          await refreshMe();
          if (data?.portal_url) window.location.href = data.portal_url;
        } catch (e) {
          if (authHint) {
            authHint.textContent = String(e?.message || e);
            show(authHint, true);
          }
        }
      });
    }

    if (manageBillingBtn) {
      manageBillingBtn.addEventListener("click", async () => {
        try {
          const data = await apiPost("/stripe/portal", {}, { headers: authHeaders() });
          if (data?.url) window.location.href = data.url;
        } catch (e) {
          if (authHint) {
            authHint.textContent = String(e?.message || e);
            show(authHint, true);
          }
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        setBearer("");
        await refreshMe();
      });
    }
  }

  // -----------------------
  // Chat
  // -----------------------
  function initChat() {
    const chatEl = $("chat");
    const chatForm = $("chatForm");
    const chatInput = $("chatInput");
    const chatLangSelect = $("chatLangSelect");
    const chatSaveBtn = $("chatSaveBtn");
    const chatNewBtn = $("chatNewBtn");
    const chatSavedList = $("chatSavedList");

    if (!chatEl || !chatForm || !chatInput) return;

    const STORAGE_KEY = "alyana_chat_saves_v1";
    const SESSION_KEY = "alyana_chat_session_v1";

    function addBubble(role, text) {
      const row = document.createElement("div");
      row.className = `bubble-row ${role}`;

      const bubble = document.createElement("div");
      bubble.className = `bubble ${role}`;
      bubble.textContent = text;

      row.appendChild(bubble);
      chatEl.appendChild(row);
      chatEl.scrollTop = chatEl.scrollHeight;
    }

    function getSession() {
      try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
      } catch {
        return [];
      }
    }

    function setSession(items) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(items || []));
    }

    function renderSession() {
      chatEl.innerHTML = "";
      const items = getSession();
      for (const m of items) addBubble(m.role, m.text);
    }

    function loadSaves() {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      } catch {
        return [];
      }
    }

    function saveSaves(list) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list || []));
    }

    function renderSavedList() {
      if (!chatSavedList) return;
      const saves = loadSaves();
      if (!saves.length) {
        chatSavedList.innerHTML = `<small style="opacity:0.75;">No saved chats yet.</small>`;
        return;
      }
      chatSavedList.innerHTML = "";
      saves.forEach((s, idx) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.textContent = s.title || `Chat ${idx + 1}`;
        btn.addEventListener("click", () => {
          setSession(s.items || []);
          renderSession();
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.textContent = "Delete";
        del.style.marginTop = "6px";
        del.addEventListener("click", () => {
          const next = loadSaves().filter((_, i) => i !== idx);
          saveSaves(next);
          renderSavedList();
        });

        const wrap = document.createElement("div");
        wrap.style.marginTop = "8px";
        wrap.appendChild(btn);
        wrap.appendChild(del);
        chatSavedList.appendChild(wrap);
      });
    }

    // initial
    renderSession();
    renderSavedList();

    chatForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = (chatInput.value || "").trim();
      if (!msg) return;

      chatInput.value = "";
      addBubble("user", msg);

      const session = getSession();
      session.push({ role: "user", text: msg });
      setSession(session);

      const lang = (chatLangSelect?.value || "auto").trim();

      try {
        const data = await apiPost("/chat", { message: msg, lang });
        const reply = data?.reply || "—";
        addBubble("bot", reply);

        const next = getSession();
        next.push({ role: "bot", text: reply });
        setSession(next);
      } catch (err) {
        addBubble("system", `Error: ${String(err?.message || err)}`);
      }
    });

    if (chatNewBtn) {
      chatNewBtn.addEventListener("click", () => {
        setSession([]);
        renderSession();
      });
    }

    if (chatSaveBtn) {
      chatSaveBtn.addEventListener("click", () => {
        const items = getSession();
        if (!items.length) return;

        const title = `Chat • ${new Date().toLocaleString()}`;
        const saves = loadSaves();
        saves.unshift({ title, items });
        saveSaves(saves);
        renderSavedList();
        addBubble("system", "Saved.");
      });
    }
  }

  // -----------------------
  // Bible Reader
  // -----------------------
  async function initBible() {
    const bibleDbStatus = $("bibleDbStatus");
    const bookSelect = $("bookSelect");
    const chapterSelect = $("chapterSelect");
    const verseStartSelect = $("verseStartSelect");
    const verseEndSelect = $("verseEndSelect");
    const fullChapter = $("fullChapter");
    const readBibleBtn = $("readBibleBtn");
    const passageRef = $("passageRef");
    const passageText = $("passageText");
    const readingVoice = $("readingVoice");

    if (!bookSelect || !chapterSelect || !verseStartSelect || !readBibleBtn) return;

    // Use Spanish DB if voice is Spanish
    function versionForVoice() {
      const v = (readingVoice?.value || "en").toLowerCase();
      return v === "es" ? "es" : "en_default";
    }

    async function refreshStatusAndBooks() {
      const version = versionForVoice();
      try {
        const st = await apiGet(`/bible/status?version=${encodeURIComponent(version)}`);
        if (bibleDbStatus) {
          bibleDbStatus.textContent = `OK • ${st.version} • verses: ${st.verse_count}`;
        }
      } catch (e) {
        if (bibleDbStatus) bibleDbStatus.textContent = `Error: ${String(e?.message || e)}`;
      }

      try {
        const data = await apiGet(`/bible/books?version=${encodeURIComponent(version)}`);
        const books = data?.books || [];
        bookSelect.innerHTML = `<option value="">Select…</option>`;
        books.forEach((b) => {
          const opt = document.createElement("option");
          opt.value = String(b.id);
          opt.textContent = String(b.name);
          bookSelect.appendChild(opt);
        });
      } catch (e) {
        bookSelect.innerHTML = `<option value="">(Error loading books)</option>`;
      }
    }

    async function refreshChapters() {
      const version = versionForVoice();
      const bid = Number(bookSelect.value || 0);
      chapterSelect.innerHTML = `<option value="">—</option>`;
      verseStartSelect.innerHTML = `<option value="">—</option>`;
      verseEndSelect.innerHTML = `<option value="">(optional)</option>`;
      if (!bid) return;

      const data = await apiGet(`/bible/chapters?version=${encodeURIComponent(version)}&book_id=${bid}`);
      const chapters = data?.chapters || [];
      chapterSelect.innerHTML = `<option value="">Select…</option>`;
      chapters.forEach((c) => {
        const opt = document.createElement("option");
        opt.value = String(c);
        opt.textContent = String(c);
        chapterSelect.appendChild(opt);
      });
    }

    async function refreshVerses() {
      const version = versionForVoice();
      const bid = Number(bookSelect.value || 0);
      const ch = Number(chapterSelect.value || 0);
      verseStartSelect.innerHTML = `<option value="">—</option>`;
      verseEndSelect.innerHTML = `<option value="">(optional)</option>`;
      if (!bid || !ch) return;

      const data = await apiGet(`/bible/verses_max?version=${encodeURIComponent(version)}&book_id=${bid}&chapter=${ch}`);
      const max = Number(data?.max_verse || 0);
      if (!max) return;

      verseStartSelect.innerHTML = `<option value="">1</option>`;
      for (let i = 1; i <= max; i++) {
        const o1 = document.createElement("option");
        o1.value = String(i);
        o1.textContent = String(i);
        verseStartSelect.appendChild(o1);

        const o2 = document.createElement("option");
        o2.value = String(i);
        o2.textContent = String(i);
        verseEndSelect.appendChild(o2);
      }
    }

    async function readPassage() {
      const version = versionForVoice();
      const bid = Number(bookSelect.value || 0);
      const ch = Number(chapterSelect.value || 0);
      const vs = verseStartSelect.value ? Number(verseStartSelect.value) : null;
      const ve = verseEndSelect.value ? Number(verseEndSelect.value) : null;
      const whole = !!fullChapter?.checked;

      if (!bid || !ch) return;

      const params = new URLSearchParams();
      params.set("version", version);
      params.set("book_id", String(bid));
      params.set("chapter", String(ch));
      if (whole) params.set("whole_chapter", "true");
      if (!whole && vs) params.set("verse_start", String(vs));
      if (!whole && ve) params.set("verse_end", String(ve));

      const data = await apiGet(`/bible/text?${params.toString()}`);
      setText("passageRef", `${data.book} ${data.chapter}`);
      setText("passageText", data.text || "—");
    }

    if (readingVoice) {
      readingVoice.addEventListener("change", async () => {
        await refreshStatusAndBooks();
      });
    }

    bookSelect.addEventListener("change", refreshChapters);
    chapterSelect.addEventListener("change", refreshVerses);
    readBibleBtn.addEventListener("click", readPassage);

    await refreshStatusAndBooks();
  }

  // -----------------------
  // Devotional + Daily Prayer (THE FIX)
  // -----------------------
  function initDevAndPrayer() {
    const devotionalBtn = $("devotionalBtn");
    const prayerBtn = $("prayerBtn");

    const devSaveBtn = $("devSaveBtn");
    const prSaveBtn = $("prSaveBtn");

    const { getDev, getPr } = detectLangForDevPrayer();

    async function generateDevotional() {
      // language comes from devUiLang if present, else uiLangSelect
      const lang = (getDev() || "en").toLowerCase() === "es" ? "es" : "en";

      // show immediate feedback
      setText("devTheme", "Loading…");
      setText("devScriptureRef", "Loading…");
      setText("devScriptureText", "Loading…");
      setText("devStarterContext", "Loading…");
      setText("devStarterReflection", "Loading…");
      setText("devStarterApplication", "Loading…");
      setText("devStarterPrayer", "Loading…");

      const data = await apiGet(`/devotional?lang=${encodeURIComponent(lang)}`);

      // IMPORTANT: these are the fields returned by the updated backend
      setText("devTheme", data.theme);
      setText("devScriptureRef", data.scripture_ref);
      setText("devScriptureText", data.scripture_text);
      setText("devStarterContext", data.starter_context);
      setText("devStarterReflection", data.starter_reflection);
      setText("devStarterApplication", data.starter_application);
      setText("devStarterPrayer", data.starter_prayer);
    }

    async function generateDailyPrayer() {
      // language comes from prUiLang if present, else uiLangSelect
      const lang = (getPr() || "en").toLowerCase() === "es" ? "es" : "en";

      setText("pA", "Loading…");
      setText("pC", "Loading…");
      setText("pT", "Loading…");
      setText("pS", "Loading…");

      const data = await apiGet(`/daily_prayer?lang=${encodeURIComponent(lang)}`);

      // IMPORTANT: these are the fields returned by the updated backend
      setText("pA", data.adoration);
      setText("pC", data.confession);
      setText("pT", data.thanksgiving);
      setText("pS", data.supplication);
    }

    if (devotionalBtn) {
      devotionalBtn.addEventListener("click", async () => {
        try {
          await generateDevotional();
        } catch (e) {
          setText("devTheme", `Error: ${String(e?.message || e)}`);
        }
      });
    }

    if (prayerBtn) {
      prayerBtn.addEventListener("click", async () => {
        try {
          await generateDailyPrayer();
        } catch (e) {
          setText("pA", `Error: ${String(e?.message || e)}`);
        }
      });
    }

    // Local saves (optional but keeps your UI working)
    if (devSaveBtn) {
      devSaveBtn.addEventListener("click", () => {
        try {
          const key = "alyana_devotionals_v1";
          const list = JSON.parse(localStorage.getItem(key) || "[]");
          const item = {
            ts: Date.now(),
            lang: (getDev() || "en"),
            theme: $("devTheme")?.textContent || "",
            scripture_ref: $("devScriptureRef")?.textContent || "",
            scripture_text: $("devScriptureText")?.textContent || "",
            starter_context: $("devStarterContext")?.textContent || "",
            starter_reflection: $("devStarterReflection")?.textContent || "",
            starter_application: $("devStarterApplication")?.textContent || "",
            starter_prayer: $("devStarterPrayer")?.textContent || "",
            my_context: $("devMyContext")?.value || "",
            my_reflection: $("devMyReflection")?.value || "",
            my_application: $("devMyApplication")?.value || "",
            my_prayer: $("devMyPrayer")?.value || "",
            my_notes: $("devMyNotes")?.value || "",
          };
          list.unshift(item);
          localStorage.setItem(key, JSON.stringify(list));
        } catch {}
      });
    }

    if (prSaveBtn) {
      prSaveBtn.addEventListener("click", () => {
        try {
          const key = "alyana_prayers_v1";
          const list = JSON.parse(localStorage.getItem(key) || "[]");
          const item = {
            ts: Date.now(),
            lang: (getPr() || "en"),
            adoration: $("pA")?.textContent || "",
            confession: $("pC")?.textContent || "",
            thanksgiving: $("pT")?.textContent || "",
            supplication: $("pS")?.textContent || "",
            my_adoration: $("myAdoration")?.value || "",
            my_confession: $("myConfession")?.value || "",
            my_thanksgiving: $("myThanksgiving")?.value || "",
            my_supplication: $("mySupplication")?.value || "",
            notes: $("prayerNotes")?.value || "",
          };
          list.unshift(item);
          localStorage.setItem(key, JSON.stringify(list));
        } catch {}
      });
    }
  }

  // -----------------------
  // Boot
  // -----------------------
  async function boot() {
    setJsReady();
    initTabs();
    initStripeButtons();
    initChat();
    initDevAndPrayer();
    await initBible();
    await refreshMe();

    // If you came back from Stripe with success/canceled, show hint
    const authHint = $("authHint");
    const url = new URL(window.location.href);
    if (authHint && (url.searchParams.get("success") || url.searchParams.get("canceled"))) {
      authHint.textContent = url.searchParams.get("success")
        ? "Thank you. If you subscribed, tap Restore access to link your email, then Manage billing will work."
        : "Checkout canceled.";
      show(authHint, true);
    }
  }

  window.addEventListener("load", boot);
})();
