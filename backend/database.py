# -*- coding: utf-8 -*-
import os
import sqlite3
from datetime import datetime

# Setup database directory
if os.environ.get("CONTAINER_MODE") == "docker" or os.environ.get("VAULT_DIR") == "/vault":
    DB_PATH = "/data/stock_wiki.db"
else:
    # Setup unsynced local database directory to prevent Google Drive / OneDrive sync lock issues on Windows,
    # and to run on local ephemeral SSD in GCP Cloud Run (avoiding GCSFuse SQLite disk I/O locking errors).
    user_home = os.path.expanduser("~")
    DB_DIR = os.path.join(user_home, ".my_stock_llm_wiki_chat")
    os.makedirs(DB_DIR, exist_ok=True)
    DB_PATH = os.path.join(DB_DIR, "stock_wiki.db")


def get_db_connection():
    """
    Returns a connection to the SQLite database.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def initialize_database():
    """
    Creates necessary tables if they do not exist.
    """
    # Ensure vault directory exists
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if the mtime column exists in documents table.
    # If not, drop tables to recreate them with the new schema.
    try:
        cursor.execute("PRAGMA table_info(documents)")
        columns = [row[1] for row in cursor.fetchall()]
        if columns and "mtime" not in columns:
            print("[DATABASE] Schema out of date. Dropping tables to recreate...")
            cursor.execute("DROP TABLE IF EXISTS document_links")
            cursor.execute("DROP TABLE IF EXISTS documents")
    except Exception as e:
        print(f"[DATABASE] Schema check error: {e}")
    
    # 1. Documents Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            path TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            rel_path TEXT NOT NULL,
            folder TEXT NOT NULL,
            category TEXT,
            size INTEGER,
            mtime REAL,
            content TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # 2. Document Links Table (for Knowledge Graph Edge modeling)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS document_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path TEXT NOT NULL,
            target_title TEXT NOT NULL,
            FOREIGN KEY (source_path) REFERENCES documents (path) ON DELETE CASCADE,
            UNIQUE(source_path, target_title)
        )
    """)
    
    # 3. Custom Guidelines Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS custom_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 4. Research Sessions Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS research_sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            model_mode TEXT DEFAULT 'normal',
            active_draft_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Dynamically alter table to add active_draft_path if updating an existing database
    try:
        cursor.execute("ALTER TABLE research_sessions ADD COLUMN active_draft_path TEXT")
        conn.commit()
        print("[DATABASE] Added active_draft_path column to research_sessions.")
    except Exception:
        # Column already exists
        pass

    # 5. Research Messages Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS research_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            thoughts TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES research_sessions(id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()
    print(f"[DATABASE] SQLite database initialized at: {DB_PATH}")

def save_document_to_db(doc_data):
    """
    Inserts or replaces a document entry and its links.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        # Insert/Replace document metadata (now including mtime)
        cursor.execute("""
            INSERT OR REPLACE INTO documents (path, title, rel_path, folder, category, size, mtime, content, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            doc_data["path"],
            doc_data["title"],
            doc_data["rel_path"],
            doc_data["folder"],
            doc_data.get("category", "General"),
            doc_data.get("size", 0),
            doc_data.get("mtime", 0.0),
            doc_data.get("content", ""),
            now
        ))
        
        # Sync links: delete old ones first, then insert new ones
        cursor.execute("DELETE FROM document_links WHERE source_path = ?", (doc_data["path"],))
        
        links = doc_data.get("links", [])
        for link in links:
            if link:
                cursor.execute("""
                    INSERT OR IGNORE INTO document_links (source_path, target_title)
                    VALUES (?, ?)
                """, (doc_data["path"], link.strip()))

                
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[DATABASE-ERROR] Failed to save document {doc_data.get('title')}: {e}")
    finally:
        conn.close()

def delete_document_from_db(doc_path):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM documents WHERE path = ?", (doc_path,))
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"[DATABASE-ERROR] Failed to delete document {doc_path}: {e}")
    finally:
        conn.close()

def save_custom_rule(rule_text):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO custom_rules (rule) VALUES (?)", (rule_text,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[DATABASE-ERROR] Failed to save custom rule: {e}")
        return False
    finally:
        conn.close()

def get_all_custom_rules():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT rule FROM custom_rules ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [row["rule"] for row in rows]
    finally:
        conn.close()

# --- Research Session Helper Functions ---

def get_research_sessions():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM research_sessions ORDER BY updated_at DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def create_research_session(session_id, title, model_mode="normal"):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        cursor.execute("""
            INSERT INTO research_sessions (id, title, model_mode, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """, (session_id, title, model_mode, now, now))
        conn.commit()
        return {"id": session_id, "title": title, "model_mode": model_mode}
    except Exception as e:
        conn.rollback()
        print(f"[DATABASE-ERROR] Failed to create session {session_id}: {e}")
        raise e
    finally:
        conn.close()

def delete_research_session(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM research_sessions WHERE id = ?", (session_id,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[DATABASE-ERROR] Failed to delete session {session_id}: {e}")
        return False
    finally:
        conn.close()

def get_research_messages(session_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM research_messages WHERE session_id = ? ORDER BY id ASC", (session_id,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def save_research_message(session_id, role, content, thoughts=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        cursor.execute("""
            INSERT INTO research_messages (session_id, role, content, thoughts)
            VALUES (?, ?, ?, ?)
        """, (session_id, role, content, thoughts))
        
        # Update updated_at of the session
        cursor.execute("""
            UPDATE research_sessions SET updated_at = ? WHERE id = ?
        """, (now, session_id))
        
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[DATABASE-ERROR] Failed to save research message for session {session_id}: {e}")
        return False
    finally:
        conn.close()

def update_research_session_draft(session_id, draft_path):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE research_sessions SET active_draft_path = ? WHERE id = ?
        """, (draft_path, session_id))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[DATABASE-ERROR] Failed to update draft path for session {session_id}: {e}")
        return False
    finally:
        conn.close()

def clear_session_draft_by_path(draft_path):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE research_sessions SET active_draft_path = NULL WHERE active_draft_path = ?
        """, (draft_path,))
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[DATABASE-ERROR] Failed to clear draft path {draft_path}: {e}")
        return False
    finally:
        conn.close()

# Auto-initialize on import
initialize_database()
