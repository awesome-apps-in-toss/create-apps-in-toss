---
name: ait-implement
description: 기획서 기반으로 앱 기능을 구현. TDS 컴포넌트 활용, SDK 연동, 병렬 에이전트 지원
argument-hint: '[기능 범위]'
mode: automated
step: 5
label: 구현
produces: 기능 코드, 라우팅
requires: [ait-plan, ait-tds-setup]
inputs:
  - { key: scope, type: text, required: false }
outputs:
  - { key: code, type: directory, path: 'apps/<appName>/src/' }
idempotencyKey: ait-implement
---

# 앱인토스 기능 구현

기획서를 기반으로 앱 기능을 구현합니다. 병렬 에이전트를 활용하여 효율적으로 개발합니다.

## 입력

- **기획서 경로**: `apps/<app-name>/docs/planning.md` 또는 사용자 지정 경로
- **구현 범위**: 전체 / 특정 기능만 (`$ARGUMENTS` 에 지정 가능)

(앱 이름은 cwd 가 이미 `apps/<app-name>` 에 고정돼 있으므로 별도 인자로 받지 않는다.)

## 실행 절차

1. **`docs/launch-flow/05-implementation-guide.md`를 읽어서 구현 가이드를 확인**합니다.

2. **사전 조건 확인**: TDS 패키지 3종 설치 + `TDSMobileAITProvider` 래핑 확인. 미완료 시 이 세션 안에서 패키지 설치·Provider 래핑을 직접 수행하고, 그래도 해결 안 되는 구조적 문제면 요약에 한 줄로 남긴다. (외부 스킬 호출을 사용자에게 권유하지 말 것)

3. 기획서를 읽고 기능 목록 정리 → 작업 분할.

4. 구현 시 필수 준수사항은 문서 참고 (TDS 컴포넌트, 내비게이션 바, UX 규칙, `.isSupported()` 가드 패턴 등).

5. SDK/TDS 연동 시 MCP `search_docs`, `search_tds_web_docs`로 문서 검색.

6. **병렬 구현** (복잡한 앱의 경우):
   - **골격 먼저**: 공유 타입(`types/`), 라우팅 골격, 유틸리티 스텁을 생성
   - **기능별 병렬**: 기능별 에이전트를 병렬 실행:

   ```
   Agent 1: 기능 A 페이지
   Agent 2: 기능 B 페이지
   Agent 3: 기능 C 페이지
   ```

   각 에이전트에 기획서, 구현 가이드, 공유 타입/인터페이스를 컨텍스트로 전달

7. 구현 완료 후: `pnpm --filter @barreleye/<app-name> typecheck && lint`

## 디렉토리 구조 규칙

```
src/
├── pages/       # 라우트 컴포넌트 (페이지당 1파일)
├── components/  # 재사용 컴포넌트
├── utils/       # 순수 함수, 헬퍼
├── types/       # TypeScript 타입 정의
└── providers/   # Context Provider
```

## 결과물

- 기획서 기반 전체 기능 구현
- TDS 컴포넌트 + adaptive 색상 적용
- 라우팅 구조 완성
- 타입 체크 + 린트 통과

---

## 종료

구현 · typecheck · lint 가 끝나면 **짧은 완료 보고 한 번**만 출력하고 세션을 마무리한다.

**형식**:

```
✅ 구현 완료: <구현한 주요 기능 리스트>
typecheck / lint OK
```

**반드시 지킬 것**:

- 다음 단계로 **어떤 슬래시 커맨드도** 권유하지 말 것 — `/ait-*`, 다른 스킬명, 존재하지 않는 단계 조어("Phase C", "Step 8") 모두 금지. 대시보드가 파이프라인 카드로 다음 단계를 자동 안내한다.
- `.meta-dashboard.json` 을 직접 편집하지 말 것. 소스 · `package.json` 변경만 하면 대시보드 서버가 자동 감지·반영한다.
- 사과/추임새 최소화, 본론만.

---

## UI 디자인 품질 보강 (impeccable 스킬 연계)

앱 UI를 실제로 만드는 단계이므로, 구현 중·후에 `impeccable` 스킬 세트를 활용해 디자인 품질을 높일 수 있습니다. 모든 스킬이 auto-trigger 가능하지만, 확실히 돌리려면 명시 호출하세요.

### ⚠️ TDS 가드레일 (필수)

impeccable 스킬은 "creative, distinctive UI" 지향이므로 호출 전 **이 앱이 `@toss/tds-mobile` 사용 필수**임을 반드시 에이전트에 전달하세요. 호출 시 다음 제약을 프롬프트에 포함:

- **컴포넌트는 TDS primitive 위에 올린다** (자체 버튼/카드/인풋 재구현 금지)
- **색상은 TDS adaptive 토큰**을 사용 — `@toss/tds-colors`의 `colors.*` 만 허용, **리터럴 hex(`#FF0000` 등) 금지**. 브랜드 컬러는 `granite.config.ts`의 `brand.primaryColor`가 `TDSMobileAITProvider`로 주입되는 구조이므로 컴포넌트에서 직접 하드코딩 X
- **텍스트는 TDS Typography 스케일** 준수
- **impeccable은 TDS가 커버하지 못하는 레이아웃·간격·마이크로 디테일·모션만** 담당

즉 impeccable = "TDS 위의 디테일 튜너"지, "대체 디자인 시스템"이 아님.

**우선순위 규칙 (충돌 시 절대 규칙)**

`/impeccable teach`가 생성하는 Design Context와 TDS 토큰이 충돌하면 **항상 TDS 토큰이 우선**입니다. teach 결과에 별도 팔레트·타이포·spacing 제안이 포함돼 있어도 TDS primitive·`colors.*` 토큰만을 single source of truth로 삼으세요.

### 단계별 호출 가이드

**최초 1회 — 디자인 컨텍스트 학습** (신규 앱·세션당 1회로 충분)

- `/impeccable teach` — impeccable 엔진에 **TDS 토큰·색상·타이포·컴포넌트 레퍼런스를 주입**하는 단계. 이걸 먼저 안 돌리면 이후 `/impeccable craft` 등이 TDS 컨텍스트 없이 제너릭 UI를 뽑을 수 있음. 대상 앱의 `granite.config.ts`(brand.primaryColor)와 TDS 설치 상태를 함께 전달.

**구현 전 — UI 방향 설정**

- `/shape` — 큰 기능은 PRD 기반으로 UX/UI 전략·제약을 먼저 정리한 뒤 코딩 시작

**구현 중·후 — 품질 보강 (해당되는 것만 선택)**

- `/impeccable craft` — 새 페이지 만들 때 shape→build 패턴 (TDS 컴포넌트 조합 기반)
- `/layout` — TDS 컴포넌트 간 간격·정렬·시각 위계가 어색할 때
- `/typeset` — TDS Typography 적용 후 위계가 여전히 어색할 때
- `/colorize` — 너무 무채색이거나 단조로울 때. **허용: `@toss/tds-colors`의 `colors.*` 토큰만 / 금지: 리터럴 hex·rgb·hsl**. impeccable이 새 팔레트를 제안하면 TDS가 제공하는 가장 가까운 토큰으로 매핑
- `/animate` — 인터랙션·전환 애니메이션 추가하고 싶을 때
- `/clarify` — UX 카피·에러 메시지·라벨이 혼란스러울 때

> `/adapt`(반응형·다양한 화면 크기)는 앱인토스가 **모바일 전용 webview**라 일반적으론 불필요. iOS/Android 터치 타겟·safe area 보정이 꼭 필요한 경우에만.

**Shipping 직전**

- `/polish` — 구현자가 self-check용 최종 검수 (정렬·간격·일관성·마이크로 디테일)

> `/polish`는 `/ait-review`에서도 등장합니다 — 거기는 리뷰어가 별도 관점으로 돌리는 용도. 중복 호출해도 비용은 낮지만, 통상 **구현자가 한 번 / 리뷰어가 한 번**이 자연스러움.
