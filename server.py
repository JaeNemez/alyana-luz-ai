import os
import re
import time
import sqlite3
from typing import Optional, Dict, List

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from dotenv import load_dotenv
import stripe
from google import genai

from db import get_verse  # keep your db.py helper

load_dotenv()

app = FastAPI(title="Alyana Luz · Bible AI")

# --------------------
# Paths (ABSOLUTE)
# --------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
INDEX_PATH = os.path.join(FRONTEND_DIR, "index.html")
APPJS_PATH = os.path.join(FRONTEND_DIR, "app.js")

if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

# --------------------
# Stripe config (from ENV)
# --------------------
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()  # add later
APP_BASE_URL = os.getenv("APP_BASE_URL", "").strip().rstrip("/")

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

# --------------------
# Gemini (AI)
# --------------------
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=API_KEY) if API_KEY else None
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# --------------------
# Models
# --------------------
class ChatIn(BaseModel):
    prompt: str

class LangIn(BaseModel):
    lang: Optional[str] = "en"  # "en" or "es"

class CheckoutIn(BaseModel):
    # later we can attach this to a real logged-in user id/email
    email: Optional[str] = None

# --------------------
# Helpers
# --------------------
def _require_ai():
    if not client:
        raise HTTPException(
            status_code=503,
            detail="AI key not configured (set GEMINI_API_KEY / GOOGLE_API_KEY).",
        )

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
                raise HTTPException(
                    status_code=429,
                    detail="Alyana reached the AI limit right now. Please try again later.",
                )
            break

    print("Gemini error after retries:", repr(last_error))
    raise HTTPException(status_code=503, detail="AI error. Please try again in a bit.")

def _norm_lang(lang: Optional[str]) -> str:
    l = (lang or "en").strip().lower()
    return "es" if l.startswith("es") else "en"

def _require_stripe_ready():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(500, "Missing STRIPE_SECRET_KEY in environment.")
    if not STRIPE_PRICE_ID:
        raise HTTPException(500, "Missing STRIPE_PRICE_ID in environment.")
    if not APP_BASE_URL:
        raise HTTPException(500, "Missing APP_BASE_URL in environment (must be your Render https URL).")

# =========================
# Frontend serving
# =========================
@app.get("/", include_in_schema=False)
async def serve_frontend():
    if not os.path.exists(INDEX_PATH):
        return PlainTextResponse(f"Missing {INDEX_PATH}", status_code=500)
    return FileResponse(
        INDEX_PATH,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )

@app.get("/app.js", include_in_schema=False)
async def serve_app_js_root():
    if not os.path.exists(APPJS_PATH):
        return PlainTextResponse(
            f"Missing {APPJS_PATH}. Put app.js inside frontend/app.js",
            status_code=404,
        )
    return FileResponse(
        APPJS_PATH,
        media_type="application/javascript",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
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
        "db_exists": os.path.exists(os.path.join(BASE_DIR, "data", "bible.db")),
        "ai_configured": bool(API_KEY),
        "model": MODEL_NAME,
        "stripe_configured": bool(STRIPE_SECRET_KEY and STRIPE_PRICE_ID and APP_BASE_URL),
    }

# =========================
# Stripe Checkout (subscription)
# =========================
@app.post("/stripe/create-checkout-session")
def create_checkout_session(body: CheckoutIn):
    """
    Creates a Stripe Checkout Session for a subscription.
    Your frontend should call this, then redirect to session.url.
    """
    _require_stripe_ready()

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
            success_url=f"{APP_BASE_URL}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{APP_BASE_URL}/billing/cancel",
            customer_email=body.email if body.email else None,
            allow_promotion_codes=True,
        )
        return {"url": session.url, "id": session.id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")

@app.get("/billing/success", include_in_schema=False)
def billing_success(session_id: str):
    """
    For now just a friendly redirect back home.
    Later we’ll verify subscription and unlock features.
    """
    return RedirectResponse(url="/")

@app.get("/billing/cancel", include_in_schema=False)
def billing_cancel():
    return RedirectResponse(url="/")

# NOTE: Webhook will come next (recommended for real unlock logic)
# @app.post("/stripe/webhook")
# async def stripe_webhook(request: Request):
#     ...

# =========================
# Bible Reader (LOCAL DB)
# =========================
DB_PATH = os.path.join(BASE_DIR, "data", "bible.db")

def _db():
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=500, detail=f"bible.db not found at {DB_PATH}")
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con

def _get_table_columns(con: sqlite3.Connection, table: str) -> List[str]:
    rows = con.execute(f"PRAGMA table_info({table})").fetchall()
    return [r["name"] for r in rows]

def _get_books_table_mapping(con: sqlite3.Connection) -> Dict[str, str]:
    cols = [c.lower() for c in _get_table_columns(con, "books")]

    id_col = next((c for c in ["id", "book_id", "pk"] if c in cols), None) or (cols[0] if cols else "id")
    name_col = next((c for c in ["name", "book", "title", "label"] if c in cols), None) or (cols[1] if len(cols) > 1 else cols[0])
    key_col = next((c for c in ["key", "slug", "code", "abbr", "short_name", "shortname"] if c in cols), "")

    return {"id
