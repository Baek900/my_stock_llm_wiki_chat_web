# -*- coding: utf-8 -*-
import os
import sqlite3
from datetime import datetime

# Retrieve VAULT_DIR from env or fallback to local path
VAULT_DIR = os.environ.get("VAULT_DIR", "G:\\내 드라이브\\agent-guru\\agent-guru")

# Setup unsynced local database directory to prevent Google Drive / OneDrive sync lock issues
if os.environ.get("CONTAINER_MODE") == "docker" or os.environ.get("VAULT_DIR") == "/vault":
    DB_PATH = "/data/stock_wiki.db"
else:
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

# Auto-initialize on import
initialize_database()
