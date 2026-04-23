---
name: ait-scaffold
description: 미니앱 기본 틀(React + Vite + granite)을 세팅하고, PRD 에 맞춰 라우팅/서버 데이터/TDS 를 자동 판단해 설치합니다.
argument-hint: '<app-name>'
mode: automated
step: 3
label: 프로젝트 틀 만들기
produces: 최소 앱 구조 + 선택한 추가 기능
requires: [ait-plan]
inputs:
  - { key: displayName, type: text, required: false }
  - { key: primaryColor, type: color, required: false }
  - { key: appType, type: select, values: [partner, game], required: false }
outputs:
  - { key: project, type: directory, path: 'apps/<appName>/' }
idempotencyKey: ait-scaffold
---

# 앱 기본 틀 만들기

미니앱이 **일단 켜지는 최소 구성**을 세팅하고, 기획서(PRD) 에서 필요하다고 판단된 추가 기능들을 **하나씩 확인받아** 덧붙입니다.

## 왜 나눠서 설치할까?

예전에는 `pnpm new-app` 한 번에 React Router · TanStack Query · TDS 가 전부 박혀 나왔습니다.
하지만 실제로는 화면이 하나뿐인 단순 앱, 게임 앱(TDS 불필요), 로컬 데이터만 쓰는 앱도 많습니다.
**꼭 필요한 것만 넣어야** 번들 크기 · 이해할 코드량이 줄어들어요.

## 실행 절차

### 0. Idempotent 체크

`apps/<app-name>/` 이 이미 존재하고 `package.json` 이 stub(`barreleye:stub: true`) 이 아니면, step 1 은 스킵하고 바로 step 2 로 넘어간다. 대시보드의 `full` 모드는 NewApp 단계에서 이미 `pnpm new-app` 을 끝내고 진입하므로 이 경로가 기본이다.

### 1. 최소 스캐폴딩 (필요 시만)

앱 폴더가 없거나 stub 상태면:

```bash
pnpm new-app <app-name>
pnpm install
```

이 단계만으로 들어가는 패키지:
- `react`, `react-dom`
- `@apps-in-toss/web-framework` (granite 필수)
- TypeScript, Vite, ESLint

### 2. granite.config.ts 정리

대시보드 inputs(`displayName`, `primaryColor`, `appType`) 가 전달됐으면 그 값으로 `apps/<app-name>/granite.config.ts` 를 수정한다. 누락된 값은 PRD 에서 추론하고, 그래도 애매하면 안전한 기본값(`displayName` = 영문 appName 의 공백 분해, `primaryColor` = `#3182F6`, `appType` = `partner`)을 사용한 뒤 완료 보고에 "선택: X (이유: ...)" 로 명시한다.

### 3. PRD 기반 추가 기능 자동 판단

**`app.console.prdPath`** 또는 `docs/prd/*.md` 를 읽어, 아래 규칙으로 **질문 없이 스스로** 결정한다. 결정과 근거는 완료 보고에 한 줄씩 남겨 사용자가 사후에 추가/제거할 수 있게 한다.

| 기능 | 설치 규칙 | 설치 스킬 |
|------|-----------|-----------|
| 화면 이동 (React Router) | PRD 에 "홈/상세/결과" 같은 **2개 이상 화면**이 등장하면 설치. 애매하면 설치 안 함. | `/ait-add-routing` |
| 서버 데이터 (TanStack Query) | PRD 에 "API", "서버에서 가져와서", "외부 데이터" 문구가 있으면 설치. 로컬 저장으로 충분해 보이면 설치 안 함. | `/ait-add-query` |
| 토스 스타일 UI (TDS) | 비게임(`partner`) 앱이면 **항상 설치** (앱인토스 정책상 필수). 게임(`game`)은 스킵. | `/ait-tds-setup` |

PRD 가 없거나 비어있으면: 라우팅·쿼리는 스킵, TDS 는 appType 규칙대로. 이유를 완료 보고에 명시.

### 4. 결정된 추가 스킬 순차 실행

위 규칙으로 "설치" 로 판정된 스킬을 순서대로 실행한다. 각 스킬은 독립적으로 idempotent 해야 하며, 이미 붙어있으면 건너뛴다. 설치 중 에러가 나면 해당 스킬만 스킵하고 사유를 보고에 남긴 뒤 다음으로 진행 — 멈추지 않는다.

### 5. 검증

```bash
pnpm --filter @barreleye/<app-name> typecheck
```

typecheck 가 통과하는지, `granite.config.ts` · `package.json` 이 의도한 값으로 쓰였는지 확인.
**dev 서버는 띄우지 않는다** — automated 모드는 장시간 실행 프로세스를 기다리지 못한다.
사용자가 직접 `pnpm --filter @barreleye/<app-name> dev` 로 확인한다.

## 결과물

- `apps/<app-name>/` 최소 앱 구조
- granite.config.ts 브랜드 세팅 완료
- 결정된 추가 기능이 붙은 상태
- typecheck 통과

---

## 종료

위 검증까지 끝나면 **짧은 완료 보고 한 번**만 출력하고 세션을 마무리한다.

**형식**:

```
✅ 스캐폴딩 완료: apps/<app-name>/
설치된 기능: <선택한 기능 리스트>
typecheck OK
```

**반드시 지킬 것**:

- 추가 AskUserQuestion 호출 금지. 사용자가 수정 요청을 보내기 전까지 새 질문을 던지지 않는다.
- 다음 단계로 **어떤 슬래시 커맨드도** 권유하지 말 것 — `/ait-*`, 다른 스킬명, 존재하지 않는 단계 조어("Phase C", "Step 8") 모두 금지. 대시보드가 파이프라인 카드로 다음 단계를 자동 안내한다.
- `.meta-dashboard.json` 을 직접 편집하지 말 것. `granite.config.ts` 와 `package.json` 변경만 하면 대시보드 서버가 자동 감지·반영한다.
- 사과/추임새 최소화, 본론만.
