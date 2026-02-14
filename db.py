import sqlite3
from pathlib import Path
from typing import Optional, List, Dict


def _candidate_data_dirs() -> List[Path]:
    """Handle local + Render paths safely."""
    here = Path(__file__).resolve().parent
    root = here.parent
    cwd = Path.cwd().resolve()
    return [
        here / "data",
        root / "data",
        cwd / "data",
    ]


def _data_dir() -> Path:
    for d in _candidate_data_dirs():
        if d.exists() and d.is_dir():
            return d
    return Path(__file__).resolve().parent / "data"


DB_PATH = _data_dir() / "bible.db"


def _connect():
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Bible DB not found at {DB_PATH}")
    return sqlite3.connect(DB_PATH)


def get_verse(book: str, chapter: int, verse: int) -> Optional[str]:
    conn = _connect()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT v.text
        FROM verses v
        JOIN books b ON b.id = v.book_id
        WHERE b.name=? AND v.chapter=? AND v.verse=?
        """,
        (book, chapter, verse),
    )

    row = cur.fetchone()
    conn.close()

    return row[0] if row else None


def get_chapter(book: str, chapter: int) -> List[Dict]:
    conn = _connect()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT v.verse, v.text
        FROM verses v
        JOIN books b ON b.id = v.book_id
        WHERE b.name=? AND v.chapter=?
        ORDER BY v.verse
        """,
        (book, chapter),
    )

    rows = cur.fetchall()
    conn.close()

    return [{"verse": v, "text": t} for v, t in rows]


if __name__ == "__main__":
    print(get_verse("Genesis", 1, 1))
