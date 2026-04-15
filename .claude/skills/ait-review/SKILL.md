---
name: ait-review
description: 앱인토스 검수 체크리스트 기반 코드 리뷰. light(핵심만)/full(전수검사) 모드 지원
argument-hint: '<app-name> [light|full] [game|partner]'
---

# 앱인토스 검수 체크리스트 리뷰

앱인토스 검수 기준에 맞춰 앱을 코드 레벨에서 리뷰합니다.

## 입력

- **앱 이름**: 대상 앱 (`$ARGUMENTS`의 첫 번째 인자 또는 사용자에게 확인)
- **검수 모드**: `$ARGUMENTS`의 두 번째 인자 — `light`(기본) 또는 `full`
  - `light`: 설정/TDS/코드 품질 등 핵심 항목만 자동 점검
  - `full`: 공식 게임/비게임 출시 가이드 전수 검사
- **앱 유형**: `$ARGUMENTS`의 세 번째 인자 — `game` 또는 `partner` (없으면 granite.config.ts에서 확인)

## 실행 절차

1. **`docs/launch-flow/06-review-checklist.md`를 읽어서 전체 체크리스트를 확인**합니다.

2. 대상 앱의 소스 코드를 전체 읽습니다 (`src/`, `granite.config.ts`, `package.json`).

3. **light 모드**: 문서의 LIGHT 모드 체크리스트 항목만 점검.

4. **full 모드**: LIGHT + FULL 모드 전체 체크리스트 점검.
   - 병렬 에이전트 활용:
     - Agent 1: 코드 품질 + 설정 (LIGHT 항목)
     - Agent 2: 기능별 체크리스트 (FULL 항목, 게임/비게임 구분)

5. 검수 결과를 정리합니다:
   - **PASS** / **FAIL** (수정 방법 안내) / **N/A** / **MANUAL** (런타임 테스트 필요)

6. FAIL 항목 자동 수정:
   - **자동 수정 가능**: 설정값 누락, import 누락, Provider 래핑, lint 에러
   - **수동 확인 필요**: 비즈니스 로직, 디자인 결정, 런타임 동작
   - 자동 수정 전 변경 내용을 사용자에게 안내

## 결과물

전체 체크리스트 점검 결과표와 수정 완료 보고
