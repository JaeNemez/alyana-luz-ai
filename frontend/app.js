/* Alyana Luz · Bible AI
   - WhatsApp/iMessage style chat bubbles
   - Uses your existing backend endpoints:
     POST /chat {prompt}
     POST /devotional {lang}
     POST /daily_prayer {lang}
     GET  /bible/books
     GET  /bible/chapters?book=...
     GET  /bible/passage?book=...&chapter=...&full_chapter=true OR start/end
     GET  /me
     POST /stripe/create-checkout-session
     POST /stripe/create-portal-session
*/

const $ = (id) => document.getElementById(id);

const state = {
  chat: [],
  activeTab: "chat",
  account: { logged_in: false, active: false, email: null },
};

const LS_KEY = "alyana_saved_chats_v1";

function nowTime() {
  const d = new Date();
  return d.toLocaleString();
}

function setStatus(msg, isError=false) {
  const el = $("chatStatus");
  el.textContent = msg || "";
  el.className = "small " + (isError ? "danger" : "");
}

function addMsg(role, text) {
  state.chat.push({ role, text, ts: Date.now() });
  renderChat();
}

function renderChat() {
  const wrap = $("messages");
  wrap.innerHTML = "";
  for (const m of state.chat) {
    const row = document.createElement("div");
    row.className = "msg-row " + (m.role === "me" ? "me" : "bot");

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = m.text;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = (m.role === "me" ? "You" : "Alyana") + " · " + new Date(m.ts).toLocaleTimeString();

    const box = document.createElement("div");
    box.appendChild(bubble);
    box.appendChild(meta);

    row.appendChild(box);
    wrap.appendChild(row);
  }
  wrap.scrollTop = wrap.scrollHeight;
}

function getSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setSaved(items) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
  renderSaved();
}

function renderSaved() {
  const list = $("savedList");
  const items = getSaved();
  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No saved chats yet.";
    list.appendChild(empty);
    return;
  }

  for (const it of items) {
    const row = document.createElement("div");
    row.className = "saved-item";

    const left = document.createElement("div");
    left.innerHTML = `<div class="name">${escapeHtml(it.name)}</div><div class="small">${escapeHtml(it.when)}</div>`;

    const actions = document.createElement("div");
    actions.className = "actions";

    const loadBtn = document.createElement("button");
    loadBtn.className = "btn";
    loadBtn.textContent = "Load";
    loadBtn.onclick = () => {
      state.chat = Array.isArray(it.chat) ? it.chat : [];
      renderChat();
      setStatus(`Loaded "${it.name}"`);
    };

    const delBtn = document.createElement("button");
    delBtn.className = "btn";
    delBtn.textContent = "Delete";
    delBtn.onclick = () => {
      const next = getSaved().filter((x) => x.id !== it.id);
      setSaved(next);
    };

    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);

    row.appendChild(left);
    row.appendChild(actions);

    list.appendChild(row);
  }
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));

  $("view-chat").style.display = tab === "chat" ? "" : "none";
  $("view-bible").style.display = tab === "bible" ? "" : "none";
  $("view-devotional").style.display = tab === "devotional" ? "" : "none";
  $("view-prayer").style.display = tab === "prayer" ? "" : "none";
}

async function api(url, opts={}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });
  const ct = res.headers.get("content-type") || "";
  let data;
  if (ct.includes("application/json")) data = await res.json();
  else data = await res.text();
  if (!res.ok) {
    const detail = (data && data.detail) ? data.detail : (typeof data === "string" ? data : JSON.stringify(data));
    throw new Error(`${res.status} ${detail}`);
  }
  return data;
}

async function refreshAccount() {
  try {
    const me = await api("/me", { method: "GET", headers: {} });
    state.account = me;
    if (me.logged_in && me.active) {
      $("accountPill").textContent = `Account: active (${me.email})`;
      $("accountPill").className = "pill";
    } else if (me.logged_in && !me.active) {
      $("accountPill").textContent = `Account: inactive (${me.email || "unknown"})`;
      $("accountPill").className = "pill";
    } else {
      $("accountPill").textContent = "Account: not logged in";
      $("accountPill").className = "pill";
    }
  } catch (e) {
    $("accountPill").textContent = "Account: error";
    $("accountPill").className = "pill";
  }
}

async function sendChat() {
  const input = $("chatInput");
  const text = (input.value || "").trim();
  if (!text) return;

  input.value = "";
  addMsg("me", text);
  setStatus("Sending...");

  try {
    // Always use /chat (free) to avoid subscription issues while you’re debugging.
    const out = await api("/chat", { method: "POST", body: JSON.stringify({ prompt: text }) });
    addMsg("bot", out.message || "(no response)");
    setStatus("");
  } catch (e) {
    addMsg("bot", `Sorry — I hit an error.\n\n${e.message}`);
    setStatus(`Error: ${e.message}`, true);
  }
}

function newChat() {
  state.chat = [
    { role: "bot", text: "Hi, I’m Alyana Luz. How can I pray with you or help you explore Scripture today?", ts: Date.now() }
  ];
  renderChat();
  setStatus("");
}

function saveChat() {
  const name = prompt("Name this chat (example: 'Prayer for school'):");
  if (!name) return;

  const items = getSaved();
  items.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name: name.trim(),
    when: nowTime(),
    chat: state.chat,
  });
  setSaved(items);
  setStatus(`Saved "${name.trim()}"`);
}

async function loadBibleBooks() {
  const out = await api("/bible/books", { method: "GET", headers: {} });
  const books = out.books || [];
  const sel = $("bookSelect");
  sel.innerHTML = "";
  for (const b of books) {
    const opt = document.createElement("option");
    opt.value = b.name; // use name; your backend resolves it
    opt.textContent = b.name;
    sel.appendChild(opt);
  }
}

async function loadChaptersForBook() {
  const book = $("bookSelect").value;
  const out = await api(`/bible/chapters?book=${encodeURIComponent(book)}`, { method: "GET", headers: {} });
  const chSel = $("chapterSelect");
  chSel.innerHTML = "";
  for (const c of out.chapters || []) {
    const opt = document.createElement("option");
    opt.value = String(c);
    opt.textContent = `Chapter ${c}`;
    chSel.appendChild(opt);
  }
}

async function loadFullChapter() {
  const book = $("bookSelect").value;
  const chapter = $("chapterSelect").value;
  const out = await api(`/bible/passage?book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(chapter)}&full_chapter=true`, { method: "GET", headers: {} });
  $("bibleOut").innerHTML = `<div class="muted">${escapeHtml(out.reference || "")}</div><div style="margin-top:10px; white-space:pre-wrap;">${escapeHtml(out.text || "")}</div>`;
}

async function loadPassage() {
  const book = $("bookSelect").value;
  const chapter = $("chapterSelect").value;
  const start = ($("startVerse").value || "").trim();
  const end = ($("endVerse").value || "").trim();

  let url = `/bible/passage?book=${encodeURIComponent(book)}&chapter=${encodeURIComponent(chapter)}&full_chapter=false`;
  if (start) url += `&start=${encodeURIComponent(start)}`;
  if (end) url += `&end=${encodeURIComponent(end)}`;

  const out = await api(url, { method: "GET", headers: {} });
  $("bibleOut").innerHTML = `<div class="muted">${escapeHtml(out.reference || "")}</div><div style="margin-top:10px; white-space:pre-wrap;">${escapeHtml(out.text || "")}</div>`;
}

function parseStrictJsonMaybe(s) {
  if (typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return null; }
}

async function doDevotional() {
  $("devOut").innerHTML = `<div class="muted">Generating...</div>`;
  try {
    const lang = $("devLang").value;
    const out = await api("/devotional", { method: "POST", body: JSON.stringify({ lang }) });
    const obj = parseStrictJsonMaybe(out.json);
    if (!obj) throw new Error("Devotional returned non-JSON text.");
    $("devOut").innerHTML =
      `<div class="muted">${escapeHtml(obj.scripture || "")}</div>` +
      `<div style="margin-top:10px; white-space:pre-wrap;">${escapeHtml(obj.brief_explanation || "")}</div>`;
  } catch (e) {
    $("devOut").innerHTML = `<div class="danger">Error: ${escapeHtml(e.message)}</div>`;
  }
}

async function doPrayer() {
  $("prayOut").innerHTML = `<div class="muted">Generating...</div>`;
  try {
    const lang = $("prayLang").value;
    const out = await api("/daily_prayer", { method: "POST", body: JSON.stringify({ lang }) });
    const obj = parseStrictJsonMaybe(out.json);
    if (!obj) throw new Error("Daily prayer returned non-JSON text.");
    $("prayOut").innerHTML =
      `<div style="white-space:pre-wrap;">
<b>Adoration:</b> ${escapeHtml(obj.example_adoration || "")}

<b>Confession:</b> ${escapeHtml(obj.example_confession || "")}

<b>Thanksgiving:</b> ${escapeHtml(obj.example_thanksgiving || "")}

<b>Supplication:</b> ${escapeHtml(obj.example_supplication || "")}
</div>`;
  } catch (e) {
    $("prayOut").innerHTML = `<div class="danger">Error: ${escapeHtml(e.message)}</div>`;
  }
}

async function support() {
  try {
    const email = prompt("Enter the email you will use for Stripe (optional):") || "";
    const out = await api("/stripe/create-checkout-session", {
      method: "POST",
      body: JSON.stringify({ email: email.trim() || null })
    });
    if (out.url) window.location.href = out.url;
  } catch (e) {
    alert(`Support error: ${e.message}`);
  }
}

async function billing() {
  try {
    const out = await api("/stripe/create-portal-session", { method: "POST", body: JSON.stringify({}) });
    if (out.url) window.location.href = out.url;
  } catch (e) {
    alert(`Billing error: ${e.message}`);
  }
}

function wire() {
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => switchTab(b.dataset.tab)));

  $("sendBtn").onclick = sendChat;
  $("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
  $("newBtn").onclick = newChat;
  $("saveBtn").onclick = saveChat;

  $("btnSupport").onclick = support;
  $("btnBilling").onclick = billing;

  $("bookSelect").addEventListener("change", async () => {
    try { await loadChaptersForBook(); } catch {}
  });
  $("loadChapterBtn").onclick = loadFullChapter;
  $("loadPassageBtn").onclick = loadPassage;

  $("devBtn").onclick = doDevotional;
  $("prayBtn").onclick = doPrayer;
}

async function init() {
  wire();
  renderSaved();
  newChat();

  // Bible init
  try {
    await loadBibleBooks();
    await loadChaptersForBook();
  } catch (e) {
    $("bibleOut").innerHTML = `<div class="danger">Bible error: ${escapeHtml(e.message)}</div>`;
  }

  // Account
  await refreshAccount();
}

init();






