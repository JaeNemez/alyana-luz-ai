# server.py
from pathlib import Path
import time
import traceback
import os
import json
import base64
import hmac
import hashlib

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# Bible API router
from bible_api import router as bible_router

# AI brain
from agent import run_bible_ai

# Stripe (requires: pip install stripe)
try:
    import stripe  # type: ignore
except Exception:
    stripe = None


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
# Env
# -----------------------------
APP_BASE_URL = (os.getenv("APP_BASE_URL") or "").strip().rstrip("/")
STRIPE_SECRET_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
STRIPE_PRICE_ID = (os.getenv("STRIPE_PRICE_ID") or "").strip()
STRIPE_WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()
JWT_SECRET = (os.getenv("JWT_SECRET") or "").strip()  # used for signed session tokens

# ✅ 7-day trial length (override in Render if you want)
TRIAL_DAYS = int(os.getenv("TRIAL_DAYS") or "7")

if STRIPE_SECRET_KEY and stripe:
    stripe.api_key = STRIPE_SECRET_KEY


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


def _require_stripe_ready():
    if stripe is None:
        raise HTTPException(
            status_code=500,
            detail="Stripe library is not installed. Add `stripe` to requirements.txt and redeploy.",
        )
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Missing STRIPE_SECRET_KEY in environment.")
    if not STRIPE_PRICE_ID:
        raise HTTPException(status_code=500, detail="Missing STRIPE_PRICE_ID in environment.")
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="Missing JWT_SECRET in environment.")
    if not APP_BASE_URL:
        raise HTTPException(
            status_code=500,
            detail="Missing APP_BASE_URL in environment (e.g. https://alyana-luz-ai.onrender.com).",
        )


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode("utf-8"))


def _sign_token(payload: dict) -> str:
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    sig = hmac.new(JWT_SECRET.encode("utf-8"), raw, hashlib.sha256).digest()
    return f"{_b64url_encode(raw)}.{_b64url_encode(sig)}"


def _verify_token(token: str) -> dict | None:
    try:
        parts = (token or "").split(".")
        if len(parts) != 2:
            return None
        raw = _b64url_decode(parts[0])
        sig = _b64url_decode(parts[1])
        exp_sig = hmac.new(JWT_SECRET.encode("utf-8"), raw, hashlib.sha256).digest()
        if not hmac.compare_digest(sig, exp_sig):
            return None
        payload = json.loads(raw.decode("utf-8"))
        iat = int(payload.get("iat") or 0)
        if not iat:
            return None
        # token valid for 30 days
        if time.time() - iat > 60 * 60 * 24 * 30:
            return None
        return payload
    except Exception:
        return None


def _get_bearer(req: Request) -> str:
    auth = (req.headers.get("authorization") or "").strip()
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return ""


def _require_auth(req: Request) -> dict:
    tok = _get_bearer(req)
    payload = _verify_token(tok)
    if not payload:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return payload


def _stripe_customer_by_email(email: str):
    _require_stripe_ready()
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")
    customers = stripe.Customer.list(email=email, limit=1)
    if not customers or not customers.data:
        return None
    return customers.data[0]


# ✅ IMPORTANT: treat trialing as subscribed too
def _stripe_has_active_or_trialing_subscription(customer_id: str) -> bool:
    _require_stripe_ready()
    if not customer_id:
        return False

    # Fetch subscriptions and check statuses ourselves
    subs = stripe.Subscription.list(customer=customer_id, status="all", limit=20)
    if not subs or not subs.data:
        return False

    for s in subs.data:
        st = str(getattr(s, "status", "") or "")
        if st in ("active", "trialing"):
            return True
    return False


# -----------------------------
# API endpoints
# -----------------------------
@app.get("/me")
def me(req: Request):
    if not JWT_SECRET:
        return {"ok": True, "authed": False}

    tok = _get_bearer(req)
    payload = _verify_token(tok)
    if not payload:
        return {"ok": True, "authed": False}

    customer_id = str(payload.get("customer_id") or "")
    email = str(payload.get("email") or "")

    subscribed = False
    try:
        if customer_id and STRIPE_SECRET_KEY and stripe:
            subscribed = _stripe_has_active_or_trialing_subscription(customer_id)
    except Exception:
        subscribed = False

    return {
        "ok": True,
        "authed": True,
        "email": email,
        "customer_id": customer_id,
        "subscribed": subscribed,
        "status": "active" if subscribed else "inactive",
    }


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
        raise HTTPException(
            status_code=500,
            detail="Chat engine failed. Check server logs / API key.",
        )


# -----------------------------
# Stripe endpoints
# -----------------------------
@app.post("/stripe/checkout")
async def stripe_checkout(req: Request):
    _require_stripe_ready()

    try:
        body = await req.json()
    except Exception:
        body = {}

    email = (body.get("email") or "").strip().lower() if isinstance(body, dict) else ""

    try:
        success_url = f"{APP_BASE_URL}/?success=1"
        cancel_url = f"{APP_BASE_URL}/?canceled=1"

        params = {
            "mode": "subscription",
            "line_items": [{"price": STRIPE_PRICE_ID, "quantity": 1}],
            "success_url": success_url,
            "cancel_url": cancel_url,

            # ✅ 7-day trial (set TRIAL_DAYS=0 to disable)
            "subscription_data": {
                "trial_period_days": TRIAL_DAYS
            },
        }

        # In subscription mode, use customer_email (Stripe will create or reuse customer)
        if email and "@" in email:
            params["customer_email"] = email

        session = stripe.checkout.Session.create(**params)
        return {"ok": True, "url": session.url}

    except Exception as e:
        print("ERROR stripe_checkout:", repr(e))
        raise HTTPException(status_code=500, detail=f"Stripe checkout failed: {repr(e)}")


@app.post("/stripe/restore")
async def stripe_restore(req: Request):
    _require_stripe_ready()

    try:
        body = await req.json()
    except Exception:
        body = {}

    email = (body.get("email") or "").strip().lower() if isinstance(body, dict) else ""
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Please provide a valid email.")

    try:
        cust = _stripe_customer_by_email(email)
        if not cust:
            raise HTTPException(status_code=404, detail="No Stripe customer found for that email.")

        token = _sign_token(
            {
                "iat": int(time.time()),
                "email": email,
                "customer_id": cust.id,
            }
        )

        subscribed = False
        try:
            subscribed = _stripe_has_active_or_trialing_subscription(cust.id)
        except Exception:
            subscribed = False

        portal = stripe.billing_portal.Session.create(
            customer=cust.id,
            return_url=f"{APP_BASE_URL}/",
        )

        status = "active" if subscribed else "inactive"
        return {
            "ok": True,
            "url": portal.url,
            "portal_url": portal.url,
            "token": token,
            "subscribed": subscribed,
            "status": status,
            "customer_email": email,
        }

    except HTTPException:
        raise
    except Exception as e:
        print("ERROR stripe_restore:", repr(e))
        raise HTTPException(status_code=500, detail=f"Stripe restore failed: {repr(e)}")


@app.post("/stripe/portal")
async def stripe_portal(req: Request):
    _require_stripe_ready()
    payload = _require_auth(req)

    customer_id = str(payload.get("customer_id") or "")
    if not customer_id:
        raise HTTPException(status_code=401, detail="Missing customer_id")

    try:
        portal = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{APP_BASE_URL}/",
        )
        return {"ok": True, "url": portal.url}
    except Exception as e:
        print("ERROR stripe_portal:", repr(e))
        raise HTTPException(status_code=500, detail=f"Stripe portal failed: {repr(e)}")


@app.post("/stripe/webhook")
async def stripe_webhook(req: Request):
    if stripe is None or not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Webhook not configured on server.")

    payload = await req.body()
    sig = req.headers.get("stripe-signature") or ""

    try:
        event = stripe.Webhook.construct_event(
            payload=payload, sig_header=sig, secret=STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {repr(e)}")

    etype = event.get("type")
    print("Stripe webhook event:", etype)

    # Optional: you can add logic here later (email receipts, analytics, etc.)
    # Common subscription events:
    # - checkout.session.completed
    # - customer.subscription.created
    # - customer.subscription.updated
    # - customer.subscription.deleted
    # - invoice.paid
    # - invoice.payment_failed

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












