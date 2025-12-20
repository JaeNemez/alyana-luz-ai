import os
import re
import time
import hmac
import hashlib
import base64
import sqlite3
from typing import Optional, Dict, List

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from dotenv import load_dotenv
import stripe
from google import genai

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
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
APP_BASE_URL = os.getenv("APP_BASE_URL", "").strip().rstrip("/")  # e.g. https://alyana-luz-ai.onrender.com
JWT_SECRET = os.getenv("JWT_SECRET", "").strip()

# Optional: allow non-HTTPS cookie ONLY for local dev if you ever run locally
DEV_TRUST_LOCAL = os.getenv("DEV_TRUST_LOCAL", "").strip().lower() in ("1", "true", "yes")

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY


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


# --------------------
# Very small signed-token helper (cookie auth)
# (No external jwt lib needed)
# --------------------
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


AUTH_COOKIE_NAME = "alyana_auth"


def _set_auth_cookie(resp, email: str):
    """
    Sets secure signed auth cookie.
    On Render/HTTPS, secure=True is correct.
    If you run locally without HTTPS, set DEV_TRUST_LOCAL=true to allow secure=False.
    """
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
# Simple subscription store (SQLite)
# --------------------
SUB_DB_PATH = os.path.join(BASE_DIR, "data", "subs.db")


def _subs_db():
    os.makedirs(os.path.dirname(SUB_DB_PATH), exist_ok=True)
    con = sqlite3.connect(SUB_DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _subs_init():
    con = _subs_db()
    try:
        con.execute(
            """
        CREATE TABLE IF NOT EXISTS subscribers (
            email TEXT PRIMARY KEY,
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT,
            status TEXT,
            current_period_end INTEGER,
            updated_at INTEGER
        )
        """
        )
        con.commit()
    finally:
        con.close()


_subs_init()


def _subs_upsert(
    email: str,
    customer_id: Optional[str],
    subscription_id: Optional[str],
    status: Optional[str],
    current_period_end: Optional[int],
):
    email = (email or "").strip().lower()
    if not email:
        return

    now = int(time.time())
    con = _subs_db()
    try:
        con.execute(
            """
            INSERT INTO subscribers (email, stripe_customer_id, stripe_subscription_id, status, current_period_end, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                stripe_customer_id=excluded.stripe_customer_id,
                stripe_subscription_id=excluded.stripe_subscription_id,
                status=excluded.status,
                current_period_end=excluded.current_period_end,
                updated_at=excluded.updated_at
            """,
            (email, customer_id, subscription_id, status, current_period_end, now),
        )
        con.commit()
    finally:
        con.close()


def _subs_get(email: str) -> Optional[dict]:
    email = (email or "").strip().lower()
    if not email:
        return None
    con = _subs_db()
    try:
        row = con.execute("SELECT * FROM subscribers WHERE email=?", (email,)).fetchone()
        return dict(row) if row else None
    finally:
        con.close()


def _is_active_subscriber(email: str) -> bool:
    row = _subs_get(email)
    if not row:
        return False
    status = (row.get("status") or "").lower()
    return status in ("active", "trialing")


def require_active_user(request: Request) -> str:
    email = get_current_email(request)
    if not email:
        raise HTTPException(401, "Not logged in.")
    if not _is_active_subscriber(email):
        raise HTTPException(402, "Subscription inactive. Please subscribe.")
    return email


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


# =========================
# Frontend serving
# =========================
@app.get("/", include_in_schema=False)
async def serve_frontend():
    if not os.path.exists(INDEX_PATH):
        return PlainTextResponse(f"Missing {INDEX_PATH}", status_code=500)
    return FileResponse(
        INDEX_PATH,
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.get("/app.js", include_in_schema=False)
async def serve_app_js_root():
    if not os.path.exists(APPJS_PATH):
        return PlainTextResponse(
            f"Missing {APPJS_PATH}. Put app.js inside frontend/app.js", status_code=404
        )
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
        "webhook_configured": bool(STRIPE_WEBHOOK_SECRET),
        "jwt_configured": bool(JWT_SECRET and len(JWT_SECRET) >= 32),
        "subs_db_exists": os.path.exists(SUB_DB_PATH),
    }


# =========================
# Stripe Subscription Billing
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
    Restore a login cookie using the email address used for the subscription.
    If the email is ACTIVE/TRIALING in our local DB, we set the cookie.

    Note: This is convenience-first. Later you can upgrade to email OTP.
    """
    _require_jwt_secret()

    email = (body.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "Missing email.")

    if not _is_active_subscriber(email):
        raise HTTPException(402, "Subscription inactive or not found.")

    resp = JSONResponse({"ok": True, "email": email, "active": True})
    _set_auth_cookie(resp, email)
    return resp


@app.post("/stripe/create-checkout-session")
def create_checkout_session(body: CheckoutIn):
    _require_stripe_ready()

    email = (body.email or "").strip().lower() if body else ""

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


@app.post("/stripe/create-portal-session")
def create_portal_session(request: Request, body: PortalIn):
    _require_stripe_ready()

    email = get_current_email(request) or ((body.email or "").strip().lower() if body else "")
    if not email:
        raise HTTPException(400, "Missing email (not logged in).")

    row = _subs_get(email)
    if not row or not row.get("stripe_customer_id"):
        raise HTTPException(404, "No Stripe customer found for that email yet.")

    try:
        portal = stripe.billing_portal.Session.create(
            customer=row["stripe_customer_id"],
            return_url=f"{APP_BASE_URL}/",
        )
        return {"url": portal.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stripe portal error: {str(e)}")


@app.get("/billing/success", include_in_schema=False)
def billing_success(session_id: str):
    """
    After successful Checkout, user lands here.
    We verify the Checkout Session with Stripe and set a secure login cookie.
    """
    _require_stripe_ready()
    _require_jwt_secret()

    try:
        session = stripe.checkout.Session.retrieve(session_id, expand=["customer", "subscription"])

        email = ""
        if session.get("customer_details") and session["customer_details"].get("email"):
            email = session["customer_details"]["email"]
        elif session.get("customer_email"):
            email = session["customer_email"]
        email = (email or "").strip().lower()

        customer_id = session.get("customer")
        subscription_id = session.get("subscription")

        status = None
        current_period_end = None
        if subscription_id:
            sub = stripe.Subscription.retrieve(subscription_id)
            status = sub.get("status")
            current_period_end = sub.get("current_period_end")

        _subs_upsert(email, customer_id, subscription_id, status, current_period_end)

        resp = RedirectResponse(url="/")
        if email:
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
    Frontend can call this to know:
    - who is logged in
    - are they active
    """
    email = get_current_email(request)
    if not email:
        return {"logged_in": False, "email": None, "active": False, "status": None, "current_period_end": None}

    row = _subs_get(email)
    return {
        "logged_in": True,
        "email": email,
        "active": _is_active_subscriber(email),
        "status": (row.get("status") if row else None),
        "current_period_end": (row.get("current_period_end") if row else None),
    }


@app.post("/logout")
def logout():
    resp = JSONResponse({"ok": True})
    return _clear_auth_cookie(resp)


@app.get("/billing/status")
def billing_status(email: str):
    """
    Kept for compatibility; but /me is better once cookie login is used.
    """
    email = (email or "").strip().lower()
    if not email:
        raise HTTPException(400, "Missing email")
    row = _subs_get(email)
    return {
        "email": email,
        "active": _is_active_subscriber(email),
        "status": (row.get("status") if row else None),
        "current_period_end": (row.get("current_period_end") if row else None),
    }


@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(500, "Missing STRIPE_WEBHOOK_SECRET in environment.")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        return JSONResponse({"error": f"Webhook signature verification failed: {str(e)}"}, status_code=400)

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")
        email = (data.get("customer_details", {}) or {}).get("email") or data.get("customer_email") or ""
        email = (email or "").strip().lower()

        status = None
        current_period_end = None
        if subscription_id:
            sub = stripe.Subscription.retrieve(subscription_id)
            status = sub.get("status")
            current_period_end = sub.get("current_period_end")

        _subs_upsert(email, customer_id, subscription_id, status, current_period_end)

    elif event_type in (
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    ):
        subscription_id = data.get("id")
        customer_id = data.get("customer")
        status = data.get("status")
        current_period_end = data.get("current_period_end")

        email = ""
        if customer_id:
            cust = stripe.Customer.retrieve(customer_id)
            email = (cust.get("email") or "").strip().lower()

        _subs_upsert(email, customer_id, subscription_id, status, current_period_end)

    elif event_type == "invoice.paid":
        customer_id = data.get("customer")
        subscription_id = data.get("subscription")

        email = ""
        if customer_id:
            cust = stripe.Customer.retrieve(customer_id)
            email = (cust.get("email") or "").strip().lower()

        status = None
        current_period_end = None
        if subscription_id:
            sub = stripe.Subscription.retrieve(subscription_id)
            status = sub.get("status")
            current_period_end = sub.get("current_period_end")

        _subs_upsert(email, customer_id, subscription_id, status, current_period_end)

    return {"received": True, "type": event_type}


# =========================
# Premium-protected endpoint
# =========================
@app.post("/premium/chat")
def premium_chat(request: Request, body: ChatIn, email: str = Depends(require_active_user)):
    _require_ai()
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
    name_col = next((c for c in ["name", "book", "title", "label"] if c in cols), None) or (
        cols[1] if len(cols) > 1 else cols[0]
    )
    key_col = next((c for c in ["key", "slug", "code", "abbr", "short_name", "shortname"] if c in cols), "")
    return {"id_col": id_col, "name_col": name_col, "key_col": key_col}


def _normalize_book_key(book: str) -> str:
    b = (book or "").strip().lower()
    b = re.sub(r"\s+", "", b)
    return b


def _resolve_book_id(con: sqlite3.Connection, book: str) -> int:
    raw = (book or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Missing book")

    if raw.isdigit():
        return int(raw)

    mapping = _get_books_table_mapping(con)
    id_col = mapping["id_col"]
    name_col = mapping["name_col"]
    key_col = mapping["key_col"]
    norm = _normalize_book_key(raw)

    row = con.execute(
        f"SELECT {id_col} AS id FROM books WHERE LOWER({name_col}) = LOWER(?) LIMIT 1", (raw,)
    ).fetchone()
    if row:
        return int(row["id"])

    row = con.execute(
        f"SELECT {id_col} AS id FROM books WHERE REPLACE(LOWER({name_col}), ' ', '') = ? LIMIT 1", (norm,)
    ).fetchone()
    if row:
        return int(row["id"])

    if key_col:
        row = con.execute(
            f"SELECT {id_col} AS id FROM books WHERE REPLACE(LOWER({key_col}), ' ', '') = ? LIMIT 1", (norm,)
        ).fetchone()
        if row:
            return int(row["id"])

    raise HTTPException(status_code=404, detail=f"Book not found: {raw}")


@app.get("/bible/health")
def bible_health():
    con = _db()
    try:
        tables = con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        table_names = [t["name"] for t in tables]
        if "books" not in table_names or "verses" not in table_names:
            raise HTTPException(status_code=500, detail=f"Missing tables. Found: {table_names}")

        vcols = set([c.lower() for c in _get_table_columns(con, "verses")])
        needed = {"book_id", "chapter", "verse", "text"}
        if not needed.issubset(vcols):
            raise HTTPException(status_code=500, detail=f"verses table missing columns. Found: {sorted(vcols)}")

        count = con.execute("SELECT COUNT(*) AS c FROM verses").fetchone()["c"]
        return {"status": "ok", "db_path": DB_PATH, "verse_count": int(count)}
    finally:
        con.close()


@app.get("/bible/books")
def bible_books():
    con = _db()
    try:
        mapping = _get_books_table_mapping(con)
        id_col = mapping["id_col"]
        name_col = mapping["name_col"]
        key_col = mapping["key_col"]

        if key_col:
            rows = con.execute(
                f"SELECT {id_col} AS id, {name_col} AS name, {key_col} AS book_key FROM books ORDER BY {id_col}"
            ).fetchall()
        else:
            rows = con.execute(f"SELECT {id_col} AS id, {name_col} AS name FROM books ORDER BY {id_col}").fetchall()

        books = []
        for r in rows:
            books.append(
                {
                    "id": int(r["id"]),
                    "name": str(r["name"]),
                    "key": str(r["book_key"]) if "book_key" in r.keys() else None,
                }
            )

        return {"books": books}
    finally:
        con.close()


@app.get("/bible/chapters")
def bible_chapters(book: str):
    con = _db()
    try:
        book_id = _resolve_book_id(con, book)
        rows = con.execute("SELECT DISTINCT chapter FROM verses WHERE book_id=? ORDER BY chapter", (book_id,)).fetchall()
        chapters = [int(r["chapter"]) for r in rows]
        if not chapters:
            raise HTTPException(status_code=404, detail=f"No chapters for book_id={book_id}")
        return {"book_id": book_id, "chapters": chapters}
    finally:
        con.close()


@app.get("/bible/verses")
def bible_verses(book: str, chapter: int):
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")
    con = _db()
    try:
        book_id = _resolve_book_id(con, book)
        rows = con.execute(
            "SELECT verse FROM verses WHERE book_id=? AND chapter=? ORDER BY verse", (book_id, int(chapter))
        ).fetchall()
        verses = [int(r["verse"]) for r in rows]
        if not verses:
            raise HTTPException(status_code=404, detail=f"No verses for book_id={book_id} ch={chapter}")
        return {"book_id": book_id, "chapter": int(chapter), "verses": verses}
    finally:
        con.close()


@app.get("/bible/passage")
def bible_passage(
    book: str,
    chapter: int,
    full_chapter: bool = False,
    start: int = 1,
    end: Optional[int] = None,
):
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")

    con = _db()
    try:
        book_id = _resolve_book_id(con, book)

        mapping = _get_books_table_mapping(con)
        id_col = mapping["id_col"]
        name_col = mapping["name_col"]
        b = con.execute(f"SELECT {name_col} AS name FROM books WHERE {id_col}=? LIMIT 1", (book_id,)).fetchone()
        book_name = b["name"] if b else str(book)

        if full_chapter:
            rows = con.execute(
                "SELECT verse, text FROM verses WHERE book_id=? AND chapter=? ORDER BY verse",
                (book_id, int(chapter)),
            ).fetchall()
            if not rows:
                raise HTTPException(status_code=404, detail="No chapter text")
            text = "\n".join([f'{r["verse"]} {r["text"]}' for r in rows]).strip()
            return {"reference": f"{book_name} {chapter}", "text": text}

        if start < 1:
            raise HTTPException(status_code=400, detail="Invalid start verse")
        if end is None or end < start:
            end = start

        rows = con.execute(
            """
            SELECT verse, text
            FROM verses
            WHERE book_id=? AND chapter=? AND verse BETWEEN ? AND ?
            ORDER BY verse
            """,
            (book_id, int(chapter), int(start), int(end)),
        ).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="No passage text returned")

        text = "\n".join([f'{r["verse"]} {r["text"]}' for r in rows]).strip()
        ref = f"{book_name} {chapter}:{start}" if start == end else f"{book_name} {chapter}:{start}-{end}"
        return {"reference": ref, "text": text}
    finally:
        con.close()


# =========================
# Free chat + Devotional + Daily Prayer Starters
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

