import os
import re
import time
import hmac
import hashlib
import base64
import sqlite3
from typing import Optional, Dict, List, Tuple, Any

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

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
MANIFEST_PATH = os.path.join(FRONTEND_DIR, "manifest.webmanifest")
SW_PATH = os.path.join(FRONTEND_DIR, "service-worker.js")
ICONS_DIR = os.path.join(FRONTEND_DIR, "icons")

# Static mounts
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

if os.path.isdir(ICONS_DIR):
    app.mount("/icons", StaticFiles(directory=ICONS_DIR), name="icons")

# --------------------
# ENV
# --------------------
STRIPE_SECRET_KEY = (os.getenv("STRIPE_SECRET_KEY") or "").strip()
STRIPE_PRICE_ID = (os.getenv("STRIPE_PRICE_ID") or "").strip()
STRIPE_WEBHOOK_SECRET = (os.getenv("STRIPE_WEBHOOK_SECRET") or "").strip()  # optional

APP_BASE_URL = (os.getenv("APP_BASE_URL") or "").strip().rstrip("/")
JWT_SECRET = (os.getenv("JWT_SECRET") or "").strip()

ALLOWLIST_EMAILS_RAW = (os.getenv("ALLOWLIST_EMAILS") or "").strip()
DEV_TRUST_LOCAL = (os.getenv("DEV_TRUST_LOCAL") or "").strip().lower() in ("1", "true", "yes")

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

ALLOWLIST_SET = set()
if ALLOWLIST_EMAILS_RAW:
    for e in ALLOWLIST_EMAILS_RAW.split(","):
        e = (e or "").strip().lower()
        if e:
            ALLOWLIST_SET.add(e)


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


def _enforce_allowlist(email: str):
    if not ALLOWLIST_SET:
        return
    if email.lower() not in ALLOWLIST_SET:
        raise HTTPException(403, "This email is not allowed.")


# --------------------
# Signed token cookie helper
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
# OPTIONAL local cache (Stripe subscription cache)
# --------------------
SUB_DB_PATH = os.path.join(BASE_DIR, "data", "subs_cache.db")


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
            CREATE TABLE IF NOT EXISTS subs_cache (
                email TEXT PRIMARY KEY,
                stripe_customer_id TEXT,
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


def _cache_upsert(email: str, customer_id: Optional[str], status: Optional[str], current_period_end: Optional[int]):
    email = (email or "").strip().lower()
    customer_id = (customer_id or "").strip() if isinstance(customer_id, str) else None
    if not email:
        return
    now = int(time.time())
    con = _subs_db()
    try:
        con.execute(
            """
            INSERT INTO subs_cache (email, stripe_customer_id, status, current_period_end, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                stripe_customer_id=excluded.stripe_customer_id,
                status=excluded.status,
                current_period_end=excluded.current_period_end,
                updated_at=excluded.updated_at
            """,
            (email, customer_id, status, current_period_end, now),
        )
        con.commit()
    finally:
        con.close()


def _cache_get(email: str) -> Optional[dict]:
    email = (email or "").strip().lower()
    if not email:
        return None
    con = _subs_db()
    try:
        row = con.execute("SELECT * FROM subs_cache WHERE email=?", (email,)).fetchone()
        return dict(row) if row else None
    finally:
        con.close()


# --------------------
# AI daily cache (Devotional / Daily Prayer)
# --------------------
AI_CACHE_DB_PATH = os.path.join(BASE_DIR, "data", "ai_cache.db")


def _ai_cache_db():
    os.makedirs(os.path.dirname(AI_CACHE_DB_PATH), exist_ok=True)
    con = sqlite3.connect(AI_CACHE_DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def _ai_cache_init():
    con = _ai_cache_db()
    try:
        con.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_cache (
                cache_key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        con.commit()
    finally:
        con.close()


_ai_cache_init()


def _ai_cache_get(cache_key: str, max_age_seconds: int = 60 * 60 * 24):
    if not cache_key:
        return None
    con = _ai_cache_db()
    try:
        row = con.execute(
            "SELECT value, created_at FROM ai_cache WHERE cache_key=?",
            (cache_key,),
        ).fetchone()
        if not row:
            return None
        if int(time.time()) - int(row["created_at"]) > max_age_seconds:
            return None
        return str(row["value"])
    finally:
        con.close()


def _ai_cache_set(cache_key: str, value: str):
    if not cache_key or value is None:
        return
    con = _ai_cache_db()
    try:
        con.execute(
            """
            INSERT INTO ai_cache (cache_key, value, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(cache_key) DO UPDATE SET
                value=excluded.value,
                created_at=excluded.created_at
            """,
            (cache_key, value, int(time.time())),
        )
        con.commit()
    finally:
        con.close()


def _today_utc_yyyymmdd():
    return time.strftime("%Y-%m-%d", time.gmtime())


# --------------------
# Stripe: lookup subscription directly by email
# --------------------
def _stripe_find_customer_id_by_email(email: str) -> Optional[str]:
    email = (email or "").strip().lower()
    if not email:
        return None

    try:
        res = stripe.Customer.search(query=f"email:'{email}'", limit=1)
        if res and res.get("data"):
            return res["data"][0].get("id")
    except Exception:
        pass

    try:
        res = stripe.Customer.list(email=email, limit=1)
        if res and res.get("data"):
            return res["data"][0].get("id")
    except Exception:
        pass

    return None


def _stripe_get_customer_active_status(customer_id: str) -> Tuple[bool, Optional[str], Optional[int]]:
    if not customer_id:
        return (False, None, None)

    subs = stripe.Subscription.list(customer=customer_id, status="all", limit=10)
    if not subs or not subs.get("data"):
        return (False, None, None)

    ACTIVE_STATUSES = {"active", "trialing"}

    best = None
    best_rank = -1
    for s in subs["data"]:
        st = (s.get("status") or "").lower()
        rank = 0
        if st == "active":
            rank = 4
        elif st == "trialing":
            rank = 3
        elif st == "past_due":
            rank = 2
        elif st == "incomplete":
            rank = 1
        if rank > best_rank:
            best_rank = rank
            best = s

    if not best:
        return (False, None, None)

    status = (best.get("status") or "").lower()
    cpe = best.get("current_period_end")
    return (status in ACTIVE_STATUSES, status or None, int(cpe) if cpe else None)


def _stripe_check_email_subscription(email: str) -> dict:
    _require_stripe_ready()

    email = (email or "").strip().lower()
    if not email:
        return {"email": None, "customer_id": None, "active": False, "status": None, "current_period_end": None}

    customer_id = _stripe_find_customer_id_by_email(email)
    if not customer_id:
        return {"email": email, "customer_id": None, "active": False, "status": None, "current_period_end": None}

    active, status, cpe = _stripe_get_customer_active_status(customer_id)
    _cache_upsert(email, customer_id, status, cpe)

    return {"email": email, "customer_id": customer_id, "active": active, "status": status, "current_period_end": cpe}


def require_active_user(request: Request) -> str:
    email = get_current_email(request)
    if not email:
        raise HTTPException(401, "Not logged in.")

    info = _stripe_check_email_subscription(email)
    if not info["active"]:
        raise HTTPException(402, "Subscription inactive. Please subscribe.")

    return email


# --------------------
# Gemini (AI)
# --------------------
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
client = genai.Client(api_key=API_KEY) if API_KEY else None
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


class Msg(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatIn(BaseModel):
    # Support BOTH payload shapes:
    # 1) your old/new server shape: {prompt, history, lang}
    # 2) your current app.js shape: {message, lang}
    prompt: Optional[str] = None
    message: Optional[str] = None
    history: Optional[List[Msg]] = None
    lang: Optional[str] = "en"


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


def _build_chat_prompt(system_prompt: str, user_prompt: str, history: Optional[List[Msg]]) -> str:
    lines: List[str] = [system_prompt.strip(), "", "Conversation so far:"]
    if history:
        trimmed = history[-16:]
        for m in trimmed:
            role = "User" if (m.role or "").lower().startswith("user") else "Alyana"
            content = (m.content or "").strip()
            if content:
                lines.append(f"{role}: {content}")
    lines.append("")
    lines.append(f"User: {user_prompt.strip()}")
    lines.append("Alyana:")
    return "\n".join(lines)


def _extract_user_prompt(body: ChatIn) -> str:
    # prefer prompt, else message
    txt = (body.prompt or body.message or "").strip()
    if not txt:
        raise HTTPException(status_code=400, detail="Missing prompt/message.")
    return txt


def _system_prompt_for_lang(lang: str) -> str:
    # Force language output strictly
    if lang == "es":
        return (
            "Eres Alyana Luz, una asistente cálida y centrada en la Escritura. "
            "Oras con el usuario, recomiendas pasajes bíblicos y explicas versículos con sencillez. "
            "Responde SIEMPRE en español claro y natural (sin JSON ni código) a menos que el usuario pida algo técnico. "
            "Mantén las respuestas concisas pero compasivas. "
            "Recuerda hechos importantes que el usuario comparta en esta conversación."
        )
    return (
        "You are Alyana Luz, a warm, scripture-focused assistant. "
        "You pray with the user, suggest Bible passages, and explain verses. "
        "Reply in friendly, natural text (no JSON or code) unless the user asks "
        "for something technical. Keep answers concise but caring. "
        "Remember important facts the user shares in this conversation."
    )


# =========================
# Frontend serving (root files)
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


@app.get("/manifest.webmanifest", include_in_schema=False)
async def serve_manifest():
    if not os.path.exists(MANIFEST_PATH):
        return PlainTextResponse(f"Missing {MANIFEST_PATH}", status_code=404)
    return FileResponse(
        MANIFEST_PATH,
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.get("/service-worker.js", include_in_schema=False)
async def serve_service_worker():
    if not os.path.exists(SW_PATH):
        return PlainTextResponse(f"Missing {SW_PATH}", status_code=404)
    return FileResponse(
        SW_PATH,
        media_type="application/javascript",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


@app.get("/health")
def health():
    return {
        "status": "ok",
        "commit": os.getenv("RENDER_GIT_COMMIT", "unknown"),
        "frontend_dir": FRONTEND_DIR,
        "index_exists": os.path.exists(INDEX_PATH),
        "appjs_exists": os.path.exists(APPJS_PATH),
        "sw_exists": os.path.exists(SW_PATH),
        "manifest_exists": os.path.exists(MANIFEST_PATH),
        "icons_dir_exists": os.path.isdir(ICONS_DIR),
        "ai_configured": bool(API_KEY),
        "model": MODEL_NAME,
        "stripe_configured": bool(STRIPE_SECRET_KEY and STRIPE_PRICE_ID and APP_BASE_URL),
        "jwt_configured": bool(JWT_SECRET and len(JWT_SECRET) >= 32),
        "allowlist_enabled": bool(ALLOWLIST_SET),
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
    _require_jwt_secret()
    _require_stripe_ready()

    email = (body.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "Missing email.")

    _enforce_allowlist(email)

    info = _stripe_check_email_subscription(email)
    if not info["active"]:
        raise HTTPException(402, "Subscription inactive or not found.")

    resp = JSONResponse(
        {"ok": True, "email": email, "active": True, "status": info["status"], "current_period_end": info["current_period_end"]}
    )
    _set_auth_cookie(resp, email)
    return resp


@app.post("/stripe/create-checkout-session")
def create_checkout_session(body: CheckoutIn):
    _require_stripe_ready()

    email = (body.email or "").strip().lower() if body else ""
    if email:
        _enforce_allowlist(email)

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

    _enforce_allowlist(email)

    cached = _cache_get(email)
    customer_id = (cached or {}).get("stripe_customer_id")
    if not customer_id:
        customer_id = _stripe_find_customer_id_by_email(email)

    if not customer_id:
        raise HTTPException(404, "No Stripe customer found for that email yet.")

    try:
        portal = stripe.billing_portal.Session.create(customer=customer_id, return_url=f"{APP_BASE_URL}/")
        return {"url": portal.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Stripe portal error: {str(e)}")


@app.get("/billing/success", include_in_schema=False)
def billing_success(session_id: str):
    _require_stripe_ready()
    _require_jwt_secret()

    try:
        session = stripe.checkout.Session.retrieve(session_id, expand=["customer", "subscription"])

        email = ""
        cd = session.get("customer_details") or {}
        if isinstance(cd, dict) and cd.get("email"):
            email = cd["email"]
        elif session.get("customer_email"):
            email = session["customer_email"]
        email = (email or "").strip().lower()

        if email:
            _enforce_allowlist(email)

        customer_raw = session.get("customer")
        customer_id = customer_raw.get("id") if isinstance(customer_raw, dict) else customer_raw

        sub_obj = session.get("subscription")
        sub_id = sub_obj.get("id") if isinstance(sub_obj, dict) else sub_obj

        status = None
        current_period_end = None

        try:
            if isinstance(sub_id, str) and sub_id:
                sub = stripe.Subscription.retrieve(sub_id)
                status = sub.get("status")
                current_period_end = sub.get("current_period_end")
            elif isinstance(sub_obj, dict) and sub_obj.get("status"):
                status = sub_obj.get("status")
                current_period_end = sub_obj.get("current_period_end")
        except Exception:
            pass

        if email and isinstance(customer_id, str) and customer_id:
            _cache_upsert(
                email,
                customer_id,
                (status or "").lower() if status else None,
                int(current_period_end) if current_period_end else None,
            )

        resp = RedirectResponse(url="/?billing=success")
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
    email = get_current_email(request)
    if not email:
        return {"logged_in": False, "email": None, "active": False, "status": None, "current_period_end": None}

    _enforce_allowlist(email)

    info = _stripe_check_email_subscription(email)
    return {
        "logged_in": True,
        "email": email,
        "active": bool(info["active"]),
        "status": info["status"],
        "current_period_end": info["current_period_end"],
    }


@app.post("/logout")
def logout():
    resp = JSONResponse({"ok": True})
    return _clear_auth_cookie(resp)


# =========================
# Premium-protected endpoint
# =========================
@app.post("/premium/chat")
def premium_chat(request: Request, body: ChatIn, email: str = Depends(require_active_user)):
    _require_ai()
    lang = _norm_lang(body.lang)
    user_prompt = _extract_user_prompt(body)
    system_prompt = _system_prompt_for_lang(lang)
    full_prompt = _build_chat_prompt(system_prompt, user_prompt, body.history)
    text = _generate_text_with_retries(full_prompt) or ("Lo siento, no pude responder ahora." if lang == "es" else "Sorry, I couldn't respond right now.")
    return {"status": "success", "email": email, "message": text, "lang": lang}


# =========================
# Bible Reader (LOCAL DBs)
# =========================
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_EN_PATH = os.path.join(DATA_DIR, "bible.db")
DB_ES_RVR_PATH = os.path.join(DATA_DIR, "bible_es_rvr.db")

# You can add more DBs later, always local/free:
BIBLE_VERSIONS: Dict[str, Dict[str, str]] = {
    "en_default": {"lang": "en", "path": DB_EN_PATH, "label": "English (default)"},
    "es_rvr": {"lang": "es", "path": DB_ES_RVR_PATH, "label": "Español (RVR)"},
}


def _pick_bible_db(lang: Optional[str], version: Optional[str]) -> Tuple[str, str]:
    """Return (version_key, db_path)."""
    l = _norm_lang(lang)
    v = (version or "").strip()

    if v and v in BIBLE_VERSIONS:
        return v, BIBLE_VERSIONS[v]["path"]

    # Default selection by language:
    if l == "es":
        return "es_rvr", BIBLE_VERSIONS["es_rvr"]["path"]

    return "en_default", BIBLE_VERSIONS["en_default"]["path"]


def _db(db_path: str):
    if not os.path.exists(db_path):
        raise HTTPException(status_code=500, detail=f"Bible DB not found at {db_path}")
    con = sqlite3.connect(db_path)
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


@app.get("/bible/versions")
def bible_versions():
    # Helpful for later UI: list available versions
    out = []
    for k, v in BIBLE_VERSIONS.items():
        out.append({"key": k, "lang": v["lang"], "label": v["label"], "exists": os.path.exists(v["path"])})
    return {"versions": out}


@app.get("/bible/health")
def bible_health(lang: Optional[str] = None, version: Optional[str] = None):
    ver_key, db_path = _pick_bible_db(lang, version)
    con = _db(db_path)
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
        return {"status": "ok", "version": ver_key, "db_path": db_path, "verse_count": int(count)}
    finally:
        con.close()


# Compatibility alias for your frontend/app.js (it calls /bible/status)
@app.get("/bible/status")
def bible_status(lang: Optional[str] = None, version: Optional[str] = None):
    return bible_health(lang=lang, version=version)


@app.get("/bible/books")
def bible_books(lang: Optional[str] = None, version: Optional[str] = None):
    ver_key, db_path = _pick_bible_db(lang, version)
    con = _db(db_path)
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
        names = []
        for r in rows:
            nm = str(r["name"])
            names.append(nm)
            books.append(
                {
                    "id": int(r["id"]),
                    "name": nm,
                    "key": str(r["book_key"]) if "book_key" in r.keys() else None,
                }
            )

        # Return BOTH shapes so any frontend can use it:
        return {"version": ver_key, "books": names, "book_objects": books}
    finally:
        con.close()


@app.get("/bible/chapters")
def bible_chapters(book: str, lang: Optional[str] = None, version: Optional[str] = None):
    ver_key, db_path = _pick_bible_db(lang, version)
    con = _db(db_path)
    try:
        book_id = _resolve_book_id(con, book)
        rows = con.execute("SELECT DISTINCT chapter FROM verses WHERE book_id=? ORDER BY chapter", (book_id,)).fetchall()
        chapters = [int(r["chapter"]) for r in rows]
        if not chapters:
            raise HTTPException(status_code=404, detail=f"No chapters for book_id={book_id}")
        # Return BOTH list + count (your app.js looks for count-ish values)
        return {"version": ver_key, "book_id": book_id, "chapters": chapters, "count": len(chapters)}
    finally:
        con.close()


@app.get("/bible/verses")
def bible_verses(book: str, chapter: int, lang: Optional[str] = None, version: Optional[str] = None):
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")
    ver_key, db_path = _pick_bible_db(lang, version)
    con = _db(db_path)
    try:
        book_id = _resolve_book_id(con, book)
        rows = con.execute(
            "SELECT verse FROM verses WHERE book_id=? AND chapter=? ORDER BY verse", (book_id, int(chapter))
        ).fetchall()
        verses = [int(r["verse"]) for r in rows]
        if not verses:
            raise HTTPException(status_code=404, detail=f"No verses for book_id={book_id} ch={chapter}")
        return {"version": ver_key, "book_id": book_id, "chapter": int(chapter), "verses": verses}
    finally:
        con.close()


@app.get("/bible/passage")
def bible_passage(
    book: str,
    chapter: int,
    full_chapter: bool = False,
    start: int = 1,
    end: Optional[int] = None,
    lang: Optional[str] = None,
    version: Optional[str] = None,
):
    if chapter < 1:
        raise HTTPException(status_code=400, detail="Invalid chapter")

    ver_key, db_path = _pick_bible_db(lang, version)
    con = _db(db_path)
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
            return {"version": ver_key, "reference": f"{book_name} {chapter}", "text": text}

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
        return {"version": ver_key, "reference": ref, "text": text}
    finally:
        con.close()


# Compatibility endpoint for your frontend/app.js (it calls /bible/text?book=...&chapter=...&start=...&end=...&mode=...)
@app.get("/bible/text")
def bible_text(
    book: str,
    chapter: int,
    start: Optional[str] = "",
    end: Optional[str] = "",
    mode: Optional[str] = "",
    lang: Optional[str] = None,
    version: Optional[str] = None,
):
    m = (mode or "").strip().lower()
    s = int(start) if str(start).strip().isdigit() else None
    e = int(end) if str(end).strip().isdigit() else None

    if m == "chapter" or (not s and not e):
        return bible_passage(book=book, chapter=chapter, full_chapter=True, lang=lang, version=version)

    if s is None:
        s = 1
    return bible_passage(book=book, chapter=chapter, full_chapter=False, start=s, end=e, lang=lang, version=version)


# =========================
# Free chat + Devotional + Daily Prayer
# =========================
@app.post("/chat")
def chat(body: ChatIn):
    _require_ai()
    lang = _norm_lang(body.lang)
    user_prompt = _extract_user_prompt(body)
    system_prompt = _system_prompt_for_lang(lang)
    full_prompt = _build_chat_prompt(system_prompt, user_prompt, body.history)
    text = _generate_text_with_retries(full_prompt) or ("Lo siento, no pude responder ahora." if lang == "es" else "Sorry, I couldn't respond right now.")
    return {"status": "success", "message": text, "lang": lang}


@app.post("/devotional")
def devotional(body: Optional[LangIn] = None):
    _require_ai()
    lang = _norm_lang(body.lang if body else "en")

    cache_key = f"devotional:{lang}:{_today_utc_yyyymmdd()}"
    cached = _ai_cache_get(cache_key)
    if cached:
        return {"text": cached, "json": cached, "cached": True, "lang": lang}

    if lang == "es":
        prompt = """
Eres Alyana Luz. Crea un devocional en JSON ESTRICTO SOLAMENTE.
Devuelve exactamente esta forma:
{
  "scripture": "Libro Capítulo:Verso(s) — texto del verso (1-5 versos, breve)",
  "brief_explanation": "2-4 oraciones explicándolo de forma simple"
}
Reglas:
- Devuelve SOLO JSON válido (sin markdown).
- Todo en español.
- Cita claramente la referencia.
- Mantén los versos breves (1-5).
""".strip()
    else:
        prompt = """
You are Alyana Luz. Create a devotional in STRICT JSON ONLY.
Return exactly this shape:
{
  "scripture": "Book Chapter:Verse(s) — verse text (1-5 verses, brief)",
  "brief_explanation": "2-4 sentences explaining it simply"
}
Rules:
- Return ONLY valid JSON (no markdown).
- Everything in English.
- Clearly cite the reference.
- Keep verses brief (1-5).
""".strip()

    text = _generate_text_with_retries(prompt) or "{}"
    _ai_cache_set(cache_key, text)
    return {"text": text, "json": text, "cached": False, "lang": lang}


@app.post("/daily_prayer")
def daily_prayer(body: Optional[LangIn] = None):
    _require_ai()
    lang = _norm_lang(body.lang if body else "en")

    cache_key = f"daily_prayer:{lang}:{_today_utc_yyyymmdd()}"
    cached = _ai_cache_get(cache_key)
    if cached:
        return {"text": cached, "json": cached, "cached": True, "lang": lang}

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
    _ai_cache_set(cache_key, text)
    return {"text": text, "json": text, "cached": False, "lang": lang}




