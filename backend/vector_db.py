# -*- coding: utf-8 -*-
import os
import chromadb
from chromadb.utils import embedding_functions

# Retrieve VAULT_DIR from env or fallback to local path
VAULT_DIR = os.environ.get("VAULT_DIR", "G:\\내 드라이브\\agent-guru\\agent-guru")

# Setup unsynced local ChromaDB directory to prevent Google Drive / OneDrive sync lock issues
if os.environ.get("CONTAINER_MODE") == "docker" or os.environ.get("VAULT_DIR") == "/vault":
    CHROMA_PATH = "/data/chroma_db"
else:
    user_home = os.path.expanduser("~")
    DB_DIR = os.path.join(user_home, ".my_stock_llm_wiki_chat")
    os.makedirs(DB_DIR, exist_ok=True)
    CHROMA_PATH = os.path.join(DB_DIR, "chroma_db")


# Global variables for Chroma client and collection
_client = None
_collection = None

def get_vector_db_collection():
    """
    Retrieves or initializes the ChromaDB client and collection.
    Uses the default ChromaDB sentence-transformer embedding function ('all-MiniLM-L6-v2').
    """
    global _client, _collection
    if _collection is not None:
        return _collection

    # Ensure storage folder exists
    os.makedirs(CHROMA_PATH, exist_ok=True)
    
    # Initialize persistent client
    _client = chromadb.PersistentClient(path=CHROMA_PATH)
    
    # Use default embedding function
    emb_fn = embedding_functions.DefaultEmbeddingFunction()
    
    # Create or get collection
    _collection = _client.get_or_create_collection(
        name="stock_wiki_rag",
        embedding_function=emb_fn,
        metadata={"hnsw:space": "cosine"}
    )
    return _collection

def chunk_text(text, chunk_size=800, overlap=100):
    """
    Splits text into chunks of specified size with overlap for better context preservation.
    """
    if not text:
        return []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

def add_document_to_vector_db(path, title, content):
    """
    Chunks and indexes a document in the Vector DB.
    """
    try:
        collection = get_vector_db_collection()
        
        # Delete existing entries for this path to avoid duplicates
        collection.delete(where={"path": path})
        
        chunks = chunk_text(content)
        if not chunks:
            return
        
        documents = []
        metadatas = []
        ids = []
        
        for idx, chunk in enumerate(chunks):
            documents.append(chunk)
            metadatas.append({
                "path": path,
                "title": title,
                "chunk_index": idx
            })
            ids.append(f"{path}_chunk_{idx}")
            
        collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        safe_title = title.encode('ascii', 'replace').decode('ascii')
        print(f"[VECTOR-DB] Successfully indexed '{safe_title}' ({len(chunks)} chunks).")
    except Exception as e:
        safe_title = title.encode('ascii', 'replace').decode('ascii')
        safe_err = str(e).encode('ascii', 'replace').decode('ascii')
        print(f"[VECTOR-DB-ERROR] Failed to index document '{safe_title}': {safe_err}")

def delete_document_from_vector_db(path):
    """
    Deletes all indexed chunks associated with the file path.
    """
    try:
        collection = get_vector_db_collection()
        collection.delete(where={"path": path})
        print(f"[VECTOR-DB] Deleted index entries for path: {path}")
    except Exception as e:
        print(f"[VECTOR-DB-ERROR] Failed to delete index for {path}: {e}")

def search_vector_db(query, limit=5):
    """
    Queries the Vector DB and returns matching documents with metadata.
    """
    try:
        collection = get_vector_db_collection()
        results = collection.query(
            query_texts=[query],
            n_results=limit
        )
        
        formatted_results = []
        if results and "documents" in results and results["documents"]:
            # Chroma returns nested arrays: results['documents'][0], results['metadatas'][0], etc.
            docs = results["documents"][0]
            metas = results["metadatas"][0]
            distances = results["distances"][0] if "distances" in results else [0]*len(docs)
            
            for i in range(len(docs)):
                formatted_results.append({
                    "title": metas[i]["title"],
                    "path": metas[i]["path"],
                    "snippet": docs[i],
                    "score": 1.0 - distances[i] # Cosine similarity representation
                })
        return formatted_results
    except Exception as e:
        print(f"[VECTOR-DB-ERROR] Search failed for query '{query}': {e}")
        return []
