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
    const res = await fetch(url, {
      credentials: "include", // IMPORTANT: send auth cookie to /me, portal, logout, etc.
      ...opts,
    });
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

  // ==============================
  // AUTH / BILLING UI (NEW)
  // ==============================
  const authPill = $("authPill");
  const manageBillingBtn = $("manageBillingBtn");
  const logoutBtn = $("logoutBtn");
  const authHint = $("authHint");

  // NEW: Restore access elements
  const loginEmail = $("loginEmail");
  const loginBtn = $("loginBtn");

  async function doLogin() {
    try {
      const email = (loginEmail?.value || "").trim().toLowerCase();
      if (!email) {
        alert("Type the email you used in Stripe.");
        return;
      }

      if (loginBtn) loginBtn.disabled = true;

      await apiJSON("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      await refreshMe();
      alert("Logged in.");
    } catch (e) {
      console.error(e);
      alert("Could not restore access. Make sure your subscription is active and the email matches.");
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  }

  if (loginBtn) loginBtn.addEventListener("click", doLogin);

  function setPill(state, text) {
    if (!authPill) return;
    authPill.classList.remove("ok", "warn", "bad");
    if (state) authPill.classList.add(state);
    authPill.textContent = text;
  }

  function setHint(text) {
    if (!authHint) return;
    if (!text) {
      authHint.style.display = "none";
      authHint.textContent = "";
      return;
    }
    authHint.style.display = "block";
    authHint.textContent = text;
  }

  let lastMe = { logged_in: false, email: null, active: false, status: null };

  async function refreshMe() {
    try {
      setPill("warn", "Account: checking…");
      setHint("");

      const me = await apiJSON("/me", { method: "GET" });
      lastMe = me || lastMe;

      const loggedIn = !!me.logged_in;
      const active = !!me.active;
      const email = me.email || "";

      if (!loggedIn) {
        setPill("warn", "Account: not logged in");

        // Show restore access UI when logged out
        if (loginEmail) loginEmail.style.display = "inline-block";
        if (loginBtn) loginBtn.style.display = "inline-block";
        if (logoutBtn) logoutBtn.style.display = "none";

        if (manageBillingBtn) manageBillingBtn.disabled = false; // allow it to act like "Subscribe"
        setHint("To access premium features, tap Support to subscribe (Stripe Checkout).");
        return;
      }

      // logged in
      if (logoutBtn) logoutBtn.style.display = "inline-block";

      // Hide restore access UI when logged in
      if (loginEmail) loginEmail.style.display = "none";
      if (loginBtn) loginBtn.style.display = "none";

      if (active) {
        setPill("ok", `Active: ${email}`);
        if (manageBillingBtn) manageBillingBtn.disabled = false;
        setHint("");
      } else {
        setPill("bad", `Inactive: ${email}`);
        if (manageBillingBtn) manageBillingBtn.disabled = false; // allow user to manage billing OR re-subscribe
        setHint("Your subscription is inactive. Tap Support to subscribe again, or Manage billing if a customer exists.");
      }
    } catch (e) {
      console.error("refreshMe failed:", e);
      setPill("bad", "Account: error");
      if (manageBillingBtn) manageBillingBtn.disabled = false;
      setHint("Could not load account status. Try refreshing the page.");
    }
  }

  // ------------------------------
  // Support button (Stripe Checkout)
  // ------------------------------
  const supportBtn = $("supportBtn");

  async function startStripeCheckout() {
    if (!supportBtn) return;

    const originalText = supportBtn.textContent;
    supportBtn.disabled = true;
    supportBtn.textContent = "Redirecting to secure checkout…";

    try {
      const res = await fetch("/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Checkout error ${res.status}: ${txt}`);
      }

      const data = await res.json();
      if (!data.url) throw new Error("No checkout URL returned by server.");

      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      alert("Sorry — checkout failed. Please try again.");
      supportBtn.disabled = false;
      supportBtn.textContent = originalText || "❤️ Support Alyana Luz";
    }
  }

  if (supportBtn) {
    supportBtn.addEventListener("click", startStripeCheckout);
  }

  // NEW: Manage billing button
  async function openBillingPortalOrCheckout() {
    try {
      if (!manageBillingBtn) return;
      manageBillingBtn.disabled = true;

      // If not logged in, treat Manage billing as Subscribe
      if (!lastMe.logged_in) {
        await startStripeCheckout();
        return;
      }

      // Logged in -> try billing portal
      const data = await apiJSON("/stripe/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}) // server reads cookie email first
      });

      if (!data.url) throw new Error("No portal URL returned.");
      window.location.href = data.url;
    } catch (e) {
      console.error(e);
      // If portal fails (no customer yet), fallback to checkout
      const msg = String(e && e.message ? e.message : e);
      if (msg.includes("No Stripe customer") || msg.includes("404")) {
        await startStripeCheckout();
      } else {
        alert("Could not open billing portal. Try Support instead.");
      }
    } finally {
      if (manageBillingBtn) manageBillingBtn.disabled = false;
    }
  }

  if (manageBillingBtn) {
    manageBillingBtn.addEventListener("click", openBillingPortalOrCheckout);
  }

  // NEW: Logout
  async function doLogout() {
    try {
      if (logoutBtn) logoutBtn.disabled = true;
      await apiJSON("/logout", { method: "POST" });
      await refreshMe();
      // Optional: hard refresh to clear any cached state
      window.location.href = "/";
    } catch (e) {
      console.error(e);
      alert("Logout failed. Try again.");
    } finally {
      if (logoutBtn) logoutBtn.disabled = false;
    }
  }

  if (logoutBtn) logoutBtn.addEventListener("click", doLogout);

  // ==============================
  // Local storage keys + streak helpers
  // ==============================
  const DEV_STORAGE = "alyana_devotionals_v1";
  const PR_STORAGE  = "alyana_prayers_v1";
  const DEV_STREAK  = "alyana_dev_streak_v1";
  const PR_STREAK   = "alyana_pr_streak_v1";

  function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function daysBetween(aISO, bISO) {
    const a = new Date(aISO + "T00:00:00");
    const b = new Date(bISO + "T00:00:00");
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }

  function loadList(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); }
    catch { return []; }
  }

  function saveList(key, list) {
    localStorage.setItem(key, JSON.stringify(list));
  }

  function loadObj(key, fallback = {}) {
    try { return JSON.parse(localStorage.getItem(key) || "") || fallback; }
    catch { return fallback; }
  }

  function saveObj(key, obj) {
    localStorage.setItem(key, JSON.stringify(obj));
  }

  function markStreakDone(streakKey) {
    const t = todayISO();
    const s = loadObj(streakKey, { count: 0, last: null });

    if (!s.last) {
      s.count = 1;
      s.last = t;
      saveObj(streakKey, s);
      return s;
    }

    if (s.last === t) return s;

    const diff = daysBetween(s.last, t);
    if (diff === 1) s.count += 1;
    else s.count = 1;

    s.last = t;
    saveObj(streakKey, s);
    return s;
  }

  // ------------------------------
  // Tabs
  // ------------------------------
  const sections = Array.from(document.querySelectorAll(".app-section"));
  const me


