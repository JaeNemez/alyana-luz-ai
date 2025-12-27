from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/bible", tags=["bible"])

# Map "version" -> sqlite filename.
DB_MAP = {
    "en_default": "bible.db",
    "rvr1909": "bible_es_rvr.db",
    # aliases
    "es_rvr": "bible_es_rvr.db",
    "es": "bible_es_rvr.db",
    "en": "bible.db",
}


def _candidate_data_dirs() -> List[Path]:
    """
    Be robust on Render/local:
    - ./data next to this file
    - project root ./data
    - current working dir ./data
    """
    here = Path(__file__).resolve().parent
    root = here.parent
    cwd = Path.cwd().resolve()
    return [
        here / "data",
        root / "data",
        cwd / "data",
    ]


def _data_dir() -> Path:
    # Choose the first existing data dir; otherwise default to "here/data"
    for d in _candidate_data_dirs():
        if d.exists() and d.is_dir():
            return d
    return Path(__file__).resolve().parent / "data"


def resolve_version(version: Optional[str]) -> str:
    v = (version or "en_default").strip()
    return v or "en_default"


def resolve_db_path(version: Optional[str]) -> Path:
    v = resolve_version(version)
    filename = DB_MAP.get(v)
    if not filename:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown version '{v}'. Allowed: {sorted(DB_MAP.keys())}",
        )
    return _data_dir() / filename


def open_db(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Bible DB not found at {db_path}. Make sure your data folder is deployed.",
        )
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    return con


def verse_count(con: sqlite3.Connection) -> int:
    row = con.execute("SELECT COUNT(*) AS c FROM verses").fetchone()
    return int(row["c"]) if row else 0


def get_books(con: sqlite3.Connection) -> List[Dict[str, Any]]:
    rows = con.execute("SELECT id, name FROM books ORDER BY id").fetchall()
    return [{"id": int(r["id"]), "name": str(r["name"])} for r in rows]


def get_book_id_by_name(con: sqlite3.Connection, book_name: str) -> Optional[int]:
    name = (book_name or "").strip()
    if not name:
        return None

    row = con.execute(
        "SELECT id FROM books WHERE LOWER(name)=LOWER(?) LIMIT 1",
        (name,),
    ).fetchone()
    if row:
        return int(row["id"])

    row = con.execute(
        "SELECT id FROM books WHERE LOWER(name) LIKE LOWER(?) LIMIT 1",
        (f"%{name}%",),
    ).fetchone()
    if row:
        return int(row["id"])

    return None


def get_max_chapter(con: sqlite3.Connection, book_id: int) -> int:
    row = con.execute(
        "SELECT MAX(chapter) AS m FROM verses WHERE book_id=?",
        (book_id,),
    ).fetchone()
    m = row["m"] if row else None
    return int(m) if m is not None else 0


def get_max_verse(con: sqlite3.Connection, book_id: int, chapter: int) -> int:
    row = con.execute(
        "SELECT MAX(verse) AS m FROM verses WHERE book_id=? AND chapter=?",
        (book_id, chapter),
    ).fetchone()
    m = row["m"] if row else None
    return int(m) if m is not None else 0


@router.get("/status")
def bible_status(version: Optional[str] = Query(default="en_default")) -> Dict[str, Any]:
    db_path = resolve_db_path(version)
    con = open_db(db_path)
    try:
        c = verse_count(con)
        return {
            "status": "ok",
            "version": resolve_version(version),
            "db_path": str(db_path),
            "verse_count": c,
        }
    finally:
        con.close()


@router.get("/books")
def bible_books(version: Optional[str] = Query(default="en_default")) -> Dict[str, Any]:
    db_path = resolve_db_path(version)
    con = open_db(db_path)
    try:
        books = get_books(con)
        return {"version": resolve_version(version), "books": books}
    finally:
        con.close()


@router.get("/chapters")
def bible_chapters(
    version: Optional[str] = Query(default="en_default"),
    book_id: Optional[int] = Query(default=None),
    book: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    db_path = resolve_db_path(version)
    con = open_db(db_path)
    try:
        bid = book_id
        if bid is None and book:
            bid = get_book_id_by_name(con, book)
        if bid is None:
            raise HTTPException(status_code=400, detail="Missing book_id or book")

        max_ch = get_max_chapter(con, int(bid))
        if max_ch <= 0:
            raise HTTPException(status_code=404, detail="Book not found (no chapters)")

        return {
            "version": resolve_version(version),
            "book_id": int(bid),
            "chapters": list(range(1, max_ch + 1)),
        }
    finally:
        con.close()


@router.get("/verses_max")
def bible_verses_max(
    version: Optional[str] = Query(default="en_default"),
    book_id: int = Query(..., ge=1),
    chapter: int = Query(..., ge=1),
) -> Dict[str, Any]:
    db_path = resolve_db_path(version)
    con = open_db(db_path)
    try:
        m = get_max_verse(con, int(book_id), int(chapter))
        if m <= 0:
            raise HTTPException(status_code=404, detail="Not Found")
        return {"version": resolve_version(version), "book_id": int(book_id), "chapter": int(chapter), "max_verse": m}
    finally:
        con.close()


@router.get("/text")
def bible_text(
    version: Optional[str] = Query(default="en_default"),
    book_id: Optional[int] = Query(default=None),
    book: Optional[str] = Query(default=None),
    chapter: int = Query(..., ge=1),
    verse_start: Optional[int] = Query(default=None, ge=1),
    verse_end: Optional[int] = Query(default=None, ge=1),
    whole_chapter: bool = Query(default=False),
) -> Dict[str, Any]:
    db_path = resolve_db_path(version)
    con = open_db(db_path)
    try:
        bid = book_id
        if bid is None and book:
            bid = get_book_id_by_name(con, book)
        if bid is None:
            raise HTTPException(status_code=400, detail="Missing book_id or book")

        bid = int(bid)

        if whole_chapter or (verse_start is None and verse_end is None):
            rows = con.execute(
                """
                SELECT verse, text
                FROM verses
                WHERE book_id=? AND chapter=?
                ORDER BY verse
                """,
                (bid, chapter),
            ).fetchall()
        else:
            vs = int(verse_start) if verse_start is not None else 1
            ve = int(verse_end) if verse_end is not None else vs
            if ve < vs:
                vs, ve = ve, vs

            rows = con.execute(
                """
                SELECT verse, text
                FROM verses
                WHERE book_id=? AND chapter=? AND verse BETWEEN ? AND ?
                ORDER BY verse
                """,
                (bid, chapter, vs, ve),
            ).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail="Not Found")

        b = con.execute("SELECT name FROM books WHERE id=? LIMIT 1", (bid,)).fetchone()
        book_name = str(b["name"]) if b else str(bid)

        verses = [{"verse": int(r["verse"]), "text": str(r["text"])} for r in rows]
        text_joined = "\n".join([f"{v['verse']}. {v['text']}" for v in verses])

        return {
            "version": resolve_version(version),
            "book_id": bid,
            "book": book_name,
            "chapter": int(chapter),
            "verses": verses,
            "text": text_joined,
        }
    finally:
        con.close()



