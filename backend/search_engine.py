# -*- coding: utf-8 -*-
import os
import re
import time
import threading

# Explicitly point to the Google Drive Obsidian Vault directory for data
VAULT_DIR = "G:\\내 드라이브\\agent-guru\\agent-guru"

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
    while ensuring maximum freshness.
    """
    global doc_cache, cache_last_updated
    
    now = time.time()
    if len(doc_cache) > 0:
        if not force and (now - cache_last_updated) < 5:
            return
            
    # Perform scan synchronously to ensure correctness and prevent race conditions
    _perform_cache_scan()

def _perform_cache_scan():
    global doc_cache, cache_last_updated
    with cache_lock:
        new_cache = []
        scan_dirs = ["knowledge", "guru report", "macro report", "tech trend", "startup report", "snp500 report", "monthly_magazines", "llmwiki chat"]
        
        for folder in scan_dirs:
            folder_path = os.path.join(VAULT_DIR, folder)
            if not os.path.exists(folder_path):
                continue
                
            for root, _, files in os.walk(folder_path):
                for file in files:
                    if not file.endswith(".md") or file.lower() == "readme.md":
                        continue
                        
                    file_path = os.path.join(root, file)
                    try:
                        size = os.path.getsize(file_path)
                        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                            content = f.read()
                            
                        # Quick category extraction
                        category = "General"
                        cat_match = re.search(r'^category:\s*(.*)$', content, re.MULTILINE)
                        if cat_match:
                            category = cat_match.group(1).strip()
                            
                        # Extract Obsidian wiki links [[WikiLink]] or [[WikiLink|Alias]]
                        wiki_links = [l.split("|")[0].strip() for l in re.findall(r'\[\[([^\]]+)\]\]', content)]
                        wiki_links = list(set(wiki_links)) # deduplicate
                        
                        new_cache.append({
                            "title": file[:-3].strip(),
                            "path": file_path,
                            "rel_path": os.path.relpath(file_path, VAULT_DIR),
                            "folder": folder,
                            "content": content,
                            "category": category,
                            "size": size,
                            "links": wiki_links
                        })
                    except Exception:
                        pass
                        
        doc_cache = new_cache
        cache_last_updated = time.time()

def get_all_cached_documents():
    """
    Returns the complete list of documents in memory.
    """
    update_document_cache()
    return doc_cache

def search_local_vault(query, limit=5):
    """
    Searches the cached documents in memory using keyword match density.
    Extremely fast (takes < 2ms).
    """
    # Ensure cache is loaded
    update_document_cache()
    
    if not query:
        return []
        
    # Extract terms (alphanumeric and Hangul words, length > 1)
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
        
    results = []
    
    for doc in doc_cache:
        score = 0
        title_lower = doc["title"].lower()
        content_lower = doc["content"].lower()
        
        # 1. Exact title match gets massive score boost
        q_clean = query.lower().replace(".md", "").strip()
        doc_title_clean = doc["title"].lower().replace(".md", "").strip()
        if doc_title_clean == q_clean:
            score += 1000000
            
        # 2. Check match density for other terms
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
            
            results.append({
                "title": doc["title"],
                "path": doc["path"],
                "rel_path": doc["rel_path"],
                "folder": doc["folder"],
                "score": score,
                "category": doc["category"],
                "size": doc["size"],
                "snippet": snippet,
                "links": doc.get("links", [])
            })
            
    # Sort by relevance score descending
    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]

if __name__ == "__main__":
    print("Testing cached local search for 'RAG'...")
    res = search_local_vault("RAG")
    for r in res:
        print(f"[{r['folder']}] {r['title']} (Score: {r['score']})")
