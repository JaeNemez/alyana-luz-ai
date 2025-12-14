import os
import re
import time
import sqlite3
from typing import Optional, Tuple, Dict, Any

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
    # Adjust if you serve a different path
    if os.path.exists("frontend/index.html"):
        return FileResponse("frontend/index.html")
    if os.path.exists("index.html"):
        return FileResponse("index.html")
    raise HTTPException(status_code=404, detail="frontend/index.html not found")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "commit": os.getenv("RENDER_GIT_COMMIT", "unknown"),
    }


# =========================
# Bible Reader (LOCAL DB)
# Schema:
#   verses(book_id, chapter, verse, text)
#   books( ... )  (we will introspect columns safely)
# =========================
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(PROJECT_ROOT, "data", "bible.db")
DB_PATH = os.getenv("BIBLE_DB_PATH", DEFAULT_DB_PATH)

# Simple in-process cache
_BOOKS_CACHE: Dict[str, Any] = {"loaded": False, "by_id": {}, "by_name": {}, "book_name_col": None, "book_id_col": None}


def _db() -> sqlite3.Connection:
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail=f"bible.db not found at {DB_PATH}")
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _slug(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _load_books_cache(force: bool = False) -> None:
    global _BOOKS_CACHE
    if _BOOKS_CACHE.get("loaded") and not force:
        return

    con = _db()
    try:
        # detect columns in books table (name/title/book/book_name etc.)
        cols = con.execute("PRAGMA table_info(books)").fetchall()
        if not cols:
            raise HTTPException(status_code=500, detail="books table not found or has no columns")

        colnames = [c["name"] for c in cols]

        # identify book id column
        # common: id, book_id
        book_id_col = "id" if "id" in colnames else ("book_id" if "book_id" in colnames else None)
        if not book_id_col:
            # If there is only one integer-ish primary key column, use it
            pk_cols = [c["name"] for c in cols if c["pk"] == 1]
            book_id_col = pk_cols[0] if pk_cols else None
        if not book_id_col:
            raise HTTPException(status_code=500, detail=f"Could not identify books id column. Found: {colnames}")

        # identify book name column
        # common: name, title, book, book_name
        for candidate in ["name", "title", "book", "book_name"]:
            if candidate in colnames:
                book_name_col = candidate
                break
        else:
            # fallback: first TEXT column
            text_cols = [c["name"] for c in cols if (c["type"] or "").upper().startswith("TEXT")]
            book_name_col = text_cols[0] if text_cols else None

        if not book_name_col:
            raise HTTPException(status_code=500, detail=f"Could not identify books name column. Found: {colnames}")

        rows = con.execute(
            f"SELECT {book_id_col} AS id, {book_name_col} AS name FROM books ORDER BY {book_id_col}"
        ).fetchall()

        by_id = {}
        by_name = {}
        for r in rows:
            bid = int(r["id"])
            name = str(r["name"])
            by_id[bid] = name
            by_name[_slug(name)] = bid

        _BOOKS_CACHE = {
            "loaded": True,
            "by_id": by_id,
            "by_name": by_name,
            "book_name_col": book_name_col,
            "book_id_col": book_id_col,
        }
    finally:
        con.close()


def _resolve_book_to_id(book: str) -> int:
    """
    Accepts:
      - book name (e.g., "Genesis")
      - numeric id as string (e.g., "1")
    Returns: book_id (int)
    """
    if book is None:
        raise HTTPException(status_code=400, detail="Missing book")

    _load_books_cache()

    b = str(book).strip()
    if not b:
        raise HTTPException(status_code=400, detail="Missing book")

    if b.isdigit():
        bid = int(b)
        if bid in _BOOKS_CACHE["by_id"]:
            return bid
        raise HTTPException(status_code=404, detail=f"Book id not found: {bid}")

    key = _slug(b)
    bid = _BOOKS_CACHE["by_name"].get(key)
    if bid is not None:
        return int(bid)

    # Try relaxed matching (contains) as last resort
    for name_slug, bid2 in _BOOKS_CACHE["by_name"].items():
        if key in name_slug:
            return int(bid2)

    raise HTTPException(status_code=404, detail=f"Book not found: {book}")


def _book_label(book_id: int) -> str:
    _load_books_cache()
    return _BOOKS_CACHE["by_id"].get(int(book_id), f"Book {book_id}")


def _parse_verse_param(verse: Optional[str]) -> Optional[Tuple[int, int]]:
    """
    Accepts:
      "5" or "5-12"
    Returns:
      (start, end)
    """
    if not verse:
        return None
    v = str(verse).strip()
    m = re.match(r"^(\d+)\s*-\s*(\d+)$", v)
    if m:
        a = int(m.group(1))
        b = int(m.group(2))
        if a < 1 or b < 1:
            raise HTTPException(status_code=400, detail="Invalid verse range")
        return (a, b) if b >= a else (a, a)
    if v.isdigit():
        n = int(v)
        if n < 1:
            raise HTTPException(status_code=400, detail="Invalid verse")
        return (n, n)
    raise HTTPException(status_code=400, detail="Invalid verse format (use '5' or '5-12')")


@app.get("/bible/health")
def bible_health():
    """
    Quick diagnostics for DB + schema.
    """
    if not os.path.exists(DB_PATH):
        return JSONResponse(
            {
                "ok": False,
                "db_path": DB_PATH,
                "error": "bible.db missing",
                "hint": "Ensure data/bible.db is included in your deploy (in repo) or set BIBLE_DB_PATH.",
            },
            status_code=500,
        )

    con = sqlite3.connect(DB_PATH)
    try:
        con.row_factory = sqlite3.Row

        tables = [r["name"] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
        if "verses" not in tables:
            return JSONResponse({"ok": False, "db_path": DB_PATH, "tables": tables, "error": "Missing 'verses' table"}, status_code=500)
        if "books" not in tables:
            return JSONResponse({"ok": False, "db_path": DB_PATH, "tables": tables, "error": "Missing 'books' table"}, status_code=500)

        vcols = [r["name"] for r in con.execute("PRAGMA table_info(verses)")]
        bcols = [r["name"] for r in con.execute("PRAGMA table_info(books)")]

        # Test a simple query
        sample = con.execute("SELECT book_id, chapter, verse FROM verses LIMIT 1").fetchone()
        sample_dict = dict(sample) if sample else None

        return {
            "ok": True,
            "db_path": DB_PATH,
            "tables": tables,
            "verses_columns": vcols,
            "books_columns": bcols,
            "sample_verses_row": sample_dict,
        }
    finally:
        con.close()


@app.get("/bible/books")
def bible_books():
    """
    Frontend expects: {"books": [ "Genesis", "Exodus", ... ]}
    """
    _load_books_cache(force=True)
    books = [name for _, name in sorted(_BOOKS_CACHE["by_id"].items(), key=lambda x: x[0])]
    return {"books": books}


@app.get("/bible/chapters")
def bible_chapters(book: str = Query(..., description="Book name (e.g. Genesis) or id")):
    book_id = _resolve_book_to_id(book)
    con = _db()
    try:
        rows = con.execute(
            "SELECT DISTINCT chapter FROM verses WHERE book_id=? ORDER BY chapter",
            (int(book_id),),
        ).fetchall()
        chapters = [int(r["chapter"]) for r in rows]
        if not chapters:
            raise HTTPException(status_code=404, detail=f"No chapters found for book_id={book_id}")
        return {"book": _book_label(book_id), "book_id": int(book_id), "chapters": chapters}
    finally:
        con.close()


@app.get("/bible/verses")
def bible_verses(book: str, chapter: int):
    book_id = _resolve_book_to_id(book)
    if int(chapter) < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")

    con = _db()
    try:
        rows = con.execute(
            "SELECT verse FROM verses WHERE book_id=? AND chapter=? ORDER BY verse",
            (int(book_id), int(chapter)),
        ).fetchall()
        verses = [int(r["verse"]) for r in rows]
        if not verses:
            raise HTTPException(status_code=404, detail=f"No verses found for book_id={book_id} ch={chapter}")
        return {"book": _book_label(book_id), "book_id": int(book_id), "chapter": int(chapter), "verses": verses}
    finally:
        con.close()


@app.get("/bible/passage")
def bible_passage(
    book: str,
    chapter: int,
    # Backward compatible params:
    verse: Optional[str] = None,              # e.g. "1" or "1-5"
    # Newer style params:
    full_chapter: bool = False,               # true/false
    start: int = 1,
    end: Optional[int] = None,
):
    """
    Supports BOTH query styles:

    1) /bible/passage?book=Genesis&chapter=1&verse=1-5
    2) /bible/passage?book=Genesis&chapter=1&full_chapter=true
    3) /bible/passage?book=Genesis&chapter=1&start=1&end=5
    """
    book_id = _resolve_book_to_id(book)

    if int(chapter) < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")

    # If verse param is provided, it overrides start/end/full_chapter (except full_chapter=true)
    if not full_chapter and verse:
        se = _parse_verse_param(verse)
        if se:
            start, end = se[0], se[1]

    con = _db()
    try:
        if full_chapter:
            rows = con.execute(
                "SELECT verse, text FROM verses WHERE book_id=? AND chapter=? ORDER BY verse",
                (int(book_id), int(chapter)),
            ).fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail=f"No chapter text for book_id={book_id} ch={chapter}")
            text = "\n".join([f'{int(r["verse"])} {r["text"]}' for r in rows]).strip()
            ref = f"{_book_label(book_id)} {int(chapter)}"
            return {"reference": ref, "text": text}

        if int(start) < 1:
            raise HTTPException(status_code=400, detail="Invalid start verse")

        if end is None or int(end) < int(start):
            end = int(start)

        rows = con.execute(
            """
            SELECT verse, text
            FROM verses
            WHERE book_id=? AND chapter=? AND verse BETWEEN ? AND ?
            ORDER BY verse
            """,
            (int(book_id), int(chapter), int(start), int(end)),
        ).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="No passage text returned")

        text = "\n".join([f'{int(r["verse"])} {r["text"]}' for r in rows]).strip()

        if int(start) == int(end):
            ref = f"{_book_label(book_id)} {int(chapter)}:{int(start)}"
        else:
            ref = f"{_book_label(book_id)} {int(chapter)}:{int(start)}-{int(end)}"

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
    response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
    return {"json": (response.text or "").strip()}


@app.post("/daily_prayer")
def daily_prayer():
    _require_ai()
    prompt = (
        "Return ONLY valid JSON (no markdown, no code fences) with keys:\n"
        "example_adoration, example_confession, example_thanksgiving, example_supplication.\n"
        "Each value should be 1-2 sentences, warm and biblically grounded.\n"
    )
    response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
    return {"json": (response.text or "").strip()}



