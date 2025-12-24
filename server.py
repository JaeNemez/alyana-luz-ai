import os
import sqlite3
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# -----------------------------
# Paths
# -----------------------------
ROOT_DIR = Path(__file__).resolve().parent
DATA_DIR = ROOT_DIR / "data"
FRONTEND_DIR = ROOT_DIR / "frontend"

INDEX_HTML = FRONTEND_DIR / "index.html"
APP_JS = FRONTEND_DIR / "app.js"
MANIFEST = FRONTEND_DIR / "manifest.webmanifest"
SERVICE_WORKER = FRONTEND_DIR / "service-worker.js"
ICONS_DIR = FRONTEND_DIR / "icons"

# -----------------------------
# Bible DB Versions (MATCH FRONTEND KEYS)
# -----------------------------
BIBLE_VERSIONS: Dict[str, Dict[str, Any]] = {
    "kjv": {
        "label": "KJV (English, local)",
        "path": DATA_DIR / "bible.db",
    },
    # IMPORTANT: frontend expects rvr1909 key; we map it to your Spanish DB file.
    "rvr1909": {
        "label": "RVR 1909 (Español, local)",
        "path": DATA_DIR / "bible_es_rvr.db",
    },
}

DEFAULT_BIBLE_VERSION = os.getenv("BIBLE_DEFAULT_VERSION", "kjv")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# Helpers
# -----------------------------
def resolve_version(version: Optional[str]) -> str:
    v = (version or DEFAULT_BIBLE_VERSION).strip()

    # Alias support (just in case your frontend uses slightly different strings)
    aliases = {
        "en_default": "kjv",
        "es_rvr": "rvr1909",
        "rvr": "rvr1909",
    }
    v = aliases.get(v, v)

    if v not in BIBLE_VERSIONS:
        raise HTTPException(status_code=400, detail=f"Unknown version '{v}'")
    return v

def db_path_for(version: str) -> Path:
    return Path(BIBLE_VERSIONS[version]["path"]).resolve()

def ensure_db_exists(p: Path):
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Bible DB not found at {str(p)}")

def open_db(p: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(p))
    con.row_factory = sqlite3.Row
    return con

# -----------------------------
# Frontend routes
# -----------------------------
@app.get("/", include_in_schema=False)
def serve_index():
    if not INDEX_HTML.exists():
        return JSONResponse(
            status_code=500,
            content={"detail": f"frontend/index.html not found at {str(INDEX_HTML)}"},
        )
    return FileResponse(str(INDEX_HTML))

@app.get("/app.js", include_in_schema=False)
def serve_app_js():
    if not APP_JS.exists():
        raise HTTPException(status_code=404, detail="app.js not found")
    return FileResponse(str(APP_JS))

@app.get("/manifest.webmanifest", include_in_schema=False)
def serve_manifest():
    if not MANIFEST.exists():
        raise HTTPException(status_code=404, detail="manifest.webmanifest not found")
    return FileResponse(str(MANIFEST))

@app.get("/service-worker.js", include_in_schema=False)
def serve_service_worker():
    if not SERVICE_WORKER.exists():
        raise HTTPException(status_code=404, detail="service-worker.js not found")
    return FileResponse(str(SERVICE_WORKER))

@app.get("/icons/{icon_name}", include_in_schema=False)
def serve_icons(icon_name: str):
    p = (ICONS_DIR / icon_name).resolve()
    if ICONS_DIR.resolve() not in p.parents:
        raise HTTPException(status_code=400, detail="Invalid icon path")
    if not p.exists():
        raise HTTPException(status_code=404, detail="Icon not found")
    return FileResponse(str(p))

# -----------------------------
# API
# -----------------------------
@app.get("/me")
def me():
    return {"ok": True}

@app.get("/bible/versions")
def bible_versions():
    versions = []
    for k, meta in BIBLE_VERSIONS.items():
        p = Path(meta["path"]).resolve()
        versions.append(
            {
                "key": k,
                "label": meta["label"],
                "path": str(p),
                "exists": p.exists(),
            }
        )
    return {"default": DEFAULT_BIBLE_VERSION, "versions": versions}

@app.get("/bible/status")
def bible_status(version: Optional[str] = Query(default=None)):
    v = resolve_version(version)
    p = db_path_for(v)
    ensure_db_exists(p)

    con = open_db(p)
    try:
        verse_count = con.execute("SELECT COUNT(*) AS c FROM verses").fetchone()["c"]
    finally:
        con.close()

    return {
        "status": "ok",
        "version": v,
        "db_path": str(p),
        "verse_count": verse_count,
    }

@app.get("/bible/books")
def bible_books(version: Optional[str] = Query(default=None)):
    v = resolve_version(version)
    p = db_path_for(v)
    ensure_db_exists(p)

    con = open_db(p)
    try:
        rows = con.execute("SELECT id, name FROM books ORDER BY id").fetchall()
        books = [{"id": r["id"], "name": r["name"]} for r in rows]
    finally:
        con.close()

    return {"version": v, "books": books}

@app.get("/bible/chapters")
def bible_chapters(
    book_id: int = Query(...),
    version: Optional[str] = Query(default=None),
):
    v = resolve_version(version)
    p = db_path_for(v)
    ensure_db_exists(p)

    con = open_db(p)
    try:
        row = con.execute(
            "SELECT MAX(chapter) AS max_ch FROM verses WHERE book_id=?",
            (book_id,),
        ).fetchone()
        max_ch = row["max_ch"] or 0
    finally:
        con.close()

    if max_ch == 0:
        raise HTTPException(status_code=404, detail="Missing book")

    return {"version": v, "book_id": book_id, "chapters": list(range(1, max_ch + 1))}

@app.get("/bible/text")
def bible_text(
    book_id: int = Query(...),
    chapter: int = Query(...),
    start_verse: Optional[int] = Query(default=None),
    end_verse: Optional[int] = Query(default=None),
    version: Optional[str] = Query(default=None),
):
    v = resolve_version(version)
    p = db_path_for(v)
    ensure_db_exists(p)

    sv = start_verse if start_verse and start_verse > 0 else None
    ev = end_verse if end_verse and end_verse > 0 else None

    con = open_db(p)
    try:
        book_row = con.execute("SELECT name FROM books WHERE id=?", (book_id,)).fetchone()
        if not book_row:
            raise HTTPException(status_code=404, detail="Missing book")

        book_name = book_row["name"]

        q = """
        SELECT verse, text
        FROM verses
        WHERE book_id=? AND chapter=?
        """
        params: List[Any] = [book_id, chapter]

        if sv is not None:
            q += " AND verse >= ?"
            params.append(sv)
        if ev is not None:
            q += " AND verse <= ?"
            params.append(ev)

        q += " ORDER BY verse"

        rows = con.execute(q, tuple(params)).fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail="No verses found")

        verses = [{"verse": r["verse"], "text": r["text"]} for r in rows]
    finally:
        con.close()

    return {
        "version": v,
        "book_id": book_id,
        "book_name": book_name,
        "chapter": chapter,
        "verses": verses,
    }

@app.get("/devotional")
def devotional():
    return {"ok": True, "devotional": "Coming soon."}

@app.get("/daily_prayer")
def daily_prayer():
    return {"ok": True, "prayer": "Coming soon."}

@app.post("/chat")
async def chat(req: Request):
    body = await req.json()
    user_message = body.get("message", "")
    return {"ok": True, "reply": f"(stub) You said: {user_message}"}







