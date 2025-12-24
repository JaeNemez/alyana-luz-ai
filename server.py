# server.py
# Alyana Luz • Bible AI (FastAPI)
#
# What this update does:
# 1) Fixes Spanish AI responses everywhere (chat / devotional / daily prayer) via lang forcing.
# 2) Adds FREE multi-local-DB Bible version support (multiple SQLite files in /data).
#    - You can drop new DB files into ./data (ex: rvr1909.db) with no API cost.
#    - Server exposes /bible/versions and accepts ?version=... on bible endpoints.
# 3) Makes Bible endpoints match the frontend/app.js you’re using now:
#    - GET  /bible/health
#    - GET  /bible/versions
#    - GET  /bible/books?version=
#    - GET  /bible/chapters?book=Genesis&version=
#    - GET  /bible/passage?book=Genesis&chapter=1&full_chapter=true&start=1&end=&version=
# 4) Fixes “[object Object]” style bible output issues by always returning {reference, text}
#
# IMPORTANT NOTE:
# - Your current bible.db appears to be ENGLISH. Spanish will NOT appear in Read Bible
#   until you add a Spanish DB (example: data/rvr1909.db) and select it using ?version=rvr1909.
# - The AI Spanish replies are independent of the Bible DB language.

import os
import json
import time
import sqlite3
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, Body, Query, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


# -----------------------------
# APP
# -----------------------------
app = FastAPI(title="Alyana Luz • Bible AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later if you want
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")


# -----------------------------
# AI (Agent)
# -----------------------------
# Your agent.py (Gemini-based) should expose run_bible_ai(prompt: str) -> str
try:
    from agent import run_bible_ai  # type: ignore
except Exception:
    run_bible_ai = None  # type: ignore


def force_language(prefix_lang: str, text: str) -> str:
    """
    Ensures the model replies ONLY in the requested language by hard prefixing.
    """
    if prefix_lang == "es":
        return f"IMPORTANTE: Responde SOLO en español.\n\n{text}"
    return f"IMPORTANT: Reply ONLY in English.\n\n{text}"


def safe_json_dumps(obj: Any) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return json.dumps({"error": "Could not serialize"})


# Very simple daily in-memory cache (optional)
_CACHE: Dict[str, Dict[str, Any]] = {}


def cache_get(key: str) -> Optional[Dict[str, Any]]:
    v = _CACHE.get(key)
    if not v:
        return None
    return v


def cache_set(key: str, payload: Dict[str, Any]) -> None:
    _CACHE[key] = payload


def today_key() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())


# -----------------------------
# BIBLE VERSIONS (multi-DB, free)
# -----------------------------
def normalize_key(s: str) -> str:
    s = s.strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.replace("&", "and")
    s = "".join(ch if ch.isalnum() else " " for ch in s)
    s = " ".join(s.split())
    return s


def version_registry() -> Dict[str, Dict[str, str]]:
    """
    Configure your Bible DB files here.
    Put the actual sqlite files in ./data.

    Current default DB:
      data/bible.db  (your existing one — looks like KJV/English)

    Add more:
      data/rvr1909.db   (Spanish)
      data/web.db       (English WEB)
      etc.
    """
    return {
        "kjv": {
            "label": "KJV (English, local)",
            "lang": "en",
            "path": os.path.join(DATA_DIR, "bible.db"),
        },
        # Add your Spanish DB file here when you have it:
        "rvr1909": {
            "label": "RVR 1909 (Español, local)",
            "lang": "es",
            "path": os.path.join(DATA_DIR, "rvr1909.db"),
        },
        # Example placeholder:
        # "rv1960": {"label":"RVR 1960 (Español, local)","lang":"es","path":os.path.join(DATA_DIR,"rv1960.db")},
    }


def available_versions() -> List[Dict[str, Any]]:
    out = []
    for vid, meta in version_registry().items():
        path = meta["path"]
        out.append(
            {
                "id": vid,
                "label": meta["label"],
                "lang": meta["lang"],
                "exists": os.path.isfile(path),
            }
        )
    return out


def pick_default_version(lang: str) -> str:
    """
    If user is in Spanish, prefer a Spanish DB IF it exists.
    Else fallback to KJV.
    """
    versions = version_registry()
    if lang == "es":
        for vid, meta in versions.items():
            if meta.get("lang") == "es" and os.path.isfile(meta["path"]):
                return vid
    return "kjv"


def get_db_path(version: Optional[str], lang: str) -> Tuple[str, Dict[str, str]]:
    versions = version_registry()
    vid = (version or "").strip() or pick_default_version(lang)
    if vid not in versions:
        raise HTTPException(status_code=400, detail=f"Unknown version '{vid}'. Use /bible/versions.")
    meta = versions[vid]
    path = meta["path"]
    if not os.path.isfile(path):
        # version exists in registry but file not present yet
        raise HTTPException(
            status_code=400,
            detail=f"Bible DB file missing for version '{vid}'. Expected: {os.path.basename(path)} in /data",
        )
    return path, meta


def open_db(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def detect_schema(conn: sqlite3.Connection) -> Dict[str, Any]:
    """
    Tries to adapt to common Bible sqlite schemas.
    We support:
      - books table: (id, name) or (book_id, name)
      - verses table: with columns like book_id/book, chapter, verse, text/scripture/content
    """
    cur = conn.cursor()
    tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}

    def cols(table: str) -> List[str]:
        try:
            rows = cur.execute(f"PRAGMA table_info({table})").fetchall()
            return [r[1] for r in rows]
        except Exception:
            return []

    schema = {"tables": list(tables), "books_table": None, "verses_table": None, "books_cols": [], "verses_cols": []}

    # pick books table
    for t in ["books", "book", "bible_books"]:
        if t in tables:
            schema["books_table"] = t
            schema["books_cols"] = cols(t)
            break

    # pick verses table
    for t in ["verses", "verse", "bible_verses", "scriptures"]:
        if t in tables:
            schema["verses_table"] = t
            schema["verses_cols"] = cols(t)
            break

    return schema


def books_list(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    schema = detect_schema(conn)
    bt = schema["books_table"]
    if not bt:
        # fallback: infer from verses table if no books table
        vt = schema["verses_table"]
        if not vt:
            return []
        vcols = schema["verses_cols"]
        book_col = "book"
        if "book_id" in vcols:
            book_col = "book_id"
        elif "book" in vcols:
            book_col = "book"
        elif "b" in vcols:
            book_col = "b"

        rows = conn.execute(f"SELECT DISTINCT {book_col} AS b FROM {vt} ORDER BY b").fetchall()
        return [{"id": r["b"], "name": str(r["b"]), "key": normalize_key(str(r["b"]))} for r in rows]

    bcols = schema["books_cols"]
    id_col = "id" if "id" in bcols else ("book_id" if "book_id" in bcols else bcols[0])
    name_col = "name" if "name" in bcols else ("title" if "title" in bcols else bcols[-1])

    rows = conn.execute(f"SELECT {id_col} AS id, {name_col} AS name FROM {bt} ORDER BY id").fetchall()
    out = []
    for r in rows:
        name = str(r["name"])
        out.append({"id": r["id"], "name": name, "key": normalize_key(name)})
    return out


def resolve_book_id(conn: sqlite3.Connection, book_name: str) -> Tuple[Optional[int], str]:
    """
    Returns (book_id, display_name).
    If schema has books table, we match by name loosely.
    Otherwise we return None and use book_name directly in verses queries.
    """
    schema = detect_schema(conn)
    bt = schema["books_table"]
    if not bt:
        return None, book_name

    bcols = schema["books_cols"]
    id_col = "id" if "id" in bcols else ("book_id" if "book_id" in bcols else bcols[0])
    name_col = "name" if "name" in bcols else ("title" if "title" in bcols else bcols[-1])

    target = normalize_key(book_name)

    rows = conn.execute(f"SELECT {id_col} AS id, {name_col} AS name FROM {bt}").fetchall()
    # exact normalized match
    for r in rows:
        if normalize_key(str(r["name"])) == target:
            return int(r["id"]), str(r["name"])
    # contains match
    for r in rows:
        if target in normalize_key(str(r["name"])):
            return int(r["id"]), str(r["name"])
    # fallback: first row
    if rows:
        return int(rows[0]["id"]), str(rows[0]["name"])

    return None, book_name


def chapters_for_book(conn: sqlite3.Connection, book_name: str) -> List[int]:
    schema = detect_schema(conn)
    vt = schema["verses_table"]
    if not vt:
        return []

    vcols = schema["verses_cols"]

    # determine columns
    chapter_col = "chapter" if "chapter" in vcols else ("c" if "c" in vcols else None)
    if not chapter_col:
        return []

    book_id, _ = resolve_book_id(conn, book_name)

    # book column selection
    book_col = None
    if "book_id" in vcols:
        book_col = "book_id"
    elif "book" in vcols:
        book_col = "book"
    elif "b" in vcols:
        book_col = "b"

    if not book_col:
        return []

    if book_id is not None and book_col == "book_id":
        rows = conn.execute(
            f"SELECT DISTINCT {chapter_col} AS ch FROM {vt} WHERE {book_col}=? ORDER BY ch",
            (book_id,),
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT DISTINCT {chapter_col} AS ch FROM {vt} WHERE {book_col}=? ORDER BY ch",
            (book_name,),
        ).fetchall()

    out = []
    for r in rows:
        try:
            out.append(int(r["ch"]))
        except Exception:
            pass
    return out


def passage_text(
    conn: sqlite3.Connection,
    book_name: str,
    chapter: int,
    full_chapter: bool,
    start: int,
    end: Optional[int],
) -> Tuple[str, str]:
    schema = detect_schema(conn)
    vt = schema["verses_table"]
    if not vt:
        raise HTTPException(status_code=500, detail="Bible DB missing verses table.")

    vcols = schema["verses_cols"]

    # columns
    chapter_col = "chapter" if "chapter" in vcols else ("c" if "c" in vcols else None)
    verse_col = "verse" if "verse" in vcols else ("v" if "v" in vcols else None)
    text_col = None
    for cand in ["text", "scripture", "content", "t"]:
        if cand in vcols:
            text_col = cand
            break

    if not chapter_col or not verse_col or not text_col:
        raise HTTPException(status_code=500, detail="Bible DB schema not supported (missing chapter/verse/text columns).")

    # book columns
    book_col = None
    if "book_id" in vcols:
        book_col = "book_id"
    elif "book" in vcols:
        book_col = "book"
    elif "b" in vcols:
        book_col = "b"

    if not book_col:
        raise HTTPException(status_code=500, detail="Bible DB schema not supported (missing book column).")

    book_id, display_book = resolve_book_id(conn, book_name)

    params: List[Any] = []
    where = f"{chapter_col}=?"
    params.append(int(chapter))

    if book_id is not None and book_col == "book_id":
        where = f"{book_col}=? AND " + where
        params.insert(0, int(book_id))
    else:
        where = f"{book_col}=? AND " + where
        params.insert(0, book_name)

    if full_chapter:
        # entire chapter
        q = f"""
            SELECT {verse_col} AS v, {text_col} AS t
            FROM {vt}
            WHERE {where}
            ORDER BY v
        """
    else:
        # passage range
        s = max(int(start), 1)
        e = int(end) if end is not None else s
        if e < s:
            e = s
        where2 = where + f" AND {verse_col}>=? AND {verse_col}<=?"
        params2 = params + [s, e]
        q = f"""
            SELECT {verse_col} AS v, {text_col} AS t
            FROM {vt}
            WHERE {where2}
            ORDER BY v
        """
        params = params2

    rows = conn.execute(q, tuple(params)).fetchall()
    if not rows:
        ref = f"{display_book} {chapter}"
        return ref, ""

    verses = []
    for r in rows:
        vnum = r["v"]
        txt = r["t"]
        verses.append(f"{vnum} {txt}")

    # Build reference
    if full_chapter:
        ref = f"{display_book} {chapter}"
    else:
        s = max(int(start), 1)
        e = int(end) if end is not None else s
        ref = f"{display_book} {chapter}:{s}-{e}"

    return ref, "\n".join(verses)


# -----------------------------
# STATIC FRONTEND
# -----------------------------
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def root():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return JSONResponse({"ok": True, "message": "Frontend not found. Put index.html in /frontend."})


# -----------------------------
# ACCOUNT (simple stub)
# -----------------------------
@app.get("/me")
def me():
    # If you add real auth later, replace this.
    email = os.environ.get("ALYANA_EMAIL") or os.environ.get("USER_EMAIL") or None
    return {"email": email, "active": True if email else False}


# -----------------------------
# CHAT
# -----------------------------
@app.post("/chat")
def chat(payload: Dict[str, Any] = Body(...)):
    if run_bible_ai is None:
        raise HTTPException(status_code=500, detail="agent.py not available or failed to import run_bible_ai().")

    prompt = str(payload.get("prompt") or "").strip()
    history = payload.get("history") or []

    # Determine lang:
    # - If prompt already includes the language instruction, good.
    # - Otherwise infer from prompt markers. (Frontend adds instruction now.)
    lang = "es" if "Responde SOLO en español" in prompt or "español" in prompt.lower() else "en"

    # Build a single prompt for the agent (history + new prompt)
    # Keep it readable and stable.
    history_lines = []
    if isinstance(history, list):
        for m in history[-16:]:
            role = (m or {}).get("role", "")
            content = (m or {}).get("content", "")
            if role in ("user", "assistant") and str(content).strip():
                history_lines.append(f"{role.upper()}: {content}")

    combined = ""
    if history_lines:
        combined += "Conversation so far:\n" + "\n".join(history_lines) + "\n\n"

    combined += "User:\n" + prompt

    combined = force_language(lang, combined)

    try:
        reply = run_bible_ai(combined)
        return {"message": str(reply)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {e}")


# -----------------------------
# DEVOTIONAL (returns { json: "<stringified JSON>" })
# -----------------------------
@app.post("/devotional")
def devotional(payload: Dict[str, Any] = Body(...)):
    if run_bible_ai is None:
        raise HTTPException(status_code=500, detail="agent.py not available or failed to import run_bible_ai().")

    lang = str(payload.get("lang") or "en").lower()
    lang = "es" if lang.startswith("es") else "en"

    cache_key = f"devotional:{today_key()}:{lang}"
    cached = cache_get(cache_key)
    if cached:
        return {"json": cached["json"], "cached": True}

    prompt = (
        "Create a short devotional suggestion in STRICT JSON with keys:\n"
        '  "scripture": string,\n'
        '  "brief_explanation": string\n'
        "No markdown. No extra keys.\n"
    )
    prompt = force_language(lang, prompt)

    try:
        text = run_bible_ai(prompt)
        # Ensure it is JSON; if model returns extra text, wrap in safe object
        parsed = None
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = {"scripture": "", "brief_explanation": str(text)}

        out_json = safe_json_dumps(parsed)
        cache_set(cache_key, {"json": out_json})
        return {"json": out_json, "cached": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Devotional error: {e}")


# -----------------------------
# DAILY PRAYER (returns { json: "<stringified JSON>" })
# -----------------------------
@app.post("/daily_prayer")
def daily_prayer(payload: Dict[str, Any] = Body(...)):
    if run_bible_ai is None:
        raise HTTPException(status_code=500, detail="agent.py not available or failed to import run_bible_ai().")

    lang = str(payload.get("lang") or "en").lower()
    lang = "es" if lang.startswith("es") else "en"

    cache_key = f"prayer:{today_key()}:{lang}"
    cached = cache_get(cache_key)
    if cached:
        return {"json": cached["json"], "cached": True}

    prompt = (
        "Create prayer starters in STRICT JSON with keys:\n"
        '  "example_adoration": string,\n'
        '  "example_confession": string,\n'
        '  "example_thanksgiving": string,\n'
        '  "example_supplication": string\n'
        "No markdown. No extra keys.\n"
    )
    prompt = force_language(lang, prompt)

    try:
        text = run_bible_ai(prompt)
        parsed = None
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = {
                "example_adoration": "",
                "example_confession": "",
                "example_thanksgiving": "",
                "example_supplication": str(text),
            }

        out_json = safe_json_dumps(parsed)
        cache_set(cache_key, {"json": out_json})
        return {"json": out_json, "cached": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Daily prayer error: {e}")


# -----------------------------
# BIBLE API
# -----------------------------
@app.get("/bible/versions")
def bible_versions():
    return {"versions": available_versions()}


@app.get("/bible/health")
def bible_health(version: Optional[str] = Query(default=None), lang: str = Query(default="en")):
    lang = "es" if str(lang).lower().startswith("es") else "en"
    path, meta = get_db_path(version, lang)

    try:
        conn = open_db(path)
        schema = detect_schema(conn)
        # attempt a verse count (best-effort)
        verse_count = None
        if schema["verses_table"]:
            vt = schema["verses_table"]
            verse_count = conn.execute(f"SELECT COUNT(1) AS n FROM {vt}").fetchone()["n"]
        conn.close()
        return {
            "status": "ok",
            "version": meta["label"],
            "version_id": version or pick_default_version(lang),
            "verse_count": verse_count,
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.get("/bible/books")
def bible_books(version: Optional[str] = Query(default=None), lang: str = Query(default="en")):
    lang = "es" if str(lang).lower().startswith("es") else "en"
    path, meta = get_db_path(version, lang)

    conn = open_db(path)
    try:
        books = books_list(conn)
        return {"version": meta["label"], "version_id": version or pick_default_version(lang), "books": books}
    finally:
        conn.close()


@app.get("/bible/chapters")
def bible_chapters(
    book: str = Query(...),
    version: Optional[str] = Query(default=None),
    lang: str = Query(default="en"),
):
    lang = "es" if str(lang).lower().startswith("es") else "en"
    path, meta = get_db_path(version, lang)

    conn = open_db(path)
    try:
        chapters = chapters_for_book(conn, book)
        return {"version": meta["label"], "version_id": version or pick_default_version(lang), "book": book, "chapters": chapters}
    finally:
        conn.close()


@app.get("/bible/passage")
def bible_passage(
    book: str = Query(...),
    chapter: int = Query(...),
    full_chapter: bool = Query(default=True),
    start: int = Query(default=1),
    end: Optional[int] = Query(default=None),
    version: Optional[str] = Query(default=None),
    lang: str = Query(default="en"),
):
    lang = "es" if str(lang).lower().startswith("es") else "en"
    path, meta = get_db_path(version, lang)

    conn = open_db(path)
    try:
        ref, txt = passage_text(conn, book, int(chapter), bool(full_chapter), int(start), end)
        return {
            "version": meta["label"],
            "version_id": version or pick_default_version(lang),
            "reference": ref,
            "text": txt,
        }
    finally:
        conn.close()


