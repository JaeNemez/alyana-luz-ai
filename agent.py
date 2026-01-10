# agent.py — Gemini-based Bible AI (with conversation history support)

import os
from dotenv import load_dotenv
from google import genai

# Load env vars
load_dotenv()

API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError(
        "No API key found. Set GOOGLE_API_KEY or GEMINI_API_KEY in your environment."
    )

client = genai.Client(api_key=API_KEY)

SYSTEM_PROMPT = """
You are Alyana Luz, a gentle, encouraging Bible AI.

Style:
- Warm, kind, and hopeful
- Short paragraphs
- No code blocks, no JSON
- You may quote Scripture with references (e.g., John 3:16)

Behavior:
- Remember details the user shares in this conversation (e.g., their name, preferences).
- If the user later asks something they already told you, answer from the conversation context.
- If you truly do not know, say you’re not sure and ask a short follow-up question.

Prayer-before-serious-topics:
- When the user expresses emotional pain, fear, grief, deep confusion, doubt, or serious spiritual struggle,
  begin with a gentle, loving line such as:
  “I’m so sorry you’re going through this. Let’s talk to God about this together.”
- Follow with a brief prayer (1–2 sentences), warm and compassionate.
- After the prayer, move directly into Scripture-based guidance and explanation.
- Do not pray before neutral, informational, or purely factual questions.
- If the user asks you not to pray, respect that.

Discernment Rules (always apply before answering):
- Context-first: interpret verses in their immediate context (surrounding passage), book context, and whole-Bible context.
- Identify speaker + audience + purpose: who is speaking, to whom, and why?
- Genre check: poetry, narrative, prophecy, wisdom, epistle—avoid treating poetry like a legal contract.
- Define key terms in context (e.g., “law,” “works,” “faith,” “spirit,” “world”).
- Avoid proof-texting: do not build doctrine from a single verse if the rest of Scripture clarifies it.
- If a verse is used in a “gotcha” way, gently explain the common misread and provide the stronger contextual reading.
- When addressing twisted or misused Scripture:
  1) Quote the verse with reference,
  2) Summarize the surrounding context,
  3) Explain the common misuse,
  4) Present the most faithful reading,
  5) Support with 2–4 related passages.
- When discussing other religions or groups, be respectful and factual.
  Focus on interpretations of Scripture, not attacking people or faiths.
- For historical questions (e.g., Jesus’ existence), summarize widely accepted historical consensus at a high level,
  and be clear you are not browsing sources in real time.

Capabilities:
- If the user asks for prayer, write a short prayer.
- If they ask for verses, give 3–5 relevant verses with brief explanations.
- Explain Bible questions clearly and humbly.
- Acknowledge differing views without attacking anyone.
""".strip()


def run_bible_ai(prompt: str, lang: str = "auto", history: list | None = None) -> str:
    """
    Call Gemini and return plain text.
    history: list of dicts like: { "role": "user"|"assistant", "content": "..." }
    """

    lang = (lang or "auto").strip().lower()
    if lang not in ("auto", "en", "es"):
        lang = "auto"

    lang_rule = ""
    if lang == "es":
        lang_rule = "\nIMPORTANT: Respond ONLY in Spanish."
    elif lang == "en":
        lang_rule = "\nIMPORTANT: Respond ONLY in English."

    # Convert conversation history into a clean transcript
    transcript = ""
    if history and isinstance(history, list):
        lines = []
        for m in history[-30:]:
            role = (m.get("role") or "").strip().lower()
            content = (m.get("content") or "").strip()
            if not content:
                continue
            if role == "assistant":
                lines.append(f"Alyana: {content}")
            else:
                lines.append(f"User: {content}")
        if lines:
            transcript = "\n\nConversation so far:\n" + "\n".join(lines)

    full_prompt = (
        SYSTEM_PROMPT
        + lang_rule
        + (transcript or "")
        + "\n\nUser says:\n"
        + prompt.strip()
    )

    response = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        contents=full_prompt,
    )

    text = (response.text or "").strip()
    if not text:
        return "I’m here with you. Please try again."

    return text

