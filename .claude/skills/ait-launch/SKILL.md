---
name: ait-launch
description: 앱인토스 미니앱 전체 출시 플로우를 7단계(기획→리소스→스캐폴딩→TDS→구현→검수→빌드)로 순차 실행
argument-hint: '[기획서 경로 또는 앱 아이디어]'
---

# 앱인토스 미니앱 전체 출시 플로우

앱인토스 미니앱을 아이디어부터 출시 직전까지 준비하는 전체 플로우를 순차 실행합니다.

## 입력

사용자에게 아래 정보를 확인합니다 (`$ARGUMENTS`에 기획서 경로가 있으면 바로 읽기):

1. **기획서 또는 앱 아이디어**: 기획서 파일 경로 또는 구두 설명
2. **앱 유형**: 게임 / 비게임
3. **appName** (영문, 변경 불가): 미정이면 함께 결정

## 운영 원칙

### Git 체크포인트

각 주요 단계 완료 시 커밋하여 진행 상황을 보존한다:

- **STEP 3 완료 후**: 스캐폴딩 + 설정 커밋
- **STEP 5 완료 후**: 구현 완료 커밋
- **STEP 6 완료 후**: 리뷰 수정사항 커밋

### 에러 복구

단계 실패 시:

- typecheck/lint 에러 → 자동 수정 시도 후 재실행
- 스캐폴딩 실패 → 에러 메시지 확인 후 원인 해결
- 빌드 실패 → STEP 6(검수)부터 재점검
- **대화가 중단된 경우**: 사용자에게 현재 진행 상황을 확인하고, `apps/<app-name>/` 디렉토리 존재 여부로 시작 단계를 판단

### 단계 간 핸드오프

각 단계에서 확정된 정보는 이후 단계에서 재질문하지 않는다:

- STEP 1 → appName 후보, 앱 유형, 수익화 모델
- STEP 2 → appName 확정, 브랜드 컬러, 한국어 이름
- STEP 3 → 프로젝트 경로, granite.config.ts 설정값

## 실행 플로우

아래 7단계를 순서대로 실행합니다. 각 단계의 상세는 해당 스킬을 참고합니다.

### STEP 1: 기획 & 정책 검토

`docs/launch-flow/01-planning-guide.md`를 읽고 정책 위반 여부 검토, appName 후보 결정.
PRD가 필요하면 `/ait-plan` 스킬의 대화형 프로세스를 활용.

### STEP 2: 리소스 준비 점검

`docs/launch-flow/02-resource-checklist.md`를 읽고 이미지/텍스트 리소스 점검, appName 최종 확정. 상세는 `/ait-assets` 스킬 참고.

### STEP 3: 스캐폴딩

`docs/launch-flow/03-scaffold-guide.md`를 읽고 `pnpm new-app` + granite.config.ts 설정 + **git commit**. 상세는 `/ait-scaffold` 스킬 참고.

### STEP 4: TDS 세팅

`docs/launch-flow/04-tds-setup-guide.md`를 읽고 TDS 패키지/Provider 확인 + 타입체크. 상세는 `/ait-tds-setup` 스킬 참고.

### STEP 5: 구현

`docs/launch-flow/05-implementation-guide.md`를 읽고 기획서 기반 기능 구현 (병렬 에이전트 활용) + **git commit**. 상세는 `/ait-implement` 스킬 참고.

### STEP 6: 검수

`docs/launch-flow/06-review-checklist.md`를 읽고 **full 모드** 점검, 자동 수정 + **git commit**. 상세는 `/ait-review` 스킬 참고.

### STEP 7: 빌드 & 배포 준비

`docs/launch-flow/07-build-deploy-guide.md`를 읽고 typecheck → lint → build → 콘솔 업로드 안내. 상세는 `/ait-build` 스킬 참고.

## 완료 조건

- 모든 7단계의 체크리스트를 통과
- `.ait` 빌드 파일이 정상 생성
- 콘솔 업로드 및 검토 요청이 가능한 상태

## 참고

- MCP `apps-in-toss` 서버를 활용하여 SDK/TDS 문서를 실시간 검색 가능
- 각 단계별로 독립 실행하려면 `/ait-plan`, `/ait-assets`, `/ait-scaffold`, `/ait-tds-setup`, `/ait-implement`, `/ait-review`, `/ait-build` 스킬을 개별 사용
