# agent.py  — super simple Gemini-based Bible AI brain

import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Load .env from this folder
load_dotenv()

# Read the key from env (.env or shell)
API_KEY = (
    os.getenv("GOOGLE_API_KEY")
    or os.getenv("GEMINI_API_KEY")
)

if not API_KEY:
    raise RuntimeError(
        "No API key found. Set GOOGLE_API_KEY or GEMINI_API_KEY in your .env file."
    )

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

def run_bible_ai(prompt: str, context: dict | None = None) -> str:
    """
    Call Gemini and return a plain text answer — no JSON, no tools, just chat.
    """
    # Add a tiny bit of context if we have user info
    user_info = ""
    if context and isinstance(context, dict):
        user = context.get("user") or {}
        email = user.get("email")
        if email:
            user_info = f"\n(The user’s email is {email}.)"

    full_prompt = f"{SYSTEM_PROMPT}\n\nUser says:{user_info}\n\"\"\"\n{prompt}\n\"\"\""

    response = client.models.generate_content(
        model="gemini-2.0-flash-exp",
        contents=[types.Part.from_text(full_prompt)],
    )

    # response.text is already a nice string
    text = (response.text or "").strip()
    if not text:
        return "Sorry, I couldn’t think of anything to say just now. Please try again."

    return text

