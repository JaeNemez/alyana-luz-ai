# server.py — Bible chat API with nicer error handling + small retry

import os
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.responses import FileResponse

from dotenv import load_dotenv
from google import genai

# Load .env if present
load_dotenv()

# Try GEMINI_API_KEY first (recommended), fall back to GOOGLE_API_KEY
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise RuntimeError(
        "Missing API key. Set GEMINI_API_KEY (or GOOGLE_API_KEY) in your environment."
    )

# Gemini client
client = genai.Client(api_key=API_KEY)

app = FastAPI(title="Alyana Luz · Bible AI")


class ChatIn(BaseModel):
    prompt: str


@app.get("/", include_in_schema=False)
async def serve_frontend():
    # Serve the chat UI
    return FileResponse("frontend/index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
def chat(body: ChatIn):
    """
    Main chat endpoint used by your front-end.
    Returns plain text in 'message' so the UI can show it.
    """
    system_prompt = (
        "You are Alyana Luz, a warm, scripture-focused assistant. "
        "You pray with the user, suggest Bible passages, and explain verses. "
        "Reply in friendly, natural text (no JSON or code) unless the user asks "
        "for something technical. Keep answers concise but caring."
    )

    full_prompt = f"{system_prompt}\n\nUser: {body.prompt}"

    # Simple retry loop for transient model overloads (503 / UNAVAILABLE)
    last_error = None
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=full_prompt,
            )
            text = response.text or "Sorry, I couldn't think of anything to say."
            return {
                "status": "success",
                "message": text,
            }
        except Exception as e:
            last_error = e
            msg = repr(e)
            # If it's clearly an overload / unavailable error, retry a bit
            if "UNAVAILABLE" in msg or "503" in msg or "overloaded" in msg:
                # short backoff: 1s, then 2s, then 3s
                time.sleep(1 + attempt)
                continue
            # For other errors, break immediately
            break

    # If we get here, we failed after retries – log and send a friendly message
    print("Gemini error after retries:", repr(last_error))
    raise HTTPException(
        status_code=503,
        detail=(
            "Alyana is having trouble reaching the prayer model right now. "
            "Please try your request again in a bit."
        ),
    )

