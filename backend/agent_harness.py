# -*- coding: utf-8 -*-
import os
import sys
import json
import re
import time
import urllib.request
import urllib.parse
from datetime import datetime
import asyncio


# Explicitly point to the Google Drive Obsidian Vault directory
VAULT_DIR = "G:\\내 드라이브\\agent-guru\\agent-guru"
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
SCRIPTS_DIR = os.path.join(VAULT_DIR, "workflow", "scripts")
sys.path.append(SCRIPTS_DIR)

# Dynamically import scripts from vault workflow folder
import local_llm
import search_engine
import web_searcher
import resource_checker

MODEL_NAME = "Gemma-4-26B-A4B-it-GGUF"
AGENTS_RULE_FILE = os.path.join(VAULT_DIR, ".agents", "AGENTS.md")
HISTORY_FILE = os.path.join(VAULT_DIR, "knowledge", "Interaction_History.md")

def get_latest_draft_path():
    draft_folder = os.path.join(VAULT_DIR, "knowledge", "drafts")
    if not os.path.exists(draft_folder):
        return None
    files = [os.path.join(draft_folder, f) for f in os.listdir(draft_folder) if f.endswith(".md")]
    if not files:
        return None
    files.sort(key=os.path.getmtime, reverse=True)
    return files[0]

def log(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [AGENT-HARNESS] {msg}")
    sys.stdout.flush()

# Global dictionary to track active search approvals: {request_id: {"event": asyncio.Event(), "approved": bool}}
active_search_approvals = {}

async def request_search_approval(query, model_mode):
    """
    Suspends execution to wait for user's search approval.
    Returns: (approved, list_of_sse_events)
    """
    request_id = f"req_{int(time.time() * 1000)}"
    event = asyncio.Event()
    active_search_approvals[request_id] = {
        "event": event,
        "approved": None
    }
    
    events = [
        sse_yield({"type": "search_approval_required", "request_id": request_id, "query": query}),
        sse_yield({"type": "thought", "text": f"👤 사용자의 웹 검색 승인을 기다리고 있습니다... (검색어: '{query}')"})
    ]
    
    # Wait for the event (set by main.py endpoint)
    await event.wait()
    
    approval_data = active_search_approvals.pop(request_id, {})
    approved = approval_data.get("approved", False)
    
    if approved:
        events.append(sse_yield({"type": "thought", "text": "✅ 웹 검색 승인됨. DuckDuckGo 실시간 검색을 수행합니다."}))
    else:
        events.append(sse_yield({"type": "thought", "text": "❌ 웹 검색 거부됨. 기존 지식만으로 답변을 합성합니다."}))
        
    return approved, events


async def query_local_model_sync(prompt, temperature=0.2, model_mode="local", target_model=None):
    """
    Helper to run a quick non-streaming completion asynchronously in a thread pool.
    """
    is_cloud = (model_mode in ["cloud", "turbo"])
    messages = [{"role": "user", "content": prompt}]
    
    if not target_model:
        if is_cloud:
            if model_mode == "turbo":
                target_model = "gemini-3.1-pro"
            else:
                target_model = "gemini-3.1-flash-lite"
        else:
            target_model = MODEL_NAME
            
    # Run the blocking network/local LLM call in a background thread to keep event loop free
    res = await asyncio.to_thread(
        local_llm.generate_chat_completion,
        target_model,
        messages,
        temperature=temperature,
        force_local=not is_cloud,
        direct_local=not is_cloud
    )
    return res

def clean_json_string(output_text):
    """
    Extracts the JSON substring out of markdown code blocks or unstructured LLM output.
    """
    if not output_text:
        return {}
    try:
        match = re.search(r'```json\s*(.*?)\s*```', output_text, re.DOTALL | re.IGNORECASE)
        if match:
            return json.loads(match.group(1).strip())
        
        match_general = re.search(r'(\{.*\})', output_text, re.DOTALL)
        if match_general:
            return json.loads(match_general.group(1).strip())
            
        return json.loads(output_text.strip())
    except Exception:
        return {}

def read_custom_behavior_rules():
    """
    Reads dynamically added system prompt guidelines from .agents/AGENTS.md
    """
    if os.path.exists(AGENTS_RULE_FILE):
        try:
            with open(AGENTS_RULE_FILE, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception:
            pass
    return ""

def write_custom_behavior_rule(new_rule):
    """
    Appends a new rule to .agents/AGENTS.md
    """
    os.makedirs(os.path.dirname(AGENTS_RULE_FILE), exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted_rule = f"\n\n### [반영일자: {timestamp}]\n- {new_rule}\n"
    
    try:
        is_new = not os.path.exists(AGENTS_RULE_FILE)
        with open(AGENTS_RULE_FILE, "a", encoding="utf-8") as f:
            if is_new:
                f.write("# 에이전트 커스텀 행동 가이드라인 (Dynamic User Rules)\n")
                f.write("사용자의 피드백을 통해 학습된 행동 규칙 목록입니다.\n")
            f.write(formatted_rule)
        return True
    except Exception:
        return False

def append_to_interaction_history(user_query, ai_response):
    """
    Appends the conversation summary to knowledge/Interaction_History.md
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    summary_entry = f"""
### 🕒 [{timestamp}] 대화 세션
- **질문**: {user_query[:200]}...
- **핵심 답변**: {ai_response[:300]}...
- **피드백 유형**: 자동 기록됨

---
"""
    try:
        os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
        is_new = not os.path.exists(HISTORY_FILE)
        with open(HISTORY_FILE, "a", encoding="utf-8") as f:
            if is_new:
                f.write("---\ntype: knowledge-term\ncategory: Interaction History\ntags:\n  - knowledge/interaction\n---\n")
                f.write("# 대화 이력 피드백 허브 (Interaction History)\n")
                f.write("사용자와 에이전트 간의 주요 Q&A 기록입니다. 자율 검색 시 피드백 컨텍스트로 인용됩니다.\n\n")
            f.write(summary_entry)
        return True
    except Exception:
        return False

def parse_frontmatter(content):
    if not content.startswith("---"):
        return {}, content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content
    fm_text = parts[1]
    body = parts[2]
    
    fm_dict = {}
    lines = fm_text.splitlines()
    current_key = None
    
    for line in lines:
        if not line.strip():
            continue
        # Check if it is a list item for the current key
        if line.strip().startswith("-") and current_key:
            val = line.strip()[1:].strip().strip('"').strip("'")
            if current_key not in fm_dict:
                fm_dict[current_key] = []
            elif not isinstance(fm_dict[current_key], list):
                fm_dict[current_key] = [fm_dict[current_key]]
            fm_dict[current_key].append(val)
        elif ":" in line:
            parts_line = line.split(":", 1)
            key = parts_line[0].strip()
            val = parts_line[1].strip()
            current_key = key
            if val == "":
                fm_dict[key] = []
            elif val.startswith("[") and val.endswith("]"):
                # inline list: e.g. [a, b]
                items = [item.strip().strip('"').strip("'") for item in val[1:-1].split(",") if item.strip()]
                fm_dict[key] = items
            else:
                fm_dict[key] = val.strip('"').strip("'")
    return fm_dict, body

def dump_frontmatter(fm_dict, body):
    lines = ["---"]
    for key, val in fm_dict.items():
        if isinstance(val, list):
            lines.append(f"{key}:")
            for item in val:
                # If the item has special chars, quote it
                if ":" in item or "[" in item or "]" in item or "#" in item:
                    lines.append(f"  - \"{item}\"")
                else:
                    lines.append(f"  - {item}")
        else:
            lines.append(f"{key}: {val}")
    lines.append("---")
    return "\n".join(lines) + "\n" + body

def enrich_document_frontmatter(file_path, new_terms):
    if not os.path.exists(file_path):
        return False
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        
        fm_dict, body = parse_frontmatter(content)
        
        # If no frontmatter existed, initialize it
        if not fm_dict and not content.startswith("---"):
            fm_dict = {
                "type": "knowledge-term",
                "category": "Auto-Enriched",
                "aliases": [],
                "tags": []
            }
            body = content
        
        # Let's add terms to aliases
        if "aliases" not in fm_dict:
            fm_dict["aliases"] = []
        elif not isinstance(fm_dict["aliases"], list):
            fm_dict["aliases"] = [fm_dict["aliases"]]
            
        if "tags" not in fm_dict:
            fm_dict["tags"] = []
        elif not isinstance(fm_dict["tags"], list):
            fm_dict["tags"] = [fm_dict["tags"]]
            
        updated = False
        for term in new_terms:
            term = term.strip()
            if not term:
                continue
            
            # Add to aliases if not already present
            if term not in fm_dict["aliases"]:
                fm_dict["aliases"].append(term)
                updated = True
            
            # Add tag if not present
            tag_name = f"knowledge/synonym/{term.replace(' ', '_')}"
            if tag_name not in fm_dict["tags"]:
                fm_dict["tags"].append(tag_name)
                updated = True
                
        if updated:
            new_content = dump_frontmatter(fm_dict, body)
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            return True
        return False
    except Exception as e:
        print(f"Error enriching frontmatter for {file_path}: {e}")
        return False

def sse_yield(data_dict):
    """
    Encodes data as a valid SSE event string.
    """
    return f"data: {json.dumps(data_dict, ensure_ascii=False)}\n\n"

async def save_report_to_wiki(query, full_response, local_refs=None, web_refs=None, draft_path=None, model_mode="cloud"):
    """
    Saves the comprehensive report to knowledge/drafts/YYYY-MM-DD_HHMMSS-요약문장.md
    Appends reference links at the bottom. Overwrites existing draft if draft_path is provided.
    """
    if local_refs is None:
        local_refs = []
    if web_refs is None:
        web_refs = []
        
    # 1. Generate a clean Korean summary (10 chars/words approx) for filename
    summary_prompt = f"""
    아래 사용자의 질문과 리서치 답변의 핵심 주제를 요약하는 2~4단어의 짧은 파일명을 한글로 작성해 주세요.
    조사, 문장부호, 특수기호 없이 명사와 단어 위주로 띄어쓰기는 언더바(_)로 연결해 주세요.
    예: "워런_버핏_투자_포트폴리오", "인공지능_반도체_동향", "글로벌_인플레이션_분석"
    
    질문: {query}
    답변 시작 부분: {full_response[:300]}
    
    출력 (설명 없이 오직 파일명으로 쓸 단어만 반환):
    """
    summary_text = await query_local_model_sync(summary_prompt, temperature=0.1, model_mode=model_mode)
    if summary_text:
        summary_text = summary_text.strip().replace(" ", "_")
        summary_text = re.sub(r'[\\/*?:"<>| \r\n\t`\'".,]', '', summary_text)
    if not summary_text or len(summary_text) < 2:
        summary_text = "투자_리서치_보고서"
        
    # Limit length
    summary_text = summary_text[:30]
    
    # 2. File path structure
    if draft_path and os.path.exists(draft_path):
        file_path = draft_path
        filename = os.path.basename(draft_path)
        if filename.endswith(".md"):
            report_title = filename[:-3]
        else:
            report_title = filename
    else:
        timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        filename = f"{timestamp}-{summary_text}.md"
        report_folder = os.path.join(VAULT_DIR, "knowledge", "drafts")
        os.makedirs(report_folder, exist_ok=True)
        file_path = os.path.join(report_folder, filename)
        report_title = f"{timestamp}-{summary_text}"
    
    # 3. Build document content with frontmatter
    # Extract unique local refs
    unique_local = list(set([doc for doc in local_refs if doc]))
    unique_web = []
    seen_web = set()
    for title, url in web_refs:
        if url not in seen_web:
            seen_web.add(url)
            unique_web.append((title, url))
            
    fm_dict = {
        "type": "deep-research-report",
        "category": "Deep Research",
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "related_terms": [f"[[{doc}]]" for doc in unique_local],
        "tags": ["research/report", f"concept/{summary_text}"]
    }
    
    body_content = f"# {query}\n\n{full_response}\n\n## 🔗 참고 자료 및 출처\n"
    if unique_local:
        body_content += "### 📂 내부 지식 문서\n"
        for doc in unique_local:
            body_content += f"- [[{doc}]]\n"
            
    if unique_web:
        body_content += "\n### 🌐 외부 웹페이지\n"
        for title, url in unique_web:
            body_content += f"- [{title}]({url})\n"
            
    new_content = dump_frontmatter(fm_dict, body_content)
    
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        # Force cache reload so the document list registers it
        search_engine.update_document_cache(force=True)
        return file_path, report_title
    except Exception as e:
        print(f"Error saving report to wiki: {e}")
        return None, None

async def generate_chat_summary(query, full_response, model_mode="cloud"):
    """
    Generates a concise chat summary (150 chars approx) of the detailed report.
    """
    summary_prompt = f"""
    당신은 글로벌 리서치 허브 에이전트 Agent-Guru입니다.
    아래 사용자의 질문과 작성된 상세 보고서를 바탕으로, 대화창(채팅창)에 표시할 친절하고 정중한 요약문(한글 3~4문장, 150자 내외)을 작성해 주세요.
    상세한 리서치 보고서가 우측 문서창에 자동으로 열렸음을 사용자에게 알려주세요. (예: "상세한 투자 포트폴리오 분석 보고서는 우측 문서창에 자동으로 생성해 띄워 드렸습니다.")
    
    질문: {query}
    상세 보고서:
    {full_response[:2000]}
    
    요약문:
    """
    summary = await query_local_model_sync(summary_prompt, temperature=0.3, model_mode=model_mode)
    if summary:
        return summary.strip()
    return "리서치 보고서 생성이 완료되었습니다. 상세한 내용은 우측 문서 창에서 확인하실 수 있습니다."

GURU_MAPPING = {
    "Warren Buffett": ["워런 버핏", "워런버핏", "워렌 버핏", "워렌버핏", "버핏", "warren buffett", "buffett"],
    "Charlie Munger": ["찰리 멍거", "찰리멍거", "멍거", "charlie munger", "munger"],
    "Benjamin Graham": ["벤자민 그레이엄", "벤자민그레이엄", "그레이엄", "벤저민 그레이엄", "benjamin graham", "graham"],
    "Joel Greenblatt": ["조엘 그린블라트", "조엘그린블라트", "그린블라트", "joel greenblatt", "greenblatt"],
    "Li Lu": ["리 루", "리루", "li lu", "lilu"],
    "Mohnish Pabrai": ["모니시 파브라이", "모니시파브라이", "파브라이", "mohnish pabrai", "pabrai"],
    "Peter Lynch": ["피터 린치", "피터린치", "린치", "peter lynch", "lynch"],
    "Cathie Wood": ["캐시 우드", "캐시우드", "cathie wood", "wood", "돈나무"],
    "Chamath Palihapitiya": ["차마트 팔리하피티야", "차마트", "팔리하피티야", "chamath palihapitiya", "chamath"],
    "Ray Dalio": ["레이 달리오", "레이달리오", "달리오", "ray dalio", "dalio"],
    "George Soros": ["조지 소로스", "조지소로스", "소로스", "george soros", "soros"],
    "Stanley Druckenmiller": ["스탠리 드러켄밀러", "스탠리 드러켄밀러", "드러켄밀러", "stanley druckenmiller", "druckenmiller"],
    "Howard Marks": ["하워드 막스", "하워드막스", "하워드 마크", "하워드마크", "막스", "howard marks", "marks"],
    "Seth Klarman": ["세스 클라만", "세스크라만", "클라만", "seth klarman", "klarman"],
    "David Tepper": ["데이비드 테퍼", "데이비드테퍼", "테퍼", "david tepper", "tepper"],
    "Bill Ackman": ["빌 애크먼", "빌애크먼", "애크먼", "bill ackman", "ackman"],
    "Jim Simons": ["짐 사이먼스", "짐사이먼스", "사이먼스", "jim simons", "simons"],
    "Ken Griffin": ["켄 그리핀", "켄그리핀", "그리핀", "ken griffin", "griffin"],
    "Steve Cohen": ["스티브 코헨", "스티브코헨", "코헨", "steve cohen", "cohen"],
    "Michael Burry": ["마이클 버리", "마이클버리", "버리", "michael burry", "burry"],
    "Keith Gill": ["키스 길", "키스길", "gill", "roaring kitty", "포효하는 고양이"]
}

def load_financials_database():
    fin_path = os.path.join(VAULT_DIR, "workflow", "config", "company_financials.json")
    if os.path.exists(fin_path):
        try:
            with open(fin_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def screen_companies_for_guru(guru_name, financials_db):
    def get_safe(d, key, default):
        val = d.get(key)
        if val is None:
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    candidates = []
    
    if guru_name in ["Warren Buffett", "Charlie Munger", "Li Lu", "Mohnish Pabrai", "Howard Marks", "Bill Ackman"]:
        for ticker, m in financials_db.items():
            score = 0
            roe = get_safe(m, "roe", 0)
            margin = get_safe(m, "operating_margin", 0)
            de = get_safe(m, "debt_to_equity", 999)
            fcf = get_safe(m, "fcf_yield", 0)
            
            if roe > 15: score += 2
            if margin > 15: score += 2
            if de < 100: score += 1
            if de < 50: score += 1
            if fcf > 3: score += 1
            
            if score >= 3:
                candidates.append((ticker, m, score))
        candidates.sort(key=lambda x: (x[2], get_safe(x[1], "roe", 0)), reverse=True)
        
    elif guru_name == "Joel Greenblatt":
        for ticker, m in financials_db.items():
            roc = get_safe(m, "roc", -999)
            ey = get_safe(m, "ey", -999)
            if roc > 0 and ey > 0:
                score = roc + ey
                candidates.append((ticker, m, score))
        candidates.sort(key=lambda x: x[2], reverse=True)
        
    elif guru_name in ["Benjamin Graham", "Seth Klarman"]:
        for ticker, m in financials_db.items():
            score = 0
            pbr = get_safe(m, "pbr", 999)
            de = get_safe(m, "debt_to_equity", 999)
            ncav = get_safe(m, "ncav", -999)
            per = get_safe(m, "per", 999)
            
            if 0 < pbr < 2.0: score += 2
            if de < 100: score += 1
            if ncav > 0: score += 2
            if 0 < per < 15: score += 1
            
            if score >= 2:
                candidates.append((ticker, m, score))
        candidates.sort(key=lambda x: (x[2], -get_safe(x[1], "pbr", 999)), reverse=True)
        
    elif guru_name in ["Cathie Wood", "Chamath Palihapitiya"]:
        startups = ["NET", "FSLY", "RKLB", "IOT", "IONQ"]
        for ticker in startups:
            if ticker in financials_db:
                candidates.append((ticker, financials_db[ticker], 5))
            else:
                candidates.append((ticker, {"roe": 0, "operating_margin": 0}, 3))
                
    else:
        for ticker, m in financials_db.items():
            score = 0
            roe = get_safe(m, "roe", 0)
            per = get_safe(m, "per", 999)
            if ticker in ["AAPL", "MSFT", "GOOGL", "NVDA", "AMZN", "BRK-B", "COST", "JPM", "TSLA", "LLY"]:
                score += 3
            if roe > 20:
                score += 2
            if per < 30:
                score += 1
                
            if score >= 2:
                candidates.append((ticker, m, score))
        candidates.sort(key=lambda x: x[2], reverse=True)
        
    return [c[0] for c in candidates[:5]]

def get_company_report_context(ticker):
    report_dir = os.path.join(VAULT_DIR, "snp500 report")
    if not os.path.exists(report_dir):
        return ""
    for f in os.listdir(report_dir):
        if f.startswith(f"{ticker} - ") or f == ticker:
            folder_path = os.path.join(report_dir, f)
            file_path = os.path.join(folder_path, f"{ticker}.md")
            if os.path.exists(file_path):
                try:
                    with open(file_path, "r", encoding="utf-8", errors="ignore") as file:
                        return file.read()
                except Exception:
                    pass
    return ""

def get_latest_magazine_content():
    mag_dir = os.path.join(VAULT_DIR, "monthly_magazines")
    if not os.path.exists(mag_dir):
        return ""
    files = [os.path.join(mag_dir, f) for f in os.listdir(mag_dir) if f.endswith(".md") and f.lower() != "readme.md"]
    if not files:
        return ""
    files.sort(key=os.path.getmtime, reverse=True)
    try:
        with open(files[0], "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""

def get_latest_industry_report():
    ind_dir = os.path.join(VAULT_DIR, "macro report", "industry")
    if not os.path.exists(ind_dir):
        return ""
    files = [os.path.join(ind_dir, f) for f in os.listdir(ind_dir) if f.endswith(".md") and f.lower() != "readme.md"]
    if not files:
        return ""
    files.sort(key=os.path.getmtime, reverse=True)
    try:
        with open(files[0], "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
    except Exception:
        return ""

async def generate_guru_portfolio_loop(query, guru_names, model_mode="cloud", draft_path=None, is_modification_mode=False, chat_history=None):
    if isinstance(guru_names, str):
        guru_names = [guru_names]
        
    guru_names_str = " & ".join(guru_names)
    yield sse_yield({"type": "thought", "text": f"1단계: '{guru_names_str}'의 투자 인격(Soul) 및 실행 방법론(Workflow) 지식을 로딩하고 있습니다..."})
    
    soul_content = ""
    workflow_content = ""
    for name in guru_names:
        folder_path = os.path.join(VAULT_DIR, "guru report", name)
        try:
            soul_path = os.path.join(folder_path, f"{name}-soul.md")
            if os.path.exists(soul_path):
                with open(soul_path, "r", encoding="utf-8") as f:
                    soul_content += f"\n### [{name}의 투자 Soul]\n" + f.read() + "\n"
            workflow_path = os.path.join(folder_path, f"{name}-workflow.md")
            if os.path.exists(workflow_path):
                with open(workflow_path, "r", encoding="utf-8") as f:
                    workflow_content += f"\n### [{name}의 투자 Workflow]\n" + f.read() + "\n"
        except Exception as e:
            yield sse_yield({"type": "thought", "text": f"⚠️ '{name}' 구루 파일 로드 중 실패: {e}"})
        
    yield sse_yield({"type": "thought", "text": "2단계: 최신 월간 매거진 및 산업 동향 리포트를 분석하고 있습니다..."})
    magazine_content = get_latest_magazine_content()
    industry_content = get_latest_industry_report()
    
    yield sse_yield({"type": "thought", "text": f"3단계: 선별된 구루들 ({', '.join(guru_names)})의 규칙에 부합하는 S&P 500 및 스타트업 기업을 정량 스크리닝하고 있습니다..."})
    financials_db = load_financials_database()
    
    screened_tickers = []
    for name in guru_names:
        tickers = screen_companies_for_guru(name, financials_db)
        for t in tickers:
            if t not in screened_tickers:
                screened_tickers.append(t)
    screened_tickers = screened_tickers[:5]
    
    company_profiles = []
    for ticker in screened_tickers:
        profile = get_company_report_context(ticker)
        if profile:
            company_profiles.append(f"## {ticker} Company Profile:\n{profile[:1000]}")
            
    yield sse_yield({"type": "thought", "text": f"4단계: 실시간 시장 시황 및 선별된 종목 ({', '.join(screened_tickers[:3])})의 오늘 주가/뉴스 웹 검색 중입니다..."})
    
    search_results = []
    web_refs = []
    try:
        market_res = await asyncio.to_thread(web_searcher.search_web, "today US stock market trend SP500 nasdaq", limit=3)
        if market_res:
            search_results.append("### 실시간 글로벌 시황 동향:\n" + "\n".join([f"- {r['title']}: {r['snippet']}" for r in market_res]))
            for r in market_res:
                web_refs.append((r['title'], r['url']))
        
        for ticker in screened_tickers[:3]:
            ticker_res = await asyncio.to_thread(web_searcher.search_web, f"{ticker} stock price today live news", limit=2)
            if ticker_res:
                search_results.append(f"### {ticker} 실시간 주가 및 뉴스:\n" + "\n".join([f"- {r['title']}: {r['snippet']}" for r in ticker_res]))
                for r in ticker_res:
                    web_refs.append((r['title'], r['url']))
    except Exception as e:
        yield sse_yield({"type": "thought", "text": f"⚠️ 실시간 웹 검색 중 오류 발생 (로컬 캐시 데이터로 대체): {e}"})
        
    yield sse_yield({"type": "thought", "text": f"5단계: 수집된 재무 데이터 및 실시간 시황을 기반으로 '{guru_names_str}'의 톤앤매너로 포트폴리오 제안서를 작성 중입니다..."})
    
    # Automatically treat any existing draft as a notepad to update
    if not draft_path:
        draft_path = get_latest_draft_path()
        
    draft_content = ""
    if draft_path and os.path.exists(draft_path):
        try:
            with open(draft_path, "r", encoding="utf-8", errors="ignore") as f:
                draft_content = f.read()
        except:
            pass

    if draft_content:
        prompt = f"""
    [SYSTEM INSTRUCTION - 수정 모드 활성화됨]
    당신은 전설적인 투자자 '{guru_names_str}'의 AI 복제본(Replica)입니다.
    사용자의 추가 요청사항(피드백)에 맞춰, 기존에 작성된 초안 보고서의 내용을 **부분적으로 보충 및 수정**해 주세요.
    
    CRITICAL WARNING: 기존 보고서의 뼈대와 내용을 대량 삭제하거나 전면적으로 새로 작성(리팩토링)하지 마십시오!
    반드시 아래 3단계를 수행하여 수정해야 합니다:
    1. [수정사항 확인]: 사용자의 수정 요구 및 질문을 명확히 확인합니다.
    2. [수정 부분 선별]: 기존 보고서 중 어떤 부분이 수정되거나 추가 설명이 보충되어야 하는지 선별합니다.
    3. [선별적 수정/보완]: 선별된 부분(예: 특정 추천 종목 설명, 자산 배분 비중, 수치 등)만 교정하거나 추가하고, 수정이 불필요한 기존 초안 보고서 본문(표, 서론, 다른 추천 종목 등)은 토씨 하나 고치지 않고 **그대로 보존**하여 출력하십시오.
    
    여기에 당신의 핵심 투자 인격(Soul) 정보가 있습니다:
    ```markdown
    {soul_content}
    ```
    
    여기에 당신의 실행 방법론(Workflow) 정보가 있습니다:
    ```markdown
    {workflow_content}
    ```
    
    [참고 컨텍스트 데이터]
    - 선별 종목: {', '.join(screened_tickers)}
    {chr(10).join(company_profiles)}
    {chr(10).join(search_results)}
    
    [기존 초안 보고서 내용]
    {draft_content}
    
    [사용자의 추가 수정/보완 요청사항]
    {query}
    """
    else:
        prompt = f"""
    [SYSTEM INSTRUCTION]
    당신은 전설적인 투자자 '{guru_names_str}'의 AI 복제본(Replica)입니다.
    사용자가 제시한 질문에 맞추어, 당신의 투자 철학과 페르소나를 완벽하게 반영한 **'오늘의 투자 포트폴리오 및 자산 배분 제안 보고서'**를 작성해 주세요.
    보고서는 친절한 한국어로 작성되어야 하며, 당신 고유의 어조(어록, 투자 철학, 주주 서한 스타일)를 고수해야 합니다.
    
    여기에 당신의 핵심 투자 인격(Soul) 정보가 있습니다:
    ```markdown
    {soul_content}
    ```
    
    여기에 당신의 실행 방법론(Workflow) 정보가 있습니다:
    ```markdown
    {workflow_content}
    ```
    
    [참고 컨텍스트 데이터]
    1. 최신 월간 투자 매거진 요약:
    {magazine_content[:1500]}
    
    2. 최신 산업 동향 분석 보고서:
    {industry_content[:1500]}
    
    3. 선별된 구루 추천 종목 재무 지표 및 프로필 정보:
    - 선별 종목: {', '.join(screened_tickers)}
    {chr(10).join(company_profiles)}
    
    4. 실시간 웹 검색 정보 (오늘의 주가 및 시황):
    {chr(10).join(search_results)}
    
    [보고서 작성 규칙]
    - **말투**: 존칭을 사용하며, 주주 서한을 보내듯이 차분하고 통찰이 넘치는 명문장으로 작성해 주세요.
    - **자산 배분 비율 테이블**: 현금 비중(%) 및 추천 종목들의 구체적인 비중(%)을 포함하는 마크다운 표를 반드시 제공해 주세요. (예: 현금 20%, AAPL 40%, MSFT 40% 등 총합 100%)
    - **포트폴리오 설계 이유**: 해당 비율을 설정한 구체적인 철학적 판단 근거를 당신의 투자 철학에 비추어 상세히 설명하세요.
    - **경고/안내**: 최신 13F 공시를 기계적으로 베낀 것이 아니라, 오늘의 주가와 재무 지표를 기반으로 독립적으로 내린 판단임을 밝힐 것.
    """
    
    custom_rules = read_custom_behavior_rules()
    if custom_rules:
        prompt += f"\n\n[사용자 지정 추가 규칙]\n{custom_rules}"

    try:
        load_success = await asyncio.to_thread(local_llm.load_model, MODEL_NAME)
        if not load_success:
            yield sse_yield({"type": "status", "status": "error", "message": "로컬 모델 구동에 실패했습니다. 서버 상태를 점검해 주세요."})
            return
            
        messages = [{"role": "system", "content": prompt}]
        if chat_history:
            for msg in chat_history[-5:]:
                role = msg.get("role", "user")
                if role not in ["user", "assistant", "system"]:
                    role = "user"
                messages.append({"role": role, "content": msg.get("content", "")})
        messages.append({"role": "user", "content": query})
        
        full_response = ""
        async for chunk_type, chunk_text in generate_streaming_completion(messages, model_mode=model_mode):
            if chunk_text:
                if chunk_type == "content":
                    full_response += chunk_text
                    yield sse_yield({"type": "report_chunk", "text": chunk_text})
                elif chunk_type == "thought":
                    yield sse_yield({"type": "reasoning", "text": chunk_text})
                    
        # Step 5: Save report to drafts wiki and record to history
        yield sse_yield({"type": "thought", "text": "5단계: 최종 리서치 보고서를 임시 드래프트 폴더에 저장하고 있습니다..."})
        local_refs = screened_tickers
        saved_path, report_title = await save_report_to_wiki(query, full_response, local_refs, web_refs, draft_path, model_mode=model_mode)
        if saved_path:
            yield sse_yield({"type": "report_path", "path": saved_path, "title": report_title})
            
        append_to_interaction_history(query, full_response)
        
        # Step 6: Generate and stream chat summary
        yield sse_yield({"type": "thought", "text": "6단계: 최종 리서치 답변을 요약하여 채팅 창에 출력하고 있습니다..."})
        chat_summary = await generate_chat_summary(query, full_response, model_mode=model_mode)
        
        chunk_size = 10
        for i in range(0, len(chat_summary), chunk_size):
            chunk = chat_summary[i:i+chunk_size]
            yield sse_yield({"type": "content", "text": chunk})
            time.sleep(0.01)
            
    finally:
        try:
            local_llm.unload_model(MODEL_NAME)
        except Exception:
            pass

async def generate_agent_loop(query, model_mode="cloud", draft_path=None, chat_history=None, is_modification_mode=False):
    """
    Generator implementing the Fable-5 Agentic Harness loop.
    Yields JSON events for SSE stream.
    """
    # Check resources using resource checker
    if resource_checker.check_resource_busy():
        yield sse_yield({
            "type": "status",
            "status": "busy",
            "message": "지금 로컬 모델 자원이 예약작업(백그라운드 분석 등)에 사용 중에 있으니 나중에 요청하시기 바랍니다."
        })
        return

    # Step 0: Intent Classification (General Chat vs. Deep Research vs. Ambiguous)
    yield sse_yield({"type": "thought", "text": "0단계: 질문의 성격(일반 대화 vs 심층 리서치)을 판단하고 있습니다..."})
    
    history_context = ""
    if chat_history:
        history_context = "\n".join([f"{msg.get('role', 'user')}: {msg.get('content', '')}" for msg in chat_history[-3:]])
        
    classify_prompt = f"""
    당신은 대화 흐름 분석 및 지식 탐색 분류 에이전트입니다.
    사용자의 최근 입력과 이전 대화 이력을 바탕으로, 이번 입력의 의도(Intent)를 분류해 주세요.
    
    [이전 대화 이력]
    {history_context}
    
    [사용자 입력]
    {query}
    
    [분류 가이드라인]
    1. 만약 이전 대화에서 에이전트가 "관련 내용을 찾아서 알려드릴까요?" 또는 "리서치 보고서를 생성해 드릴까요?"와 같이 탐색 여부를 되물어보았고, 사용자가 이에 대해 긍정적인 답변("응", "알려줘", "그래", "yes", "please", "시작해줘", "해줘" 등)을 했다면 반드시 "deep_research"로 분류하십시오.
    2. 질문이 단순한 인사("안녕", "hello"), 일상적인 질문("오늘 어때?", "너는 누구니?"), 혹은 간단한 가이드 문의 등 RAG/외부 검색 및 파일 보고서 저장이 전혀 불필요한 가벼운 대화라면 "general_chat"으로 분류하십시오.
    3. 특정 기업의 실적 분석, 포트폴리오 자산배분 제안, 기술 동향 스캔 등 외부 검색 및 지식 RAG를 돌려서 마크다운 리서치 파일 작성이 확실하게 요구되는 전문적 질문이라면 "deep_research"로 분류하십시오.
    4. 질문의 주제는 지식 탐색 대상(예: "워런 버핏의 가치투자", "엔비디아 주가")이지만, 심층 리서치 및 보고서 생성을 즉시 시작할 것인지 아니면 그냥 가볍게 물어본 것인지 의도가 모호한 경우에는 "ambiguous"로 분류하십시오.
    
    반드시 아래 JSON 형식으로만 응답해 주세요 (설명이나 마크다운 코드 블록 없이 순수 JSON만 반환):
    {{
      "category": "general_chat" 또는 "deep_research" 또는 "ambiguous",
      "reason": "분류 이유 요약 (한글 1줄)",
      "clarification_question": "ambiguous인 경우 사용자에게 관련 내용을 탐색해서 상세 위키 보고서로 생성해 드릴지 정중히 되묻는 질문 문장 (예: '해당 주제에 대해 RAG와 실시간 웹 검색을 결합한 리서치 보고서를 생성해 드릴까요?')",
      "reconstructed_query": "category가 'deep_research'이고 사용자의 현재 입력이 단순한 긍정/확인 답변(예: '응', '넵', '알려줘', '그래', 'yes', '오냐', '부탁해')인 경우, 이전 대화 이력의 제안을 참고하여 사용자가 원래 하고자 하는 구체적이고 구체화된 연구/검색 질문 문장을 재구성해 반환하십시오. 만약 사용자의 입력에 이미 구체적 질문이 있다면 그대로 반환하십시오. (예: '빌 애크먼과 피터 린치의 투자 철학을 결합하여 현재 시장 상황에 맞는 포트폴리오 제안 리서치 보고서')"
    }}
    """
    
    try:
        class_out = await query_local_model_sync(classify_prompt, temperature=0.1, model_mode=model_mode)
        classification = clean_json_string(class_out)
    except Exception:
        classification = {"category": "deep_research"}
        
    category = classification.get("category", "deep_research")
    reason = classification.get("reason", "분류 실패 기본값 적용")
    reconstructed = classification.get("reconstructed_query")
    
    if category == "deep_research" and reconstructed:
        log(f"Reconstructed short query '{query}' to '{reconstructed}'")
        query = reconstructed
        
    # Robust Fallback for short/empty query reconstruction
    if category == "deep_research":
        is_short_agreement = False
        query_clean = re.sub(r'[^\w\s]', '', query.strip()).lower()
        agreement_words = ["네", "응", "그래", "yes", "ok", "시작해줘", "해줘", "그렇게 해줘", "그렇게 해주세요", "부탁해", "부탁해요", "넵", "오냐", "좋아", "좋아요"]
        if query_clean in [re.sub(r'[^\w\s]', '', w).lower() for w in agreement_words] or len(query.strip()) < 10:
            is_short_agreement = True
            
        if (not reconstructed or reconstructed == query) and is_short_agreement and chat_history:
            last_real_query = None
            for msg in reversed(chat_history):
                if msg.get("role") == "user":
                    content = msg.get("content", "").strip()
                    content_clean = re.sub(r'[^\w\s]', '', content).lower()
                    if content_clean not in [re.sub(r'[^\w\s]', '', w).lower() for w in agreement_words] and len(content) >= 10:
                        last_real_query = content
                        break
            if last_real_query:
                log(f"[Fallback Query Reconstruction] Swapped empty/short query '{query}' -> '{last_real_query}' based on chat history.")
                query = last_real_query
        
    print(f"[INTENT CLASSIFIED]: Category={category}, Reason={reason}, TargetQuery={query}")
    
    if category == "general_chat":
        system_instruction = (
            "당신은 글로벌 리서치 에이전트 Agent-Guru입니다. "
            "이 질문은 가벼운 일반 대화이므로, 깊은 검색이나 보고서 작성 없이 "
            "사용자의 질문에 친절하고 정중한 한국어로 대화하듯이 답변해 주세요."
        )
        messages = [
            {"role": "system", "content": system_instruction}
        ]
        if chat_history:
            for msg in chat_history[-5:]:
                messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
        messages.append({"role": "user", "content": query})
            
        yield sse_yield({"type": "thought", "text": "일반 대화 모드로 전환하여 답변을 생성하고 있습니다..."})
        
        full_response = ""
        for chunk_type, chunk_text in generate_streaming_completion(messages, model_mode=model_mode):
            if chunk_text and chunk_type == "content":
                full_response += chunk_text
                yield sse_yield({"type": "content", "text": chunk_text})
                
        append_to_interaction_history(query, full_response)
        return
        
    elif category == "ambiguous":
        clarification = classification.get("clarification_question", "관련 내용을 탐색해서 상세 리서치 보고서로 생성해 드릴까요?")
        yield sse_yield({"type": "thought", "text": "질문의 성격이 모호하여 의도를 재확인하고 있습니다..."})
        
        chunk_size = 10
        for i in range(0, len(clarification), chunk_size):
            chunk = clarification[i:i+chunk_size]
            yield sse_yield({"type": "content", "text": chunk})
            time.sleep(0.01)
        return

    # Check for Guru Portfolio request
    query_lower = query.lower()
    is_portfolio_request = any(k in query_lower for k in ["포트폴리오", "자산 배분", "자산배분", "portfolio", "asset allocation"])
    
    matched_gurus = []
    if is_portfolio_request:
        for guru_name, aliases in GURU_MAPPING.items():
            if any(alias in query_lower for alias in aliases):
                matched_gurus.append(guru_name)
                
        if matched_gurus:
            async for event in generate_guru_portfolio_loop(query, matched_gurus, model_mode, draft_path, is_modification_mode=is_modification_mode, chat_history=chat_history):
                yield event
            return
        elif len(query.strip()) < 8:
            yield sse_yield({"type": "thought", "text": "구루 포트폴리오 분석 모드 감지됨. 대상 구루 확인 중..."})
            yield sse_yield({
                "type": "content",
                "text": "오늘의 투자 포트폴리오를 알고 싶으시면 어떤 투자자(구루)의 관점인지 지정해 주세요.\n예: *'워런 버핏의 관점에서 오늘의 투자 포트폴리오를 구성해줘'*\n\n**선택 가능한 투자 구루 목록 (21인):**\n\n*   **가치투자 클래식**: 워런 버핏, 찰리 멍거, 리 루, 모니시 파브라이\n*   **성장 및 파괴적 혁신**: 피터 린치, 캐시 우드, 차마트 팔리하피티야\n*   **글로벌 매크로**: 레이 달리오, 조지 소로스, 스탠리 드러켄밀러\n*   **리스크 제어 & 가치**: 하워드 막스, 세스 클라만, 데이비드 테퍼, 빌 애크먼\n*   **계량 및 트레이딩**: 조엘 그린블라트, 짐 사이먼스, 켄 그리핀, 스티브 코헨\n*   **역발상 & 밈**: 마이클 버리, 키스 길"
            })
            return

    is_cloud = (model_mode in ["cloud", "turbo"])
    if is_cloud:
        mode_label = "Turbo" if model_mode == "turbo" else "Cloud"
        yield sse_yield({"type": "thought", "text": f"클라우드 Antigravity API 연결({mode_label} 모드)을 활성화하고 계획을 수립하고 있습니다..."})
    else:
        yield sse_yield({"type": "thought", "text": "로컬 LLM 서버에 연결하고 컨텍스트 메모리를 준비하고 있습니다..."})
    
    try:
        if not is_cloud:
            load_success = await asyncio.to_thread(local_llm.load_model, MODEL_NAME)
            if not load_success:
                yield sse_yield({"type": "status", "status": "error", "message": "로컬 모델 구동에 실패했습니다. 서버 상태를 점검해 주세요."})
                return
            
        # Step 1: Multi-Stage Planning & Local search (RAG)
        yield sse_yield({"type": "thought", "text": "1단계: 질문을 분석하고 의도 파악 및 다단계 지식 탐색 계획을 수립하고 있습니다..."})
        
        planning_prompt = f"""
        당신은 지식 탐색 기획 에이전트입니다.
        사용자의 질문을 다각도로 분석하여, 지식 베이스(Obsidian Vault) 및 외부 검색을 위한 최적의 '다단계 탐색 계획(Search Plan)'을 수립해 주세요.
        
        질문의 핵심 의도(Intent)를 판단하고, 검색 누락 방지를 위한 동의어/약어 도출과 함께 지식 그래프 노드 간의 유기적인 연결 관계(Connected Nodes)를 추적하여 순차적인 분석 프로세스를 설계하십시오.
        
        [사용자 질문]
        {query}
        
        반드시 아래 JSON 형식으로만 응답해 주세요 (설명이나 마크다운 코드 블록 없이 순수 JSON만 반환):
        {{
          "query_intent": "구루 포트폴리오 분석 / 개념 정의 / 최신 동향 조사 등",
          "core_concepts": ["핵심개념1", "핵심개념2"],
          "synonyms": ["동의어1", "동의어2", ...],
          "connected_nodes": ["연결노드명1", "연결노드명2", ...],
          "plan_sequence": [
            "1. 분석할 소스 노드 또는 검색 키워드 정의",
            "2. 보완할 외부 지식 웹 검색 정의",
            "3. 합성 계획 정의"
          ]
        }}
        """
        
        plan_out = await query_local_model_sync(planning_prompt, temperature=0.1, model_mode=model_mode)
        plan_json = clean_json_string(plan_out)
        
        query_intent = plan_json.get("query_intent", "일반 정보 리서치")
        synonyms = plan_json.get("synonyms", [])
        connected_nodes = plan_json.get("connected_nodes", [])
        plan_sequence = plan_json.get("plan_sequence", [query])
        
        # Collect unique search queries starting with the main query
        core_concepts = plan_json.get("core_concepts", [])
        queries = []
        for term in core_concepts:
            term = term.strip()
            if term and term.lower() not in [q.lower() for q in queries]:
                queries.append(term)
        for term in synonyms:
            term = term.strip()
            if term and term.lower() not in [q.lower() for q in queries]:
                queries.append(term)
        if query.strip() and query.strip().lower() not in [q.lower() for q in queries]:
            queries.append(query.strip())
        queries = queries[:3]

        
        # Emit formatted plan info to UI
        plan_msg = (
            f"📋 상세 탐색 계획 수립 완료:\n"
            f"- **판단된 의도**: {query_intent}\n"
            f"- **추적된 연결 지식 노드**: {', '.join([f'[[{node}]]' for node in connected_nodes]) if connected_nodes else '없음'}\n"
            f"- **순차 실행 시퀀스**:\n" + "\n".join([f"  {step}" for step in plan_sequence])
        )
        yield sse_yield({"type": "thought", "text": plan_msg})
        
        yield sse_yield({"type": "thought", "text": "2단계: 수립된 계획에 따라 내부 지식 스캔 및 외부 웹 탐색을 개시합니다..."})
        
        collected_context = []
        matched_docs_info = []
        web_refs = []
        web_search_count = 0
        max_web_searches = 2
        
        for q_idx, q in enumerate(queries):
            yield sse_yield({"type": "thought", "text": f"쿼리 [{q_idx+1}/{len(queries)}] 실행 중: '{q}'"})
            
            # 1) Search local vault
            local_results = await asyncio.to_thread(search_engine.search_local_vault, q, limit=3)
            
            # Determine if local match score is low (< 150), empty, or contains invalid/error content
            has_high_quality_match = False
            if local_results:
                best_res = local_results[0]
                max_score = best_res["score"]
                
                snippet = best_res.get("snippet", "").strip()
                is_error_content = any(err in snippet.lower() for err in ["404 not found", "http error", "error: http error", "exception occurred"])
                is_too_short = len(snippet) < 100
                
                # Check if the query term or any synonyms/concepts actually appear in the snippet/body
                search_terms = [q.lower()] + [s.lower() for s in synonyms if isinstance(s, str)] + [c.lower() for c in core_concepts if isinstance(c, str)]
                search_terms = [t for t in search_terms if t]
                term_in_body = any(t in snippet.lower() for t in search_terms)
                
                if max_score >= 150 and not is_error_content and not is_too_short and term_in_body:
                    has_high_quality_match = True
                else:
                    log(f"Local match '{best_res['title']}' rejected as high quality (score={max_score}, is_error={is_error_content}, too_short={is_too_short}, term_in_body={term_in_body})")
                    
            if not has_high_quality_match:
                # 2) Fallback to External Flashlight Search
                if web_search_count < max_web_searches:
                    approved, approval_events = await request_search_approval(q, model_mode)
                    for ev in approval_events:
                        yield ev
                        
                    web_results = []
                    if approved:
                        yield sse_yield({"type": "thought", "text": f"⚠️ 로컬 검색 매칭 부족 (매칭 점수 미달 또는 없음). 외부 실시간 웹 탐색(Flashlight Search) 실행: '{q}'"})
                        try:
                            web_results = await asyncio.to_thread(web_searcher.search_web, q, limit=5)
                        except Exception as e:
                            pass
                        
                        web_search_count += 1
                        
                        if web_results:
                            for r in web_results:
                                web_refs.append((r['title'], r['url']))
                                
                            flashlight_result = "\n\n".join([f"Title: {r['title']}\nURL: {r['url']}\nSnippet: {r['snippet']}" for r in web_results])
                            
                            # 3) Generate new Wiki content from web results
                            yield sse_yield({"type": "thought", "text": f"웹 RAG 정보 획득 완료. 지식 위키 자동 갱신 및 저장 중..."})
                            
                            wiki_prompt = f"""
                            웹 검색 결과를 바탕으로, 이 정보를 Obsidian 지식 위키에 저장할 수 있도록 표준 형식의 마크다운 위키 페이지를 작성해 주세요.
                            반드시 아래 YAML frontmatter 형식을 첫머리에 포함해야 하며, 텍스트 설명 외의 사설은 생략하세요.
                            
                            [웹 검색 자료]
                            {flashlight_result}
                            
                            출력 형식 예시:
                            ---
                            type: knowledge-term
                            category: Deep Tech (또는 Macroeconomics, AI 등 알맞은 카테고리)
                            related_terms:
                              - "[[관련개념1]]"
                            tags:
                              - knowledge/definition
                              - concept/검색어
                            ---
                            # [개념명]
                            
                            ## 정의
                            ...
                            
                            ## 주요 내용
                            ...
                            """
                            
                            wiki_content = await query_local_model_sync(wiki_prompt, temperature=0.2, model_mode=model_mode)
                            
                            # Parse title to save
                            title_match = re.search(r'^#\s+(.*)$', wiki_content, re.MULTILINE)
                            concept_title = title_match.group(1).strip() if title_match else q
                            concept_title = re.sub(r'[\\/*?:"<>|]', '', concept_title)
                            
                            wiki_path = os.path.join(VAULT_DIR, "knowledge", f"{concept_title}.md")
                            try:
                                os.makedirs(os.path.dirname(wiki_path), exist_ok=True)
                                with open(wiki_path, "w", encoding="utf-8") as f:
                                    f.write(wiki_content)
                                yield sse_yield({
                                    "type": "thought", 
                                    "text": f"새로운 위키 문서 생성 완료: [knowledge/{concept_title}.md](file:///{wiki_path.replace(chr(92), '/')})"
                                })
                                
                                # Force cache reload so it is indexable
                                await asyncio.to_thread(search_engine.update_document_cache, force=True)
                                
                                # Re-run local search for this query to get the newly created document
                                local_results = await asyncio.to_thread(search_engine.search_local_vault, q, limit=3)
                            except Exception as ex:
                                yield sse_yield({"type": "thought", "text": f"위키 문서 저장 실패: {ex}"})
                            
            # 4) Process and collect search results
            for r in local_results:
                collected_context.append(f"## 문서: {r['title']} (카테고리: {r['folder']})\n{r['snippet']}")
                matched_docs_info.append(r)
                
        # Step 3: Self-Improving Index (유의어 동적 학습)
        unique_docs = {}
        for doc in matched_docs_info:
            unique_docs[doc["path"]] = doc
            
        if unique_docs and synonyms:
            yield sse_yield({"type": "thought", "text": "3단계: 지식 검색에 사용된 유의어들을 매칭된 문서 메타데이터에 추가 기록(자가 학습)하고 있습니다..."})
            
            for doc_path, doc in unique_docs.items():
                success = enrich_document_frontmatter(doc_path, synonyms)
                if success:
                    yield sse_yield({
                        "type": "thought",
                        "text": f"🏷️ 지식 동적 학습 완료: '{doc['title']}.md' 문서에 유의어들을 자동 인덱싱하였습니다."
                    })
            # Reload cache once all changes are saved
            search_engine.update_document_cache(force=True)
            
        # Step 4: Final Stream Response Generation
        yield sse_yield({"type": "thought", "text": "4단계: 수집 및 학습된 지식을 바탕으로 최종 리서치 답변을 합성하고 있습니다..."})
        
        context_text = "\n\n".join(set(collected_context)) if collected_context else "(검색된 데이터 없음)"
        custom_rules = read_custom_behavior_rules()
        
        # Automatically treat any existing draft as a notepad to update
        if not draft_path:
            draft_path = get_latest_draft_path()

        draft_content = ""
        if draft_path and os.path.exists(draft_path):
            try:
                with open(draft_path, "r", encoding="utf-8", errors="ignore") as f:
                    draft_content = f.read()
            except:
                pass

        if draft_content:
            system_instruction = f"""
        당신은 글로벌 리서치 허브 에이전트 Agent-Guru입니다.
        사용자의 추가 수정/보완 요청에 따라, 아래 제공된 [컨텍스트 정보]를 참조하여 기존에 작성된 [기존 초안 보고서]의 내용을 **부분적으로 보충 및 수정**해 주세요.
        
        CRITICAL WARNING: 기존 보고서의 뼈대와 내용을 대량 삭제하거나 전면적으로 새로 작성(리팩토링)하지 마십시오!
        반드시 아래 3단계를 수행하여 수정해야 합니다:
        1. [수정사항 확인]: 사용자의 수정 요구 및 질문을 명확히 확인합니다.
        2. [수정 부분 선별]: 기존 보고서 중 어떤 부분이 수정되거나 추가 설명이 보충되어야 하는지 선별합니다.
        3. [선별적 수정/보완]: 선별된 부분(예: 특정 단락, 지표 설명, 수치 등)만 교정하거나 추가하고, 수정이 불필요한 기존 초안 보고서 본문(표, 다른 섹션 등)은 토씨 하나 고치지 않고 **그대로 보존**하여 출력하십시오.
        
        [컨텍스트 정보]
        {context_text}
        
        [기존 초안 보고서 내용]
        {draft_content}
        
        [사용자의 추가 수정/보완 요청사항]
        {query}
        
        {f'[사용자 지정 추가 규칙]\n{custom_rules}' if custom_rules else ''}
        """
        else:
            system_instruction = f"""
        당신은 글로벌 리서치 허브 에이전트 Agent-Guru입니다.
        아래 제공된 [컨텍스트 정보]를 핵심 근거로 삼아, 사용자의 질문에 한국어로 친절하고 정확하게 답해 주세요.
        답변 도중 위키 링크가 필요한 단어가 있다면 Obsidian 링크 `[[개념명]]` 형식을 부착해 주면 좋습니다.
        
        [컨텍스트 정보]
        {context_text}
        
        {f'[사용자 지정 추가 규칙]\n{custom_rules}' if custom_rules else ''}
        
        {f'[이전 초안 보고서 수정요청]\n귀하는 이미 작성된 초안 보고서를 바탕으로 사용자의 추가 요청사항을 반영하여 보고서를 갱신해야 합니다. 기존 내용을 최대한 보존하며 수정하십시오:\n{draft_content}' if draft_content else ''}
        """
        
        messages = [{"role": "system", "content": system_instruction}]
        if chat_history:
            for msg in chat_history[-5:]:
                role = msg.get("role", "user")
                if role not in ["user", "assistant", "system"]:
                    role = "user"
                messages.append({"role": role, "content": msg.get("content", "")})
        messages.append({"role": "user", "content": query})
        
        full_response = ""
        for chunk_type, chunk_text in generate_streaming_completion(messages, model_mode=model_mode):
            if chunk_text:
                if chunk_type == "content":
                    full_response += chunk_text
                    yield sse_yield({"type": "report_chunk", "text": chunk_text})
                elif chunk_type == "thought":
                    yield sse_yield({"type": "reasoning", "text": chunk_text})
                
        # Step 5: Save report to drafts wiki and record to history
        yield sse_yield({"type": "thought", "text": "5단계: 최종 리서치 보고서를 임시 드래프트 폴더에 저장하고 있습니다..."})
        local_refs = [doc["title"] for doc in matched_docs_info]
        saved_path, report_title = await save_report_to_wiki(query, full_response, local_refs, web_refs, draft_path, model_mode=model_mode)
        if saved_path:
            yield sse_yield({"type": "report_path", "path": saved_path, "title": report_title})
            
        append_to_interaction_history(query, full_response)
        
        # Step 6: Generate and stream chat summary
        yield sse_yield({"type": "thought", "text": "6단계: 최종 리서치 답변을 요약하여 채팅 창에 출력하고 있습니다..."})
        chat_summary = await generate_chat_summary(query, full_response, model_mode=model_mode)
        
        chunk_size = 10
        for i in range(0, len(chat_summary), chunk_size):
            chunk = chat_summary[i:i+chunk_size]
            yield sse_yield({"type": "content", "text": chunk})
            time.sleep(0.01)
            
        # Step 7: Critique detection (Meta-Self-Improvement)
        yield sse_yield({"type": "thought", "text": "7단계: 사용자의 지적 사항이나 교정 요구가 있었는지 자율 검사 중..."})
        critique_prompt = f"""
        아래 사용자의 입력에서 행동 규칙, 태도, 출력 포맷 변경 요청, 혹은 AI에 대한 지적 사항이 명시적으로 담겨있는지 분류해 주세요.
        
        [사용자 입력]
        {query}
        
        형식 예시 (JSON으로만 답변):
        {{
          "feedback_detected": true 또는 false,
          "suggested_rule": "에이전트가 앞으로 준수해야 할 정제된 가이드라인 한 줄 (예: '답변을 항상 세 줄 이내로 짧게 요약한다')"
        }}
        """
        critique_out = await query_local_model_sync(critique_prompt, temperature=0.1, model_mode=model_mode)
        critique_json = clean_json_string(critique_out)
        
        if critique_json.get("feedback_detected", False) and critique_json.get("suggested_rule"):
            suggested_rule = critique_json.get("suggested_rule")
            yield sse_yield({
                "type": "meta_improve", 
                "instruction": suggested_rule
            })
            
    finally:
        if not is_cloud:
            try:
                await asyncio.to_thread(local_llm.unload_model, MODEL_NAME)
            except Exception:
                pass


async def generate_streaming_completion(messages, temperature=0.3, max_tokens=8192, model_mode="local"):
    """
    Tries Cloud API first (if model_mode == 'cloud' or 'turbo'), and falls back to local Lemonade Server on failure.
    If model_mode == 'local', calls local model directly.
    """
    is_cloud = (model_mode in ["cloud", "turbo"])
    if not is_cloud:
        log("Forcing direct local model completion...")
        try:
            res = await asyncio.to_thread(
                local_llm.generate_chat_completion,
                MODEL_NAME,
                messages,
                temperature=temperature,
                force_local=True,
                direct_local=True
            )
            if res:
                chunk_size = 50
                for i in range(0, len(res), chunk_size):
                    yield "content", res[i:i+chunk_size]
                    await asyncio.sleep(0.01)
            else:
                yield "content", "[로컬 모델 응답 오류: 응답이 비어 있음]"
        except Exception as e:
            yield "content", f"[로컬 모델 실행 에러: {e}]"
        return

    # Cloud/Turbo mode: try Cloud first
    target_model = "gemini-3.1-pro" if model_mode == "turbo" else "gemini-3.5-flash"
    try:
        log(f"Streaming: calling Antigravity Cloud API (Model: {target_model})...")
        res = await asyncio.to_thread(
            local_llm.generate_chat_completion,
            target_model,
            messages,
            temperature=temperature,
            force_local=False
        )
        if res:
            chunk_size = 50
            for i in range(0, len(res), chunk_size):
                yield "content", res[i:i+chunk_size]
                await asyncio.sleep(0.01)
            return
        else:
            raise Exception("Cloud API response is empty")
    except Exception as e:
        log(f"Cloud API failed or timed out: {e}. Falling back to Local Lemonade Server (Port 8000) as last resort...")
        
        # Fallback to local model (direct HTTP POST to lemonade)
        payload = {
            "model": MODEL_NAME,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True
        }
        
        def call_lemonade_endpoint():
            import urllib.request
            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                "http://localhost:8000/v1/chat/completions",
                data=data,
                headers={"Content-Type": "application/json"}
            )
            try:
                response = urllib.request.urlopen(req, timeout=10)
                return response.read().decode('utf-8', errors='ignore')
            except Exception as e:
                return f"Error: {e}"
                
        try:
            # We run this sync web request in thread pool
            response_text = await asyncio.to_thread(call_lemonade_endpoint)
            if response_text.startswith("Error"):
                raise Exception(response_text)
                
            # Parse lemonade server SSE chunks (line by line)
            for line in response_text.splitlines():
                if line.startswith("data: "):
                    data_content = line[6:].strip()
                    if data_content == "[DONE]":
                        break
                    try:
                        chunk_json = json.loads(data_content)
                        delta = chunk_json['choices'][0]['delta']
                        if 'content' in delta and delta['content'] is not None:
                            yield "content", delta['content']
                    except Exception:
                        pass
        except Exception as ex:
            yield "content", f"\n[최후수단 로컬 모델 호출 실패: {ex}]"
