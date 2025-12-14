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
    const res = await fetch(url, opts);
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

  function addClass(el, c, on) {
    if (!el) return;
    el.classList.toggle(c, !!on);
  }

  // ------------------------------
  // Support button
  // ------------------------------
  const supportBtn = $("supportBtn");
  if (supportBtn) {
    supportBtn.addEventListener("click", () => window.open("https://buy.stripe.com/", "_blank"));
  }

  // ------------------------------
  // Tabs (Chat / Read / Devotional / Daily Prayer)
  // ------------------------------
  const sections = Array.from(document.querySelectorAll(".app-section"));
  const menuButtons = Array.from(document.querySelectorAll(".menu-btn"));

  function showSection(id) {
    sections.forEach(s => addClass(s, "active", s.id === id));
    menuButtons.forEach(b => addClass(b, "active", b.dataset.target === id));
  }

  menuButtons.forEach(btn => {
    btn.addEventListener("click", () => showSection(btn.dataset.target));
  });

  // Default
  showSection("chatSection");

  // ------------------------------
  // TTS (two voices) — optional
  // ------------------------------
  const TTS = { voices: [], ready: false, isSpeaking: false };
  const chatVoicePill = $("chatVoicePill");

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    TTS.voices = window.speechSynthesis.getVoices() || [];
    TTS.ready = TTS.voices.length > 0;
    updateVoicePill();
  }

  function pickVoice(langKey) {
    const voices = (TTS.voices && TTS.voices.length)
      ? TTS.voices
      : ("speechSynthesis" in window ? window.speechSynthesis.getVoices() : []);

    if (langKey === "es") {
      const v =
        voices.find(v => (v.lang === "es-MX") && (v.name || "").toLowerCase().includes("paulina")) ||
        voices.find(v => (v.lang || "").toLowerCase() === "es-mx") ||
        voices.find(v => (v.lang || "").toLowerCase().startsWith("es"));
      return { voice: v || null, lang: "es-MX" };
    }

    const v =
      voices.find(v => (v.lang === "en-AU") && (v.name || "").toLowerCase().includes("karen")) ||
      voices.find(v => (v.lang || "").toLowerCase() === "en-au") ||
      voices.find(v => (v.lang || "").toLowerCase().startsWith("en"));
    return { voice: v || null, lang: "en-AU" };
  }

  function stopSpeaking() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    TTS.isSpeaking = false;
    updateVoicePill();
  }

  function chunkText(text, maxLen = 220) {
    const t = String(text || "").trim();
    if (!t) return [];
    const parts = [];
    let cur = "";
    for (const token of t.split(/\s+/)) {
      if ((cur + " " + token).trim().length > maxLen) {
        parts.push(cur.trim());
        cur = token;
      } else {
        cur = (cur + " " + token).trim();
      }
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  }

  function speakText(text, langKey) {
    if (!("speechSynthesis" in window)) return;
    stopSpeaking();

    const { voice, lang } = pickVoice(langKey) || {};
    const chunks = chunkText(text, 220);
    if (!chunks.length) return;

    TTS.isSpeaking = true;
    updateVoicePill();

    let idx = 0;
    const speakNext = () => {
      if (!TTS.isSpeaking) return;
      if (idx >= chunks.length) {
        TTS.isSpeaking = false;
        updateVoicePill();
        return;
      }
      const u = new SpeechSynthesisUtterance(chunks[idx]);
      u.lang = lang || (langKey === "es" ? "es-MX" : "en-AU");
      if (voice) u.voice = voice;
      u.rate = 0.95;

      u.onend = () => { idx++; speakNext(); };
      u.onerror = () => { idx++; speakNext(); };
      window.speechSynthesis.speak(u);
    };

    speakNext();
  }

  function updateVoicePill() {
    if (!chatVoicePill) return;
    const ready = ("speechSynthesis" in window) ? (TTS.ready ? "ready" : "loading…") : "not supported";
    chatVoicePill.textContent = `Voice: ${ready}${TTS.isSpeaking ? " (speaking)" : ""}`;
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = () => refreshVoices();
    setTimeout(refreshVoices, 250);
    setTimeout(refreshVoices, 1200);
  } else {
    if (chatVoicePill) chatVoicePill.textContent = "Voice: not supported";
  }

  // ------------------------------
  // CHAT (Send / Enter / New / Save / Listen)
  // ------------------------------
  const chatLangSelect = $("chatLangSelect");
  const chatEl = $("chat");
  const chatForm = $("chatForm");
  const chatInput = $("chatInput");
  const chatSendBtn = $("chatSendBtn");
  const chatNewBtn = $("chatNewBtn");
  const chatSaveBtn = $("chatSaveBtn");
  const chatListenBtn = $("chatListenBtn"); // may exist in your old HTML
  const chatSavedList = $("chatSavedList");

  const CHAT_STORAGE = "alyana_chat_logs_v1";
  const chatHistory = [];
  let lastBo

