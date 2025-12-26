from pathlib import Path
import time
import traceback

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# Bible API router
from bible_api import router as bible_router

# AI brain
from agent import run_bible_ai


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
app.include_router(bible_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# Simple in-memory chat memory
# -----------------------------
# Keyed by (ip + user-agent) -> { "ts": last_seen, "history": [ {role, content}, ... ] }
CHAT_SESSIONS = {}
SESSION_TTL_SECONDS = 60 * 60 * 6  # 6 hours
MAX_HISTORY = 30


def _session_key(req: Request) -> str:
    ip = (req.client.host if req.client else "unknown").strip()
    ua = (req.headers.get("user-agent") or "unknown").strip()
    return f"{ip}::{ua}"


def _cleanup_sessions():
    now = time.time()
    dead = []
    for k, v in CHAT_SESSIONS.items():
        last = v.get("ts") or 0
        if now - last > SESSION_TTL_SECONDS:
            dead.append(k)
    for k in dead:
        CHAT_SESSIONS.pop(k, None)


def _get_history(req: Request) -> list:
    _cleanup_sessions()
    key = _session_key(req)
    sess = CHAT_SESSIONS.get(key)
    if not sess:
        sess = {"ts": time.time(), "history": []}
        CHAT_SESSIONS[key] = sess
    sess["ts"] = time.time()
    return sess["history"]


def _push_history(req: Request, role: str, content: str):
    h = _get_history(req)
    h.append({"role": role, "content": content})
    # keep only last MAX_HISTORY
    if len(h) > MAX_HISTORY:
        del h[:-MAX_HISTORY]


# -----------------------------
# Helpers
# -----------------------------
def _safe_path_under(base: Path, requested_path: str) -> Path:
    base = base.resolve()
    clean = (requested_path or "").lstrip("/\\")
    target = (base / clean).resolve()
    if base not in target.parents and target != base:
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


# -----------------------------
# API endpoints
# -----------------------------
@app.get("/me")
def me():
    return {"ok": True}


@app.get("/devotional")
def devotional():
    return {"ok": True, "devotional": "Coming soon."}


@app.get("/daily_prayer")
def daily_prayer():
    return {"ok": True, "prayer": "Coming soon."}


@app.post("/chat")
async def chat(req: Request):
    """
    Expected JSON:
      { "message": "...", "lang": "auto" | "en" | "es" }

    Memory:
      Stores the conversation in-memory per user (IP + User-Agent) for a few hours.
    """
    try:
        body = await req.json()
    except Exception:
        body = {}

    user_message = (body.get("message") or "").strip()
    if not user_message:
        return {"ok": True, "reply": "Please type a message."}

    lang = (body.get("lang") or "auto").strip().lower()
    if lang not in ("auto", "en", "es"):
        lang = "auto"

    try:
        # Save user message to memory first
        _push_history(req, "user", user_message)

        history = _get_history(req)

        # Ask Alyana with conversation history
        reply = run_bible_ai(user_message, lang=lang, history=history)

        if not reply:
            reply = "I’m here. Please try again."

        # Save assistant reply to memory
        _push_history(req, "assistant", str(reply))

        return {"ok": True, "reply": str(reply)}

    except Exception as e:
        print("ERROR in /chat:", repr(e))
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail="Chat engine failed. Check server logs / API key.",
        )


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
        raise HTTPException(status_code=404, detail=f"app.js not found at {str(APP_JS)}")
    return FileResponse(str(APP_JS))


@app.get("/manifest.webmanifest", include_in_schema=False)
def serve_manifest():
    if not MANIFEST.exists():
        raise HTTPException(status_code=404, detail=f"manifest.webmanifest not found at {str(MANIFEST)}")
    return FileResponse(str(MANIFEST))


@app.get("/service-worker.js", include_in_schema=False)
def serve_service_worker():
    if not SERVICE_WORKER.exists():
        raise HTTPException(status_code=404, detail=f"service-worker.js not found at {str(SERVICE_WORKER)}")
    return FileResponse(str(SERVICE_WORKER))


@app.get("/icons/{icon_name}", include_in_schema=False)
def serve_icons(icon_name: str):
    p = _safe_path_under(ICONS_DIR, icon_name)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Icon not found")
    return FileResponse(str(p))


# -----------------------------
# Catch-all fallback (SPA)
# -----------------------------
@app.get("/{path:path}", include_in_schema=False)
def serve_frontend_fallback(path: str):
    blocked_prefixes = ("bible", "me", "chat", "devotional", "daily_prayer")

    first_segment = (path.split("/", 1)[0] or "").strip().lower()
    if first_segment in blocked_prefixes:
        raise HTTPException(status_code=404, detail="Not Found")

    candidate = _safe_path_under(FRONTEND_DIR, path)
    if candidate.exists() and candidate.is_file():
        return FileResponse(str(candidate))

    if INDEX_HTML.exists():
        return FileResponse(str(INDEX_HTML))

    raise HTTPException(status_code=404, detail="Not Found")







