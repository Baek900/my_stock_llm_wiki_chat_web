# -*- coding: utf-8 -*-
import os
import re
import time
import threading

import database
import vector_db

# Explicitly point to the Google Drive Obsidian Vault directory for data
VAULT_DIR = os.getenv("VAULT_DIR", "G:\\내 드라이브\\agent-guru\\agent-guru")

# Global document index cache to prevent slow disk reads on every keystroke
doc_cache = []
cache_last_updated = 0
cache_lock = threading.Lock()

# Synonym dictionary for domain terms to provide instant local query expansion
SYNONYM_DICT = {
    "rag": ["검색증강생성", "retrieval", "augmented", "generation"],
    "검색증강생성": ["rag", "retrieval", "augmented", "generation"],
    "llm": ["거대언어모델", "large", "language", "model"],
    "거대언어모델": ["llm", "large", "language", "model"],
    "ai": ["인공지능", "artificial", "intelligence"],
    "인공지능": ["ai", "artificial", "intelligence"],
    "금리": ["이자율", "통화정책", "기준금리", "fed", "연준"],
    "이자율": ["금리", "통화정책", "기준금리"],
    "연준": ["fed", "fomc", "금리", "기준금리"],
    "fed": ["연준", "fomc", "금리", "기준금리"],
    "주식": ["증권", "equity", "stock", "시장"],
    "증권": ["주식", "stock"],
    "반도체": ["semiconductor", "chip", "nvdia", "엔비디아"],
    "매크로": ["거시경제", "macro", "macroeconomics"],
    "거시경제": ["매크로", "macro", "macroeconomics"],
    "스타트업": ["startup", "창업", "벤처"],
    "구루": ["guru", "투자", "대가", "포트폴리오"],
    "snp500": ["s&p500", "s&p", "에스앤피", "미국주식"],
    "s&p500": ["snp500", "s&p", "에스앤피"],
    "s&p": ["snp500", "s&p500", "에스앤피"],
    "에스앤피": ["snp500", "s&p500", "s&p"]
}

def _hydrate_db_from_cache(cached_list):
    """
    Hydrates the ephemeral SQLite database from the persisted JSON document list on startup.
    This avoids slow GCSFuse directory walks and prevents CPU/memory OOMs.
    """
    try:
        from datetime import datetime
        import database
        
        conn = database.get_db_connection()
        cursor = conn.cursor()
        
        # Check if database is empty
        cursor.execute("SELECT COUNT(*) FROM documents")
        count = cursor.fetchone()[0]
        if count > 0:
            conn.close()
            return
            
        print(f"[DATABASE-HYDRATE] Hydrating SQLite database with {len(cached_list)} documents from JSON cache...")
        
        doc_insert_data = []
        link_insert_data = []
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        for doc in cached_list:
            # Reconstruct and normalize the absolute path for the Linux container environment
            rel_path = doc.get("rel_path")
            normalized_path = os.path.join(VAULT_DIR, rel_path).replace("\\", "/")
            
            doc_insert_data.append((
                normalized_path,
                doc.get("title"),
                rel_path,
                doc.get("folder"),
                doc.get("category", "General"),
                doc.get("size", 0),
                doc.get("mtime", 0.0),
                doc.get("content", ""),
                now_str,
                now_str
            ))
            
            # Reconstruct document links
            for target_title in doc.get("links", []):
                if target_title:
                    link_insert_data.append((normalized_path, target_title.strip()))
                    
        # Batch insert documents
        cursor.executemany("""
            INSERT OR REPLACE INTO documents (path, title, rel_path, folder, category, size, mtime, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, doc_insert_data)
        
        # Batch insert links
        cursor.executemany("""
            INSERT OR IGNORE INTO document_links (source_path, target_title)
            VALUES (?, ?)
        """, link_insert_data)
        
        conn.commit()
        conn.close()
        print(f"[DATABASE-HYDRATE] Successfully hydrated {len(doc_insert_data)} records and {len(link_insert_data)} links.")
    except Exception as e:
        print(f"[DATABASE-HYDRATE-ERROR] Failed to hydrate database: {e}")

def update_document_cache(force=False):
    """
    Loads all markdown files in the vault into memory synchronously.
    Uses a TTL to avoid redundant reads. On GCP, it caches in memory and
    falls back to reading/writing the JSON index file.
    """
    global doc_cache, cache_last_updated
    
    running_on_gcp = os.getenv("RUNNING_ON_GCP", "false").lower() == "true"
    now = time.time()
    
    if running_on_gcp:
        # Avoid redundant scans within 30 seconds unless forced
        if len(doc_cache) > 0 and not force and (now - cache_last_updated) < 30:
            return
            
        # Try loading from the JSON cache file first if not forced
        cache_file = os.path.join(VAULT_DIR, ".cache", "document_index.json")
        if not force and os.path.exists(cache_file):
            try:
                import json
                start_t = time.time()
                with open(cache_file, "r", encoding="utf-8") as f:
                    doc_cache = json.load(f)
                cache_last_updated = now
                print(f"[CACHE-LOAD-GCP] Loaded {len(doc_cache)} documents from persisted index in {time.time() - start_t:.3f}s")
                
                # Hydrate the empty local SQLite DB from the cache
                _hydrate_db_from_cache(doc_cache)
                
                return
            except Exception as e:
                print(f"[CACHE-LOAD-GCP-ERROR] Failed to load persisted index: {e}")
                
        # If forced or if the cache file is missing/broken, perform a real scan
        # over the mounted GCS bucket files to rebuild and save the index!
        print(f"[CACHE-SCAN-GCP] Rebuilding document index from GCS mount...")
        _perform_cache_scan(force=True)
        return
            
    else:
        # Local mode: Standard TTL-based scanning (5 seconds)
        if len(doc_cache) > 0:
            if not force and (now - cache_last_updated) < 5:
                return
            
    # Perform scan synchronously to ensure correctness and prevent race conditions
    _perform_cache_scan(force=force)

def _perform_cache_scan(force=False):
    global doc_cache, cache_last_updated
    import json
    
    cache_file = os.path.join(VAULT_DIR, ".cache", "document_index.json")
    
    # Try loading from persisted cache index first if not forced and cache is empty
    if not force and not doc_cache:
        if os.path.exists(cache_file):
            try:
                start_t = time.time()
                with open(cache_file, "r", encoding="utf-8") as f:
                    doc_cache = json.load(f)
                cache_last_updated = os.path.getmtime(cache_file)
                print(f"[CACHE-LOAD] Loaded {len(doc_cache)} documents from persisted index in {time.time() - start_t:.3f}s")
                return
            except Exception as e:
                print(f"[CACHE-LOAD] Failed to load persisted index: {e}")

    with cache_lock:
        start_t = time.time()
        new_cache = []
        scan_dirs = ["knowledge", "guru report", "macro report", "tech trend", "startup report", "snp500 report", "monthly_magazines", "llmwiki chat"]
        
        # 0. Batch convert paths in SQLite if they don't match the current running environment's VAULT_DIR.
        # This prevents running slow, locking individual update queries inside the concurrent worker threads.
        try:
            conn = database.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT path, rel_path FROM documents")
            path_updates = []
            for row in cursor.fetchall():
                old_p = row["path"]
                rel_p = row["rel_path"]
                new_p = os.path.join(VAULT_DIR, rel_p).replace("\\", "/")
                if old_p.replace("\\", "/").strip().lower() != new_p.lower():
                    path_updates.append((new_p, old_p))
            
            if path_updates:
                cursor.executemany("UPDATE documents SET path = ? WHERE path = ?", path_updates)
                cursor.executemany("UPDATE document_links SET source_path = ? WHERE source_path = ?", path_updates)
                conn.commit()
                print(f"[CACHE-PATH-SYNC] Successfully batch-updated {len(path_updates)} document paths in SQLite.")
            conn.close()
        except Exception as batch_err:
            print(f"[CACHE-PATH-SYNC-ERROR] Failed to batch update paths: {batch_err}")

        # Load existing documents and links from DB to determine what has changed
        db_docs = {}
        db_docs_by_rel = {}
        db_links = {}
        try:
            conn = database.get_db_connection()
            cursor = conn.cursor()
            
            # Fetch all existing documents metadata
            cursor.execute("SELECT path, title, rel_path, folder, category, size, mtime, content FROM documents")
            for row in cursor.fetchall():
                doc_info = {
                    "path": row["path"],
                    "title": row["title"],
                    "rel_path": row["rel_path"],
                    "folder": row["folder"],
                    "category": row["category"],
                    "size": row["size"],
                    "mtime": row["mtime"],
                    "content": row["content"]
                }
                db_docs[row["path"]] = doc_info
                
                # Normalize relative path key (always forward slash, lowercase)
                rel_key = row["rel_path"].replace("\\", "/").strip().lower()
                db_docs_by_rel[rel_key] = doc_info
                
            # Fetch all document links
            cursor.execute("SELECT source_path, target_title FROM document_links")
            for row in cursor.fetchall():
                sp = row["source_path"]
                tt = row["target_title"]
                if sp not in db_links:
                    db_links[sp] = []
                db_links[sp].append(tt)
                
            conn.close()
        except Exception as e:
            print(f"[CACHE-SCAN-INIT-ERROR] Failed to load cache from DB: {e}")
            
        scanned_paths = set()
        
        # 1. Collect all scanned files quickly (filenames only, no stat calls)
        all_scanned_files = []
        for folder in scan_dirs:
            folder_path = os.path.join(VAULT_DIR, folder)
            if not os.path.exists(folder_path):
                continue
                
            for root, _, files in os.walk(folder_path):
                for file in files:
                    if file.endswith(".md") and file.lower() != "readme.md":
                        file_path = os.path.join(root, file)
                        all_scanned_files.append((file_path, file))
                        scanned_paths.add(file_path)

        # Thread safe locks
        db_write_lock = threading.Lock()
        vector_db_lock = threading.Lock()
        
        def process_single_file(file_info):
            file_path, file = file_info
            try:
                # Concurrently fetch size/mtime via GCSFuse stat requests
                size = os.path.getsize(file_path)
                mtime = os.path.getmtime(file_path)
                
                # Match by relative path to handle cross-platform path differences (Windows vs Linux container)
                rel_path_key = os.path.relpath(file_path, VAULT_DIR).replace("\\", "/").strip().lower()
                cached_doc = db_docs_by_rel.get(rel_path_key)
                
                if cached_doc and cached_doc["size"] == size and abs(float(cached_doc["mtime"]) - float(mtime)) < 2.0:
                    # Re-use cached document metadata
                    doc_data = {
                        "title": cached_doc["title"],
                        "path": file_path,
                        "rel_path": cached_doc["rel_path"],
                        "folder": cached_doc["folder"],
                        "content": cached_doc["content"],
                        "category": cached_doc["category"],
                        "size": size,
                        "mtime": mtime,
                        "links": db_links.get(cached_doc["path"], [])
                    }
                    return doc_data, cached_doc["path"]
                else:
                    # File changed or not in cache - read and index
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read()
                        
                    # Quick category extraction
                    category = "General"
                    cat_match = re.search(r'^category:\s*(.*)$', content, re.MULTILINE)
                    if cat_match:
                        category = cat_match.group(1).strip()
                        
                    # Extract Obsidian wiki links
                    wiki_links = [l.split("|")[0].strip() for l in re.findall(r'\[\[([^\]]+)\]\]', content)]
                    wiki_links = list(set(wiki_links)) # deduplicate
                    
                    rel_folder = os.path.dirname(os.path.relpath(file_path, VAULT_DIR)).replace("\\", "/")
                    doc_data = {
                        "title": file[:-3].strip(),
                        "path": file_path,
                        "rel_path": os.path.relpath(file_path, VAULT_DIR),
                        "folder": rel_folder,
                        "content": content,
                        "category": category,
                        "size": size,
                        "mtime": mtime,
                        "links": wiki_links
                    }
                    
                    # Sync to SQLite RDBMS (thread-safe locks)
                    with db_write_lock:
                        database.save_document_to_db(doc_data)
                    
                    # Only index in Vector DB if NOT running on GCP Cloud Run
                    running_on_gcp = os.getenv("RUNNING_ON_GCP", "false").lower() == "true"
                    if not running_on_gcp:
                        try:
                            with vector_db_lock:
                                vector_db.add_document_to_vector_db(file_path, doc_data["title"], content)
                        except Exception as vec_err:
                            print(f"[VECTOR-DB-ERROR] Failed to index {doc_data['title']}: {vec_err}")
                    return doc_data, True
            except Exception as e:
                safe_file = file.encode('ascii', 'replace').decode('ascii')
                safe_err = str(e).encode('ascii', 'replace').decode('ascii')
                print(f"[CACHE-SCAN-ERROR] Failed processing {safe_file}: {safe_err}")
                return None, None

        # Execute stat and indexing concurrently across 32 threads
        from concurrent.futures import ThreadPoolExecutor
        files_updated = 0
        files_cached = 0
        
        with ThreadPoolExecutor(max_workers=32) as executor:
            thread_results = list(executor.map(process_single_file, all_scanned_files))
            
        for doc_data, flag_or_path in thread_results:
            if doc_data:
                new_cache.append(doc_data)
            if flag_or_path is True:
                files_updated += 1
            elif isinstance(flag_or_path, str):
                files_cached += 1
                scanned_paths.add(flag_or_path)
                
        print(f"[CACHE-SCAN] Completed. Loaded {files_cached} from cache, updated/indexed {files_updated} files.")
        
        # Cleanup deleted files from RDBMS & Vector DB
        deleted_count = 0
        for db_path in db_docs.keys():
            if db_path not in scanned_paths:
                try:
                    title = db_docs[db_path]["title"]
                    safe_title = title.encode('ascii', 'replace').decode('ascii')
                    print(f"[CACHE-SYNC] Cleaning up deleted file: {safe_title}")
                    database.delete_document_from_db(db_path)
                    vector_db.delete_document_from_vector_db(db_path)
                    deleted_count += 1
                except Exception as e:
                    print(f"[CACHE-SCAN-CLEANUP-ERROR] Failed to clean up {db_path}: {e}")
                    
        if deleted_count > 0:
            print(f"[CACHE-SCAN] Cleaned up {deleted_count} deleted files from database.")
            
        doc_cache = new_cache
        cache_last_updated = time.time()
        print(f"[CACHE-SCAN] Synchronously scanned {len(doc_cache)} documents in {time.time() - start_t:.3f}s")
        
        # Save to persisted cache file for subsequent instant loading
        try:
            cache_dir = os.path.dirname(cache_file)
            os.makedirs(cache_dir, exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(new_cache, f, ensure_ascii=False)
            print(f"[CACHE-SAVE] Successfully saved index to {cache_file}")
        except Exception as e:
            print(f"[CACHE-SAVE] Failed to save persisted index: {e}")

def get_all_cached_documents():
    """
    Returns the complete list of documents in memory.
    """
    update_document_cache()
    return doc_cache

def search_local_vault(query, limit=5, fast=False):
    """
    Searches the cached documents using hybrid retrieval:
    Keyword match density + Vector DB similarity search.
    If fast is True, semantic Vector DB search is skipped to run instantly.
    """
    # Ensure cache is loaded
    update_document_cache()
    
    if not query:
        return []
        
    # Extract terms for keyword search
    terms = [t.lower() for t in re.findall(r'[a-zA-Z0-9가-힣]+', query) if len(t) > 1]
    if not terms:
        terms = [query.lower()]
        
    # Expand query terms using synonym dictionary
    expanded_terms = set(terms)
    for term in terms:
        if term in SYNONYM_DICT:
            for syn in SYNONYM_DICT[term]:
                expanded_terms.add(syn)
    terms = list(expanded_terms)
        
    keyword_results = {}
    
    # Ontology-based Weighted Search: determine boost factors based on query terms
    ontology_boosts = {
        "knowledge/macro": 0,
        "knowledge/institutions": 0,
        "knowledge/people": 0,
        "knowledge/tech_themes": 0,
        "knowledge/industries": 0,
        "knowledge/segments": 0
    }
    
    query_lower = query.lower()
    
    # 1. Macro & Institutions Keywords
    macro_kws = ["금리", "cpi", "gdp", "통화정책", "연준", "fed", "fomc", "인플레이션", "inflation", "긴축", "완화", "거시경제", "macro"]
    inst_kws = ["연준", "fed", "fomc", "sec", "ecb", "boj", "한은", "한국은행", "imf", "세계은행", "정부", "institutions"]
    if any(kw in query_lower for kw in macro_kws):
        ontology_boosts["knowledge/macro"] += 300
    if any(kw in query_lower for kw in inst_kws):
        ontology_boosts["knowledge/institutions"] += 300
        
    # 2. People & Guru Keywords
    people_kws = ["버핏", "buffett", "멍거", "munger", "린치", "lynch", "에크먼", "ackman", "소로스", "soros", "드러켄밀러", "druckenmiller", "구루", "guru"]
    if any(kw in query_lower for kw in people_kws):
        ontology_boosts["knowledge/people"] += 300
        
    # 3. Technology Themes Keywords
    tech_kws = ["ai", "hbm", "gpu", "데이터 센터", "데이터센터", "반도체", "칩", "llm", "cuda", "인공지능", "gpt", "gemini", "nvidia", "엔비디아"]
    if any(kw in query_lower for kw in tech_kws):
        ontology_boosts["knowledge/tech_themes"] += 300
        
    # 4. Industries Keywords
    industry_kws = ["산업", "업종", "벨류체인", "밸류체인", "자동차", "바이오", "에너지", "화학", "철강", "조선", "빅테크"]
    if any(kw in query_lower for kw in industry_kws):
        ontology_boosts["knowledge/industries"] += 300
        
    # 5. Segments Keywords
    segment_kws = ["세그먼트", "점유율", "시장점유율", "market share", "매출비중", "사업부", "부문"]
    if any(kw in query_lower for kw in segment_kws):
        ontology_boosts["knowledge/segments"] += 300
    
    # 1. Keyword search over memory cache
    for doc in doc_cache:
        score = 0
        title_lower = doc["title"].lower()
        content_lower = doc["content"].lower()
        
        # Exact title match gets massive score boost
        q_clean = query.lower().replace(".md", "").strip()
        doc_title_clean = doc["title"].lower().replace(".md", "").strip()
        if doc_title_clean == q_clean:
            score += 1000000
            
        for term in terms:
            if term in title_lower:
                score += 150 * title_lower.count(term)
            if term in content_lower:
                score += 1 * content_lower.count(term)
                
        if score > 0:
            body = doc["content"]
            if body.startswith("---"):
                parts = body.split("---", 2)
                if len(parts) >= 3:
                    body = parts[2]
                    
            if "## 관련 리서치 언급 맥락" in body:
                body = body.split("## 관련 리서치 언급 맥락")[0]
            elif "## Recent Mentions" in body:
                body = body.split("## Recent Mentions")[0]
                
            snippet = body.strip()[:1500]
            
            keyword_results[doc["path"]] = {
                "title": doc["title"],
                "path": doc["path"],
                "rel_path": doc["rel_path"],
                "folder": doc["folder"],
                "score": score,
                "category": doc["category"],
                "size": doc["size"],
                "snippet": snippet,
                "links": doc.get("links", [])
            }
            
    # 2. Semantic Search over Vector DB (skipped on GCP Cloud Run to avoid model loading overhead)
    running_on_gcp = os.getenv("RUNNING_ON_GCP", "false").lower() == "true"
    if not fast and not running_on_gcp:
        vector_results = vector_db.search_vector_db(query, limit=limit * 2)
    else:
        vector_results = []
    
    # 3. Hybrid Merger
    merged_results = {}
    
    # Add all keyword results to merged set
    for path, res in keyword_results.items():
        merged_results[path] = res
        
    # Merge vector results
    for vec_res in vector_results:
        path = vec_res["path"]
        # Convert vector similarity score (0~1) to a scale comparable with keyword scoring (e.g. max 500)
        vector_score = vec_res["score"] * 500
        
        if path in merged_results:
            # Boost score of existing document
            merged_results[path]["score"] += vector_score
            # If the keyword snippet is shorter/less informative than vector snippet, replace it
            if len(merged_results[path]["snippet"]) < 300 and vec_res["snippet"]:
                merged_results[path]["snippet"] = vec_res["snippet"]
        else:
            # Find in cache to populate other metadata
            doc = next((d for d in doc_cache if d["path"] == path), None)
            if doc:
                merged_results[path] = {
                    "title": doc["title"],
                    "path": doc["path"],
                    "rel_path": doc["rel_path"],
                    "folder": doc["folder"],
                    "score": vector_score,
                    "category": doc["category"],
                    "size": doc["size"],
                    "snippet": vec_res["snippet"][:1500] if vec_res["snippet"] else "",
                    "links": doc.get("links", [])
                }
                
    results_list = list(merged_results.values())
    
    # Prevent session context leakage: skip drafts and past chat reports during RAG search
    results_list = [
        res for res in results_list
        if not (res.get("folder", "").startswith("knowledge/drafts") or res.get("folder", "").startswith("llmwiki chat"))
    ]
    
    # Apply ontology-based weighted boost
    for res in results_list:
        folder = res.get("folder", "")
        if folder in ontology_boosts:
            res["score"] += ontology_boosts[folder]
            
    results_list.sort(key=lambda x: x["score"], reverse=True)
    return results_list[:limit]

def add_or_update_doc_in_cache(doc_data):
    """
    Directly adds or updates a document in the in-memory cache and persists it to JSON.
    Also syncs to SQLite and Vector DB if we are not running on GCP or if they succeed.
    """
    global doc_cache, cache_last_updated
    with cache_lock:
        # Remove existing if any
        doc_cache = [d for d in doc_cache if d["path"] != doc_data["path"]]
        doc_cache.append(doc_data)
        cache_last_updated = time.time()
        
        # Save to persisted JSON cache
        cache_file = os.path.join(VAULT_DIR, ".cache", "document_index.json")
        try:
            cache_dir = os.path.dirname(cache_file)
            os.makedirs(cache_dir, exist_ok=True)
            import json
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(doc_cache, f, ensure_ascii=False)
            print(f"[CACHE-SAVE] Successfully saved updated index to {cache_file}")
        except Exception as e:
            print(f"[CACHE-SAVE] Failed to save updated index: {e}")
            
        # Sync to SQLite and Vector DB (wrapped to prevent crashes)
        try:
            import database
            database.save_document_to_db(doc_data)
        except Exception as e:
            print(f"[CACHE-SYNC-DB] Failed to sync to SQLite: {e}")
            
        running_on_gcp = os.getenv("RUNNING_ON_GCP", "false").lower() == "true"
        if not running_on_gcp:
            try:
                import vector_db
                vector_db.add_document_to_vector_db(doc_data["path"], doc_data["title"], doc_data["content"])
            except Exception as e:
                print(f"[CACHE-SYNC-VEC] Failed to sync to Vector DB: {e}")

def delete_doc_from_cache(doc_path):
    """
    Removes a document from the in-memory cache and persists the change.
    """
    global doc_cache, cache_last_updated
    with cache_lock:
        doc_cache = [d for d in doc_cache if d["path"] != doc_path]
        cache_last_updated = time.time()
        
        cache_file = os.path.join(VAULT_DIR, ".cache", "document_index.json")
        try:
            import json
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(doc_cache, f, ensure_ascii=False)
            print(f"[CACHE-DELETE] Successfully saved updated index after deleting {doc_path}")
        except Exception as e:
            print(f"[CACHE-DELETE] Failed to save updated index: {e}")
            
        # Sync to SQLite and Vector DB
        try:
            import database
            database.delete_document_from_db(doc_path)
        except Exception as e:
            print(f"[CACHE-DELETE-DB] Failed to delete from SQLite: {e}")
            
        try:
            import vector_db
            vector_db.delete_document_from_vector_db(doc_path)
        except Exception as e:
            print(f"[CACHE-DELETE-VEC] Failed to delete from Vector DB: {e}")

if __name__ == "__main__":
    print("Testing hybrid search for 'RAG'...")
    res = search_local_vault("RAG")
    for r in res:
        print(f"[{r['folder']}] {r['title']} (Score: {r['score']:.1f})")

