import os
import re
import time
import sqlite3
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
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
        raise HTTPException(
            status_code=500,
            detail=f"bible.db not found at {DB_PATH}. Make sure data/bible.db is committed to GitHub and deployed on Render.",
        )
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
    return (book_key or "").capitalize()


def _parse_verse_range(verse: Optional[str], start: int, end: Optional[int]) -> Tuple[int, int]:
    """
    Supports:
      - verse="5" or verse="5-9"
      - start/end query params (existing)
    Returns (start, end)
    """
    if verse:
        v = str(verse).strip()
        m = re.match(r"^(\d+)(?:\s*-\s*(\d+))?$", v)
        if not m:
            raise HTTPException(status_code=400, detail="Invalid verse format. Use e.g. verse=5 or verse=5-9")
        s = int(m.group(1))
        e = int(m.group(2)) if m.group(2) else s
        return (s, e)

    # fallback to start/end
    s = int(start)
    e = int(end) if end is not None else s
    if e < s:
        e = s
    return (s, e)


@app.get("/bible/health")
def bible_health():
    """
    This helps you debug Render deploys quickly.
    If this shows db_exists=false, your repo/deploy does not include data/bible.db.
    """
    exists = os.path.exists(DB_PATH)
    size = os.path.getsize(DB_PATH) if exists else 0
    return {"db_exists": exists, "db_path": DB_PATH, "db_size_bytes": size}


@app.get("/bible/books")
def bible_books():
    con = _db()
    try:
        rows = con.execute("SELECT DISTINCT book FROM verses ORDER BY book").fetchall()
        # Return both key and label (frontend shows label, but uses key for API calls)
        books = [{"key": r["book"], "label": _pretty_book_label(r["book"])} for r in rows]
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
    # Backward compatible:
    verse: Optional[str] = Query(default=None, description="Optional verse range like 5 or 5-9"),
    start: int = 1,
    end: Optional[int] = None,
):
    """
    Supports BOTH styles:

    Style A (your updated frontend should use this):
      /bible/passage?book=genesis&chapter=1&full_chapter=true
      /bible/passage?book=genesis&chapter=1&start=1&end=5

    Style B (backward compatible):
      /bible/passage?book=genesis&chapter=1&verse=1-5
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

        s, e = _parse_verse_range(verse=verse, start=start, end=end)
        if s < 1:
            raise HTTPException(status_code=400, detail="Invalid start verse")

        rows = con.execute(
            """
            SELECT verse, text
            FROM verses
            WHERE book=? AND chapter=? AND verse BETWEEN ? AND ?
            ORDER BY verse
            """,
            (bk, int(chapter), int(s), int(e)),
        ).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="No passage text returned")

        text = "\n".join([f'{r["verse"]} {r["text"]}' for r in rows]).strip()
        ref = f"{_pretty_book_label(bk)} {chapter}:{s}" if s == e else f"{_pretty_book_label(bk)} {chapter}:{s}-{e}"
        return {"reference": ref, "text": text}
    finally:
        con.close()


# =========================
# AI endpoints (Gemini)
# =========================
def _require_ai():
    if not client:
        raise HTTPException(status_code=503, detail="AI key not configured (GEMINI_API_KEY missing).")


@app.post("/chat")
def chat(body: ChatIn):
    _require_ai()

    system_prompt = (
        "You are Alyana Luz, a warm, scripture-focused assistant. "
        "You pray with the user, suggest Bible passages, and explain verses. "
        "Reply in friendly, natural text (no JSON or code) unless the user asks "
        "for something technical. Keep answers concise but caring."
    )
    full_prompt = f"{system_prompt}\n\nUser: {body.prompt}"

    last_error = None
    for attempt in range(3):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=full_prompt,
            )
            text = response.text or "Sorry, I couldn't think of anything to say."
            return {"status": "success", "message": text}
        except Exception as e:
            last_error = e
            msg = repr(e)
            if "UNAVAILABLE" in msg or "503" in msg or "overloaded" in msg:
                time.sleep(1 + attempt)
                continue
            if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
                raise HTTPException(status_code=429, detail="Alyana reached today's free AI limit. Please try again later.")
            break

    print("Gemini error after retries:", repr(last_error))
    raise HTTPException(status_code=503, detail="AI error. Please try again in a bit.")


@app.post("/devotional")
def devotional():
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

