from pathlib import Path
import traceback

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# Bible API router
from bible_api import router as bible_router

# Gemini brain
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
def _safe_path_under(base: Path, requested_path: str) -> Path:
    """
    Prevent path traversal: ensure requested_path stays inside base.
    Handles leading slashes safely.
    """
    base = base.resolve()
    clean = (requested_path or "").lstrip("/\\")
    target = (base / clean).resolve()

    if base not in target.parents and target != base:
        raise HTTPException(status_code=400, detail="Invalid path")

    return target


# -----------------------------
# API health/basic endpoints
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

    Returns:
      { "ok": true, "reply": "..." }
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
        reply = run_bible_ai(user_message, lang=lang)
        reply = (reply or "").strip()
        if not reply:
            reply = "I’m here with you. Please try again."
        return {"ok": True, "reply": reply}
    except Exception as e:
        # Log server-side details (Render logs)
        print("ERROR in /chat:", repr(e))
        print(traceback.format_exc())

        # Return SAFE message to the UI (no 500 crash loop)
        return {
            "ok": True,
            "reply": "I’m having trouble connecting right now. Please try again in a moment.",
        }


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

    candidate = _safe_path_under(FRONTEND_DIR, path)
    if candidate.exists() and candidate.is_file():
        return FileResponse(str(candidate))

    if INDEX_HTML.exists():
        return FileResponse(str(INDEX_HTML))

    raise HTTPException(status_code=404, detail="Not Found")






