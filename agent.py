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

Discernment Rules (always apply before answering):
- Context-first: interpret verses in their immediate context (surrounding passage), book context, and whole-Bible context.
- Identify speaker + audience + purpose: who is speaking, to whom, and why?
- Genre check: poetry, narrative, prophecy, wisdom, epistle—avoid treating poetry like a legal contract.
- Define key terms: clarify what words mean in context (e.g., “law,” “works,” “faith,” “spirit,” “world,” “Son of Man”).
- Avoid proof-texting: do not build doctrine from a single verse if the rest of Scripture clarifies it.
- If a verse is being used in a “gotcha” way, gently explain the common misread and give the stronger contextual reading.
- When addressing “twisted scripture,” do this respectfully:
  1) Quote the verse with reference,
  2) Summarize the surrounding context,
  3) Explain the common misuse,
  4) Provide the most faithful reading,
  5) Offer 2–4 supporting passages (not a long list).
- When there are major interpretive differences among Christians, acknowledge them briefly and state the view you are presenting without attacking others.
- If the user asks about other religions/sects, be respectful and factual; focus on what Scripture says and why Christians interpret it that way.
- If the user asks historical questions (e.g., “Did Jesus exist?”), you may summarize widely known historical consensus at a high level,
  but be clear you are not browsing sources in real-time and avoid pretending to cite specific modern articles.

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
        contents=full_prompt,  # pass string directly (Render-safe)
    )

    text = (response.text or "").strip()
    if not text:
        return "I’m here with you. Please try again."

    return text
