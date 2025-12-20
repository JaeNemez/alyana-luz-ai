(() => {
  const $ = (id) => document.getElementById(id);

  const jsStatus = $("jsStatus");
  const authPill = $("authPill");
  const authHint = $("authHint");
  const supportBtn = $("supportBtn");
  const manageBillingBtn = $("manageBillingBtn");
  const logoutBtn = $("logoutBtn");

  const loginRow = $("loginRow");
  const loginEmail = $("loginEmail");
  const loginBtn = $("loginBtn");

  const chat = $("chat");
  const chatForm = $("chatForm");
  const chatInput = $("chatInput");

  function setHint(msg, show = true) {
    if (!authHint) return;
    authHint.style.display = show ? "block" : "none";
    authHint.textContent = msg || "";
  }

  function setPill(cls, text) {
    authPill.classList.remove("ok", "warn", "bad");
    authPill.classList.add(cls);
    authPill.textContent = text;
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) {
      const msg = (data && (data.detail || data.error)) || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }

  function addBubble(kind, text) {
    const row = document.createElement("div");
    row.className = `bubble-row ${kind}`;
    const bubble = document.createElement("div");
    bubble.className = `bubble ${kind}`;
    bubble.textContent = text;
    row.appendChild(bubble);
    chat.appendChild(row);
    chat.scrollTop = chat.scrollHeight;
  }

  async function refreshMe() {
    jsStatus.textContent = "JS: running";

    try {
      const me = await api("/me", { method: "GET" });

      if (!me.logged_in) {
        setPill("warn", "Account: not logged in");
        manageBillingBtn.disabled = true;
        logoutBtn.style.display = "none";
        loginRow.style.display = "flex";
        setHint("To access premium features, subscribe with Support, or restore access using your Stripe email.", true);
        return;
      }

      if (me.active) {
        setPill("ok", `Account: active (${me.email})`);
        manageBillingBtn.disabled = false;
        logoutBtn.style.display = "inline-block";
        loginRow.style.display = "none";
        setHint("", false);
      } else {
        setPill("bad", `Account: inactive (${me.email})`);
        manageBillingBtn.disabled = true;
        logoutBtn.style.display = "inline-block";
        loginRow.style.display = "flex";
        setHint("Your subscription is not active. Please subscribe again using Support, or check Stripe Portal after re-subscribing.", true);
      }
    } catch (e) {
      setPill("bad", "Account: error");
      manageBillingBtn.disabled = true;
      logoutBtn.style.display = "none";
      loginRow.style.display = "flex";
      setHint(`Status check failed: ${e.message}`, true);
    }
  }

  async function startCheckout() {
    // Use email if user typed one (helps Stripe prefill)
    const email = (loginEmail && loginEmail.value ? loginEmail.value : "").trim().toLowerCase();

    supportBtn.disabled = true;
    setHint("Opening Stripe Checkout…", true);

    try {
      const data = await api("/stripe/create-checkout-session", {
        method: "POST",
        body: JSON.stringify({ email: email || null }),
      });
      if (data && data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout URL returned.");
    } catch (e) {
      setHint(`Checkout error: ${e.message}`, true);
    } finally {
      supportBtn.disabled = false;
    }
  }

  async function openPortal() {
    manageBillingBtn.disabled = true;
    setHint("Opening billing portal…", true);

    try {
      const data = await api("/stripe/create-portal-session", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (data && data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No portal URL returned.");
    } catch (e) {
      setHint(`Portal error: ${e.message}`, true);
    } finally {
      manageBillingBtn.disabled = false;
    }
  }

  async function restoreAccess() {
    const email = (loginEmail.value || "").trim().toLowerCase();
    if (!email) {
      setHint("Type the email you used on Stripe, then click Restore access.", true);
      return;
    }

    loginBtn.disabled = true;
    setHint("Checking subscription…", true);

    try {
      await api("/login", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setHint("Access restored. Refreshing account…", true);
      await refreshMe();
    } catch (e) {
      setHint(`Restore failed: ${e.message}`, true);
    } finally {
      loginBtn.disabled = false;
    }
  }

  async function logout() {
    logoutBtn.disabled = true;
    try {
      await api("/logout", { method: "POST", body: JSON.stringify({}) });
      await refreshMe();
    } catch (e) {
      setHint(`Logout error: ${e.message}`, true);
    } finally {
      logoutBtn.disabled = false;
    }
  }

  // Menu buttons
  function setupMenu() {
    const btns = document.querySelectorAll(".menu-btn");
    btns.forEach((b, idx) => {
      b.addEventListener("click", () => {
        btns.forEach((x) => x.classList.remove("active"));
        b.classList.add("active");

        const target = b.getAttribute("data-target");
        document.querySelectorAll(".app-section").forEach((sec) => sec.classList.remove("active"));
        const el = document.getElementById(target);
        if (el) el.classList.add("active");
      });

      if (idx === 0) b.classList.add("active");
    });
  }

  // Minimal chat
  async function handleChatSubmit(e) {
    e.preventDefault();
    const text = (chatInput.value || "").trim();
    if (!text) return;
    chatInput.value = "";

    addBubble("user", text);

    try {
      const me = await api("/me", { method: "GET" });
      const endpoint = me.logged_in && me.active ? "/premium/chat" : "/chat";

      const resp = await api(endpoint, {
        method: "POST",
        body: JSON.stringify({ prompt: text }),
      });

      addBubble("bot", resp.message || "…");
    } catch (err) {
      addBubble("system", `Error: ${err.message}`);
    }
  }

  // Wire up buttons
  supportBtn.addEventListener("click", startCheckout);
  manageBillingBtn.addEventListener("click", openPortal);
  logoutBtn.addEventListener("click", logout);

  if (loginBtn) loginBtn.addEventListener("click", restoreAccess);
  if (loginEmail) {
    loginEmail.addEventListener("keydown", (e) => {
      if (e.key === "Enter") restoreAccess();
    });
  }

  if (chatForm) chatForm.addEventListener("submit", handleChatSubmit);

  // init
  setupMenu();
  refreshMe();
})();

