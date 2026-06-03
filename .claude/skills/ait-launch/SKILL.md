---
name: ait-launch
description: 앱인토스 미니앱 전체 출시 플로우를 8단계(기획→리소스→스캐폴딩→TDS→구현→스크린샷→검수→빌드)로 순차 실행
argument-hint: '[기획서 경로 또는 앱 아이디어]'
mode: interactive
requires: []
inputs:
  - { key: ideaOrPrdPath, type: text, required: false }
  - { key: appType, type: enum, values: [game, partner], required: false }
  - { key: appName, type: text, required: false }
outputs:
  - { key: app, type: directory, path: 'apps/<appName>/' }
idempotencyKey: ait-launch
---

# 앱인토스 미니앱 전체 출시 플로우

아이디어 → 콘솔 업로드 직전까지 8단계를 순차 실행한다. 각 단계의 본문은 호출되는 `/ait-*` 스킬이 자기 책임으로 읽는다 — 이 스킬은 **오케스트레이션만** 담당.

## 입력

`$ARGUMENTS`에 기획서 경로가 있으면 바로 읽고, 없으면 아이디어·앱 유형(게임/비게임)·appName(영문, 변경 불가)을 순서대로 확인.

## 8단계

| STEP | 단계 | 호출 스킬 | 비고 |
|------|------|-----------|------|
| 1 | 기획 & 정책 검토 | `/ait-plan` | appName 후보 결정 |
| 2 | 리소스 점검 (로고+가로 썸네일+텍스트) | `/ait-assets` | appName 확정, 브랜드 컬러 |
| 3 | 스캐폴딩 + 추가 기능 | `/ait-scaffold` | 라우팅/쿼리/TDS 자동 판단. **커밋** |
| 4 | TDS (STEP 3 누락 시) | `/ait-tds-setup` | `@toss/tds-mobile` 있으면 스킵 |
| 5 | 구현 | `/ait-implement` | 병렬 에이전트 활용. **커밋** |
| 6 | 세로 스크린샷 3장 | `/ait-screenshots` | dev 서버 기동 후 캡처 |
| 7 | 검수 | `/ait-review` full | 자동 수정. **커밋** |
| 8 | 빌드 & 배포 | `/ait-build` | typecheck→lint→build, 콘솔 업로드 안내 |

> STEP 6 은 dev 서버 기동이 필요하다. STEP 5 가 끝나면 사용자에게 "다른 터미널에서 `pnpm --filter <package> dev` 를 띄워달라" 고 안내하고, 사용자 확인을 받은 뒤 STEP 6 진행. 캡처 후 사용자가 직접 종료한다.

## 운영 원칙

- **핸드오프**: 앞 단계에서 확정된 정보(appName, 앱 유형, 브랜드 컬러, 설치 스킬 목록)는 뒷단계에서 재질문하지 않는다. 특히 STEP 5 → STEP 6 전환 시 "구현 완료 → 이제 dev 서버 띄워서 스크린샷" 이라는 핸드오프 메시지를 명시적으로 보여 사용자가 다음 행동을 알게 한다.
- **에러 복구**: typecheck/lint 에러는 자동 수정 재시도. 빌드 실패 시 STEP 7 부터 재점검. 대화 중단 시 `apps/<app-name>/` 존재 여부로 시작 단계 판단.
- **완료 조건**: 모든 단계 체크리스트 통과 + `.ait` 생성 + 콘솔 업로드 가능 상태.
- MCP `apps-in-toss`로 SDK/TDS 문서 실시간 검색 가능.
