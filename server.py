# server.py — simple Bible chat API using Gemini directly (no ADK runner)

import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.responses import FileResponse

from dotenv import load_dotenv
from google import genai

# Load .env if present
load_dotenv()

# Try GEMINI_API_KEY first (recommended), fall back to GOOGLE_API_KEY if you kept that name
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
    try:
        system_prompt = (
            "You are Alyana Luz, a warm, scripture-focused assistant. "
            "You pray with the user, suggest Bible passages, and explain verses. "
            "Reply in friendly, natural text (no JSON or code) unless the user asks "
            "for something technical. Keep answers concise but caring."
        )

        full_prompt = f"{system_prompt}\n\nUser: {body.prompt}"

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=full_prompt,
        )

        text = response.text or "Sorry, I couldn't think of anything to say."

        # Keep this shape simple so the UI just needs message
        return {
            "status": "success",
            "message": text,
        }

    except Exception as e:
        # Log to terminal for you; send generic error to the browser
        print("Gemini error:", repr(e))
        raise HTTPException(status_code=500, detail="Model error")

