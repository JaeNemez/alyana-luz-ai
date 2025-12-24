# server.py
import os
import json
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# --- Optional: your Gemini agent (keep your existing agent.py as-is) ---
try:
    from agent import run_bible_ai  # type: ignore
except Exception:
    run_bible_ai = None  # allows Bible-only endpoints to work even if agent import fails


APP_TITLE = "Alyana Luz • Bible AI"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

# IMPORTANT:
# Render path shown in your screenshots is: /opt/render/project/src/...
# This code uses relative paths so it works both locally and on Render.
BIBLE_VERSIONS: Dict[str, Dict[str, str]] = {
    "en_default": {
        "label": "KJV (English, local)",
        "lang": "en",
        "path": os.path.join(DATA_DIR, "bible.db"),
    },
    "es_rvr": {
        "label": "RVR (Español, local)",
        "lang": "es",
        "path": os.path.join(DATA_DIR, "bible_es_rvr.db"),
    },
}

DEFAULT_VERSION_BY_LANG = {
    "en": "en_default",
    "es": "es_rvr",
}


def _db_exists(path: str) -> bool:
    return bool(path) and os.path.isfile(path)


def _connect(db_path: str) -> sqlite3.Connection:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con


def _detect_lang(request: Request) -> str:
    # Frontend can send:
    # - ?lang=es
    # - header: x-lang: es
    # - Accept-Language: es-ES,es;q=0.9,en;q=0.8
    lang_q = request.query_params.get("lang")
    if lang_q:
        return lang_q.strip().lower()[:2]

    hdr = request.headers.get("x-lang")
    if hdr:
        return hdr.strip().lower()[:2]

    al = request.headers.get("accept-language", "")
    al = al.strip().lower()
    if al.startswith("es"):
        return "es"
    if al.startswith("en"):
        return "en"
    return "en"


def _pick_version(request: Request, version: Optional[str]) -> str:
    """
    Priority:
      1) explicit ?version=...
      2) language-derived default (?lang=..., x-lang, Accept-Language)
      3) fallback to en_default
    """
    if version and version in BIBLE_VERSIONS:
        return version

    lang = _detect_lang(request)
    v = DEFAULT_VERSION_BY_LANG.get(lang, "en_default")
    return v if v in BIBLE_VERSIONS else "en_default"


def _get_db_path(version_key: str) -> str:
    info = BIBLE_VERSIONS.get(version_key)
    if not info:
        raise HTTPException(status_code=400, detail=f"Unknown Bible version: {version_key}")
    return info["path"]


def _ensure_schema(con: sqlite3.Connection) -> None:
    # Your DB schema is:
    # tables: books(id,name) and verses(book_id,chapter,verse,text)
    tables = {r["name"] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "books" not in tables or "verses" not in tables:
        raise HTTPException(status_code=500, detail="Bible DB schema invalid (missing tables).")


def _verse_count(con: sqlite3.Connection) -> int:
    row = con.execute("SELECT COUNT(*) AS c FROM verses").fetchone()
    return int(row["c"]) if row else 0


def _resolve_book_id(con: sqlite3.Connection, book: Any) -> int:
    """
    Accepts:
      - book_id as int or numeric string
      - book name as string (case-insensitive)
    """
    if book is None:
        raise HTTPException(status_code=400, detail="Missing book")

    # numeric book id
    if isinstance(book, int):
        book_id = book
        row = con.execute("SELECT id FROM books WHERE id=?", (book_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Missing book")
        return book_id

    if isinstance(book, str):
        s = book.strip()
        if s.isdigit():
            book_id = int(s)
            row = con.execute("SELECT id FROM books WHERE id=?", (book_id,)).fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Missing book")
            return book_id

        # name lookup (case-insensitive)
        row = con.execute(
            "SELECT id FROM books WHERE lower(name)=lower(?) LIMIT 1",
            (s,),
        ).fetchone()
        if row:
            return int(row["id"])

        # fallback: contains match
        row = con.execute(
            "SELECT id FROM books WHERE lower(name) LIKE lower(?) ORDER BY id LIMIT 1",
            (f"%{s}%",),
        ).fetchone()
        if row:
            return int(row["id"])

    raise HTTPException(status_code=404, detail="Missing book")


app = FastAPI(title=APP_TITLE)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ok for now; lock down later if desired
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the PWA frontend if present
if os.path.isdir(FRONTEND_DIR):
    app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR), name="frontend")


@app.get("/")
def root():
    # Prefer frontend/index.html if you use the /frontend mount
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    # fallback to root index.html
    root_index = os.path.join(BASE_DIR, "index.html")
    if os.path.isfile(root_index):
        return FileResponse(root_index)
    return {"ok": True, "app": APP_TITLE}


@app.get("/me")
def me():
    # keep it simple; your existing auth logic can replace this
    return {"ok": True}


# --------------------
# Bible versioning APIs
# --------------------
@app.get("/bible/versions")
def bible_versions():
    versions = []
    default = "en_default"
    for k, v in BIBLE_VERSIONS.items():
        versions.append(
            {
                "key": k,
                "label": v["label"],
                "lang": v["lang"],
                "path": v["path"],
                "exists": _db_exists(v["path"]),
            }
        )
        if k == "en_default":
            default = k
    return {"default": default, "versions": versions}


@app.get("/bible/status")
def bible_status(request: Request, version: Optional[str] = None):
    vkey = _pick_version(request, version)
    db_path = _get_db_path(vkey)

    if not _db_exists(db_path):
        raise HTTPException(status_code=404, detail=f"Bible DB not found at {db_path}")

    con = _connect(db_path)
    try:
        _ensure_schema(con)
        vc = _verse_count(con)
    finally:
        con.close()

    return {
        "status": "ok",
        "version": vkey,
        "db_path": db_path,
        "verse_count": vc,
    }


@app.get("/bible/books")
def bible_books(request: Request, version: Optional[str] = None):
    """
    This endpoint MUST switch by version/language.
    This is the fix for your current “Missing book” Spanish screen.
    """
    vkey = _pick_version(request, version)
    db_path = _get_db_path(vkey)

    if not _db_exists(db_path):
        raise HTTPException(status_code=404, detail=f"Bible DB not found at {db_path}")

    con = _connect(db_path)
    try:
        _ensure_schema(con)
        rows = con.execute("SELECT id, name FROM books ORDER BY id").fetchall()
        books = [{"id": int(r["id"]), "name": r["name"]} for r in rows]
        return {"version": vkey, "books": books}
    finally:
        con.close()


@app.get("/bible/chapters")
def bible_chapters(
    request: Request,
    book: Any = Query(..., description="Book id (int) or book name (string)"),
    version: Optional[str] = None,
):
    vkey = _pick_version(request, version)
    db_path = _get_db_path(vkey)

    if not _db_exists(db_path):
        raise HTTPException(status_code=404, detail=f"Bible DB not found at {db_path}")

    con = _connect(db_path)
    try:
        _ensure_schema(con)
        book_id = _resolve_book_id(con, book)
        rows = con.execute(
            "SELECT DISTINCT chapter FROM verses WHERE book_id=? ORDER BY chapter",
            (book_id,),
        ).fetchall()
        chapters = [int(r["chapter"]) for r in rows]
        return {"version": vkey, "book_id": book_id, "chapters": chapters}
    finally:
        con.close()


@app.get("/bible/text")
def bible_text(
    request: Request,
    book: Any = Query(..., description="Book id (int) or book name (string)"),
    chapter: int = Query(..., ge=1),
    start: Optional[int] = Query(None, ge=1),
    end: Optional[int] = Query(None, ge=1),
    full: bool = Query(False, description="If true, ignore start/end and return full chapter"),
    version: Optional[str] = None,
):
    vkey = _pick_version(request, version)
    db_path = _get_db_path(vkey)

    if not _db_exists(db_path):
        raise HTTPException(status_code=404, detail=f"Bible DB not found at {db_path}")

    con = _connect(db_path)
    try:
        _ensure_schema(con)
        book_id = _resolve_book_id(con, book)

        if full or (start is None and end is None):
            rows = con.execute(
                """
                SELECT verse, text
                FROM verses
                WHERE book_id=? AND chapter=?
                ORDER BY verse
                """,
                (book_id, chapter),
            ).fetchall()
        else:
            s = start if start is not None else 1
            e = end if end is not None else s
            if e < s:
                s, e = e, s
            rows = con.execute(
                """
                SELECT verse, text
                FROM verses
                WHERE book_id=? AND chapter=? AND verse BETWEEN ? AND ?
                ORDER BY verse
                """,
                (book_id, chapter, s, e),
            ).fetchall()

        # book name for UI
        b = con.execute("SELECT name FROM books WHERE id=? LIMIT 1", (book_id,)).fetchone()
        book_name = b["name"] if b else str(book_id)

        verses = [{"verse": int(r["verse"]), "text": r["text"]} for r in rows]
        return {
            "version": vkey,
            "book_id": book_id,
            "book_name": book_name,
            "chapter": chapter,
            "verses": verses,
        }
    finally:
        con.close()


# --------------------
# AI endpoints (Chat / Devotional / Prayer)
# --------------------
@app.post("/chat")
async def chat(request: Request):
    if run_bible_ai is None:
        raise HTTPException(status_code=500, detail="AI agent not available (agent.py import failed).")

    payload = await request.json()
    user_text = (payload.get("message") or "").strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Missing message")

    lang = (payload.get("lang") or _detect_lang(request) or "en").strip().lower()[:2]
    # You can also pass chosen Bible version to your agent if you want:
    version = payload.get("version")
    vkey = _pick_version(request, version)

    # Let your agent decide language behavior; we pass it explicitly.
    # If your run_bible_ai signature differs, adjust this call to match your agent.py.
    try:
        result = run_bible_ai(user_text, lang=lang, bible_version=vkey)  # type: ignore
    except TypeError:
        # Backward compatibility if your agent doesn't accept those kwargs yet
        result = run_bible_ai(user_text)  # type: ignore

    # normalize output
    if isinstance(result, dict):
        return result
    return {"reply": str(result)}


@app.get("/devotional")
async def devotional(request: Request, lang: Optional[str] = None):
    if run_bible_ai is None:
        raise HTTPException(status_code=500, detail="AI agent not available (agent.py import failed).")
    lg = (lang or _detect_lang(request) or "en").strip().lower()[:2]
    prompt = "Write a short devotional with a Bible verse, reflection, and prayer."
    if lg == "es":
        prompt = "Escribe un devocional corto con un versículo bíblico, reflexión y oración."
    try:
        result = run_bible_ai(prompt, lang=lg)  # type: ignore
    except TypeError:
        result = run_bible_ai(prompt)  # type: ignore
    return result if isinstance(result, dict) else {"text": str(result)}


@app.get("/daily_prayer")
async def daily_prayer(request: Request, lang: Optional[str] = None):
    if run_bible_ai is None:
        raise HTTPException(status_code=500, detail="AI agent not available (agent.py import failed).")
    lg = (lang or _detect_lang(request) or "en").strip().lower()[:2]
    prompt = "Write a short daily prayer."
    if lg == "es":
        prompt = "Escribe una oración diaria corta."
    try:
        result = run_bible_ai(prompt, lang=lg)  # type: ignore
    except TypeError:
        result = run_bible_ai(prompt)  # type: ignore
    return result if isinstance(result, dict) else {"text": str(result)}




