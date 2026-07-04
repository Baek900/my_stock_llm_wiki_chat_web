# Project-Scoped Rules

## Cloud Run Deployment & Debugging Guardrails

### 1. 지레짐작 금지 및 로그 우선 분석 (Log-First Diagnostics)
- 배포(Cloud Run) 서버 환경에서 API 호출 오류나 비정상 동작이 감지될 경우, 원인을 절대 지레짐작하거나 코드를 바로 수정하지 않는다.
- 즉시 `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=agent-guru-service"` 명령어를 실행하여 **실제 Stacktrace, 에러 예외(Exception), HTTP status code**를 분석하고 확실한 팩트에 근거하여 디버깅을 시작한다.

### 2. 배포 전 로컬 통합/구문 검증 절차 강제 (Pre-deploy Verification)
- 배포 스크립트(`gcloud run deploy`)를 실행하기 전에, 수정된 백엔드 파일(`main.py`, `agent_harness.py`, `api_llm.py` 등)의 함수 호출 관계, 모듈 import 여부, 매개변수 규격(Signature)이 일치하는지 로컬 환경에서 컴파일 및 통합 검증을 100% 수행하고 에러가 없음을 확인한다.
- 예: `python -m py_compile backend/*.py` 실행 및 상호 참조 정합성 검사.

### 3. 배포 직후 서비스 헬스 체크 자동화 (Post-deploy Health Check)
- 배포가 완료되면 단순히 성공 메시지를 띄우는 것에 그치지 않고, 배포 완료된 라이브 도메인의 주요 API 엔드포인트(예: `/api/research/sessions`)에 직접 curl 또는 HTTP request를 날려 서버가 200 OK로 활성화되고 실제로 API 기반 호출이 이루어지는지 연동 성공 여부를 최종 확인한다.
