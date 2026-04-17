---
name: ait-build
description: typecheck→lint→ait build 순서로 빌드하고 .ait 번들 용량 검증 및 콘솔 업로드 절차 안내
argument-hint: '<app-name>'
mode: automated
step: 7
requires: [ait-review]
inputs:
  - { key: appName, type: text, required: true }
outputs:
  - { key: bundle, type: file, path: 'apps/<appName>/dist/*.ait' }
idempotencyKey: ait-build
---

# 앱인토스 빌드 & 배포 준비

앱을 빌드하고 번들을 검증하여 콘솔 업로드가 가능한 상태로 만듭니다.

## 입력

- **앱 이름**: 대상 앱 (`$ARGUMENTS` 또는 사용자에게 확인)

## 실행 절차

1. **`docs/launch-flow/07-build-deploy-guide.md`를 읽어서 빌드/배포 가이드를 확인**합니다.

2. 사전 검증 + 빌드:

   ```bash
   pnpm --filter @barreleye/<app-name> typecheck
   pnpm --filter @barreleye/<app-name> lint
   pnpm --filter @barreleye/<app-name> build
   ```

   - 에러 발생 시 자동 수정 시도

3. 빌드 결과 검증 및 배포 절차 안내는 문서를 따른다 (번들 용량, CORS Origin, 콘솔 업로드, 테스트 절차).

## 결과물

- 빌드 성공 및 `.ait` 파일 생성
- 콘솔 업로드 및 출시 절차 안내
