(() => {
  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);

  function setHint(msg, isError = false) {
    const el = $("authHint");
    if (!el) return;
    if (!msg) {
      el.style.display = "none";
      el.textContent = "";
      return;
    }
    el.style.display = "block";
    el.textContent = msg;
    el.style.opacity = "1";
    el.style.color = isError ? "#fecaca" : "#d1fae5";
  }

  function setJsStatus(text) {
    const el = $("jsStatus");
    if (el) el.textContent = text;
  }

  async function jsonFetch(url, opts = {}) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) {
      const msg = (data && (data.detail || data.error)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function setAuthPill({ logged_in, email, active, status }) {
    const pill = $("authPill");
    if (!pill) return;

    const manageBtn = $("manageBillingBtn");
    const logoutBtn = $("logoutBtn");

    if (!logged_in) {
      pill.className = "pill warn";
      pill.textContent = "Account: not logged in";
      if (manageBtn) manageBtn.disabled = true;
      if (logoutBtn) logoutBtn.style.display = "none";
      return;
    }

    if (active) {
      pill.className = "pill ok";
      pill.textContent = `Account: active (${email})`;
      if (manageBtn) manageBtn.disabled = false;
    } else {
      pill.className = "pill bad";
      pill.textContent = `Account: inactive (${email})`;
      if (manageBtn) manageBtn.disabled = false; // let them manage billing anyway
    }

    if (logoutBtn) logoutBtn.style.display = "inline-flex";
    if (status) {
      // optional: show status in hint (non-error)
      setHint(`Subscription status: ${status}`, false);
    }
  }

  async function refreshMe() {
    try {
      const me = await jsonFetch("/me", { method: "GET" });
      setAuthPill(me);
      return me;
    } catch (e) {
      // If /me fails, show safe info
      setAuthPill({ logged_in: false });
      return { logged_in: false };
    }
  }

  // ---------- menu ----------
  function setupMenu() {
    const buttons = document.querySelectorAll(".menu-btn");
    const sections = document.querySelectorAll(".app-section");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        buttons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        sections.forEach((sec) => {
          sec.classList.toggle("active", sec.id === targetId);
        });
      });
    });
  }

  // ---------- billing ----------
  async function handleSupport() {
    setHint("");
    const email = ($("loginEmail")?.value || "").trim().toLowerCase();

    try {
      const out = await jsonFetch("/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ email: email || null }),
      });
      if (out && out.url) {
        window.location.href = out.url;
        return;
      }
      throw new Error("No checkout URL returned.");
    } catch (e) {
      setHint(`Subscribe failed: ${e.message}`, true);
    }
  }

  async function handleManageBilling() {
    setHint("");
    try {
      const out = await jsonFetch("/stripe/create-portal-session", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (out && out.url) {
        window.location.href = out.url;
        return;
      }
      throw new Error("No portal URL returned.");
    } catch (e) {
      setHint(`Manage billing failed: ${e.message}`, true);
    }
  }

  async function handleRestoreAccess() {
    setHint("");
    const email = ($("loginEmail")?.value || "").trim().toLowerCase();
    if (!email) {
      setHint("Type the email you used at Stripe, then click Restore access.", true);
      return;
    }

    try {
      setHint("Checking subscription…", false);
      await jsonFetch("/login", { method: "POST", body: JSON.stringify({ email }) });
      setHint("Access restored. You are now logged in.", false);
      await refreshMe();
    } catch (e) {
      setHint(`Restore failed: ${e.message}`, true);
      await refreshMe();
    }
  }

  async function handleLogout() {
    setHint("");
    try {
      await jsonFetch("/logout", { method: "POST", body: JSON.stringify({}) });
      setHint("Logged out.", false);
      await refreshMe();
    } catch (e) {
      setHint(`Logout failed: ${e.message}`, true);
    }
  }

  // ---------- chat (simple) ----------
  function addBubble(kind, text) {
    const chat = $("chat");
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

  function setupChat() {
    const chatEl = $("chat");
    if (chatEl && chatEl.childElementCount === 0) {
      addBubble("system", 'Hi! Try "Read John 1:1", "Verses about peace", or "Pray for my family".');
    }

    $("chatForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = $("chatInput");
      const prompt = (input?.value || "").trim();
      if (!prompt) return;

      addBubble("user", prompt);
      if (input) input.value = "";

      try {
        const out = await jsonFetch("/chat", { method: "POST", body: JSON.stringify({ prompt }) });
        addBubble("bot", out?.message || "…");
      } catch (err) {
        addBubble("bot", `Error: ${err.message}`);
      }
    });

    $("chatNewBtn")?.addEventListener("click", () => {
      const chat = $("chat");
      if (!chat) return;
      chat.innerHTML = "";
      addBubble("system", "New chat started.");
    });

    // Save/load chats (localStorage)
    const LIST_KEY = "alyana_saved_chats_v1";

    function loadSaved() {
      const listEl = $("chatSavedList");
      if (!listEl) return;
      const raw = localStorage.getItem(LIST_KEY);
      const items = raw ? JSON.parse(raw) : [];
      if (!items.length) {
        listEl.innerHTML = `<small style="opacity:0.75;">No saved chats yet.</small>`;
        return;
      }
      listEl.innerHTML = "";
      items.forEach((it, idx) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.textContent = `${it.title}`;
        btn.addEventListener("click", () => {
          const chat = $("chat");
          chat.innerHTML = it.html;
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.style.marginTop = "8px";
        del.textContent = "Delete";
        del.addEventListener("click", () => {
          const next = items.filter((_, i) => i !== idx);
          localStorage.setItem(LIST_KEY, JSON.stringify(next));
          loadSaved();
        });

        const wrap = document.createElement("div");
        wrap.appendChild(btn);
        wrap.appendChild(del);
        listEl.appendChild(wrap);
      });
    }

    $("chatSaveBtn")?.addEventListener("click", () => {
      const chat = $("chat");
      if (!chat) return;
      const html = chat.innerHTML;
      const title = prompt("Name this chat (example: forgiveness — 2025-12-20 07:01):");
      if (!title) return;
      const raw = localStorage.getItem(LIST_KEY);
      const items = raw ? JSON.parse(raw) : [];
      items.unshift({ title, html });
      localStorage.setItem(LIST_KEY, JSON.stringify(items.slice(0, 20)));
      loadSaved();
    });

    loadSaved();
  }

  // ---------- devotional/prayer local save ----------
  function setupDevotional() {
    const LIST_KEY = "alyana_saved_devotionals_v1";

    function loadSavedDev() {
      const listEl = $("devSavedList");
      if (!listEl) return;
      const raw = localStorage.getItem(LIST_KEY);
      const items = raw ? JSON.parse(raw) : [];
      if (!items.length) {
        listEl.innerHTML = `<small style="opacity:0.75;">No saved devotionals yet.</small>`;
        return;
      }
      listEl.innerHTML = "";
      items.forEach((it, idx) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.textContent = it.title;
        btn.addEventListener("click", () => {
          $("devotionalScripture").textContent = it.scripture || "—";
          $("devotionalExplain").textContent = it.brief_explanation || "—";
          $("devotionalMyExplanation").value = it.my_explain || "";
          $("devotionalMyApplication").value = it.my_apply || "";
          $("devotionalMyPrayer").value = it.my_prayer || "";
          $("devotionalReflection").value = it.reflect || "";
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.style.marginTop = "8px";
        del.textContent = "Delete";
        del.addEventListener("click", () => {
          const next = items.filter((_, i) => i !== idx);
          localStorage.setItem(LIST_KEY, JSON.stringify(next));
          loadSavedDev();
        });

        const wrap = document.createElement("div");
        wrap.appendChild(btn);
        wrap.appendChild(del);
        listEl.appendChild(wrap);
      });
    }

    $("devotionalBtn")?.addEventListener("click", async () => {
      try {
        const lang = $("devUiLang")?.value || "en";
        const out = await jsonFetch("/devotional", { method: "POST", body: JSON.stringify({ lang }) });
        const raw = out?.json || "{}";
        let obj = {};
        try { obj = JSON.parse(raw); } catch {}
        $("devotionalScripture").textContent = obj.scripture || "—";
        $("devotionalExplain").textContent = obj.brief_explanation || "—";
      } catch (e) {
        setHint(`Devotional failed: ${e.message}`, true);
      }
    });

    $("devSaveBtn")?.addEventListener("click", () => {
      const scripture = $("devotionalScripture")?.textContent || "";
      const brief_explanation = $("devotionalExplain")?.textContent || "";
      const my_explain = $("devotionalMyExplanation")?.value || "";
      const my_apply = $("devotionalMyApplication")?.value || "";
      const my_prayer = $("devotionalMyPrayer")?.value || "";
      const reflect = $("devotionalReflection")?.value || "";
      const title = prompt("Name this devotional:");
      if (!title) return;

      const raw = localStorage.getItem(LIST_KEY);
      const items = raw ? JSON.parse(raw) : [];
      items.unshift({ title, scripture, brief_explanation, my_explain, my_apply, my_prayer, reflect });
      localStorage.setItem(LIST_KEY, JSON.stringify(items.slice(0, 30)));
      loadSavedDev();
    });

    let devStreak = Number(localStorage.getItem("alyana_dev_streak_v1") || "0");
    const pill = $("devStreakPill");
    const btn = $("devStreakBtn");
    const update = () => {
      if (pill) pill.textContent = `Streak: ${devStreak}`;
      localStorage.setItem("alyana_dev_streak_v1", String(devStreak));
    };
    update();
    btn?.addEventListener("click", () => {
      devStreak += 1;
      update();
    });

    loadSavedDev();
  }

  function setupPrayer() {
    const LIST_KEY = "alyana_saved_prayers_v1";

    function loadSavedPr() {
      const listEl = $("prSavedList");
      if (!listEl) return;
      const raw = localStorage.getItem(LIST_KEY);
      const items = raw ? JSON.parse(raw) : [];
      if (!items.length) {
        listEl.innerHTML = `<small style="opacity:0.75;">No saved prayers yet.</small>`;
        return;
      }
      listEl.innerHTML = "";
      items.forEach((it, idx) => {
        const btn = document.createElement("button");
        btn.className = "btn btn-ghost";
        btn.textContent = it.title;
        btn.addEventListener("click", () => {
          $("pA").textContent = it.example_adoration || "—";
          $("pC").textContent = it.example_confession || "—";
          $("pT").textContent = it.example_thanksgiving || "—";
          $("pS").textContent = it.example_supplication || "—";
          $("myAdoration").value = it.myA || "";
          $("myConfession").value = it.myC || "";
          $("myThanksgiving").value = it.myT || "";
          $("mySupplication").value = it.myS || "";
          $("prayerNotes").value = it.notes || "";
        });

        const del = document.createElement("button");
        del.className = "btn btn-danger";
        del.style.marginTop = "8px";
        del.textContent = "Delete";
        del.addEventListener("click", () => {
          const next = items.filter((_, i) => i !== idx);
          localStorage.setItem(LIST_KEY, JSON.stringify(next));
          loadSavedPr();
        });

        const wrap = document.createElement("div");
        wrap.appendChild(btn);
        wrap.appendChild(del);
        listEl.appendChild(wrap);
      });
    }

    $("prayerBtn")?.addEventListener("click", async () => {
      try {
        const lang = $("prUiLang")?.value || "en";
        const out = await jsonFetch("/daily_prayer", { method: "POST", body: JSON.stringify({ lang }) });
        const raw = out?.json || "{}";
        let obj = {};
        try { obj = JSON.parse(raw); } catch {}
        $("pA").textContent = obj.example_adoration || "—";
        $("pC").textContent = obj.example_confession || "—";
        $("pT").textContent = obj.example_thanksgiving || "—";
        $("pS").textContent = obj.example_supplication || "—";
      } catch (e) {
        setHint(`Prayer failed: ${e.message}`, true);
      }
    });

    $("prSaveBtn")?.addEventListener("click", () => {
      const title = prompt("Name this prayer entry:");
      if (!title) return;

      const example_adoration = $("pA")?.textContent || "";
      const example_confession = $("pC")?.textContent || "";
      const example_thanksgiving = $("pT")?.textContent || "";
      const example_supplication = $("pS")?.textContent || "";
      const myA = $("myAdoration")?.value || "";
      const myC = $("myConfession")?.value || "";
      const myT = $("myThanksgiving")?.value || "";
      const myS = $("mySupplication")?.value || "";
      const notes = $("prayerNotes")?.value || "";

      const raw = localStorage.getItem(LIST_KEY);
      const items = raw ? JSON.parse(raw) : [];
      items.unshift({ title, example_adoration, example_confession, example_thanksgiving, example_supplication, myA, myC, myT, myS, notes });
      localStorage.setItem(LIST_KEY, JSON.stringify(items.slice(0, 30)));
      loadSavedPr();
    });

    let prStreak = Number(localStorage.getItem("alyana_pr_streak_v1") || "0");
    const pill = $("prStreakPill");
    const btn = $("prStreakBtn");
    const update = () => {
      if (pill) pill.textContent = `Streak: ${prStreak}`;
      localStorage.setItem("alyana_pr_streak_v1", String(prStreak));
    };
    update();
    btn?.addEventListener("click", () => {
      prStreak += 1;
      update();
    });

    loadSavedPr();
  }

  // ---------- bible reader ----------
  async function setupBible() {
    try {
      const health = await jsonFetch("/bible/health", { method: "GET" });
      $("bibleDbStatus").textContent = `OK — ${health.verse_count} verses loaded`;
    } catch (e) {
      $("bibleDbStatus").textContent = `Error: ${e.message}`;
      return;
    }

    const bookSelect = $("bookSelect");
    const chapterSelect = $("chapterSelect");
    const verseStartSelect = $("verseStartSelect");
    const verseEndSelect = $("verseEndSelect");

    const fillSelect = (sel, items, placeholder = "—") => {
      sel.innerHTML = "";
      if (!items || !items.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = placeholder;
        sel.appendChild(opt);
        return;
      }
      items.forEach((x) => {
        const opt = document.createElement("option");
        opt.value = String(x.value);
        opt.textContent = x.label;
        sel.appendChild(opt);
      });
    };

    const booksOut = await jsonFetch("/bible/books", { method: "GET" });
    const books = (booksOut.books || []).map((b) => ({ value: b.id, label: b.name }));
    fillSelect(bookSelect, books, "No books");

    async function loadChapters() {
      const bookVal = bookSelect.value;
      if (!bookVal) return;
      const out = await jsonFetch(`/bible/chapters?book=${encodeURIComponent(bookVal)}`, { method: "GET" });
      const chapters = (out.chapters || []).map((c) => ({ value: c, label: String(c) }));
      fillSelect(chapterSelect, chapters, "—");
      fillSelect(verseStartSelect, [], "—");
      fillSelect(verseEndSelect, [], "(optional)");
    }

    async function loadVerses() {
      const bookVal = bookSelect.value;
      const chVal = chapterSelect.value;
      if (!bookVal || !chVal) return;
      const out = await jsonFetch(`/bible/verses?book=${encodeURIComponent(bookVal)}&chapter=${encodeURIComponent(chVal)}`, { method: "GET" });
      const verses = (out.verses || []).map((v) => ({ value: v, label: String(v) }));
      fillSelect(verseStartSelect, verses, "—");
      fillSelect(verseEndSelect, [{ value: "", label: "(optional)" }, ...verses], "(optional)");
    }

    bookSelect.addEventListener("change", loadChapters);
    chapterSelect.addEventListener("change", loadVerses);

    // initial load
    await loadChapters();
    await loadVerses();

    $("listenBible")?.addEventListener("click", async () => {
      const bookVal = bookSelect.value;
      const chVal = chapterSelect.value;
      if (!bookVal || !chVal) return;

      const full = $("fullChapter")?.checked ? "true" : "false";
      const start = verseStartSelect.value || "1";
      const end = verseEndSelect.value || "";

      const url = `/bible/passage?book=${encodeURIComponent(bookVal)}&chapter=${encodeURIComponent(chVal)}&full_chapter=${full}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
      try {
        const out = await jsonFetch(url, { method: "GET" });
        $("passageRef").textContent = out.reference || "—";
        $("passageText").textContent = out.text || "—";
      } catch (e) {
        $("passageRef").textContent = "—";
        $("passageText").textContent = `Error: ${e.message}`;
      }
    });

    $("stopBible")?.addEventListener("click", () => {
      // You can wire real TTS later; for now just UI
      setHint("Stopped (TTS not wired yet).", false);
    });
  }

  // ---------- init ----------
  async function init() {
    setJsStatus("JS: running");

    setupMenu();
    setupChat();
    setupDevotional();
    setupPrayer();
    setupBible();

    $("supportBtn")?.addEventListener("click", handleSupport);
    $("manageBillingBtn")?.addEventListener("click", handleManageBilling);
    $("loginBtn")?.addEventListener("click", handleRestoreAccess);
    $("logoutBtn")?.addEventListener("click", handleLogout);

    // If Stripe redirect happened, refresh account
    await refreshMe();
  }

  document.addEventListener("DOMContentLoaded", init);
})();


