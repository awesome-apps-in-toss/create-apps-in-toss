---
name: ait-scaffold
description: 모노레포에 새 미니앱 프로젝트를 pnpm new-app으로 생성하고 granite.config.ts 설정까지 완료
argument-hint: '<app-name>'
mode: automated
step: 3
requires: [ait-plan]
inputs:
  - { key: appName, type: text, required: true }
  - { key: displayName, type: text, required: false }
  - { key: primaryColor, type: text, required: false }
  - { key: appType, type: enum, values: [game, partner], required: false }
outputs:
  - { key: project, type: directory, path: 'apps/<appName>/' }
idempotencyKey: ait-scaffold
---

# 앱인토스 앱 스캐폴딩

모노레포 내에 새 미니앱 프로젝트를 생성하고 기본 설정을 완료합니다.

## 입력

사용자에게 아래 정보를 확인합니다 (`$ARGUMENTS`에 app-name이 있으면 바로 사용):

- **appName**: 콘솔에 등록한 앱 ID (영문, 하이픈 가능)
- **한국어 앱 이름** (displayName)
- **브랜드 컬러** (HEX)
- **앱 로고 URL** (없으면 빈 문자열로 임시)
- **앱 유형**: 게임(`'game'`) / 비게임(`'partner'`)

## 실행 절차

1. **`docs/launch-flow/03-scaffold-guide.md`를 읽어서 스캐폴딩 절차를 확인**합니다.

2. 앱 생성: `pnpm new-app <app-name>` → `pnpm install`

3. `apps/<app-name>/granite.config.ts` 설정 (상세 필드: 문서 참고)

4. `vite.config.ts` 포트 일치 확인

5. `apps/<app-name>/docs/` 폴더 생성 후 기획서 배치

6. 개발 서버 실행 확인: `pnpm --filter @barreleye/<app-name> dev`

7. 스캐폴딩 체크리스트 점검 후 결과 보고

## 결과물

- 새 앱 디렉토리 `apps/<app-name>/` 생성
- granite.config.ts 설정 완료
- 개발 서버 정상 실행 확인
