---
name: ait-build
description: typecheck→lint→ait build 순서로 빌드하고 .ait 번들 용량 검증 및 콘솔 업로드 절차 안내
argument-hint: ''
mode: automated
step: 7
label: 빌드
produces: .ait 번들
requires: [ait-review]
inputs: []
outputs:
  - { key: bundle, type: file, path: 'apps/<appName>/dist/*.ait' }
idempotencyKey: ait-build
---

# 앱인토스 빌드 & 배포 준비

앱을 빌드하고 번들을 검증하여 콘솔 업로드가 가능한 상태로 만듭니다.

(앱 이름은 cwd 가 이미 `apps/<app-name>` 에 고정돼 있으므로 별도 인자로 받지 않는다.)

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

---

## 종료

typecheck·lint·build 가 끝나면 **짧은 완료 보고 한 번**만 출력하고 세션을 마무리한다.

**형식**:

```
✅ 빌드 완료
산출물: apps/<app-name>/dist/*.ait (용량: <size>)
typecheck / lint / build OK
```

**반드시 지킬 것**:

- 다음 단계로 **어떤 슬래시 커맨드도** 권유하지 말 것. 대시보드가 파이프라인 카드로 다음 단계를 자동 안내한다.
- 콘솔 업로드 안내는 "문서 참고" 정도로만 남기고, 특정 스킬을 실행하라고 권유하지 말 것.
- `.meta-dashboard.json` 을 직접 편집하지 말 것. `.ait` 파일을 생성하면 대시보드 서버가 자동 감지·반영한다.
- 사과/추임새 최소화, 본론만.
