/* Alyana Luz - frontend/app.js */

const $ = (id) => document.getElementById(id);

function setPill(el, text, kind) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("ok", "warn", "bad");
  if (kind) el.classList.add(kind);
}

function scrollChatToBottom() {
  const chat = $("chat");
  if (!chat) return;
  requestAnimationFrame(() => {
    chat.scrollTop = chat.scrollHeight;
  });
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

  scrollChatToBottom();
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
      (data && (data.detail || data.error)) ?
        (data.detail || data.error) :
        `Request failed (${resp.status})`;
    throw new Error(msg);
  }
  return data;
}

/* -----------------------
   PWA registration
------------------------ */
async function setupPWA() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  } catch (e) {
    // Non-fatal. PWA just won't work offline.
    console.log("SW register failed:", e);
  }
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

  buttons.forEach((b) => {
    b.addEventListener("click", () => activate(b.dataset.target));
  });

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

function getRestoreEmail() {
  const byId = $("loginEmail");
  if (byId && byId.value) return byId.value.trim();

  const inputs = document.querySelectorAll('input[type="text"], input[type="email"]');
  for (const i of inputs) {
    const ph = (i.getAttribute("placeholder") || "").toLowerCase();
    if (ph.includes("email used for stripe")) return (i.value || "").trim();
    if (ph.includes("stripe")) return (i.value || "").trim();
  }
  return "";
}

async function refreshMe() {
  const authPill = $("authPill");
  const manageBillingBtn = $("manageBillingBtn");
  const logoutBtn = $("logoutBtn");

  setPill(authPill, "Account: checking…", "warn");
  showAuthHint("");

  try {
    const me = await api("/me", { method: "GET" });

    if (!me.logged_in) {
      setPill(authPill, "Account: not logged in", "warn");
      if (manageBillingBtn) manageBillingBtn.disabled = true;
      if (logoutBtn) logoutBtn.style.display = "none";
      showAuthHint(
        "To access premium features, subscribe with Support, or restore access using the email you used on Stripe."
      );
      return;
    }

    if (me.active) {
      setPill(authPill, `Account: ${me.email} (active)`, "ok");
      if (manageBillingBtn) manageBillingBtn.disabled = false;
      if (logoutBtn) logoutBtn.style.display = "";
      showAuthHint("");
    } else {
      setPill(authPill, `Account: ${me.email} (inactive)`, "bad");
      if (manageBillingBtn) manageBillingBtn.disabled = false;
      if (logoutBtn) logoutBtn.style.display = "";
      showAuthHint(
        "Your subscription is inactive. Click Support to subscribe, or Manage billing to fix payment/cancel/renew."
      );
    }
  } catch (e) {
    setPill(authPill, "Account: error", "bad");
    if (manageBillingBtn) manageBillingBtn.disabled = true;
    if (logoutBtn) logoutBtn.style.display = "none";
    showAuthHint(e.message);
  }
}

function setupBillingButtons() {
  const supportBtn = $("supportBtn");
  const manageBillingBtn = $("manageBillingBtn");
  const logoutBtn = $("logoutBtn");
  const loginBtn = $("loginBtn");

  if (supportBtn) {
    supportBtn.addEventListener("click", async () => {
      try {
        const email = getRestoreEmail();
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
        const email = getRestoreEmail();
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

  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      try {
        const email = getRestoreEmail();
        if (!email) {
          showAuthHint("Type the email you used on Stripe, then click Restore access.");
          return;
        }
        showAuthHint("Checking subscription…");

        await api("/login", {
          method: "POST",
          body: JSON.stringify({ email }),
        });

        showAuthHint("");
        await refreshMe();
      } catch (e) {
        showAuthHint(`Restore failed: ${e.message}`);
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

function setupChatComposerAutoGrow(textarea) {
  const grow = () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px";
  };
  textarea.addEventListener("input", grow);
  grow();
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

  if (input) {
    setupChatComposerAutoGrow(input);

    // Enter = send, Shift+Enter = newline
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form?.requestSubmit();
      }
    });
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
      const messages = rows.map((r) => {
        const kind = r.classList.contains("user") ? "user" :
                     r.classList.contains("bot") ? "bot" : "system";
        const text = (r.querySelector(".bubble")?.textContent || "").trim();
        return { kind, text };
      }).filter(m => m.text);

      const title = (messages.find(m => m.kind === "user")?.text || "Saved chat").slice(0, 40);
      const saved = JSON.parse(localStorage.getItem("alyana_saved_chats") || "[]");
      saved.unshift({ title: `${title} — ${new Date().toISOString().slice(0,16).replace("T"," ")}`, messages });
      localStorage.setItem("alyana_saved_chats", JSON.stringify(saved));
      loadSavedChats();
      addBubble("system", "Saved.");
    });
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = (input?.value || "").trim();
      if (!q) return;

      addBubble("user", q);

      if (input) {
        input.value = "";
        input.style.height = "auto";
        input.focus();
      }

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
   Boot
------------------------ */
window.addEventListener("DOMContentLoaded", async () => {
  await setupPWA();
  setupNav();
  setupBillingButtons();
  setupChat();
  await refreshMe();
});




