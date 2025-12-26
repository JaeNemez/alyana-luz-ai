
# agent.py — Gemini-based Bible AI (Render-safe)

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

Capabilities:
- If the user asks for prayer, write a short prayer
- If they ask for verses, give 3–5 relevant verses with brief explanations
- Explain Bible questions clearly and humbly
- Acknowledge differing views without attacking anyone
"""

def run_bible_ai(prompt: str, lang: str = "auto") -> str:
    """
    Call Gemini and return plain text.
    Compatible with Render's google-genai version.
    """

    lang = (lang or "auto").lower()
    if lang not in ("auto", "en", "es"):
        lang = "auto"

    lang_rule = ""
    if lang == "es":
        lang_rule = "\nIMPORTANT: Respond ONLY in Spanish."
    elif lang == "en":
        lang_rule = "\nIMPORTANT: Respond ONLY in English."

    full_prompt = (
        SYSTEM_PROMPT
        + lang_rule
        + "\n\nUser says:\n"
        + prompt
    )

    # ✅ CRITICAL FIX:
    # Do NOT use types.Part.from_text
    # Just pass a string directly
    response = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        contents=full_prompt,
    )

    text = (response.text or "").strip()
    if not text:
        return "I’m here with you. Please try again."

    return text
