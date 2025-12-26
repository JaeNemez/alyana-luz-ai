from pathlib import Path
import os
import time
import traceback
import hmac
import hashlib
import json

import stripe
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# Bible API router
from bible_api import router as bible_router

# AI brain
from agent import run_bible_ai


# -----------------------------
# Env / Stripe
# -----------------------------
APP_BASE_URL = (os.getenv("APP_BASE_URL") or "").strip().rstrip("/")
STRIPE_SECRET_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
STRIPE_PRICE_ID = (os.getenv("STRIPE_PRICE_ID") or "").strip()
STRIPE_WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


def _require_env():
    missing = []
    if not APP_BASE_URL:
        missing.append("APP_BASE_URL")
    if not STRIPE_SECRET_KEY:
        missing.append("STRIPE_SECRET_KEY")
    if not STRIPE_PRICE_ID:
        missing.append("STRIPE_PRICE_ID")
    if missing:
        raise HTTPException(status_code=500, detail=f"Missing env vars: {', '.join(missing)}")


def _success_url():
    # You can handle this in app.js by reading URL params (?success=1)
    return f"{APP_BASE_URL}/?success=1"


def _cancel_url():
    return f"{APP_BASE_URL}/?canceled=1"


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


def _stripe_enabled() -> bool:
    return bool(STRIPE_SECRET_KEY and STRIPE_PRICE_ID and APP_BASE_URL)


def _find_customer_by_email(email: str):
    # Stripe does not guarantee a unique match by email; we pick the most recent if multiple exist.
    customers = stripe.Customer.list(email=email, limit=10)
    if not customers or not customers.data:
        return None
    return customers.data[0]


def _customer_has_active_sub(customer_id: str) -> bool:
    subs = stripe.Subscription.list(customer=customer_id, status="all", limit=10)
    for s in subs.data or []:
        # treat trialing + active as "active access"
        if s.status in ("active", "trialing"):
            return True
    return False


# -----------------------------
# API endpoints
# -----------------------------
@app.get("/me")
async def me(request: Request):
    """
    Basic health + (optional) subscription status check.

    If client provides {"email": "..."} via query param or header X-Email,
    we attempt to find Stripe customer and return active status.
    """
    email = (request.query_params.get("email") or request.headers.get("x-email") or "").strip().lower()

    resp = {"ok": True, "stripe_enabled": _stripe_enabled()}

    if not _stripe_enabled() or not email:
        return resp

    try:
        c = _find_customer_by_email(email)
        if not c:
            resp.update({"email": email, "customer_found": False, "active": False})
            return resp

        active = _customer_has_active_sub(c.id)
        resp.update(
            {
                "email": email,
                "customer_found": True,
                "customer_id": c.id,
                "active": bool(active),
            }
        )
        return resp

    except Exception as e:
        print("ERROR in /me stripe:", repr(e))
        resp.update({"email": email, "stripe_error": True})
        return resp


@app.get("/devotional")
def devotional():
    return {"ok": True, "devotional": "Coming soon."}


@app.get("/daily_prayer")
def daily_prayer():
    return {"ok": True, "prayer": "Coming soon."}


@app.post("/chat")
async def chat(req: Request):
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
        _push_history(req, "user", user_message)
        history = _get_history(req)

        reply = run_bible_ai(user_message, lang=lang, history=history)
        if not reply:
            reply = "I’m here. Please try again."

        _push_history(req, "assistant", str(reply))
        return {"ok": True, "reply": str(reply)}

    except Exception as e:
        print("ERROR in /chat:", repr(e))
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Chat engine failed. Check server logs / API key.")


# -----------------------------
# Stripe endpoints
# -----------------------------
@app.post("/stripe/checkout")
async def stripe_checkout(req: Request):
    """
    Expected JSON:
      { "email": "optional@email.com" }

    Returns:
      { ok: True, url: "https://checkout.stripe.com/..." }
    """
    _require_env()

    try:
        body = {}
        try:
            body = await req.json()
        except Exception:
            body = {}

        email = (body.get("email") or "").strip().lower()

        params = {
            "mode": "subscription",
            "line_items": [{"price": STRIPE_PRICE_ID, "quantity": 1}],
            "success_url": _success_url(),
            "cancel_url": _cancel_url(),
            # Makes Stripe collect email if not provided; if provided, prefill.
            "customer_email": email or None,
            # Helpful for taxes / receipts, optional:
            "billing_address_collection": "auto",
            "allow_promotion_codes": True,
        }

        # Remove None values (Stripe can be picky)
        params = {k: v for k, v in params.items() if v is not None}

        session = stripe.checkout.Session.create(**params)
        return {"ok": True, "url": session.url}

    except Exception as e:
        print("ERROR in /stripe/checkout:", repr(e))
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Stripe checkout failed. Check STRIPE_* env vars and logs.")


@app.post("/stripe/portal")
async def stripe_portal(req: Request):
    """
    Expected JSON:
      { "email": "email@domain.com" }

    Returns:
      { ok: True, url: "https://billing.stripe.com/..." }

    We locate customer by email, then create Billing Portal session.
    """
    _require_env()

    try:
        body = {}
        try:
            body = await req.json()
        except Exception:
            body = {}

        email = (body.get("email") or "").strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="Missing email")

        c = _find_customer_by_email(email)
        if not c:
            raise HTTPException(status_code=404, detail="Customer not found for that email")

        portal = stripe.billing_portal.Session.create(
            customer=c.id,
            return_url=APP_BASE_URL + "/",
        )
        return {"ok": True, "url": portal.url}

    except HTTPException:
        raise
    except Exception as e:
        print("ERROR in /stripe/portal:", repr(e))
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Stripe portal failed. Check logs.")


@app.post("/stripe/restore")
async def stripe_restore(req: Request):
    """
    Expected JSON:
      { "email": "email@domain.com" }

    Returns:
      {
        ok: True,
        customer_found: bool,
        active: bool,
        portal_url: optional
      }
    """
    _require_env()

    try:
        body = {}
        try:
            body = await req.json()
        except Exception:
            body = {}

        email = (body.get("email") or "").strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="Missing email")

        c = _find_customer_by_email(email)
        if not c:
            return {"ok": True, "customer_found": False, "active": False}

        active = _customer_has_active_sub(c.id)

        portal = stripe.billing_portal.Session.create(
            customer=c.id,
            return_url=APP_BASE_URL + "/",
        )

        return {
            "ok": True,
            "customer_found": True,
            "customer_id": c.id,
            "active": bool(active),
            "portal_url": portal.url,
        }

    except HTTPException:
        raise
    except Exception as e:
        print("ERROR in /stripe/restore:", repr(e))
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Stripe restore failed. Check logs.")


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    """
    Optional but recommended.
    We verify the webhook signature. For now we just acknowledge events.
    """
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Missing STRIPE_WEBHOOK_SECRET")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=STRIPE_WEBHOOK_SECRET,
        )
    except Exception as e:
        print("Webhook signature verification failed:", repr(e))
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    # You can expand this later to store subscription status in a DB.
    # For your current app, /me checks Stripe live, so webhook isn’t required to function.
    etype = event.get("type")
    print("Stripe webhook event:", etype)

    return {"ok": True}


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
    blocked_prefixes = ("bible", "me", "chat", "devotional", "daily_prayer", "stripe")

    first_segment = (path.split("/", 1)[0] or "").strip().lower()
    if first_segment in blocked_prefixes:
        raise HTTPException(status_code=404, detail="Not Found")

    candidate = _safe_path_under(FRONTEND_DIR, path)
    if candidate.exists() and candidate.is_file():
        return FileResponse(str(candidate))

    if INDEX_HTML.exists():
        return FileResponse(str(INDEX_HTML))

    raise HTTPException(status_code=404, detail="Not Found")








