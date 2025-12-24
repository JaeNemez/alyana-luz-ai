from __future__ import annotations

from pathlib import Path
import os
import sqlite3
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# Bible API router
from bible_api import router as bible_router, DB_MAP

# Optional Gemini
GEMINI_AVAILABLE = False
try:
    from dotenv import load_dotenv
    from google import genai
    from google.genai import types
    GEMINI_AVAILABLE = True
except Exception:
    GEMINI_AVAILABLE = False


# -----------------------------
# Paths
# -----------------------------
ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
ICONS_DIR = FRONTEND_DIR / "icons"

INDEX_HTML = FRONTEND_DIR / "index.html"
APP_JS = FRONTEND_DIR / "app.js"
MANIFEST = FRONTEND_DIR / "manifest.webmanifest"
SERVICE_WORKER = FRONTEND_DIR / "service-worker.js"


# -----------------------------
# App
# -----------------------------
app = FastAPI()

# Register API routers FIRST
app.include_router(bible_router)

# CORS (tighten later)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# Helpers
# -----------------------------
def _safe_resolve_under(base: Path, target: Path) -> Path:
    base = base.resolve()
    target = target.resolve()
    if base not in target.parents and target != base:
        raise HTTPException(status_code=400, detail="Invalid path")
    return target

def _data_dir() -> Path:
    here = Path(__file__).resolve().parent
    return here / "data"

def _resolve_db_path(version: Optional[str]) -> Path:
    v = (version or "en_default").strip() or "en_default"
    filename = DB_MAP.get(v)
    if not filename:
        raise HTTPException(status_code=400, detail=f"Unknown version '{v}'. Allowed: {sorted(DB_MAP.keys())}")
    p = _data_dir() / filename
    if not p.exists():
        raise HTTPException(status_code=404, detail=f"Bible DB not found at {p}")
    return p

def _open_db(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(path))
    con.row_factory = sqlite3.Row
    return con

def _today_utc_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")

def _stable_index(day: str, version: str, modulo: int) -> int:
    h = hashlib.sha256(f"{day}|{version}".encode("utf-8")).hexdigest()
    n = int(h[:16], 16)
    return n % max(1, modulo)

def _get_daily_verse(con: sqlite3.Connection, version: str) -> Dict[str, Any]:
    row = con.execute("SELECT COUNT(*) AS c FROM verses").fetchone()
    total = int(row["c"]) if row and row["c"] is not None else 0
    if total <= 0:
        raise HTTPException(status_code=500, detail="Bible DB has no verses.")

    day = _today_utc_key()
    offset = _stable_index(day, version, total)

    v = con.execute(
        """
        SELECT v.book_id, v.chapter, v.verse, v.text
        FROM verses v
        ORDER BY v.ROWID
        LIMIT 1 OFFSET ?
        """,
        (offset,),
    ).fetchone()
    if not v:
        raise HTTPException(status_code=500, detail="Could not select daily verse.")

    b = con.execute("SELECT name FROM books WHERE id=? LIMIT 1", (int(v["book_id"]),)).fetchone()
    book_name = str(b["name"]) if b else str(v["book_id"])

    ref = f"{book_name} {int(v['chapter'])}:{int(v['verse'])}"
    scripture = str(v["text"])

    return {
        "day": day,
        "reference": ref,
        "scripture": scripture,
        "book": book_name,
        "chapter": int(v["chapter"]),
        "verse": int(v["verse"]),
    }

def _fallback_devotional(lang: str) -> Dict[str, Any]:
    if lang == "es":
        return {
            "theme": "Confiar en Dios hoy",
            "starters": {
                "context": "Ejemplo: Este pasaje me invita a depender de Dios y no de mis fuerzas.",
                "reflection": "Ejemplo: Dios es fiel aun cuando yo me siento inseguro.",
                "application": "Ejemplo: Hoy voy a obedecer a Dios en un paso específico.",
                "prayer": "Ejemplo: “Señor, ayúdame a confiar en Ti hoy…”",
            },
        }
    return {
        "theme": "Trusting God Today",
        "starters": {
            "context": "Example: This passage calls me to depend on God instead of my own strength.",
            "reflection": "Example: God is faithful even when I feel unsure.",
            "application": "Example: Today I will obey God in one specific step.",
            "prayer": "Example: “Lord, help me trust You today…”",
        },
    }

def _fallback_prayer(lang: str) -> Dict[str, Any]:
    # ACTS-style starters
    if lang == "es":
        return {
            "starters": {
                "adoration": "Ejemplo: “Padre, Tú eres santo, bueno y cercano…”",
                "confession": "Ejemplo: “Perdóname por ______ y límpiame…”",
                "thanksgiving": "Ejemplo: “Gracias por ______ y por cuidarme hoy…”",
                "supplication": "Ejemplo: “Te pido sabiduría y paz para ______ …”",
            }
        }
    return {
        "starters": {
            "adoration": 'Example: “Father, You are holy, faithful, and near…”',
            "confession": 'Example: “Forgive me for ______ and cleanse my heart…”',
            "thanksgiving": 'Example: “Thank You for ______ and for Your care today…”',
            "supplication": 'Example: “Please give me wisdom and peace for ______ …”',
        }
    }

def _gemini_generate_devotional(lang: str, reference: str, scripture: str) -> Dict[str, Any]:
    if not GEMINI_AVAILABLE:
        raise RuntimeError("Gemini not available")

    load_dotenv()
    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("No Gemini API key")

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    client = genai.Client(api_key=key)

    if lang == "es":
        sys = (
            "Eres Alyana Luz, una IA bíblica suave y alentadora.\n"
            "Devuelve SOLO: 1) un tema corto, 2) 4 ejemplos breves: contexto, reflexión, aplicación, oración.\n"
            "Cada ejemplo en 1–2 líneas. Sin explicaciones largas.\n"
        )
        user = (
            f"Pasaje del día:\n{reference}\n{scripture}\n\n"
            "Entrega exactamente este formato:\n"
            "THEME: ...\n"
            "CONTEXT: ...\n"
            "REFLECTION: ...\n"
            "APPLICATION: ...\n"
            "PRAYER: ...\n"
        )
    else:
        sys = (
            "You are Alyana Luz, a gentle encouraging Bible AI.\n"
            "Return ONLY: 1) a short theme, 2) 4 brief starters: context, reflection, application, prayer.\n"
            "Each starter 1–2 lines. No long explanations.\n"
        )
        user = (
            f"Daily passage:\n{reference}\n{scripture}\n\n"
            "Return exactly this format:\n"
            "THEME: ...\n"
            "CONTEXT: ...\n"
            "REFLECTION: ...\n"
            "APPLICATION: ...\n"
            "PRAYER: ...\n"
        )

    resp = client.models.generate_content(
        model=model,
        contents=[types.Part.from_text(sys + "\n\n" + user)],
    )
    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Empty Gemini response")

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out = {"theme": "", "starters": {"context": "", "reflection": "", "application": "", "prayer": ""}}

    def take(prefix: str) -> str:
        for ln in lines:
            if ln.upper().startswith(prefix):
                return ln.split(":", 1)[1].strip() if ":" in ln else ""
        return ""

    out["theme"] = take("THEME")
    out["starters"]["context"] = take("CONTEXT")
    out["starters"]["reflection"] = take("REFLECTION")
    out["starters"]["application"] = take("APPLICATION")
    out["starters"]["prayer"] = take("PRAYER")

    if not out["theme"]:
        raise RuntimeError("Gemini parse failed: theme missing")

    return out

def _gemini_generate_prayer(lang: str, reference: str, scripture: str) -> Dict[str, Any]:
    if not GEMINI_AVAILABLE:
        raise RuntimeError("Gemini not available")

    load_dotenv()
    key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("No Gemini API key")

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    client = genai.Client(api_key=key)

    if lang == "es":
        sys = (
            "Eres Alyana Luz, una IA bíblica suave y alentadora.\n"
            "Genera SOLO ejemplos breves para ACTS en español (1–2 líneas cada uno).\n"
            "No escribas la oración completa; solo starters cortos.\n"
        )
        user = (
            f"Pasaje del día:\n{reference}\n{scripture}\n\n"
            "Entrega exactamente este formato:\n"
            "ADORATION: ...\n"
            "CONFESSION: ...\n"
            "THANKSGIVING: ...\n"
            "SUPPLICATION: ...\n"
        )
    else:
        sys = (
            "You are Alyana Luz, a gentle encouraging Bible AI.\n"
            "Generate ONLY brief ACTS starters (1–2 lines each). Not a full prayer.\n"
        )
        user = (
            f"Daily passage:\n{reference}\n{scripture}\n\n"
            "Return exactly this format:\n"
            "ADORATION: ...\n"
            "CONFESSION: ...\n"
            "THANKSGIVING: ...\n"
            "SUPPLICATION: ...\n"
        )

    resp = client.models.generate_content(
        model=model,
        contents=[types.Part.from_text(sys + "\n\n" + user)],
    )
    text = (resp.text or "").strip()
    if not text:
        raise RuntimeError("Empty Gemini response")

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    out = {"starters": {"adoration": "", "confession": "", "thanksgiving": "", "supplication": ""}}

    def take(prefix: str) -> str:
        for ln in lines:
            if ln.upper().startswith(prefix):
                return ln.split(":", 1)[1].strip() if ":" in ln else ""
        return ""

    out["starters"]["adoration"] = take("ADORATION")
    out["starters"]["confession"] = take("CONFESSION")
    out["starters"]["thanksgiving"] = take("THANKSGIVING")
    out["starters"]["supplication"] = take("SUPPLICATION")

    # If any are missing, treat as failure so we fallback
    if not out["starters"]["adoration"]:
        raise RuntimeError("Gemini parse failed: adoration missing")

    return out


# -----------------------------
# API endpoints
# -----------------------------
@app.get("/me")
def me():
    return {"ok": True}

@app.get("/devotional")
def devotional(
    lang: str = Query(default="en"),
    version: str = Query(default="en_default"),
) -> Dict[str, Any]:
    lang = (lang or "en").strip().lower()
    if lang not in ("en", "es"):
        lang = "en"

    db_path = _resolve_db_path(version)
    con = _open_db(db_path)
    try:
        daily = _get_daily_verse(con, version)
    finally:
        con.close()

    try:
        gen = _gemini_generate_devotional(lang, daily["reference"], daily["scripture"])
    except Exception:
        gen = _fallback_devotional(lang)

    return {
        "ok": True,
        "day": daily["day"],
        "lang": lang,
        "version": version,
        "theme": gen["theme"],
        "reference": daily["reference"],
        "scripture": daily["scripture"],
        "starters": gen["starters"],
    }

@app.get("/daily_prayer")
def daily_prayer(
    lang: str = Query(default="en"),
    version: str = Query(default="en_default"),
) -> Dict[str, Any]:
    lang = (lang or "en").strip().lower()
    if lang not in ("en", "es"):
        lang = "en"

    db_path = _resolve_db_path(version)
    con = _open_db(db_path)
    try:
        daily = _get_daily_verse(con, version)
    finally:
        con.close()

    try:
        gen = _gemini_generate_prayer(lang, daily["reference"], daily["scripture"])
    except Exception:
        gen = _fallback_prayer(lang)

    return {
        "ok": True,
        "day": daily["day"],
        "lang": lang,
        "version": version,
        "reference": daily["reference"],
        "scripture": daily["scripture"],
        "starters": gen["starters"],
    }

@app.post("/chat")
async def chat(req: Request):
    body = await req.json()
    user_message = body.get("message", "")
    return {"ok": True, "reply": f"(stub) You said: {user_message}"}


# -----------------------------
# Frontend / Static serving
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
    p = _safe_resolve_under(ICONS_DIR, ICONS_DIR / icon_name)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Icon not found")
    return FileResponse(str(p))

# Catch-all fallback (SPA)
@app.get("/{path:path}", include_in_schema=False)
def serve_frontend_fallback(path: str):
    blocked_prefixes = (
        "bible",
        "me",
        "chat",
        "devotional",
        "daily_prayer",
    )
    first_segment = (path.split("/", 1)[0] or "").strip().lower()
    if first_segment in blocked_prefixes:
        raise HTTPException(status_code=404, detail="Not Found")

    candidate = _safe_resolve_under(FRONTEND_DIR, FRONTEND_DIR / path)
    if candidate.exists() and candidate.is_file():
        return FileResponse(str(candidate))

    if INDEX_HTML.exists():
        return FileResponse(str(INDEX_HTML))

    raise HTTPException(status_code=404, detail="Not Found")


