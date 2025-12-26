# agent.py — Gemini-based Bible AI brain (supports lang="auto|en|es")

import os
import re
import traceback
from dotenv import load_dotenv

from google import genai
from google.genai import types

# Load .env from this folder (local dev); Render uses env vars automatically
load_dotenv()

API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError("No API key found. Set GOOGLE_API_KEY or GEMINI_API_KEY.")

client = genai.Client(api_key=API_KEY)

SYSTEM_PROMPT = """
You are **Alyana Luz**, a gentle, encouraging Bible AI.

Style:
- Warm, kind, and hopeful.
- Short paragraphs.
- No code blocks, no JSON.
- You can quote Scripture with references (e.g., John 3:16).

Capabilities:
- If the user says things like "pray about X", write a short prayer for them.
- If they ask for verses, give 3–5 relevant verses with brief explanations.
- If they ask questions about the Bible, explain clearly and humbly.
- If something is controversial, acknowledge different views without attacking anyone.
""".strip()


def _detect_lang_auto(text: str) -> str:
    """
    Very small heuristic: if it has Spanish punctuation/accents/common words,
    answer in Spanish; else English.
    """
    t = (text or "").lower()
    if re.search(r"[áéíóúñ¿¡]", t):
        return "es"
    common_es = [" oracion", " oración", " dios", " jesus", " jesús", " versiculo", " versículo", " biblia", " gracias", " por favor"]
    if any(w in t for w in common_es):
        return "es"
    return "en"


def run_bible_ai(prompt: str, lang: str = "auto", context: dict | None = None) -> str:
    """
    Call Gemini and return plain text.
    lang: "auto" | "en" | "es"
    """
    try:
        user_text = (prompt or "").strip()
        if not user_text:
            return "Please type a message."

        lang = (lang or "auto").strip().lower()
        if lang not in ("auto", "en", "es"):
            lang = "auto"

        final_lang = _detect_lang_auto(user_text) if lang == "auto" else lang

        # Optional context (if you ever pass it)
        user_info = ""
        if context and isinstance(context, dict):
            user = context.get("user") or {}
            email = user.get("email")
            if email:
                user_info = f"\n(User email: {email}.)"

        lang_instruction = (
            "IMPORTANT: Respond ONLY in Spanish."
            if final_lang == "es"
            else "IMPORTANT: Respond ONLY in English."
        )

        full_prompt = (
            f"{SYSTEM_PROMPT}\n\n"
            f"{lang_instruction}\n\n"
            f"User says:{user_info}\n"
            f"\"\"\"\n{user_text}\n\"\"\""
        )

        # Use a stable model name first; fall back if needed
        model_candidates = ["gemini-2.0-flash", "gemini-1.5-flash"]

        last_err = None
        for model_name in model_candidates:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[types.Part.from_text(full_prompt)],
                )
                text = (response.text or "").strip()
                if text:
                    return text
                return (
                    "Lo siento, no pude generar una respuesta ahora. Inténtalo de nuevo."
                    if final_lang == "es"
                    else "Sorry, I couldn’t generate a response right now. Please try again."
                )
            except Exception as e:
                last_err = e

        print("ERROR in run_bible_ai:", repr(last_err))
        print(traceback.format_exc())

        return (
            "Estoy teniendo problemas conectando con el motor de chat ahora mismo. Inténtalo de nuevo en un momento."
            if final_lang == "es"
            else "I’m having trouble connecting to the chat engine right now. Please try again in a moment."
        )

    except Exception as e:
        # absolute safety net (never crash the endpoint due to agent errors)
        print("FATAL agent error:", repr(e))
        print(traceback.format_exc())
        return "I’m having trouble right now. Please try again in a moment."
