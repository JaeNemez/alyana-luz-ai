import os
import re
import time
import sqlite3
from typing import Optional, Dict, Any, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from google import genai

load_dotenv()

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
    return {"status": "ok", "commit": os.getenv("RENDER_GIT_COMMIT", "unknown")}


# =========================
# Bible Reader (LOCAL DB)
# Your DB schema (confirmed):
#   tables: books, verses
#   verses columns: book_id, chapter, verse, text
# =========================
DB_PATH = os.path.join(os.path.dirname(__file__), "data", "bible.db")


def _db():
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail=f"bible.db not found at {DB_PATH}")
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _get_table_columns(con: sqlite3.Connection, table: str) -> List[str]:
    rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    return [r["name"] for r in rows]


def _get_books_table_mapping(con: sqlite3.Connection) -> Dict[str, str]:
    """
    We don't assume exact books table column names.
    We'll auto-detect the best candidates for:
      - id column
      - display name column
      - optional key/slug column (if exists)
    """
    cols = [c.lower() for c in _get_table_columns(con, "books")]

    # id column
    id_col = None
    for cand in ["id", "book_id", "pk"]:
        if cand in cols:
            id_col = cand
            break
    if not id_col:
        # fallback: first integer primary key
        # pragma table_info includes pk flag, but we already only captured names
        # so we just try common 'id'
        id_col = "id" if "id" in cols else cols[0]

    # name column
    name_col = None
    for cand in ["name", "book", "title", "label"]:
        if cand in cols:
            name_col = cand
            break
    if not name_col:
        # fallback: second column if exists, else first
        name_col = cols[1] if len(cols) > 1 else cols[0]

    # key/slug column (optional)
    key_col = None
    for cand in ["key", "slug", "code", "abbr", "short_name", "shortname"]:
        if cand in cols:
            key_col = cand
            break

    return {"id_col": id_col, "name_col": name_col, "key_col": key_col or ""}


def _normalize_book_key(book: str) -> str:
    b = (book or "").strip().lower()
    b = re.sub(r"\s+", "", b)
    return b


def _resolve_book_id(con: sqlite3.Connection, book: str) -> int:
    """
    Accepts:
      - numeric book id: "10"
      - name: "Genesis"
      - key/slug: "2samuel", "songofsolomon"
    """
    raw = (book or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Missing book")

    # numeric id
    if raw.isdigit():
        return int(raw)

    mapping = _get_books_table_mapping(con)
    id_col = mapping["id_col"]
    name_col = mapping["name_col"]
    key_col = mapping["key_col"]

    norm = _normalize_book_key(raw)

    # Try exact name match (case-insensitive)
    row = con.execute(
        f"SELECT {id_col} AS id FROM books WHERE LOWER({name_col}) = LOWER(?) LIMIT 1",
        (raw,),
    ).fetchone()
    if row:
        return int(row["id"])

    # Try normalized compare (remove spaces) against name
    row = con.execute(
        f"SELECT {id_col} AS id FROM books WHERE REPLACE(LOWER({name_col}), ' ', '') = ? LIMIT 1",
        (norm,),
    ).fetchone()
    if row:
        return int(row["id"])

    # If key/slug column exists, try it
    if key_col:
        row = con.execute(
            f"SELECT {id_col} AS id FROM books WHERE REPLACE(LOWER({key_col}), ' ', '') = ? LIMIT 1",
            (norm,),
        ).fetchone()
        if row:
            return int(row["id"])

    raise HTTPException(status_code=404, detail=f"Book not found: {raw}")


@app.get("/bible/health")
def bible_health():
    con = _db()
    try:
        # Check required tables
        tables = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        table_names = [t["name"] for t in tables]
        if "books" not in table_names or "verses" not in table_names:
            raise HTTPException(status_code=500, detail=f"Missing tables. Found: {table_names}")

        # Check required columns in verses
        vcols = set([c.lower() for c in _get_table_columns(con, "verses")])
        needed = {"book_id", "chapter", "verse", "text"}
        if not needed.issubset(vcols):
            raise HTTPException(
                status_code=500,
                detail=f"verses table missing columns. Found: {sorted(vcols)}"
            )

        count = con.execute("SELECT COUNT(*) AS c FROM verses").fetchone()["c"]
        return {"status": "ok", "db_path": DB_PATH, "verse_count": int(count)}
    finally:
        con.close()


@app.get("/bible/books")
def bible_books():
    con = _db()
    try:
        mapping = _get_books_table_mapping(con)
        id_col = mapping["id_col"]
        name_col = mapping["name_col"]
        key_col = mapping["key_col"]

        # Provide id + label + key (if exists) so frontend can display nicely and query reliably.
        if key_col:
            rows = con.execute(
                f"SELECT {id_col} AS id, {name_col} AS name, {key_col} AS book_key FROM books ORDER BY {id_col}"
            ).fetchall()
        else:
            rows = con.execute(
                f"SELECT {id_col} AS id, {name_col} AS name FROM books ORDER BY {id_col}"
            ).fetchall()

        books = []
        for r in rows:
            books.append({
                "id": int(r["id"]),
                "name": str(r["name"]),
                "key": str(r["book_key"]) if "book_key" in r.keys() else None
            })

        return {"books": books}
    finally:
        con.close()


@app.get("/bible/chapters")
def bible_chapters(book: str):
    con = _db()
    try:
        book_id = _resolve_book_id(con, book)
        rows = con.execute(
            "SELECT DISTINCT chapter FROM verses WHERE book_id=? ORDER BY chapter",
            (book_id,),
        ).fetchall()
        chapters = [int(r["chapter"]) for r in rows]
        if not chapters:
            raise HTTPException(status_code=404, detail=f"No chapters for book_id={book_id}")
        return {"book_id": book_id, "chapters": chapters}
    finally:
        con.close()


@app.get("/bible/verses")
def bible_verses(book: str, chapter: int):
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")
    con = _db()
    try:
        book_id = _resolve_book_id(con, book)
        rows = con.execute(
            "SELECT verse FROM verses WHERE book_id=? AND chapter=? ORDER BY verse",
            (book_id, int(chapter)),
        ).fetchall()
        verses = [int(r["verse"]) for r in rows]
        if not verses:
            raise HTTPException(status_code=404, detail=f"No verses for book_id={book_id} ch={chapter}")
        return {"book_id": book_id, "chapter": int(chapter), "verses": verses}
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
    Frontend will call:
      /bible/passage?book=<book_id_or_name_or_key>&chapter=...&full_chapter=true|false&start=...&end=...
    """
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")

    con = _db()
    try:
        book_id = _resolve_book_id(con, book)

        # get book name for reference
        mapping = _get_books_table_mapping(con)
        id_col = mapping["id_col"]
        name_col = mapping["name_col"]
        b = con.execute(
            f"SELECT {name_col} AS name FROM books WHERE {id_col}=? LIMIT 1",
            (book_id,),
        ).fetchone()
        book_name = b["name"] if b else str(book)

        if full_chapter:
            rows = con.execute(
                "SELECT verse, text FROM verses WHERE book_id=? AND chapter=? ORDER BY verse",
                (book_id, int(chapter)),
            ).fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail="No chapter text")
            text = "\n".join([f'{r["verse"]} {r["text"]}' for r in rows]).strip()
            return {"reference": f"{book_name} {chapter}", "text": text}

        if start < 1:
            raise HTTPException(status_code=400, detail="Invalid start verse")
        if end is None or end < start:
            end = start

        rows = con.execute(
            """
            SELECT verse, text
            FROM verses
            WHERE book_id=? AND chapter=? AND verse BETWEEN ? AND ?
            ORDER BY verse
            """,
            (book_id, int(chapter), int(start), int(end)),
        ).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="No passage text returned")

        text = "\n".join([f'{r["verse"]} {r["text"]}' for r in rows]).strip()
        ref = f"{book_name} {chapter}:{start}" if start == end else f"{book_name} {chapter}:{start}-{end}"
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





