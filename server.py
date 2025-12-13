import os
import re
import time
import sqlite3
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from google import genai

load_dotenv()

# --------------------
# App
# --------------------
app = FastAPI(title="Alyana Luz · Bible AI")

# --------------------
# Gemini (AI)
# --------------------
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=API_KEY) if API_KEY else None


class ChatIn(BaseModel):
    prompt: str


@app.get("/", include_in_schema=False)
async def serve_frontend():
    return FileResponse("frontend/index.html")


@app.get("/health")
def health():
    # Helpful for debugging Render deploys
    return {
        "status": "ok",
        "commit": os.getenv("RENDER_GIT_COMMIT", "unknown"),
    }


# =========================
# Bible Reader (LOCAL DB)
# Uses ./data/bible.db (table: verses)
# =========================
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "bible.db")


def _db():
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail=f"bible.db not found at {DB_PATH}")
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _normalize_book_key(book: str) -> str:
    # Accept UI-style ("2 Samuel") or DB-style ("2samuel") and normalize to DB key.
    b = (book or "").strip().lower()
    b = re.sub(r"\s+", "", b)  # remove spaces
    return b


def _pretty_book_label(book_key: str) -> str:
    # For reference strings only (simple formatter)
    m = re.match(r"^([123])(.*)$", book_key)
    if m:
        num, rest = m.group(1), m.group(2)
        return f"{num} {rest.capitalize()}"
    return book_key.capitalize()


@app.get("/bible/books")
def bible_books():
    con = _db()
    try:
        rows = con.execute("SELECT DISTINCT book FROM verses ORDER BY book").fetchall()
        books = [r["book"] for r in rows]
        return {"books": books}
    finally:
        con.close()


@app.get("/bible/chapters")
def bible_chapters(book: str):
    bk = _normalize_book_key(book)
    con = _db()
    try:
        rows = con.execute(
            "SELECT DISTINCT chapter FROM verses WHERE book=? ORDER BY chapter",
            (bk,),
        ).fetchall()
        chapters = [int(r["chapter"]) for r in rows]
        if not chapters:
            raise HTTPException(status_code=404, detail=f"No chapters found for book={bk}")
        return {"book": bk, "chapters": chapters}
    finally:
        con.close()


@app.get("/bible/verses")
def bible_verses(book: str, chapter: int):
    bk = _normalize_book_key(book)
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")
    con = _db()
    try:
        rows = con.execute(
            "SELECT verse FROM verses WHERE book=? AND chapter=? ORDER BY verse",
            (bk, int(chapter)),
        ).fetchall()
        verses = [int(r["verse"]) for r in rows]
        if not verses:
            raise HTTPException(status_code=404, detail=f"No verses found for {bk} ch{chapter}")
        return {"book": bk, "chapter": int(chapter), "verses": verses}
    finally:
        con.close()


@app.get("/bible/passage")
def bible_passage(
    book: str,
    chapter: int,
    full_chapter: bool = False,
    start: int = 1,
    end: Optional[int] = None,
):
    """
    Matches your FRONTEND query params:
      /bible/passage?book=...&chapter=...&full_chapter=true|false&start=...&end=...
    """
    bk = _normalize_book_key(book)
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")

    con = _db()
    try:
        if full_chapter:
            rows = con.execute(
                "SELECT verse, text FROM verses WHERE book=? AND chapter=? ORDER BY verse",
                (bk, int(chapter)),
            ).fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail=f"No chapter text for {bk} ch{chapter}")
            text = "\n".join([f'{r["verse"]} {r["text"]}' for r in rows]).strip()
            ref = f"{_pretty_book_label(bk)} {chapter}"
            return {"reference": ref, "text": text}

        if start < 1:
            raise HTTPException(status_code=400, detail="Invalid start verse")
        if end is None or end < start:
            end = start

        rows = con.execute(
            """
            SELECT verse, text
            FROM verses
            WHERE book=? AND chapter=? AND verse BETWEEN ? AND ?
            ORDER BY verse
            """,
            (bk, int(chapter), int(start), int(end)),
        ).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="No passage text returned")

        text = "\n".join([f'{r["verse"]} {r["text"]}' for r in rows]).strip()

        if start == end:
            ref = f"{_pretty_book_label(bk)} {chapter}:{start}"
        else:
            ref = f"{_pretty_book_label(bk)} {chapter}:{start}-{end}"

        return {"reference": ref, "text": text}
    finally:
        con.close()


# =========================
# AI endpoints (Gemini)
# =========================
def _require_ai():
    if not client:
        raise HTTPException(status_code=503, detail="AI key not configured (GEMINI_API_KEY missing).")


def _detect_language_from_text(text: str) -> str:
    """
    Small heuristic:
    - If user input looks Spanish, return 'es'
    - Else return 'en'
    """
    t = (text or "").strip().lower()

    # quick signals: accents or inverted punctuation
    if any(ch in t for ch in ["¿", "¡", "á", "é", "í", "ó", "ú", "ñ"]):
        return "es"

    # common Spanish tokens
    spanish_hits = [
        " jesus", " jesús", " dios", " oración", " oracion", " por favor", " gracias",
        " versículo", " versiculo", " biblia", " milagro", " milagros",
        " perdón", " perdon", " cómo", " como ", " qué", " que ", " porque", " para ",
        "me puedes", "puedes", "háblame", "hablame", "quiero", "necesito",
        "hola", "buenas", "bendiciones", "señor", "senor"
    ]
    score = sum(1 for w in spanish_hits if w in f" {t} ")
    return "es" if score >= 2 else "en"


def _extract_last_user_line(full_history_blob: str) -> str:
    """
    Your frontend sends a 'historyText' that includes lines like:
      User: ...
      Alyana: ...
    We try to pull the last User: line for language detection.
    If not found, fallback to the whole blob.
    """
    blob = full_history_blob or ""
    matches = re.findall(r"(?:^|\n)User:\s*(.*)", blob)
    if matches:
        return matches[-1].strip()
    return blob.strip()


@app.post("/chat")
def chat(body: ChatIn):
    _require_ai()

    # Decide language based on the user's *latest* message (not the whole history).
    last_user = _extract_last_user_line(body.prompt)
    lang = _detect_language_from_text(last_user)

    if lang == "es":
        language_rule = (
            "IMPORTANT: Reply entirely in Spanish. Do NOT switch to English. "
            "If the user asks in Spanish, keep the full response in Spanish."
        )
        fallback = "Lo siento, no pude pensar en algo que decir."
    else:
        language_rule = (
            "IMPORTANT: Reply entirely in English. Do NOT switch to Spanish unless the user asks."
        )
        fallback = "Sorry, I couldn't think of anything to say."

    system_prompt = (
        "You are Alyana Luz, a warm, scripture-focused assistant. "
        "You pray with the user, suggest Bible passages, and explain verses. "
        "Reply in friendly, natural text (no JSON or code) unless the user asks "
        "for something technical. Keep answers concise but caring.\n\n"
        f"{language_rule}"
    )

    full_prompt = f"{system_prompt}\n\nUser: {body.prompt}"

    last_error = None
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=full_prompt,
            )
            text = response.text or fallback
            return {"status": "success", "message": text}
        except Exception as e:
            last_error = e
            msg = repr(e)
            if "UNAVAILABLE" in msg or "503" in msg or "overloaded" in msg:
                time.sleep(1 + attempt)
                continue
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                raise HTTPException(
                    status_code=429,
                    detail="Alyana reached today's free AI limit. Please try again later.",
                )
            break

    print("Gemini error after retries:", repr(last_error))
    raise HTTPException(status_code=503, detail="AI error. Please try again in a bit.")


@app.post("/devotional")
def devotional():
    """
    Frontend expects: { json: "<json-string>" }
    with keys: scripture, brief_explanation
    """
    _require_ai()

    prompt = (
        "Return ONLY valid JSON (no markdown, no code fences) with keys:\n"
        "scripture: a short scripture reference + verse text (1-3 verses max)\n"
        "brief_explanation: 2-4 sentences explaining it simply\n"
        "Choose an encouraging, Christ-centered theme.\n"
    )

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return {"json": (response.text or "").strip()}


@app.post("/daily_prayer")
def daily_prayer():
    """
    Frontend expects: { json: "<json-string>" }
    with keys:
      example_adoration, example_confession, example_thanksgiving, example_supplication
    """
    _require_ai()

    prompt = (
        "Return ONLY valid JSON (no markdown, no code fences) with keys:\n"
        "example_adoration, example_confession, example_thanksgiving, example_supplication.\n"
        "Each value should be 1-2 sentences, warm and biblically grounded.\n"
    )

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    return {"json": (response.text or "").strip()}
