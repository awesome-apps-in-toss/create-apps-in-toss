---
name: ait-review
description: 앱인토스 검수 체크리스트 기반 코드 리뷰. light(핵심만)/full(전수검사) 모드 지원
argument-hint: '[light|full] [game|partner]'
mode: automated
step: 6
label: 검수
produces: 검수 리포트
requires: [ait-implement]
inputs:
  - { key: reviewMode, type: enum, values: [light, full], required: false }
  - { key: appType, type: enum, values: [game, partner], required: false }
outputs:
  - { key: reviewReport, type: text, required: true }
idempotencyKey: ait-review
---

# 앱인토스 검수 체크리스트 리뷰

앱인토스 검수 기준에 맞춰 앱을 코드 레벨에서 리뷰합니다.

## 입력

- **검수 모드**: `$ARGUMENTS`의 첫 번째 인자 — `light`(기본) 또는 `full`
  - `light`: 설정/TDS/코드 품질 등 핵심 항목만 자동 점검
  - `full`: 공식 게임/비게임 출시 가이드 전수 검사
- **앱 유형**: `$ARGUMENTS`의 두 번째 인자 — `game` 또는 `partner` (없으면 granite.config.ts에서 확인)

(앱 이름은 cwd 가 이미 `apps/<app-name>` 에 고정돼 있으므로 별도 인자로 받지 않는다.)

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

---

## 종료

체크리스트 점검 · 자동 수정이 끝나면 **구조화 상태 신호를 먼저 기록한 뒤**, 짧은 완료 보고 한 번만 출력하고 세션을 마무리한다.

### 구조화 상태 신호 (NON-NEGOTIABLE)

공통 규약: `.claude/skills/_shared/run-status-contract.md`

대시보드 세션으로 실행될 때 환경변수 `AIT_RUN_STATUS_PATH` 로 per-run JSON 파일 경로가 전달된다. **텍스트로 ✅/❌ 를 찍기 전에 반드시** 이 경로에 `Write` 로 기록한다.

성공:
```json
{"status":"success"}
```

실패:
```json
{"status":"failure","reason":"<한 줄 원인>"}
```

대시보드 밖에서는 환경변수가 비어있을 수 있으니 있을 때만 기록한다.

**형식**:

```
✅ 검수 완료 (mode: light|full)
PASS: <개수> · FAIL: <개수> · MANUAL: <개수>
자동 수정: <수정한 항목 요약>
```

**규칙**: 완료 보고 1회 후 종료.

---

## UI 디자인 리뷰 보강 (impeccable 스킬 연계)

앱인토스 공식 체크리스트는 정책·규격·기능 검수가 중심입니다. **UI 디자인 품질**은 아래 스킬로 보강할 수 있습니다 (체크리스트와 중복되지 않는 관점):

- `/critique` — UX 관점 평가: 시각 위계·정보구조·인지 부하 스코어링 + 페르소나 기반 피드백
- `/audit` — 접근성·성능·안티패턴 기술 품질 점검 (P0~P3 심각도 리포트)
- `/polish` — 리뷰어 관점의 최종 검수 (정렬·간격·일관성·마이크로 디테일)

> `/polish`는 `/ait-implement`에서도 구현자 self-check로 등장합니다. 여기는 **리뷰어가 제3자 관점**으로 한 번 더 돌리는 용도 — 놓친 디테일 캐치.

auto-trigger 가능하지만, 리뷰 깊이를 높이려면 명시 호출 권장.
