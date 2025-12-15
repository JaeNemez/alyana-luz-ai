import os
import re
import time
import sqlite3
from typing import Optional, Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from google import genai

load_dotenv()

app = FastAPI(title="Alyana Luz · Bible AI")

# --------------------
# Paths (ABSOLUTE)
# --------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
INDEX_PATH = os.path.join(FRONTEND_DIR, "index.html")
APPJS_PATH = os.path.join(FRONTEND_DIR, "app.js")

# Serve the entire frontend folder under /static (optional but helpful)
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# --------------------
# Gemini (AI)
# --------------------
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=API_KEY) if API_KEY else None

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


class ChatIn(BaseModel):
    prompt: str


class LangIn(BaseModel):
    lang: str = "en"


def _require_ai():
    if not client:
        raise HTTPException(
            status_code=503,
            detail="AI key not configured (set GEMINI_API_KEY / GOOGLE_API_KEY).",
        )


def _generate_text_with_retries(full_prompt: str, tries: int = 3) -> str:
    """
    Gemini can occasionally return UNAVAILABLE/503 when overloaded.
    We retry a few times with backoff. 429 is returned to client.
    """
    last_error = None
    for attempt in range(tries):
        try:
            resp = client.models.generate_content(
                model=MODEL_NAME,
                contents=full_prompt,
            )
            return resp.text or ""
        except Exception as e:
            last_error = e
            msg = repr(e)

            # Overloaded / temporary service issues
            if ("UNAVAILABLE" in msg) or ("503" in msg) or ("overloaded" in msg):
                time.sleep(1 + attempt)
                continue

            # Rate limits / quota
            if ("429" in msg) or ("RESOURCE_EXHAUSTED" in msg):
                raise HTTPException(
                    status_code=429,
                    detail="Alyana reached the AI limit right now. Please try again later.",
                )

            break

    print("Gemini error after retries:", repr(last_error))
    raise HTTPException(status_code=503, detail="AI error. Please try again in a bit.")


# =========================
# Frontend serving
# =========================
@app.get("/", include_in_schema=False)
async def serve_frontend():
    if not os.path.exists(INDEX_PATH):
        return PlainTextResponse(f"Missing {INDEX_PATH}", status_code=500)
    return FileResponse(
        INDEX_PATH,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


# IMPORTANT: your index.html uses <script src="/app.js" defer></script>
@app.get("/app.js", include_in_schema=False)
async def serve_app_js_root():
    if not os.path.exists(APPJS_PATH):
        return PlainTextResponse(
            f"Missing {APPJS_PATH}. Put app.js inside frontend/app.js",
            status_code=404,
        )
    return FileResponse(
        APPJS_PATH,
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/static/app.js", include_in_schema=False)
async def serve_app_js_static():
    if not os.path.exists(APPJS_PATH):
        return PlainTextResponse(
            f"Missing {APPJS_PATH}. Put app.js inside frontend/app.js",
            status_code=404,
        )
    return FileResponse(
        APPJS_PATH,
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "commit": os.getenv("RENDER_GIT_COMMIT", "unknown"),
        "frontend_dir": FRONTEND_DIR,
        "index_exists": os.path.exists(INDEX_PATH),
        "appjs_exists": os.path.exists(APPJS_PATH),
        "db_exists": os.path.exists(os.path.join(BASE_DIR, "data", "bible.db")),
        "ai_configured": bool(API_KEY),
        "model": MODEL_NAME,
    }


# =========================
# Bible Reader (LOCAL DB)
# =========================
DB_PATH = os.path.join(BASE_DIR, "data", "bible.db")


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
    cols = [c.lower() for c in _get_table_columns(con, "books")]

    id_col = None
    for cand in ["id", "book_id", "pk"]:
        if cand in cols:
            id_col = cand
            break
    if not id_col:
        id_col = "id" if "id" in cols else cols[0]

    name_col = None
    for cand in ["name", "book", "title", "label"]:
        if cand in cols:
            name_col = cand
            break
    if not name_col:
        name_col = cols[1] if len(cols) > 1 else cols[0]

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
    raw = (book or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Missing book")

    if raw.isdigit():
        return int(raw)

    mapping = _get_books_table_mapping(con)
    id_col = mapping["id_col"]
    name_col = mapping["name_col"]
    key_col = mapping["key_col"]
    norm = _normalize_book_key(raw)

    row = con.execute(
        f"SELECT {id_col} AS id FROM books WHERE LOWER({name_col}) = LOWER(?) LIMIT 1",
        (raw,),
    ).fetchone()
    if row:
        return int(row["id"])

    row = con.execute(
        f"SELECT {id_col} AS id FROM books WHERE REPLACE(LOWER({name_col}), ' ', '') = ? LIMIT 1",
        (norm,),
    ).fetchone()
    if row:
        return int(row["id"])

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
        tables = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        table_names = [t["name"] for t in tables]
        if "books" not in table_names or "verses" not in table_names:
            raise HTTPException(
                status_code=500, detail=f"Missing tables. Found: {table_names}"
            )

        vcols = set([c.lower() for c in _get_table_columns(con, "verses")])
        needed = {"book_id", "chapter", "verse", "text"}
        if not needed.issubset(vcols):
            raise HTTPException(
                status_code=500,
                detail=f"verses table missing columns. Found: {sorted(vcols)}",
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
            books.append(
                {
                    "id": int(r["id"]),
                    "name": str(r["name"]),
                    "key": str(r["book_key"]) if "book_key" in r.keys() else None,
                }
            )

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
            raise HTTPException(
                status_code=404, detail=f"No chapters for book_id={book_id}"
            )
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
            raise HTTPException(
                status_code=404, detail=f"No verses for book_id={book_id} ch={chapter}"
            )
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
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")

    con = _db()
    try:
        book_id = _resolve_book_id(con, book)

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
            if not

