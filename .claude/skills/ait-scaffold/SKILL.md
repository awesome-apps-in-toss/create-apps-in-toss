---
name: ait-scaffold
description: 미니앱 기본 틀(React + Vite + granite)을 세팅하고, 필요한 추가 기능(라우팅/서버 데이터/TDS 등) 을 사용자에게 확인해 맞춤 설치합니다.
argument-hint: '<app-name>'
mode: interactive
step: 3
label: 프로젝트 틀 만들기
produces: 최소 앱 구조 + 선택한 추가 기능
requires: [ait-plan]
inputs:
  - { key: appName, type: text, required: true }
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

### 1. 최소 스캐폴딩

```bash
pnpm new-app <app-name>
pnpm install
```

이 단계만으로 들어가는 패키지:
- `react`, `react-dom`
- `@apps-in-toss/web-framework` (granite 필수)
- TypeScript, Vite, ESLint

### 2. granite.config.ts 정리

사용자에게 확인:
- **displayName** (한국어 앱 이름)
- **primaryColor** (HEX)
- **appType**: `partner` (일반) / `game`

입력 값으로 `apps/<app-name>/granite.config.ts` 를 수정합니다.

### 3. PRD 기반 추가 기능 제안

**`app.console.prdPath`** 또는 `docs/prd/*.md` 를 읽어, 기획 내용에 맞춰 아래를 **AskUserQuestion 으로 개별 확인**합니다.

| 기능 | 판단 기준 | 설치 스킬 |
|------|-----------|-----------|
| 화면 이동 (React Router) | PRD 에 "홈/상세/결과" 같은 **2개 이상 화면**이 등장하면 제안 | `/ait-add-routing` |
| 서버 데이터 (TanStack Query) | PRD 에 "API", "서버에서 가져와서", "외부 데이터" 문구가 있거나, 로컬 저장으로 충분하지 않으면 제안 | `/ait-add-query` |
| 토스 스타일 UI (TDS) | 비게임(`partner`) 앱이면 기본 제안 (앱인토스 정책상 **필수**). 게임은 스킵 | `/ait-tds-setup` |

각 질문은 "필요한지 모르겠으면 스킵해도 됨. 나중에 다시 붙일 수 있음" 이라는 안전망을 넣으세요.

### 4. 선택된 스킬 순차 실행

사용자가 "예" 라고 답한 스킬을 순서대로 실행합니다.
각 스킬은 독립적으로 idempotent 해야 하며, 이미 붙어있으면 건너뜁니다.

### 5. 검증

```bash
pnpm --filter @barreleye/<app-name> typecheck
pnpm --filter @barreleye/<app-name> dev
```

개발 서버가 정상적으로 뜨고 홈 화면이 렌더링되는지 확인.

## 결과물

- `apps/<app-name>/` 최소 앱 구조
- granite.config.ts 브랜드 세팅 완료
- 사용자가 선택한 추가 기능이 붙은 상태
- 개발 서버 정상 실행 확인

---

## 종료

위 검증까지 끝나면 **짧은 완료 보고 한 번**만 출력하고 세션을 마무리한다.

**형식**:

```
✅ 스캐폴딩 완료: apps/<app-name>/
설치된 기능: <선택한 기능 리스트>
typecheck / dev 서버 OK
```

**반드시 지킬 것**:

- 추가 AskUserQuestion 호출 금지 — 사용자가 수정 요청을 보내기 전까지 새 질문을 던지지 않는다.
- `[Dashboard session contract]` 가 시스템 프롬프트에 주입돼 있으면: "이제 `/ait-tds-setup` 으로 넘어가세요" 같은 **CLI 스킬 호출 권유 금지**. 대시보드가 다음 단계 카드를 자동으로 보여준다.
- CLI 세션일 때만 다음 단계 안내 1줄 덧붙여도 된다.
- 사과/추임새 최소화, 본론만.
