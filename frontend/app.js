/* Alyana Luz - frontend/app.js */

const $ = (id) => document.getElementById(id);

function setPill(el, text, kind) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("ok", "warn", "bad");
  if (kind) el.classList.add(kind);
}

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

async function api(path, options = {}) {
  const resp = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!resp.ok) {
    const msg =
      data && (data.detail || data.error)
        ? (data.detail || data.error)
        : `Request failed (${resp.status})`;
    throw new Error(msg);
  }

  return data;
}

/* -----------------------
   Helpers: email memory + prompts
------------------------ */
const EMAIL_KEY = "alyana_email_used_for_stripe";

function getSavedEmail() {
  return (localStorage.getItem(EMAIL_KEY) || "").trim();
}

function setSavedEmail(email) {
  const e = (email || "").trim().toLowerCase();
  if (!e) return;
  localStorage.setItem(EMAIL_KEY, e);
}

function askForEmailIfMissing() {
  let email = getSavedEmail();
  if (email) return email;

  email = window.prompt("Enter the email you used on Stripe for Alyana Luz:");
  email = (email || "").trim().toLowerCase();
  if (email) setSavedEmail(email);
  return email;
}

/* -----------------------
   Navigation
------------------------ */
function setupNav() {
  const buttons = document.querySelectorAll(".menu-btn");
  const sections = document.querySelectorAll(".app-section");

  function activate(targetId) {
    sections.forEach((s) => s.classList.remove("active"));
    const t = document.getElementById(targetId);
    if (t) t.classList.add("active");

    buttons.forEach((b) => b.classList.remove("active"));
    buttons.forEach((b) => {
      if (b.dataset.target === targetId) b.classList.add("active");
    });
  }

  buttons.forEach((b) => b.addEventListener("click", () => activate(b.dataset.target)));
  activate("chatSection");
}

/* -----------------------
   Billing + Auth UI
------------------------ */
function showAuthHint(text) {
  const el = $("authHint");
  if (!el) return;
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = text;
}

async function refreshMe() {
  const authPill = $("authPill");
  const manageBillingBtn = $("manageBillingBtn");
  const logoutBtn = $("logoutBtn");

  setPill(authPill, "Account: checking…", "warn");
  showAuthHint("");

  try {
    const me = await api("/me", { method: "GET" });

    // Always allow Manage billing (we can prompt for email if needed)
    if (manageBillingBtn) manageBillingBtn.disabled = false;

    if (!me.logged_in) {
      setPill(authPill, "Account: not logged in", "warn");
      if (logoutBtn) logoutBtn.style.display = "none";

      const savedEmail = getSavedEmail();
      showAuthHint(
        savedEmail
          ? `Not logged in. Saved email: ${savedEmail}. Click “Restore access” to link this browser, or “Manage billing” to open Stripe.`
          : "Not logged in. Click “Restore access” and enter the email you used on Stripe, or click “Support Alyana Luz” to subscribe."
      );
      return;
    }

    // logged in
    setSavedEmail(me.email);

    if (me.active) {
      setPill(authPill, `Account: ${me.email} (active)`, "ok");
      if (logoutBtn) logoutBtn.style.display = "";
      showAuthHint("");
    } else {
      setPill(authPill, `Account: ${me.email} (inactive)`, "bad");
      if (logoutBtn) logoutBtn.style.display = "";
      showAuthHint("Your subscription is inactive. Use “Support” to subscribe, or “Manage billing” to fix payment/cancel/renew.");
    }
  } catch (e) {
    setPill(authPill, "Account: error", "bad");
    if (logoutBtn) logoutBtn.style.display = "none";
    // Don’t disable manage billing on error; portal can still work with email prompt
    showAuthHint(e.message);
  }
}

async function restoreAccessFlow() {
  const email = askForEmailIfMissing();
  if (!email) {
    showAuthHint("Please enter the email you used on Stripe.");
    return;
  }

  showAuthHint("Checking subscription and restoring access…");

  // IMPORTANT: your backend route is /login (not /auth/restore)
  await api("/login", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

  showAuthHint("");
  await refreshMe();
}

function setupBillingButtons() {
  const supportBtn = $("supportBtn");
  const manageBillingBtn = $("manageBillingBtn");
  const logoutBtn = $("logoutBtn");

  // Add a Restore Access button dynamically if your HTML doesn't include it
  // (Cheap: no extra HTML changes required.)
  let restoreBtn = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent || "").trim().toLowerCase() === "restore access"
  );

  if (!restoreBtn) {
    // Put it next to Manage billing
    const row = document.querySelector(".account-row");
    if (row) {
      restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "btn btn-primary";
      restoreBtn.id = "restoreAccessBtn";
      restoreBtn.textContent = "Restore access";
      row.insertBefore(restoreBtn, row.children[1] || null);
    }
  }

  if (supportBtn) {
    supportBtn.addEventListener("click", async () => {
      try {
        const email = askForEmailIfMissing(); // optional but helps Stripe link the customer
        const data = await api("/stripe/create-checkout-session", {
          method: "POST",
          body: JSON.stringify({ email: email || null }),
        });
        if (data && data.url) window.location.href = data.url;
      } catch (e) {
        showAuthHint(`Subscribe error: ${e.message}`);
      }
    });
  }

  if (manageBillingBtn) {
    manageBillingBtn.addEventListener("click", async () => {
      try {
        // If cookie not present, backend can still use email in body.
        const email = askForEmailIfMissing();
        const data = await api("/stripe/create-portal-session", {
          method: "POST",
          body: JSON.stringify({ email: email || null }),
        });
        if (data && data.url) window.location.href = data.url;
      } catch (e) {
        showAuthHint(`Manage billing error: ${e.message}`);
      }
    });
  }

  if (restoreBtn) {
    restoreBtn.addEventListener("click", async () => {
      try {
        await restoreAccessFlow();
      } catch (e) {
        showAuthHint(`Restore failed: ${e.message}`);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await api("/logout", { method: "POST", body: JSON.stringify({}) });
        await refreshMe();
      } catch (e) {
        showAuthHint(`Logout error: ${e.message}`);
      }
    });
  }
}

/* -----------------------
   Chat
------------------------ */
function loadSavedChats() {
  const list = $("chatSavedList");
  if (!list) return;

  const saved = JSON.parse(localStorage.getItem("alyana_saved_chats") || "[]");
  list.innerHTML = "";
  if (!saved.length) {
    list.innerHTML = `<small style="opacity:0.75;">No saved chats yet.</small>`;
    return;
  }

  saved.forEach((item, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "block";

    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.textContent = item.title;
    btn.addEventListener("click", () => {
      const chat = $("chat");
      chat.innerHTML = "";
      item.messages.forEach((m) => addBubble(m.kind, m.text));
    });

    const del = document.createElement("button");
    del.className = "btn btn-danger";
    del.textContent = "Delete";
    del.style.marginTop = "8px";
    del.addEventListener("click", () => {
      saved.splice(idx, 1);
      localStorage.setItem("alyana_saved_chats", JSON.stringify(saved));
      loadSavedChats();
    });

    wrap.appendChild(btn);
    wrap.appendChild(del);
    list.appendChild(wrap);
  });
}

function setupChat() {
  const jsStatus = $("jsStatus");
  if (jsStatus) jsStatus.textContent = "JS: running";

  const form = $("chatForm");
  const input = $("chatInput");
  const newBtn = $("chatNewBtn");
  const saveBtn = $("chatSaveBtn");

  const chat = $("chat");
  if (chat && !chat.children.length) {
    addBubble("system", "Hi! Try “Read John 1:1”, “Verses about peace”, or “Pray for my family”.");
  }

  if (newBtn) {
    newBtn.addEventListener("click", () => {
      $("chat").innerHTML = "";
      addBubble("system", "New chat started.");
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const rows = Array.from(document.querySelectorAll("#chat .bubble-row"));
      const messages = rows
        .map((r) => {
          const kind = r.classList.contains("user") ? "user" : r.classList.contains("bot") ? "bot" : "system";
          const text = (r.querySelector(".bubble")?.textContent || "").trim();
          return { kind, text };
        })
        .filter((m) => m.text);

      const title = (messages.find((m) => m.kind === "user")?.text || "Saved chat").slice(0, 40);
      const saved = JSON.parse(localStorage.getItem("alyana_saved_chats") || "[]");
      saved.unshift({
        title: `${title} — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        messages,
      });
      localStorage.setItem("alyana_saved_chats", JSON.stringify(saved));
      loadSavedChats();
      addBubble("system", "Saved.");
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = (input.value || "").trim();
      if (!q) return;

      addBubble("user", q);
      input.value = "";

      try {
        const res = await api("/chat", { method: "POST", body: JSON.stringify({ prompt: q }) });
        addBubble("bot", res.message || "…");
      } catch (err) {
        addBubble("system", `Error: ${err.message}`);
      }
    });
  }

  loadSavedChats();
}

/* -----------------------
   Bible Reader
------------------------ */
async function setupBible() {
  const status = $("bibleDbStatus");
  try {
    const h = await api("/bible/health", { method: "GET" });
    if (status) status.textContent = `OK — ${h.verse_count} verses.`;
  } catch (e) {
    if (status) status.textContent = `Bible DB error: ${e.message}`;
    return;
  }

  const bookSelect = $("bookSelect");
  const chapterSelect = $("chapterSelect");
  const verseStartSelect = $("verseStartSelect");
  const verseEndSelect = $("verseEndSelect");

  async function loadBooks() {
    const b = await api("/bible/books", { method: "GET" });
    bookSelect.innerHTML = "";
    b.books.forEach((bk) => {
      const opt = document.createElement("option");
      opt.value = bk.id;
      opt.textContent = bk.name;
      bookSelect.appendChild(opt);
    });
  }

  async function loadChapters(bookId) {
    const c = await api(`/bible/chapters?book=${encodeURIComponent(bookId)}`, { method: "GET" });
    chapterSelect.innerHTML = `<option value="">—</option>`;
    c.chapters.forEach((ch) => {
      const opt = document.createElement("option");
      opt.value = ch;
      opt.textContent = String(ch);
      chapterSelect.appendChild(opt);
    });
  }

  async function loadVerses(bookId, chapter) {
    const v = await api(
      `/bible/verses?book=${encodeURIComponent(bookId)}&chapter=${encodeURIComponent(chapter)}`,
      { method: "GET" }
    );
    verseStartSelect.innerHTML = `<option value="">—</option>`;
    verseEndSelect.innerHTML = `<option value="">(optional)</option>`;
    v.verses.forEach((vv) => {
      const o1 = document.createElement("option");
      o1.value = vv;
      o1.textContent = String(vv);
      verseStartSelect.appendChild(o1);

      const o2 = document.createElement("option");
      o2.value = vv;
      o2.textContent = String(vv);
      verseEndSelect.appendChild(o2);
    });
  }

  await loadBooks();

  bookSelect.addEventListener("change", async () => {
    const bid = bookSelect.value;
    if (!bid) return;
    await loadChapters(bid);
  });

  chapterSelect.addEventListener("change", async () => {
    const bid = bookSelect.value;
    const ch = chapterSelect.value;
    if (!bid || !ch) return;
    await loadVerses(bid, ch);
  });

  const listenBtn = $("listenBible");
  const stopBtn = $("stopBible");
  const fullChapter = $("fullChapter");

  function speak(text, lang) {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === "es" ? "es-MX" : "en-AU";
    window.speechSynthesis.speak(u);
  }

  if (listenBtn) {
    listenBtn.addEventListener("click", async () => {
      try {
        const bid = bookSelect.value;
        const ch = parseInt(chapterSelect.value || "0", 10);
        if (!bid || !ch) throw new Error("Pick a book and chapter first.");

        const fc = !!(fullChapter && fullChapter.checked);
        const start = parseInt(verseStartSelect.value || "1", 10);
        const end = parseInt(verseEndSelect.value || String(start), 10);

        const url = fc
          ? `/bible/passage?book=${encodeURIComponent(bid)}&chapter=${encodeURIComponent(ch)}&full_chapter=true`
          : `/bible/passage?book=${encodeURIComponent(bid)}&chapter=${encodeURIComponent(ch)}&start=${encodeURIComponent(
              start
            )}&end=${encodeURIComponent(end)}`;

        const p = await api(url, { method: "GET" });
        const voiceLang = $("readingVoice")?.value || "en";
        speak(p.text || "", voiceLang);
      } catch (e) {
        alert(e.message);
      }
    });
  }

  if (stopBtn) stopBtn.addEventListener("click", () => window.speechSynthesis.cancel());
}

/* -----------------------
   Devotional
------------------------ */
function loadSavedDevotionals() {
  const list = $("devSavedList");
  if (!list) return;

  const saved = JSON.parse(localStorage.getItem("alyana_saved_devotionals") || "[]");
  list.innerHTML = "";
  if (!saved.length) {
    list.innerHTML = `<small style="opacity:0.75;">No saved devotionals yet.</small>`;
    return;
  }

  saved.forEach((item, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "block";

    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.textContent = item.title;
    btn.addEventListener("click", () => {
      $("devotionalScripture").textContent = item.scripture || "—";
      $("devotionalExplain").textContent = item.brief_explanation || "—";
      $("devotionalMyExplanation").value = item.my_explanation || "";
      $("devotionalMyApplication").value = item.my_application || "";
      $("devotionalMyPrayer").value = item.my_prayer || "";
      $("devotionalReflection").value = item.reflection || "";
    });

    const del = document.createElement("button");
    del.className = "btn btn-danger";
    del.textContent = "Delete";
    del.style.marginTop = "8px";
    del.addEventListener("click", () => {
      saved.splice(idx, 1);
      localStorage.setItem("alyana_saved_devotionals", JSON.stringify(saved));
      loadSavedDevotionals();
    });

    wrap.appendChild(btn);
    wrap.appendChild(del);
    list.appendChild(wrap);
  });
}

function setupDevotional() {
  const genBtn = $("devotionalBtn");
  const saveBtn = $("devSaveBtn");

  if (genBtn) {
    genBtn.addEventListener("click", async () => {
      try {
        const lang = $("devUiLang")?.value || "en";
        const res = await api("/devotional", { method: "POST", body: JSON.stringify({ lang }) });
        const raw = res.json || "{}";
        const obj = JSON.parse(raw);

        $("devotionalScripture").textContent = obj.scripture || "—";
        $("devotionalExplain").textContent = obj.brief_explanation || "—";
      } catch (e) {
        alert(`Devotional error: ${e.message}`);
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const scripture = $("devotionalScripture").textContent || "";
      const brief = $("devotionalExplain").textContent || "";

      const item = {
        title: (scripture || "Devotional").slice(0, 50) + " — " + new Date().toISOString().slice(0, 16).replace("T", " "),
        scripture,
        brief_explanation: brief,
        my_explanation: $("devotionalMyExplanation").value || "",
        my_application: $("devotionalMyApplication").value || "",
        my_prayer: $("devotionalMyPrayer").value || "",
        reflection: $("devotionalReflection").value || "",
      };

      const saved = JSON.parse(localStorage.getItem("alyana_saved_devotionals") || "[]");
      saved.unshift(item);
      localStorage.setItem("alyana_saved_devotionals", JSON.stringify(saved));
      loadSavedDevotionals();
      alert("Saved devotional.");
    });
  }

  loadSavedDevotionals();
}

/* -----------------------
   Daily Prayer
------------------------ */
function loadSavedPrayers() {
  const list = $("prSavedList");
  if (!list) return;

  const saved = JSON.parse(localStorage.getItem("alyana_saved_prayers") || "[]");
  list.innerHTML = "";
  if (!saved.length) {
    list.innerHTML = `<small style="opacity:0.75;">No saved prayers yet.</small>`;
    return;
  }

  saved.forEach((item, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "block";

    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.textContent = item.title;
    btn.addEventListener("click", () => {
      $("pA").textContent = item.example_adoration || "—";
      $("pC").textContent = item.example_confession || "—";
      $("pT").textContent = item.example_thanksgiving || "—";
      $("pS").textContent = item.example_supplication || "—";

      $("myAdoration").value = item.my_adoration || "";
      $("myConfession").value = item.my_confession || "";
      $("myThanksgiving").value = item.my_thanksgiving || "";
      $("mySupplication").value = item.my_supplication || "";
      $("prayerNotes").value = item.notes || "";
    });

    const del = document.createElement("button");
    del.className = "btn btn-danger";
    del.textContent = "Delete";
    del.style.marginTop = "8px";
    del.addEventListener("click", () => {
      saved.splice(idx, 1);
      localStorage.setItem("alyana_saved_prayers", JSON.stringify(saved));
      loadSavedPrayers();
    });

    wrap.appendChild(btn);
    wrap.appendChild(del);
    list.appendChild(wrap);
  });
}

function setupPrayer() {
  const genBtn = $("prayerBtn");
  const saveBtn = $("prSaveBtn");

  if (genBtn) {
    genBtn.addEventListener("click", async () => {
      try {
        const lang = $("prUiLang")?.value || "en";
        const res = await api("/daily_prayer", { method: "POST", body: JSON.stringify({ lang }) });
        const raw = res.json || "{}";
        const obj = JSON.parse(raw);

        $("pA").textContent = obj.example_adoration || "—";
        $("pC").textContent = obj.example_confession || "—";
        $("pT").textContent = obj.example_thanksgiving || "—";
        $("pS").textContent = obj.example_supplication || "—";
      } catch (e) {
        alert(`Prayer error: ${e.message}`);
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const item = {
        title: "Prayer — " + new Date().toISOString().slice(0, 16).replace("T", " "),
        example_adoration: $("pA").textContent || "",
        example_confession: $("pC").textContent || "",
        example_thanksgiving: $("pT").textContent || "",
        example_supplication: $("pS").textContent || "",
        my_adoration: $("myAdoration").value || "",
        my_confession: $("myConfession").value || "",
        my_thanksgiving: $("myThanksgiving").value || "",
        my_supplication: $("mySupplication").value || "",
        notes: $("prayerNotes").value || "",
      };

      const saved = JSON.parse(localStorage.getItem("alyana_saved_prayers") || "[]");
      saved.unshift(item);
      localStorage.setItem("alyana_saved_prayers", JSON.stringify(saved));
      loadSavedPrayers();
      alert("Saved prayer.");
    });
  }

  loadSavedPrayers();
}

/* -----------------------
   Boot
------------------------ */
window.addEventListener("DOMContentLoaded", async () => {
  setupNav();
  setupBillingButtons();
  setupChat();
  setupDevotional();
  setupPrayer();
  await setupBible();
  await refreshMe();

  // If you just came back from Stripe success, refresh again after a short delay
  // (sometimes cookies settle after redirect)
  const params = new URLSearchParams(window.location.search);
  if (params.get("billing") === "success") {
    setTimeout(refreshMe, 600);
  }
});
