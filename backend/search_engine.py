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

def update_document_cache(force=False):
    """
    Loads all markdown files in the vault into memory synchronously.
    Uses a 5-second TTL to avoid redundant reads within the same API request flow
    while ensuring maximum freshness. On GCP, it uses the JSON cache file.
    """
    global doc_cache, cache_last_updated
    
    running_on_gcp = os.getenv("RUNNING_ON_GCP", "false").lower() == "true"
    now = time.time()
    
    if running_on_gcp:
        # On GCP Cloud Run, avoid expensive full directory walks completely.
        # We rely on the persisted document_index.json which is loaded on startup.
        if len(doc_cache) > 0 and not force:
            return
        
        # If empty or forced, try to load from the JSON cache file.
        cache_file = os.path.join(VAULT_DIR, ".cache", "document_index.json")
        if os.path.exists(cache_file):
            try:
                import json
                start_t = time.time()
                with open(cache_file, "r", encoding="utf-8") as f:
                    doc_cache = json.load(f)
                cache_last_updated = time.time()
                print(f"[CACHE-LOAD-GCP] Loaded {len(doc_cache)} documents from persisted index in {time.time() - start_t:.3f}s")
                return
            except Exception as e:
                print(f"[CACHE-LOAD-GCP-ERROR] Failed to load persisted index: {e}")
        
        # Fallback to scan only if cache file is missing entirely and we have no data
        if len(doc_cache) > 0:
            return
            
    else:
        # Local mode: Standard TTL-based scanning
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
        
        # Load existing documents and links from DB to determine what has changed
        db_docs = {}
        db_links = {}
        try:
            conn = database.get_db_connection()
            cursor = conn.cursor()
            
            # Fetch all existing documents metadata
            cursor.execute("SELECT path, title, rel_path, folder, category, size, mtime, content FROM documents")
            for row in cursor.fetchall():
                db_docs[row["path"]] = {
                    "path": row["path"],
                    "title": row["title"],
                    "rel_path": row["rel_path"],
                    "folder": row["folder"],
                    "category": row["category"],
                    "size": row["size"],
                    "mtime": row["mtime"],
                    "content": row["content"]
                }
                
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
        files_updated = 0
        files_cached = 0
        
        for folder in scan_dirs:
            folder_path = os.path.join(VAULT_DIR, folder)
            if not os.path.exists(folder_path):
                continue
                
            for root, _, files in os.walk(folder_path):
                for file in files:
                    if not file.endswith(".md") or file.lower() == "readme.md":
                        continue
                        
                    file_path = os.path.join(root, file)
                    scanned_paths.add(file_path)
                    
                    try:
                        size = os.path.getsize(file_path)
                        mtime = os.path.getmtime(file_path)
                        
                        # Check if file has changed
                        cached_doc = db_docs.get(file_path)
                        if cached_doc and cached_doc["size"] == size and cached_doc["mtime"] == mtime:
                            # Re-use cached document
                            doc_data = {
                                "title": cached_doc["title"],
                                "path": file_path,
                                "rel_path": cached_doc["rel_path"],
                                "folder": cached_doc["folder"],
                                "content": cached_doc["content"],
                                "category": cached_doc["category"],
                                "size": size,
                                "mtime": mtime,
                                "links": db_links.get(file_path, [])
                            }
                            new_cache.append(doc_data)
                            files_cached += 1
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
                            new_cache.append(doc_data)
                            
                            # Sync to SQLite RDBMS and Chroma Vector DB
                            database.save_document_to_db(doc_data)
                            vector_db.add_document_to_vector_db(file_path, doc_data["title"], content)
                            files_updated += 1
                            
                    except Exception as e:
                        safe_file = file.encode('ascii', 'replace').decode('ascii')
                        safe_err = str(e).encode('ascii', 'replace').decode('ascii')
                        print(f"[CACHE-SCAN-ERROR] Failed processing {safe_file}: {safe_err}")
                        
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

def search_local_vault(query, limit=5):
    """
    Searches the cached documents using hybrid retrieval:
    Keyword match density + Vector DB similarity search.
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
            
    # 2. Semantic Search over Vector DB
    vector_results = vector_db.search_vector_db(query, limit=limit * 2)
    
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

