import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "bible.db"

def get_verse(book: str, chapter: int, verse: int) -> str | None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        SELECT v.text
        FROM verses v
        JOIN books b ON b.id = v.book_id
        WHERE b.name=? AND v.chapter=? AND v.verse=?
    """, (book, chapter, verse))

    row = cur.fetchone()
    conn.close()

    return row[0] if row else None


def get_chapter(book: str, chapter: int) -> list[dict]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        SELECT v.verse, v.text
        FROM verses v
        JOIN books b ON b.id = v.book_id
        WHERE b.name=? AND v.chapter=?
        ORDER BY v.verse
    """, (book, chapter))

    rows = cur.fetchall()
    conn.close()

    return [{"verse": v, "text": t} for v, t in rows]


if __name__ == "__main__":
    print(get_verse("Genesis", 1, 1))

