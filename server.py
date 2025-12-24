from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# Bible API router
from bible_api import router as bible_router

# Try to import Gemini brain (optional at runtime)
try:
    from agent import run_bible_ai  # type: ignore
except Exception:
    run_bible_ai = None  # if key missing or import fails, we fallback

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

# ✅ Register API routers FIRST
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
    """
    Prevent path traversal: ensure target is inside base.
    """
    base = base.resolve()
    target = target.resolve()
    if base not in target.parents and target != base:
        raise HTTPException(status_code=400, detail="Invalid path")
    return target


def _normalize_lang(lang: str | None) -> str:
    v = (lang or "").strip().lower()
    return "es" if v.startswith("es") else "en"


def _fallback_prayer_starter(lang: str) -> str:
    if lang == "es":
        return (
            "Padre Celestial,\n"
            "— Reconocimiento: Tú eres santo, fiel y cercano.\n"
            "— Gratitud: Gracias por este nuevo día y por Tu cuidado.\n"
            "— Reflexión/Confesión: Perdóname donde he fallado y renueva mi corazón.\n"
            "— Petición: Dame sabiduría, paciencia y paz para lo que venga hoy.\n"
            "— Intercesión: Bendice a mi familia y ayuda a quienes sufren o están necesitados.\n"
            "— Rendición: Pongo este día en Tus manos; hágase Tu voluntad. Amén."
        )
    return (
        "Heavenly Father,\n"
        "— Acknowledgment: You are holy, faithful, and near.\n"
        "— Gratitude: Thank You for this new day and Your constant care.\n"
        "— Reflection/Confession: Forgive me where I’ve fallen short; renew my heart.\n"
        "— Petition: Give me wisdom, patience, and peace for what’s ahead today.\n"
        "— Intercession: Bless my family and help those who are hurting or in need.\n"
        "— Surrender: I place this day in Your hands; Your will be done. Amen."
    )


def _build_daily_prayer_prompt(lang: str) -> str:
    if lang == "es":
        return (
            "IMPORTANTE: Responde solo en español.\n\n"
            "Genera un ejemplo breve de 'oración diaria' para ayudar a iniciar al usuario.\n"
            "Debe seguir exactamente estos 6 elementos, con frases cortas (1–2 líneas por elemento):\n"
            "1) Reconocimiento de Dios\n"
            "2) Gratitud\n"
            "3) Reflexión/Confesión\n"
            "4) Petición (para hoy)\n"
            "5) Intercesión (por otros)\n"
            "6) Compromiso/Rendición\n\n"
            "Formato requerido:\n"
            "Comienza con 'Padre Celestial,' y usa viñetas con '—' para cada elemento.\n"
            "Termina con 'Amén.'\n"
            "Manténlo cálido, sencillo, y no más de 10–12 líneas."
        )
    return (
        "IMPORTANT: Reply only in English.\n\n"
        "Generate a brief 'daily prayer' example to help the user get started.\n"
        "It must follow exactly these 6 elements, with short phrases (1–2 lines per element):\n"
        "1) Acknowledgment of God\n"
        "2) Gratitude\n"
        "3) Reflection/Confession\n"
        "4) Petition (for today)\n"
        "5) Intercession (for others)\n"
        "6) Commitment/Surrender\n\n"
        "Required format:\n"
        "Start with 'Heavenly Father,' and use bullets with '—' for each element.\n"
        "End with 'Amen.'\n"
        "Keep it warm, simple, and no more than 10–12 lines."
    )


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
def daily_prayer(lang: str | None = Query(default=None)):
    """
    Returns a short starter example. User still writes the real prayer on the client.
    """
    L = _normalize_lang(lang)

    # Try Gemini if available; otherwise fallback
    if run_bible_ai:
        try:
            prompt = _build_daily_prayer_prompt(L)
            text = run_bible_ai(prompt, context=None)
            text = (text or "").strip()
            if text:
                return {"ok": True, "lang": L, "prayer": text}
        except Exception:
            pass

    return {"ok": True, "lang": L, "prayer": _fallback_prayer_starter(L)}


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


# -----------------------------
# Catch-all fallback (SPA)
# -----------------------------
@app.get("/{path:path}", include_in_schema=False)
def serve_frontend_fallback(path: str):
    """
    SPA fallback:
    - If a real file exists under /frontend, serve it
    - Otherwise serve index.html
    BUT: do NOT fallback for API-style routes (prevents HTML being returned to API calls)
    """

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

