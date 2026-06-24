# -*- coding: utf-8 -*-
import os
import sys
import json
import urllib.parse
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List

# Set vault path
VAULT_DIR = "G:\\내 드라이브\\agent-guru\\agent-guru"
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

sys.path.append(BACKEND_DIR)
import search_engine
import agent_harness
import resource_checker

app = FastAPI(title="Agent-Guru LLM Wiki Server", version="1.0.0")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryModel(BaseModel):
    query: str
    model_mode: Optional[str] = "local"
    draft_path: Optional[str] = None
    is_modification_mode: Optional[bool] = False
    chat_history: Optional[List] = []

class ImproveModel(BaseModel):
    rule: str

class PublishModel(BaseModel):
    draft_path: str

@app.get("/api/status")
def get_resource_status():
    """
    Returns if the local model resource is currently busy with background scheduled tasks.
    """
    busy = resource_checker.check_resource_busy()
    return {
        "busy": busy,
        "message": "로컬 리소스 사용 중" if busy else "대기 중"
    }

@app.get("/api/documents")
def list_documents(query: str = ""):
    """
    Lists and searches documents across the entire vault.
    If query is empty, lists all documents.
    """
    if query:
        results = search_engine.search_local_vault(query, limit=50)
        return results
    else:
        all_docs = search_engine.get_all_cached_documents()
        results = []
        for doc in all_docs:
            results.append({
                "title": doc["title"],
                "path": doc["path"],
                "rel_path": doc["rel_path"],
                "folder": doc["folder"],
                "score": 0,
                "category": doc["category"],
                "size": doc["size"],
                "links": doc.get("links", [])
            })
        return results

@app.get("/api/documents/detail")
def get_document_detail(path: str):
    """
    Retrieves the raw markdown content of any document in the vault by its path.
    """
    # Safe validation to prevent directory traversal outside vault or C: drive workspace
    abs_path = os.path.abspath(path)
    is_in_vault = abs_path.startswith(os.path.abspath(VAULT_DIR))
    is_in_web = abs_path.startswith(os.path.abspath("C:\\Users\\qorrb\\agent-guru-web"))
    
    if not (is_in_vault or is_in_web):
        raise HTTPException(status_code=403, detail="Access denied. Path is outside allowed directories.")
        
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found.")
        
    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return {
            "title": os.path.basename(abs_path)[:-3],
            "path": abs_path,
            "content": content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {e}")

@app.post("/api/chat")
def chat_endpoint(payload: QueryModel):
    """
    SSE Streaming endpoint triggering the Fable-5 Agentic Harness loop.
    """
    query = payload.query
    model_mode = payload.model_mode
    draft_path = payload.draft_path
    is_modification_mode = payload.is_modification_mode
    chat_history = payload.chat_history
    
    # Debug print to trace payload structure
    import sys
    print(f"[DEBUG-PAYLOAD] Received Chat request - Query: '{query}', Mode: '{model_mode}', History count: {len(chat_history) if chat_history else 0}")
    print(f"[DEBUG-PAYLOAD] Chat History Detail: {chat_history}")
    sys.stdout.flush()
    
    return StreamingResponse(
        agent_harness.generate_agent_loop(
            query, 
            model_mode=model_mode, 
            draft_path=draft_path, 
            chat_history=chat_history,
            is_modification_mode=is_modification_mode
        ), 
        media_type="text/event-stream"
    )

@app.post("/api/documents/publish")
def publish_document(payload: PublishModel):
    """
    Moves a draft file from knowledge/drafts/ to llmwiki chat/
    and adds it to linktree.md
    """
    draft_path = payload.draft_path
    if not draft_path or not os.path.exists(draft_path):
        raise HTTPException(status_code=404, detail="임시 초안 파일을 찾을 수 없습니다.")
        
    abs_draft = os.path.abspath(draft_path)
    # Security verification
    if not abs_draft.startswith(os.path.abspath(VAULT_DIR)):
        raise HTTPException(status_code=403, detail="권한이 없습니다. Obsidian Vault 외부에 있는 파일입니다.")
        
    # Check if file is in drafts directory
    if "knowledge\\drafts" not in abs_draft and "knowledge/drafts" not in abs_draft:
        raise HTTPException(status_code=400, detail="초안 폴더(knowledge/drafts)에 있는 파일만 발행할 수 있습니다.")
        
    try:
        # Determine destination folder
        dest_folder = os.path.join(VAULT_DIR, "llmwiki chat")
        os.makedirs(dest_folder, exist_ok=True)
        
        filename = os.path.basename(abs_draft)
        dest_path = os.path.join(dest_folder, filename)
        
        # Move the file
        import shutil
        shutil.move(abs_draft, dest_path)
        
        # Add to linktree.md
        dest_title = filename[:-3] if filename.endswith(".md") else filename
        
        # Helper to update linktree
        from datetime import datetime
        linktree_path = os.path.join(VAULT_DIR, "linktree.md")
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        link_entry = f"- [[{dest_title}]] (발행일시: {now_str})\n"
        
        if os.path.exists(linktree_path):
            with open(linktree_path, "r", encoding="utf-8") as f:
                content = f.read()
        else:
            content = "# 🌳 Linktree: AI Wiki & Chat Reports Index\n\nAI가 생성하고 발행한 투자 리서치 및 분석 보고서 목록입니다. 각 노드를 클릭하여 자세한 보고서 내용을 확인할 수 있습니다.\n\n## 📋 발행된 보고서 목록\n"
            
        if f"[[{dest_title}]]" not in content:
            header = "## 📋 발행된 보고서 목록\n"
            if header in content:
                parts = content.split(header, 1)
                content = parts[0] + header + link_entry + parts[1]
            else:
                content += "\n" + link_entry
                
            with open(linktree_path, "w", encoding="utf-8") as f:
                f.write(content)
                
        # Clear all remaining files in drafts folder to reset it
        drafts_folder = os.path.dirname(abs_draft)
        if os.path.exists(drafts_folder) and os.path.isdir(drafts_folder):
            for file_in_draft in os.listdir(drafts_folder):
                file_path = os.path.join(drafts_folder, file_in_draft)
                try:
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                    elif os.path.isdir(file_path):
                        shutil.rmtree(file_path)
                except Exception as ex:
                    print(f"[CLEANUP-DRAFTS] Failed to remove {file_path}: {ex}")
                
        # Force cache reload so search engine registers it
        search_engine.update_document_cache(force=True)
        
        return {
            "status": "success",
            "message": f"성공적으로 위키에 발행되었습니다: [[{dest_title}]]",
            "path": dest_path,
            "title": dest_title
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"발행 실패: {e}")

@app.post("/api/documents/clear_drafts")
def clear_drafts():
    """
    Clears all files in the drafts directory to reset the notepad.
    """
    drafts_folder = os.path.join(VAULT_DIR, "knowledge", "drafts")
    if os.path.exists(drafts_folder) and os.path.isdir(drafts_folder):
        import shutil
        for file_in_draft in os.listdir(drafts_folder):
            file_path = os.path.join(drafts_folder, file_in_draft)
            try:
                if os.path.isfile(file_path):
                    os.remove(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as ex:
                print(f"[CLEANUP-DRAFTS] Failed to remove {file_path}: {ex}")
    # Force cache reload so search engine registers the deletion
    search_engine.update_document_cache(force=True)
    return {"status": "success", "message": "임시 초안 폴더가 초기화되었습니다."}

@app.post("/api/improve")
def improve_endpoint(payload: ImproveModel):
    """
    Appends a new user-initiated behavioral rule to .agents/AGENTS.md
    """
    rule = payload.rule
    success = agent_harness.write_custom_behavior_rule(rule)
    if success:
        return {"status": "success", "message": f"규칙이 시스템 가이드라인에 추가되었습니다: '{rule}'"}
    else:
        raise HTTPException(status_code=500, detail="시스템 규칙 추가 실패")

if __name__ == "__main__":
    import uvicorn
    print("Starting Agent-Guru API server...")
    uvicorn.run("main:app", host="127.0.0.1", port=8080, reload=True)
