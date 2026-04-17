---
name: ait-implement
description: 기획서 기반으로 앱 기능을 구현. TDS 컴포넌트 활용, SDK 연동, 병렬 에이전트 지원
argument-hint: '<app-name> [기능 범위]'
mode: automated
step: 5
label: 구현
produces: 기능 코드, 라우팅
requires: [ait-plan, ait-tds-setup]
inputs:
  - { key: appName, type: text, required: true }
  - { key: scope, type: text, required: false }
outputs:
  - { key: code, type: directory, path: 'apps/<appName>/src/' }
idempotencyKey: ait-implement
---

# 앱인토스 기능 구현

기획서를 기반으로 앱 기능을 구현합니다. 병렬 에이전트를 활용하여 효율적으로 개발합니다.

## 입력

- **앱 이름**: 대상 앱 (`$ARGUMENTS`의 첫 번째 인자 또는 사용자에게 확인)
- **기획서 경로**: `apps/<app-name>/docs/planning.md` 또는 사용자 지정 경로
- **구현 범위**: 전체 / 특정 기능만 (`$ARGUMENTS`의 두 번째 인자에 지정 가능)

## 실행 절차

1. **`docs/launch-flow/05-implementation-guide.md`를 읽어서 구현 가이드를 확인**합니다.

2. **사전 조건 확인**: TDS 패키지 3종 설치 + `TDSMobileAITProvider` 래핑 확인. 미완료 시 `/ait-tds-setup` 실행 권장.

3. 기획서를 읽고 기능 목록 정리 → 작업 분할.

4. 구현 시 필수 준수사항은 문서 참고 (TDS 컴포넌트, 내비게이션 바, UX 규칙, `.isSupported()` 가드 패턴 등).

5. SDK/TDS 연동 시 MCP `search_docs`, `search_tds_web_docs`로 문서 검색.

6. **병렬 구현** (복잡한 앱의 경우):
   - **Phase 1**: 공유 타입(`types/`), 라우팅 골격, 유틸리티 스텁을 생성
   - **Phase 2**: 기능별 에이전트를 병렬 실행:

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
