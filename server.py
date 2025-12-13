import os
import re
import time
import sqlite3
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
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
# =========================

# Allow override if needed on Render
# Example: BIBLE_DB_PATH=/opt/render/project/src/data/bible.db
DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "data", "bible.db")
DB_PATH = os.getenv("BIBLE_DB_PATH", DEFAULT_DB_PATH)


def _db_exists() -> bool:
    return os.path.exists(DB_PATH) and os.path.isfile(DB_PATH)


def _db():
    if not _db_exists():
        raise HTTPException(status_code=500, detail=f"bible.db not found at {DB_PATH}")
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _normalize_book_key(book: str) -> str:
    # Accept UI-style ("2 Samuel") or DB-style ("2samuel") and normalize to DB key.
    b = (book or "").strip().lower()
    b = re.sub(r"\s+", "", b)
    return b


def _pretty_book_label(book_key: str) -> str:
    # "2samuel" -> "2 Samuel"
    bk = (book_key or "").strip()
    m = re.match(r"^([123])(.+)$", bk, flags=re.I)
    if m:
        num = m.group(1)
        rest = m.group(2)
        # Insert space before common compound words if DB removed spaces (best-effort)
        # "samuel" -> "Samuel", "kings" -> "Kings", etc.
        return f"{num} {rest[:1].upper()}{rest[1:]}"
    return f"{bk[:1].upper()}{bk[1:]}"


def _parse_verse_range(verse: str) -> Tuple[int, Optional[int]]:
    """
    Accepts:
      "5" -> (5, None)
      "5-10" -> (5, 10)
      " 5 - 10 " -> (5, 10)
    """
    if not verse:
        return (1, None)
    v = verse.strip()
    v = re.sub(r"\s+", "", v)
    if "-" in v:
        a, b = v.split("-", 1)
        if not a.isdigit() or not b.isdigit():
            raise HTTPException(status_code=400, detail="Invalid verse range")
        return (int(a), int(b))
    if not v.isdigit():
        raise HTTPException(status_code=400, detail="Invalid verse")
    return (int(v), None)


@app.get("/bible/health")
def bible_health():
    """
    Used by the frontend to explain why dropdowns are not loading.
    """
    if not _db_exists():
        return JSONResponse(
            status_code=200,
            content={
                "ok": False,
                "db_path": DB_PATH,
                "error": "bible.db missing",
                "hint": "Ensure data/bible.db is included in your Render deploy (in repo) or set BIBLE_DB_PATH.",
            },
        )

    con = _db()
    try:
        # Confirm table exists + has rows
        try:
            row = con.execute("SELECT COUNT(1) AS n FROM verses").fetchone()
            n = int(row["n"]) if row and row["n"] is not None else 0
        except Exception as e:
            return JSONResponse(
                status_code=200,
                content={
                    "ok": False,
                    "db_path": DB_PATH,
                    "error": f"Cannot query verses table: {repr(e)}",
                    "hint": "Your bible.db must contain a table named 'verses' with columns book, chapter, verse, text.",
                },
            )

        # Also show a sample book value for debugging
        sample = con.execute("SELECT book FROM verses LIMIT 1").fetchone()
        sample_book = sample["book"] if sample else None

        return {
            "ok": True,
            "db_path": DB_PATH,
            "verses_count": n,
            "sample_book": sample_book,
        }
    finally:
        con.close()


@app.get("/bible/books")
def bible_books():
    con = _db()
    try:
        rows = con.execute("SELECT DISTINCT book FROM verses ORDER BY book").fetchall()
        # Return both raw DB key and a human label (frontend supports both)
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
    # New style (frontend v2): full_chapter/start/end
    full_chapter: bool = False,
    start: int = 1,
    end: Optional[int] = None,
    # Backward compatibility (older frontend): verse="3" or "3-7"
    verse: Optional[str] = None,
):
    """
    Supports BOTH:
      /bible/passage?book=...&chapter=...&full_chapter=true
      /bible/passage?book=...&chapter=...&start=3&end=7
      /bible/passage?book=...&chapter=...&verse=3-7   (legacy)
    """
    bk = _normalize_book_key(book)
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")

    # Legacy "verse" overrides start/end/full_chapter (unless full_chapter is explicitly true)
    if verse and not full_chapter:
        s, e = _parse_verse_range(verse)
        start = s
        end = e

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


@app.post("/chat")
def chat(body: ChatIn):
    _require_ai()

    system_prompt = (
        "You are Alyana Luz, a warm, scripture-focused assistant. "
        "You pray with the user, suggest Bible passages, and explain verses. "
        "Reply in friendly, natural text (no JSON or code) unless the user asks "
        "for something technical. Keep answers concise but caring."
        "\n\nIMPORTANT: Match the user's language. If they write in Spanish, respond fully in Spanish."
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
                raise HTTPException(
                    status_code=429,
                    detail="Alyana reached today's free AI limit. Please try again later.",
                )
            break

    print("Gemini error after retries:", repr(last_error))
    raise HTTPException(status_code=503, detail="AI error. Please try again in a bit.")


