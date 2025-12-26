import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Load .env from this folder
load_dotenv()

API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("No API key found. Set GOOGLE_API_KEY or GEMINI_API_KEY in your .env file.")

client = genai.Client(api_key=API_KEY)

SYSTEM_PROMPT = """
You are **Alyana Luz**, a gentle, encouraging Bible AI.

Style:
- Warm, kind, and hopeful.
- Short paragraphs, no code blocks, no JSON.
- You can quote Scripture with references (e.g., John 3:16).

Capabilities:
- If the user says things like "pray about X", write a short prayer for them.
- If they ask for verses, give 3–5 relevant verses with brief explanations.
- If they ask questions about the Bible, explain clearly and humbly.
- If something is controversial, acknowledge different views without attacking anyone.
"""

def run_bible_ai(prompt: str, lang: str = "auto", context: dict | None = None) -> str:
    """
    Call Gemini and return a plain text answer — no JSON, no tools, just chat.
    lang: "auto" | "en" | "es"
    """
    lang = (lang or "auto").strip().lower()
    if lang not in ("auto", "en", "es"):
        lang = "auto"

    # Optional user info
    user_info = ""
    if context and isinstance(context, dict):
        user = context.get("user") or {}
        email = user.get("email")
        if email:
            user_info = f"\n(The user’s email is {email}.)"

    # Language instruction (forces Spanish when chosen)
    lang_rule = ""
    if lang == "es":
        lang_rule = "\nIMPORTANT: Respond ONLY in Spanish."
    elif lang == "en":
        lang_rule = "\nIMPORTANT: Respond ONLY in English."

    full_prompt = (
        f"{SYSTEM_PROMPT}"
        f"{lang_rule}\n\n"
        f"User says:{user_info}\n"
        f"\"\"\"\n{prompt}\n\"\"\""
    )

    # Pick a model (use env override if you want)
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    response = client.models.generate_content(
        model=model,
        contents=[types.Part.from_text(full_prompt)],
    )

    text = (response.text or "").strip()
    if not text:
        return "Sorry, I couldn’t think of anything to say just now. Please try again."

    return text


