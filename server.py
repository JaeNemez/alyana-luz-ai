# server.py
import os
import json
import sqlite3
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# Optional: your Gemini/agent integration (kept safe if missing)
try:
    from agent import run_bible_ai  # expected in your project
except Exception:
    run_bible_ai = None


APP_TITLE = "Alyana Luz • Bible AI"

# --- Paths (work on local + Render) ---
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
FRONTEND_DIR = BASE_DIR / "frontend"

# --- Bible DB versions (FREE + LOCAL) ---
# IMPORTANT: keys here must match what frontend sends as `version=...`
BIBLE_VERSIONS: Dict[str, Dict[str, str]] = {
    "en_default": {
        "label": "KJV (English, local)",
        "path": str(DATA_DIR / "bible.db"),
        "lang": "en",
    },
    "es_rvr": {
        "label": "RVR (Español, local)",
        "path": str(DATA_DIR / "bible_es_rvr.db"),
        "lang": "es",
    },
}
DEFAULT_VERSION_KEY = "en_default"


def _resolve_version(version: Optional[str]) -> str:
    if version and version in BIBLE_VERSIONS:
        return version
    return DEFAULT_VERSION_KEY


def _db_exists(db_path: str) -> bool:
    return Path(db_path).exists()


def _connect(db_path: str) -> sqlite3.Connection:
    if not _db_exists(db_path):
        raise FileNotFoundError(db_path)
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    return con


def _verse_count(con: sqlite3.Connection) -> int:
    row = con.execute("SELECT COUNT(*) AS c FROM verses").fetchone()
    return int(row["c"]) if row else 0


def _list_books(con: sqlite3.Connection) -> List[Dict[str, Any]]:
    rows = con.execute("SELECT id, name FROM books ORDER BY id").fetchall()
    return [{"id": int(r["id"]), "name": str(r["name"])} for r in rows]


def _chapters_for_book(con: sqlite3.Connection, book_id: int) -> List[int]:
    row = con.execute(
        "SELECT MAX(chapter) AS mx FROM verses WHERE book_id = ?",
        (book_id,),
    ).fetchone()
    mx = row["mx"] if row else None
    if mx is None:
        return []
    return list(range(1, int(mx) + 1))


def _get_passage(
    con: sqlite3.Connection,
    book_id: int,
    chapter: int,
    verse_start: Optional[int],
    verse_end: Optional[int],
) -> List[Dict[str, Any]]:
    params = [book_id, chapter]
    sql = """
        SELECT verse, text
        FROM verses
        WHERE book_id = ? AND chapter = ?
    """
    if verse_start is not None:
        sql += " AND verse >= ?"
        params.append(int(verse_start))
    if verse_end is not None:
        sql += " AND verse <= ?"
        params.append(int(verse_end))
    sql += " ORDER BY verse"

    rows = con.execute(sql, tuple(params)).fetchall()
    return [{"verse": int(r["verse"]), "text": str(r["text"])} for r in rows]


# --- FastAPI app ---
app = FastAPI(title=APP_TITLE)

# CORS (safe default for your PWA)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later if you want
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve PWA assets if present
if FRONTEND_DIR.exists():
    app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")

# Also serve icons/manifest/sw from /frontend at root-friendly paths
def _static_fallback_file(name: str) -> Optional[Path]:
    p1 = FRONTEND_DIR / name
    if p1.exists():
        return p1
    p2 = BASE_DIR / name
    if p2.exists():
        return p2
    return None


@app.get("/manifest.webmanifest")
def manifest():
    p = _static_fallback_file("manifest.webmanifest")
    if not p:
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(str(p), media_type="application/manifest+json")


@app.get("/service-worker.js")
def sw():
    p = _static_fallback_file("service-worker.js")
    if not p:
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(str(p), media_type="application/javascript")


@app.get("/icon-192.png")
def icon192():
    p = _static_fallback_file("icon-192.png")
    if not p:
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(str(p), media_type="image/png")


@app.get("/icons/icon-512.png")
def icon512():
    p = _static_fallback_file("icons/icon-512.png")
    if not p:
        raise HTTPException(status_code=404, detail="Not Found")
    return FileResponse(str(p), media_type="image/png")


@app.get("/", response_class=HTMLResponse)
def root():
    # Prefer frontend/index.html if it exists; otherwise root index.html
    candidates = [
        FRONTEND_DIR / "index.html",
        BASE_DIR / "index.html",
    ]
    for p in candidates:
        if p.exists():
            return FileResponse(str(p), media_type="text/html")
    return HTMLResponse("<h1>Alyana Luz • Bible AI</h1><p>index.html not found.</p>", status_code=200)


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/me")
def me():
    # Your frontend expects this route. Keep it simple and stable.
    return {"account": "active"}


# -----------------------------
# Bible: versions + status
# -----------------------------
@app.get("/bible/versions")
def bible_versions():
    versions = []
    for key, meta in BIBLE_VERSIONS.items():
        db_path = meta["path"]
        versions.append(
            {
                "key": key,
                "label": meta["label"],
                "lang": meta.get("lang", ""),
                "path": db_path,
                "exists": _db_exists(db_path),
            }
        )
    return {"default": DEFAULT_VERSION_KEY, "versions": versions}


@app.get("/bible/status")
def bible_status(version: Optional[str] = Query(default=None)):
    key = _resolve_version(version)
    meta = BIBLE_VERSIONS[key]
    db_path = meta["path"]

    if not _db_exists(db_path):
        return JSONResponse(
            status_code=404,
            content={
                "status": "missing",
                "version": key,
                "db_path": db_path,
                "detail": f"Bible DB not found at {db_path}",
            },
        )

    try:
        con = _connect(db_path)
        count = _verse_count(con)
        con.close()
        return {
            "status": "ok",
            "version": key,
            "db_path": db_path,
            "verse_count": count,
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "version": key,
                "db_path": db_path,
                "detail": str(e),
            },
        )


# -----------------------------
# Bible: books/chapters/text
# -----------------------------
@app.get("/bible/books")
def bible_books(version: Optional[str] = Query(default=None)):
    key = _resolve_version(version)
    db_path = BIBLE_VERSIONS[key]["path"]

    if not _db_exists(db_path):
        raise HTTPException(status_code=404, detail=f"Bible DB not found at {db_path}")

    con = _connect(db_path)
    books = _list_books(con)
    con.close()

    # return both structured + simple names to avoid frontend mismatches
    return {
        "version": key,
        "books": books,
        "names": [b["name"] for b in books],
    }


@app.get("/bible/chapters")
def bible_chapters(
    book_id: int = Query(...),
    version: Optional[str] = Query(default=None),
):
    key = _resolve_version(version)
    db_path = BIBLE_VERSIONS[key]["path"]

    if not _db_exists(db_path):
        raise HTTPException(status_code=404, detail=f"Bible DB not found at {db_path}")

    con = _connect(db_path)
    chapters = _chapters_for_book(con, int(book_id))
    con.close()

    if not chapters:
        raise HTTPException(status_code=404, detail="Missing book")

    return {"version": key, "book_id": int(book_id), "chapters": chapters}


@app.get("/bible/text")
def bible_text(
    book_id: int = Query(...),
    chapter: int = Query(...),
    verse_start: Optional[int] = Query(default=None),
    verse_end: Optional[int] = Query(default=None),
    version: Optional[str] = Query(default=None),
):
    key = _resolve_version(version)
    db_path = BIBLE_VERSIONS[key]["path"]

    if not _db_exists(db_path):
        raise HTTPException(status_code=404, detail=f"Bible DB not found at {db_path}")

    con = _connect(db_path)
    # book name
    b = con.execute("SELECT name FROM books WHERE id = ?", (int(book_id),)).fetchone()
    if not b:
        con.close()
        raise HTTPException(status_code=404, detail="Missing book")

    verses = _get_passage(con, int(book_id), int(chapter), verse_start, verse_end)
    con.close()

    if not verses:
        raise HTTPException(status_code=404, detail="Missing chapter/passage")

    # Provide both a structured list and a display string
    lines = [f"{v['verse']} {v['text']}" for v in verses]
    return {
        "version": key,
        "book_id": int(book_id),
        "book": str(b["name"]),
        "chapter": int(chapter),
        "verse_start": verse_start,
        "verse_end": verse_end,
        "verses": verses,
        "text": "\n".join(lines),
    }


# -----------------------------
# AI / Devotional / Prayer
# -----------------------------
@app.post("/chat")
def chat(payload: Dict[str, Any] = Body(default={})):
    """
    Expected frontend payload usually includes:
      - message (string)
      - lang (en/es)
    """
    message = (payload.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Missing message")

    lang = (payload.get("lang") or "").strip().lower()
    if lang not in ("en", "es"):
        # best effort: infer
        lang = "es" if any(ch in message for ch in "¿¡") else "en"

    if run_bible_ai is None:
        # Safe fallback if agent import fails
        if lang == "es":
            return {"reply": "El backend de IA no está disponible ahora mismo. Intenta de nuevo más tarde."}
        return {"reply": "AI backend is not available right now. Please try again later."}

    try:
        # If your agent supports language, pass it; otherwise it will ignore.
        reply = run_bible_ai(message=message, lang=lang)  # type: ignore
    except TypeError:
        reply = run_bible_ai(message)  # type: ignore
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"reply": reply, "lang": lang}


@app.get("/devotional")
def devotional(lang: str = "en"):
    lang = (lang or "en").lower()
    if lang == "es":
        return {
            "title": "Devocional del día",
            "content": "Permanece en la Palabra hoy. Pídele a Dios sabiduría y paz, y da un paso de obediencia.",
            "verse": "Salmo 119:105",
        }
    return {
        "title": "Devotional of the Day",
        "content": "Stay in the Word today. Ask God for wisdom and peace, and take one step of obedience.",
        "verse": "Psalm 119:105",
    }


@app.get("/daily_prayer")
def daily_prayer(lang: str = "en"):
    lang = (lang or "en").lower()
    if lang == "es":
        return {
            "title": "Oración diaria",
            "content": "Señor, guía mis pensamientos, mis palabras y mis decisiones. Ayúdame a caminar en tu luz. Amén.",
        }
    return {
        "title": "Daily Prayer",
        "content": "Lord, guide my thoughts, my words, and my decisions. Help me walk in Your light. Amen.",
    }


# -----------------------------
# Render entrypoint convenience
# -----------------------------
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=True)





