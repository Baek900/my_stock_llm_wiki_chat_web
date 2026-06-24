# 🌳 Agent-Guru: Advanced Agentic LLM Wiki & Chat Hub

**Agent-Guru**는 로컬 언어 모델(Gemma-4) 및 클라우드 모델(Gemini 2.0)을 결합하여, 전설적인 투자 구루들의 투자 방식을 모방하고 정량적/정성적 데이터를 결합한 투자 포트폴리오를 설계하며, 이를 Obsidian 위키 형태로 지식을 자율적으로 누적해나가는 **에이전트 기반 RAG(Retrieval-Augmented Generation) 시스템**입니다.

---

## 🌟 핵심 기능 (Core Features)

1. **하이브리드 모델 지원 (Cloud/Local Toggle)**
   * 클라우드 API(Gemini)와 고속 로컬 추론 엔진(Lemonade Server + Gemma-4-26B GGUF) 간의 실시간 토글을 지원합니다.
   * 백엔드 자원 점유 상태 검사(`resource_checker`)를 통해 로컬 자원의 충돌을 미연에 방지합니다.

2. **컨텍스트 의도 분류 및 계획 수립 (Intent Classification & Planning)**
   * **Step 0**: 사용자의 입력을 실시간으로 분석하여 일반 대화(`general_chat`), 모호한 질문(`ambiguous`), 심층 연구(`deep_research`)로 분류합니다.
   * **다단계 그래프 플래너**: 질문 의도에 따른 유의어 확장, 관련 지식 노드(Connected Nodes) 맵 구축, 순차적 실행 시퀀스를 기획하여 시각화합니다.

3. **구루 포트폴리오 스크리닝 스킬 (Specialized Guru Portfolio Skill)**
   * 워런 버핏, 피터 린치 등 21인의 전설적인 투자자의 투자 가치관(`-soul.md`)과 정량 필터링 공식(`-workflow.md`)을 로드합니다.
   * `company_financials.json` 데이터베이스를 조회하여 조건에 맞는 우량 종목을 자동으로 스크리닝하고 실시간 뉴스 및 주가를 결합하여 자산 배분 비중(현금 및 종목 배분율 표)을 도출합니다.

4. **공유 작업 공간/메모장 워크플로우 (Shared Notepad Workflow)**
   * 생성된 리서치 보고서는 임시 초안(`knowledge/drafts/`) 폴더에 저장되어 우측 마크다운 뷰어에 렌더링됩니다.
   * 후속 채팅 질문 시, 에이전트가 폴더 내의 초안 문서를 자동으로 감지하여 덮어쓰기 방식으로 문서를 지속 보완(수정 모드 자동 작동)해 나갑니다.
   * **New Chat** 시 초안 폴더가 깔끔히 비워지며, **발행 및 저장** 클릭 시 최종 보고서가 `llmwiki chat/`으로 이동하고 `linktree.md` 인덱스에 자동 등록됩니다.

---

## 🏗️ 시스템 아키텍처 (System Architecture)

```mermaid
flowchart TD
    User([사용자 입력 / 질문]) --> Backend[FastAPI Backend - main.py]
    
    subgraph 에이전트 리서치 루프 (agent_harness.py)
        Backend --> Intent{의도 분류}
        Intent -->|일반 대화| GenChat[단순 대화 응답 스트리밍]
        Intent -->|심층 리서치| Planner[다단계 지식 탐색 계획 수립]
        
        Planner --> LocalRAG[Obsidian 로컬 위키 검색 - search_engine.py]
        LocalRAG --> ScoreCheck{매칭 점수 >= 150?}
        
        ScoreCheck -->|Yes: 매칭 성공| ContextPool[컨텍스트 풀 구축]
        ScoreCheck -->|No: 매칭 부족| Flashlight[실시간 웹 검색 - DuckDuckGo / Google SDK]
        
        Flashlight --> SaveWiki[새로운 위키 문서 자동 생성 및 knowledge/ 저장]
        SaveWiki --> ContextPool
        
        ContextPool --> Synthesizer[최종 리서치 보고서 합성]
    end
    
    Synthesizer --> SaveDraft[knowledge/drafts/ 임시 초안 저장]
    SaveDraft --> WebUI[React Frontend - App.jsx]
    
    WebUI -->|추가 대화 피드백| Synthesizer
    WebUI -->|발행 및 저장 버튼 클릭| Publish[llmwiki chat/ 영구 폴더 이관 & linktree.md 등록]
```

---

## 💻 기술 스택 (Tech Stack)

* **Frontend**: React (Vite), TailwindCSS, React-Markdown, Remark-GFM, Lucide React
* **Backend**: FastAPI (Python), Uvicorn, Pydantic
* **LLM Engine**: Lemonade Server (Local Port 8000), Gemma-4-26B GGUF / Cloud Gemini API
* **Database & Knowledge Base**: Obsidian Local Vault (Google Drive 동기화), `company_financials.json`

---

## 🚀 시작하기 (Getting Started)

### 1. 사전 요구사항
* Python 3.10+ 및 Node.js 설치
* 구동 예정인 로컬 추론기 `LemonadeServer.exe` 및 GGUF 모델 파일 준비

### 2. 의존성 설치
```bash
# 백엔드 의존성 설치 (가상환경 활성화 상태)
pip install -r backend/requirements.txt # 또는 필요한 라이브러리 설치

# 프론트엔드 의존성 설치
cd frontend
npm install
```

### 3. 서비스 실행
서비스들을 한 번에 기동하기 위해 프로젝트 루트에 제공된 배치 스크립트를 사용합니다.

* **수동 창 분리 실행**: `start_services.bat`을 더블 클릭하여 실행합니다. (백엔드, 프론트엔드, 로컬 LLM 서버가 각각 새로운 터미널 창에서 자동 재시작 대기 상태로 가동됩니다.)
* **백그라운드 백그라운드 실행**: `start_detached.bat`을 실행하면 `spawn_services_detached.py`를 통해 모든 프로세스가 눈에 보이지 않게 WMI 백그라운드로 안전하게 분리 구동됩니다.
* **서비스 정지**: `stop_services.bat`을 더블 클릭하여 가동 중인 포트(8080, 5173, 8000) 및 Lemonade 프로세스를 안전하게 강제 종료합니다.
