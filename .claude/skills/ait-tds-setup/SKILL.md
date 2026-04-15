---
name: ait-tds-setup
description: 대상 앱에 @toss/tds-mobile TDS 패키지를 설치하고 컴포넌트 import/타입체크로 정상 동작 검증
argument-hint: '<app-name>'
---

# 앱인토스 TDS 환경 세팅 및 검증

Toss Design System(TDS)을 설치하고 정상 동작을 검증합니다.

## 입력

- **앱 이름**: 대상 앱 (`$ARGUMENTS` 또는 사용자에게 확인)

## 실행 절차

1. **`docs/launch-flow/04-tds-setup-guide.md`를 읽어서 TDS 세팅 가이드를 확인**합니다.

2. 문서 기준으로 TDS 패키지 설치 + Provider 래핑 + 컴포넌트 사용 테스트 + 타입체크를 수행합니다.

   > `pnpm new-app`으로 생성한 프로젝트는 필수 3종 + Provider가 이미 포함됨 — 확인만 하면 됨.

3. TDS 컴포넌트 활용 시 MCP `search_tds_web_docs`로 필요한 컴포넌트 검색 가능.

4. 세팅 검증 체크리스트 점검 후 결과 보고

## 주의사항

- 로컬 브라우저에서는 TDS가 동작하지 않음 (샌드박스 앱에서만 확인 가능)
- 비게임 미니앱은 TDS 사용 **필수**
