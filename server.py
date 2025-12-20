import os
import re
import time
import hmac
import hashlib
import base64
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

import stripe
from google import genai

load_dotenv()

app = FastAPI(title="Alyana Luz · Bible AI")

# --------------------
# Paths
# --------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
INDEX_PATH = os.path.join(FRONTEND_DIR, "index.html")
APPJS_PATH = os.path.join(FRONTEND_DIR, "app.js")

if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# --------------------
# ENV
# --------------------
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()  # optional if you keep webhook
APP_BASE_URL = os.getenv("APP_BASE_URL", "").strip().rstrip("/")  # e.g. https://alyana-luz-ai.onrender.com
JWT_SECRET = os.getenv("JWT_SECRET", "").strip()

# Optional: restrict who can restore access (comma-separated emails). Leave empty to allow anyone.
ALLOWLIST_EMAILS = os.getenv("ALLOWLIST_EMAILS", "").strip()

# IMPORTANT: On Render (HTTPS), cookie should be Secure
DEV_TRUST_LOCAL = os.getenv("DEV_TRUST_LOCAL", "").strip().lower() in ("1", "true", "yes")

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

# --------------------
# Helpers: ENV requirements
# --------------------
def _require_stripe_ready():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(500, "Missing STRIPE_SECRET_KEY in environment.")
    if not STRIPE_PRICE_ID:
        raise HTTPException(500, "Missing STRIPE_PRICE_ID in environment.")
    if not APP_BASE_URL:
        raise HTTPException(500, "Missing APP_BASE_URL in environment (must be your Render https URL).")

def _require_jwt_secret():
    if not JWT_SECRET or len(JWT_SECRET) < 32:
        raise HTTPException(500, "Missing/weak JWT_SECRET. Set a long random string (32+ chars).")

def _email_allowlisted(email: str) -> bool:
    if not ALLOWLIST_EMAILS:
        return True
    allowed = {e.strip().lower() for e in ALLOWLIST_EMAILS.split(",") if e.strip()}
    return email.lower() in allowed

# --------------------
# Signed cookie auth (simple HMAC token)
# --------------------
AUTH_COOKIE_NAME = "alyana_auth"

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")

def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode((s + pad).encode())

def _sign(data: bytes) -> str:
    sig = hmac.new(JWT_SECRET.encode(), data, hashlib.sha256).digest()
    return _b64url(sig)

def _make_token(email: str, exp_seconds: int = 60 * 60 * 24 * 7) -> str:
    _require_jwt_secret()
    now = int(time.time())
    payload = f"{email}|{now + exp_seconds}".encode()
    token = _b64url(payload) + "." + _sign(payload)
    return token

def _read_token(token: str) -> Optional[dict]:
    try:
        _require_jwt_secret()
        if not token or "." not in token:
            return None
        p, s = token.split(".", 1)
        payload = _b64url_decode(p)
        expected = _sign(payload)
        if not hmac.compare_digest(s, expected):
            return None
        email, exp = payload.decode().split("|", 1)
        if int(exp) < int(time.time()):
            return None
        return {"email": email}
    except Exception:
        return None

def _set_auth_cookie(resp: JSONResponse, email: str):
    token = _make_token(email)
    resp.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=(False if DEV_TRUST_LOCAL else True),
        samesite="lax",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )

def _clear_auth_cookie(resp: JSONResponse):
    resp.delete_cookie(key=AUTH_COOKIE_NAME, path="/")
    return resp

def get_current_email(request: Request) -> Optional[str]:
    token = request.cookies.get(AUTH_COOKIE_NAME)
    parsed = _read_token(token) if token else None
    return parsed["email"] if parsed else None

# --------------------
# Stripe lookup (NO LOCAL DB REQUIRED)
# --------------------
def _stripe_find_customer_by_email(email: str) -> Optional[Dict[str, Any]]:
    """
    Returns a Stripe Customer dict if found, else None.
    """
    # Stripe supports filtering by email
    customers = stripe.Customer.list(email=email, limit=1)
    if customers and customers.data:
        return customers.data[0]
    return None

def _stripe_active_subscription_for_customer(customer_id: str) -> Optional[Dict[str, Any]]:
    """
    Returns the first ACTIVE/TRIALING subscription if any, else None.
    """
    subs = stripe.Subscription.list(customer=customer_id, status="all", limit=20)
    for s in subs.data:
        st = (s.get("status") or "").lower()
        if st in ("active", "trialing"):
            return s
    return None

def _stripe_status_by_email(email: str) -> Dict[str, Any]:
    """
    Returns:
      { found_customer, customer_id, active, status, current_period_end }
    """
    email = (email or "").strip().lower()
    if not email:
        return {"found_customer": False, "customer_id": None, "active": False, "status": None, "current_period_end": None}

    cust = _stripe_find_customer_by_email(email)
    if not cust:
        return {"found_customer": False, "customer_id": None, "active": False, "status": None, "current_period_end": None}

    sub = _stripe_active_subscription_for_customer(cust["id"])
    if not sub:
        return {"found_customer": True, "customer_id": cust["id"], "active": False, "status": None, "current_period_end": None}

    return {
        "found_customer": True,
        "customer_id": cust["id"],
        "active": True,
        "status": sub.get("status"),
        "current_period_end": sub.get("current_period_end"),
    }

# --------------------
# Gemini (AI)
# --------------------
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=API_KEY) if API_KEY else None
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

class ChatIn(BaseModel):
    prompt: str

class LangIn(BaseModel):
    lang: Optional[str] = "en"

def _require_ai():
    if not client:
        raise HTTPException(status_code=503, detail="AI key not configured (set GEMINI_API_KEY / GOOGLE_API_KEY).")

def _generate_text_with_retries(full_prompt: str, tries: int = 3) -> str:
    last_error = None
    for attempt in range(tries):
        try:
            resp = client.models.generate_content(model=MODEL_NAME, contents=full_prompt)
            return resp.text or ""
        except Exception as e:
            last_error = e
            msg = repr(e)

            if ("UNAVAILABLE" in msg) or ("503" in msg) or ("overloaded" in msg):
                time.sleep(1 + attempt)
                continue

            if ("429" in msg) or ("RESOURCE_EXHAUSTED" in msg):
                raise HTTPException(status_code=429, detail="Alyana reached the AI limit right now. Please try again later.")
            break

    print("Gemini error after retries:", repr(last_error))
    raise HTTPException(status_code=503, detail="AI error. Please try again in a bit.")

def _norm_lang(lang: Optional[str]) -> str:
    l = (lang or "en").strip().lower()
    return "es" if l.startswith("es") else "en"

# =========================
# Frontend serving
# =========================
@app.get("/", include_in_schema=False)
async def serve_frontend():
    if not os.path.exists(INDEX_PATH):
        return PlainTextResponse(f"Missing {INDEX_PATH}", status_code=500)
    return FileResponse(INDEX_PATH, headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"})

@app.get("/app.js", include_in_schema=False)
async def serve_app_js_root():
    if not os.path.exists(APPJS_PATH):
        return PlainTextResponse(f"Missing {APPJS_PATH}. Put app.js inside frontend/app.js", status_code=404)
    return FileResponse(
        APPJS_PATH,
        media_type="application/javascript",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )

@app.get("/static/app.js", include_in_schema=False)
async def serve_app_js_static():
    return await serve_app_js_root()

@app.get("/health")
def health():
    return {
        "status": "ok",
        "commit": os.getenv("RENDER_GIT_COMMIT", "unknown"),
        "index_exists": os.path.exists(INDEX_PATH),
        "appjs_exists": os.path.exists(APPJS_PATH),
        "ai_configured": bool(API_KEY),
        "model": MODEL_NAME,
        "stripe_configured": bool(STRIPE_SECRET_KEY and STRIPE_PRICE_ID and APP_BASE_URL),
        "jwt_configured": bool(JWT_SECRET and len(JWT_SECRET) >= 32),
    }

# =========================
# Billing + Login (Stripe-backed)
# =========================
class CheckoutIn(BaseModel):
    email: Optional[str] = None

class PortalIn(BaseModel):
    email: Optional[str] = None

class LoginIn(BaseModel):
    email: str

@app.post("/login")
def login(body: LoginIn):
    """
    Cheapest "restore access":
    - User enters email they used on Stripe Checkout
    - We check Stripe: does this email have an active/trialing subscription?
    - If yes, we set secure cookie.
    """
    _require_stripe_ready()
    _require_jwt_secret()

    email = (body.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "Missing email.")
    if not _email_allowlisted(email):
        raise HTTPException(403, "This email is not allowed.")

    status = _stripe_status_by_email(email)
    if not status["active"]:
        raise HTTPException(402, "Subscription inactive or not found.")

    resp = JSONResponse({"ok": True, "email": email, "active": True, "status": status["status"], "current_period_end": status["current_period_end"]})
    _set_auth_cookie(resp, email)
    return resp

@app.post("/stripe/create-checkout-session")
def create_checkout_session(body: CheckoutIn):
    _require_stripe_ready()
    email = (body.email or "").strip().lower() if body else ""

    if email and not _email_allowlisted(email):
        raise HTTPException(403, "This email is not allowed.")

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
            success_url=f"{APP_BASE_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{APP_BASE_URL}/billing/cancel",
            customer_email=email if email else None,
            allow_promotion_codes=True,
        )
        return {"url": session.url, "id": session.id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")

@app.get("/billing/success", include_in_schema=False)
def billing_success(session_id: str):
    """
    After successful Checkout, set cookie using the email from the session.
    """
    _require_stripe_ready()
    _require_jwt_secret()

    try:
        session = stripe.checkout.Session.retrieve(session_id)
        email = ""
        if session.get("customer_details") and session["customer_details"].get("email"):
            email = session["customer_details"]["email"]
        elif session.get("customer_email"):
            email = session["customer_email"]
        email = (email or "").strip().lower()

        resp = RedirectResponse(url="/?billing=success")
        if email and _email_allowlisted(email):
            _set_auth_cookie(resp, email)
        return resp
    except Exception:
        return RedirectResponse(url="/?billing=success_error")

@app.get("/billing/cancel", include_in_schema=False)
def billing_cancel():
    return RedirectResponse(url="/?billing=cancel")

@app.get("/me")
def me(request: Request):
    """
    Frontend calls this to show status and enable Manage Billing.
    We verify cookie, then verify subscription via Stripe (no local DB).
    """
    _require_stripe_ready()

    email = get_current_email(request)
    if not email:
        return {"logged_in": False, "email": None, "active": False, "status": None, "current_period_end": None}

    status = _stripe_status_by_email(email)
    return {
        "logged_in": True,
        "email": email,
        "active": bool(status["active"]),
        "status": status["status"],
        "current_period_end": status["current_period_end"],
    }

@app.post("/logout")
def logout():
    resp = JSONResponse({"ok": True})
    return _clear_auth_cookie(resp)

@app.post("/stripe/create-portal-session")
def create_portal_session(request: Request, body: PortalIn):
    """
    If logged in, we use cookie email.
    Otherwise user can provide email (optional) but you should prefer logged-in flow.
    """
    _require_stripe_ready()

    email = get_current_email(request) or ((body.email or "").strip().lower() if body else "")
    if not email:
        raise HTTPException(400, "Missing email (not logged in).")
    if not _email_allowlisted(email):
        raise HTTPException(403, "This email is not allowed.")

    cust = _stripe_find_customer_by_email(email)
    if not cust:
        raise HTTPException(404, "No Stripe customer found for that email yet.")

    try:
        portal = stripe.billing_portal.Session.create(
            customer=cust["id"],
            return_url=f"{APP_BASE_URL}/",
        )
        return {"url": portal.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stripe portal error: {str(e)}")

# (Optional) Stripe webhook endpoint kept for future expansion
@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        # Not required in this new design; return ok.
        return {"received": True, "note": "No webhook secret configured; endpoint not verifying."}

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        return JSONResponse({"error": f"Webhook signature verification failed: {str(e)}"}, status_code=400)

    return {"received": True, "type": event.get("type")}

# =========================
# Premium-protected endpoint
# =========================
def _require_active_user(request: Request) -> str:
    email = get_current_email(request)
    if not email:
        raise HTTPException(401, "Not logged in.")
    status = _stripe_status_by_email(email)
    if not status["active"]:
        raise HTTPException(402, "Subscription inactive. Please subscribe.")
    return email

@app.post("/premium/chat")
def premium_chat(request: Request, body: ChatIn):
    _require_ai()
    email = _require_active_user(request)

    system_prompt = (
        "You are Alyana Luz, a warm, scripture-focused assistant. "
        "You pray with the user, suggest Bible passages, and explain verses. "
        "Reply in friendly, natural text (no JSON or code) unless the user asks "
        "for something technical. Keep answers concise but caring."
    )
    full_prompt = f"{system_prompt}\n\nUser:\n{body.prompt}\n\nAlyana:"
    text = _generate_text_with_retries(full_prompt) or "Sorry, I couldn't respond right now."
    return {"status": "success", "email": email, "message": text}

# =========================
# Free endpoints
# =========================
@app.post("/chat")
def chat(body: ChatIn):
    _require_ai()
    system_prompt = (
        "You are Alyana Luz, a warm, scripture-focused assistant. "
        "You pray with the user, suggest Bible passages, and explain verses. "
        "Reply in friendly, natural text (no JSON or code) unless the user asks "
        "for something technical. Keep answers concise but caring."
    )
    full_prompt = f"{system_prompt}\n\nUser:\n{body.prompt}\n\nAlyana:"
    text = _generate_text_with_retries(full_prompt) or "Sorry, I couldn't respond right now."
    return {"status": "success", "message": text}

@app.post("/devotional")
def devotional(body: Optional[LangIn] = None):
    _require_ai()
    lang = _norm_lang(body.lang if body else "en")

    if lang == "es":
        prompt = """
Eres Alyana Luz. Crea un devocional en JSON ESTRICTO SOLAMENTE.
Devuelve exactamente esta forma:
{
  "scripture": "Libro Capítulo:Verso(s) — texto del verso",
  "brief_explanation": "2-4 oraciones explicándolo de forma simple"
}
Reglas:
- Devuelve SOLO JSON válido (sin markdown).
- Todo en español.
- Tono cálido, práctico y breve.
""".strip()
    else:
        prompt = """
You are Alyana Luz. Create a devotional in STRICT JSON ONLY.
Return exactly this shape:
{
  "scripture": "Book Chapter:Verse(s) — verse text",
  "brief_explanation": "2-4 sentences explaining it simply"
}
Rules:
- Return ONLY valid JSON (no markdown).
- Everything in English.
- Warm, practical, brief.
""".strip()

    text = _generate_text_with_retries(prompt) or "{}"
    return {"json": text}

@app.post("/daily_prayer")
def daily_prayer(body: Optional[LangIn] = None):
    _require_ai()
    lang = _norm_lang(body.lang if body else "en")

    if lang == "es":
        prompt = """
Eres Alyana Luz. Genera frases cortas para una oración ACTS en JSON ESTRICTO SOLAMENTE.
Devuelve exactamente esta forma:
{
  "example_adoration": "1-2 frases",
  "example_confession": "1-2 frases",
  "example_thanksgiving": "1-2 frases",
  "example_supplication": "1-2 frases"
}
Reglas:
- Devuelve SOLO JSON válido (sin markdown).
- Todo en español.
- Tono cálido, breve y práctico.
""".strip()
    else:
        prompt = """
You are Alyana Luz. Generate short starters for an ACTS prayer in STRICT JSON ONLY.
Return exactly this shape:
{
  "example_adoration": "1-2 sentences",
  "example_confession": "1-2 sentences",
  "example_thanksgiving": "1-2 sentences",
  "example_supplication": "1-2 sentences"
}
Rules:
- Return ONLY valid JSON (no markdown).
- Everything in English.
- Warm, brief, practical.
""".strip()

    text = _generate_text_with_retries(prompt) or "{}"
    return {"json": text}




