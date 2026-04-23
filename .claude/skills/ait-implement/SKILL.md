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

**규칙**: 완료 보고 1회 후 종료.

---

## UI 디자인 품질 보강 (impeccable 연계, 선택)

**TDS 우선 원칙**: impeccable 스킬은 "TDS 위의 디테일 튜너" 로만 사용. TDS primitive·`@toss/tds-colors`의 `colors.*` 토큰이 single source of truth (리터럴 hex/rgb 금지). 브랜드 컬러는 `TDSMobileAITProvider`가 주입하므로 하드코딩 X.

**호출 순서 (해당되는 것만)**:
1. `/impeccable teach` — 세션당 1회, TDS 토큰·컴포넌트를 엔진에 주입
2. 구현 전: `/shape` — PRD 기반 UX/UI 전략 정리
3. 구현 중: `/impeccable craft` / `/layout` / `/typeset` / `/colorize` / `/animate` / `/clarify` — 필요한 것만
4. 마감: `/polish` — 구현자 self-check

> 모바일 전용 webview라 `/adapt`는 보통 불필요. `/polish`는 `/ait-review`에서도 돌지만 구현자·리뷰어 각 1회가 자연스러움.
