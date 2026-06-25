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
from fastapi import Depends, Header

# Set vault path
VAULT_DIR = os.getenv("VAULT_DIR", "G:\\내 드라이브\\agent-guru\\agent-guru")
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

sys.path.append(BACKEND_DIR)
import search_engine
import agent_harness
import resource_checker


# Passcode Auth config
import hashlib
ACCESS_CODE = os.getenv("ACCESS_CODE", "")
if ACCESS_CODE:
    # Use a deterministic SHA-256 hash of the access code as the session token
    # so that the token is identical across all container instances and persists across restarts.
    SESSION_TOKEN = hashlib.sha256(f"agent-guru-session-salt:{ACCESS_CODE}".encode("utf-8")).hexdigest()
else:
    SESSION_TOKEN = "local_dev_token"

class LoginModel(BaseModel):
    passcode: str

class VerifySessionModel(BaseModel):
    token: str

def verify_auth_token(authorization: Optional[str] = Header(None)):
    # Bypass auth if ACCESS_CODE is not configured (prevents locking out before configuration)
    if not ACCESS_CODE:
        return "local_dev_user"
        
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="인증 토큰이 누락되었습니다.")
    
    token = authorization.split(" ")[1]
    if token != SESSION_TOKEN:
        raise HTTPException(status_code=401, detail="유효하지 않거나 만료된 세션 토큰입니다.")
        
    return "authenticated_user"

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
    model_mode: Optional[str] = "normal"
    draft_path: Optional[str] = None
    is_modification_mode: Optional[bool] = False
    chat_history: Optional[List] = []
    approved_searches: Optional[List[str]] = None

class ImproveModel(BaseModel):
    rule: str

class PublishModel(BaseModel):
    draft_path: str


@app.get("/api/auth/config")
def get_auth_config():
    return {"is_auth_enabled": bool(ACCESS_CODE)}

@app.post("/api/auth/login")
def login_endpoint(payload: LoginModel):
    if not ACCESS_CODE:
        return {"status": "success", "token": "local_dev_token"}
    if payload.passcode == ACCESS_CODE:
        return {"status": "success", "token": SESSION_TOKEN}
    else:
        raise HTTPException(status_code=401, detail="비밀번호가 올바르지 않습니다.")

@app.post("/api/auth/verify")
def verify_session_endpoint(payload: VerifySessionModel):
    if not ACCESS_CODE:
        return {"status": "success"}
    if payload.token == SESSION_TOKEN:
        return {"status": "success"}
    else:
        raise HTTPException(status_code=401, detail="유효하지 않은 세션입니다.")

@app.get("/api/status")
def get_resource_status(current_user: str = Depends(verify_auth_token)):
    """
    Returns the database (vault) latest update status and document count.
    """
    docs = search_engine.get_all_cached_documents()
    doc_count = len(docs)
    
    last_updated_time = search_engine.cache_last_updated
    if last_updated_time > 0:
        import datetime
        dt = datetime.datetime.fromtimestamp(last_updated_time)
        last_updated_str = dt.strftime("%Y-%m-%d %H:%M:%S")
    else:
        last_updated_str = "기록 없음"
        
    return {
        "busy": False,
        "doc_count": doc_count,
        "last_updated": last_updated_str,
        "status": "연동 완료" if doc_count > 0 else "동기화 필요"
    }

@app.get("/api/documents")
def list_documents(query: str = "", current_user: str = Depends(verify_auth_token)):
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
def get_document_detail(path: str, current_user: str = Depends(verify_auth_token)):
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
async def chat_endpoint(payload: QueryModel, current_user: str = Depends(verify_auth_token)):
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
    
    # Since agent_harness.generate_agent_loop is an async generator, we pass it directly to StreamingResponse
    return StreamingResponse(
        agent_harness.generate_agent_loop(
            query, 
            model_mode=model_mode, 
            draft_path=draft_path, 
            chat_history=chat_history,
            is_modification_mode=is_modification_mode,
            approved_searches=payload.approved_searches
        ), 
    )

class SearchApprovalModel(BaseModel):
    request_id: str
    approved: bool

@app.post("/api/chat/approve_search")
async def approve_search(payload: SearchApprovalModel):
    request_id = payload.request_id
    approved = payload.approved
    
    if request_id in agent_harness.active_search_approvals:
        approval_dict = agent_harness.active_search_approvals[request_id]
        approval_dict["approved"] = approved
        approval_dict["event"].set()
        return {"status": "success", "message": f"Search request {request_id} has been {'approved' if approved else 'rejected'}."}
    else:
        raise HTTPException(status_code=404, detail="Active search approval request not found or already processed.")

@app.post("/api/documents/publish")
def publish_document(payload: PublishModel, current_user: str = Depends(verify_auth_token)):
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
def clear_drafts(current_user: str = Depends(verify_auth_token)):
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
def improve_endpoint(payload: ImproveModel, current_user: str = Depends(verify_auth_token)):
    """
    Appends a new user-initiated behavioral rule to .agents/AGENTS.md
    """
    rule = payload.rule
    success = agent_harness.write_custom_behavior_rule(rule)
    if success:
        return {"status": "success", "message": f"규칙이 시스템 가이드라인에 추가되었습니다: '{rule}'"}
    else:
        raise HTTPException(status_code=500, detail="시스템 규칙 추가 실패")


# Mount React frontend static files for deployment (if they exist)
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(BACKEND_DIR), "frontend", "dist"))
if os.path.exists(frontend_dist):
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse
    
    print(f"Serving static frontend files from: {frontend_dist}")
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    @app.get("/{catchall:path}")
    def serve_frontend_spa(catchall: str):
        if catchall.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found")
        return FileResponse(os.path.join(frontend_dist, "index.html"))

if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 8080))
    print(f"Starting Agent-Guru API server on {host}:{port}...")
    uvicorn.run("main:app", host=host, port=port, reload=True)

