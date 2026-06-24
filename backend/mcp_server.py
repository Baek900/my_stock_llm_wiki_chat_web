# -*- coding: utf-8 -*-
import sys
import os
import json
import re

# Set encoding
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

# Add current dir to path
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BACKEND_DIR)
import search_engine

VAULT_DIR = "G:\\내 드라이브\\agent-guru\\agent-guru"

def list_documents():
    docs = search_engine.get_all_cached_documents()
    results = []
    for doc in docs:
        results.append({
            "title": doc["title"],
            "path": doc["path"],
            "rel_path": doc["rel_path"],
            "folder": doc["folder"],
            "category": doc["category"],
            "size": doc["size"]
        })
    return results

def search_documents(query):
    results = search_engine.search_local_vault(query, limit=20)
    return results

def read_document(path):
    # Safe validation to prevent directory traversal
    abs_path = os.path.abspath(path)
    is_in_vault = abs_path.startswith(os.path.abspath(VAULT_DIR))
    
    if not is_in_vault:
        return {"error": "Access denied. Path is outside vault."}
        
    if not os.path.exists(abs_path):
        return {"error": "File not found."}
        
    try:
        with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return {
            "title": os.path.basename(abs_path)[:-3],
            "path": abs_path,
            "content": content
        }
    except Exception as e:
        return {"error": f"Failed to read file: {e}"}

def write_document(title, content):
    filename = title if title.endswith(".md") else f"{title}.md"
    filename = re.sub(r'[\\/*?:"<>|]', '', filename)
    file_path = os.path.join(VAULT_DIR, "knowledge", filename)
    
    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(content)
        # Force cache reload so it is immediately indexable
        search_engine.update_document_cache(force=True)
        return {"status": "success", "path": file_path}
    except Exception as e:
        return {"error": f"Failed to write file: {e}"}

def handle_request(req):
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params", {})
    
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": { "name": "stock-wiki-vault-mcp", "version": "1.0.0" }
            }
        }
        
    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": [
                    {
                        "name": "list_documents",
                        "description": "Lists all markdown documents inside the Obsidian stock wiki vault.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {}
                        }
                    },
                    {
                        "name": "search_documents",
                        "description": "Searches for documents in the vault using synonym-expanded keyword matching.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "query": {
                                    "type": "string",
                                    "description": "The search query terms (synonyms are auto-expanded)."
                                }
                            },
                            "required": ["query"]
                        }
                    },
                    {
                        "name": "read_document",
                        "description": "Reads the raw markdown content of a document by its file path.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "path": {
                                    "type": "string",
                                    "description": "The absolute path of the markdown file."
                                }
                            },
                            "required": ["path"]
                        }
                    },
                    {
                        "name": "write_document",
                        "description": "Saves or updates a markdown document inside the knowledge/ folder of the vault.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "title": {
                                    "type": "string",
                                    "description": "The title of the document (becomes the filename, e.g., 'ConceptName')."
                                },
                                "content": {
                                    "type": "string",
                                    "description": "The complete markdown body content including any YAML frontmatter."
                                }
                            },
                            "required": ["title", "content"]
                        }
                    }
                ]
            }
        }
        
    elif method == "tools/call":
        tool_name = params.get("name")
        args = params.get("arguments", {})
        
        try:
            if tool_name == "list_documents":
                data = list_documents()
            elif tool_name == "search_documents":
                data = search_documents(args.get("query", ""))
            elif tool_name == "read_document":
                data = read_document(args.get("path", ""))
            elif tool_name == "write_document":
                data = write_document(args.get("title", ""), args.get("content", ""))
            else:
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": { "code": -32601, "message": f"Tool '{tool_name}' not found." }
                }
                
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(data, ensure_ascii=False)
                        }
                    ]
                }
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": { "code": -32000, "message": f"Internal execution error: {e}" }
            }
            
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": { "code": -32601, "message": f"Method '{method}' not found." }
    }

def main():
    # Read line-by-line from stdin
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            req = json.loads(line)
            resp = handle_request(req)
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        except Exception as e:
            # Output format-compliant JSON-RPC error
            err_resp = {
                "jsonrpc": "2.0",
                "id": None,
                "error": { "code": -32700, "message": f"Parse error: {e}" }
            }
            sys.stdout.write(json.dumps(err_resp) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
