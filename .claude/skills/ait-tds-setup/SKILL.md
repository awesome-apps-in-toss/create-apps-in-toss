---
name: ait-tds-setup
description: 토스 앱과 통일된 스타일의 UI 컴포넌트(버튼·카드·리스트 등) 를 앱에 붙여줍니다. 비게임 앱은 앱인토스 정책상 필수입니다.
argument-hint: '<app-name>'
mode: automated
step: 4
label: 토스 스타일 UI
produces: TDS 패키지 + Provider 설정
requires: [ait-scaffold]
inputs:
  - { key: appName, type: text, required: true }
outputs:
  - { key: tdsPackages, type: config, path: 'apps/<appName>/package.json' }
idempotencyKey: ait-tds-setup
---

# 토스 스타일 UI 추가 (TDS)

미니앱에 **토스 앱과 비슷한 느낌의 버튼·카드·입력창·리스트** 를 쉽게 쓸 수 있게 해줍니다.
설치 후에는 `<Button>`, `<Typography>`, `<List>` 같은 준비된 컴포넌트를 바로 꺼내 쓸 수 있어요.

## 쓰기 좋은 때

- **비게임 앱**: 앱인토스 정책상 **필수**. 토스 앱 내부에서 이질감 없이 보여야 하기 때문.
- 직접 스타일을 짜기보다, 이미 검증된 UI 를 빠르게 조립하고 싶을 때

**게임 앱**은 붙이지 않아도 됩니다 — 자체 스타일/캔버스를 쓰는 경우가 많아요.

## 실행 절차

1. **`docs/launch-flow/04-tds-setup-guide.md`를 읽어서 세팅 가이드를 확인**합니다.

2. 패키지 설치 + Provider 래핑 + 컴포넌트 import 테스트 + 타입체크를 순차 수행.

3. TDS 컴포넌트 사용 예시가 궁금하면 MCP `search_tds_web_docs` 로 검색 가능.

4. 세팅 검증 체크리스트 점검 후 결과 보고.

## 주의사항

- 로컬 브라우저에서는 TDS 스타일이 완전히 동작하지 않음. **앱인토스 샌드박스 앱**에서 확인하세요.
- 비게임 미니앱은 TDS 사용 **필수** (앱인토스 심사 기준).
