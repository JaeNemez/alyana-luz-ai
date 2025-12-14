(() => {
  const $ = (id) => document.getElementById(id);

  // If this never flips, /static/app.js is not being served
  const jsStatus = $("jsStatus");
  if (jsStatus) jsStatus.textContent = "JS: running";

  const chatEl = $("chat");
  const chatForm = $("chatForm");
  const chatInput = $("chatInput");
  const chatSendBtn = $("chatSendBtn");

  function addBubble(text, who="bot") {
    const row = document.createElement("div");
    row.className = "bubble-row " + who;

    const b = document.createElement("div");
    b.className = "bubble " + (who === "user" ? "user" : who === "system" ? "system" : "bot");
    b.textContent = text;

    chatEl.appendChild(row);
    row.appendChild(b);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  addBubble("JS loaded. Type and press Enter.", "system");

  async function apiJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`API ${res.status} for ${url}`);
    return await res.json();
  }

  chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const userText = (chatInput.value || "").trim();
    if (!userText) return;

    addBubble(userText, "user");
    chatInput.value = "";

    const loadingRow = document.createElement("div");
    loadingRow.className = "bubble-row bot";
    const loading = document.createElement("div");
    loading.className = "bubble bot";
    loading.textContent = "Thinking…";
    loadingRow.appendChild(loading);
    chatEl.appendChild(loadingRow);

    chatSendBtn.disabled = true;

    try {
      const data = await apiJSON("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: userText })
      });

      loading.textContent = data.message || "(no response)";
    } catch (err) {
      console.error(err);
      loading.textContent = "Server error (check /health and /static/app.js).";
    } finally {
      chatSendBtn.disabled = false;
    }
  });
})();
