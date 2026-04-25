# 8단계: 빌드 & 배포 준비 (Build & Deploy Guide)

## 목적

앱을 빌드하고, 번들을 검증하며, 콘솔 업로드 및 출시를 준비한다.

## 빌드

### 빌드 커맨드

```bash
# 특정 앱 빌드
pnpm --filter @barreleye/<app-name> build

# 또는 앱 디렉토리에서
cd apps/<app-name>
ait build
```

### 빌드 결과

- 빌드 완료 시 앱 디렉토리(`apps/<app-name>/`)에 `<appName>.ait` 파일 생성
- `.ait` 파일 = 앱 번들 (콘솔에 업로드하는 파일)

### 빌드 검증

- [ ] `pnpm --filter @barreleye/<app-name> typecheck` (타입 체크) 통과
- [ ] `pnpm --filter @barreleye/<app-name> lint` (린트) 통과
- [ ] `pnpm --filter @barreleye/<app-name> build` 에러 없이 완료
- [ ] `apps/<app-name>/<appName>.ait` 파일 생성 확인
- [ ] 빌드 결과물이 `granite.config.ts`의 `outdir` (기본: dist)과 일치

## 번들 검증

### 용량 정책

- **압축 해제 기준 100MB 이하**만 업로드 가능
- 이미지/사운드/영상 등 모든 리소스 포함 시 초과 가능
- 리소스 파일은 빌드와 분리하여 관리

### 용량 최적화 권장사항

- 앱 실행에 필요한 **최소한의 리소스만** 번들에 포함
- 대용량 리소스는 **외부 스토리지 또는 CDN** 다운로드 방식
- 추가 리소스는 **Lazy Loading** 방식 적용

## 콘솔 업로드 및 테스트

### 업로드 방법 (2가지)

1. **콘솔에서 직접 업로드** + QR 코드 테스트
2. **CI/CD 명령어를 통한 자동 업로드**:
   ```bash
   npx ait deploy --api-key $AIT_API_KEY
   ```

   - `AIT_API_KEY`는 `.env` 파일에서 읽음 (프로젝트 루트 또는 `apps/<app-name>/.env`)
   - `.env`에 키가 없으면 앱인토스 콘솔 > 앱 설정 > API 키에서 발급 후 `.env`에 추가:
     ```
     AIT_API_KEY=your-api-key-here
     ```
   - **`.env` 파일은 `.gitignore`에 포함되어 있어야 함** (커밋 금지)

### 네트워크 주의사항

- 라이브 환경에서는 **HTTPS만 허용** (HTTP 차단, ATS 정책)
- iOS/iPadOS 13.4 이상에서 **서드파티 쿠키 완전 차단**

### 토스앱 테스트

업로드 후 생성된 **테스트용 앱스킴**으로 토스앱에서 최종 테스트:

- 테스트를 **1회 이상 완료**해야 검토 요청 버튼 활성화
- 테스트 환경과 실제 환경의 **CORS 정책 및 네트워크**가 다를 수 있음

### 테스트 시 확인사항

- [ ] 메모리/리소스 사용량
- [ ] 네트워크 요청 (CORS)
- [ ] 권한 처리
- [ ] 로그인/세션 유지
- [ ] 실제 결제/인증 기능 (해당 시)
- [ ] CORS Origin 허용 목록에 등록:
  - 실제: `https://<appName>.apps.tossmini.com`
  - QR 테스트: `https://<appName>.private-apps.tossmini.com`

## 검토 요청

### 조건

- 테스트 1회 이상 완료
- 한 번에 하나의 버전만 제출 가능
- 검토는 **영업일 기준 최대 3일** 소요

### 검토 취소

수정이 필요한 버그 발견 시 **'요청 취소하기'** 버튼으로 검토 취소 가능.
수정 후 새 번들을 업로드하고 다시 검토 요청.

### 반려 시

1. '반려사유 보기'로 확인
2. 문제 해결
3. 새로운 번들(.ait) 업로드
4. 다시 검토 요청

## 출시

### 출시 프로세스

1. 번들 승인 → 검수 결과 이메일 수신
2. 콘솔에서 '출시하기' 클릭
3. **즉시 전체 사용자에게 반영**

### 출시 후 관리

- **새 버전 배포**: 동일 방식으로 새 번들 업로드 → 검토 → 승인 → 출시
- **롤백**: '앱 출시' 메뉴에서 이전 버전 선택 → '출시하기'
- **긴급 수정**: 채널톡으로 즉시 문의

### 출시 후 모니터링

- [ ] 주요 오류/크래시 로그
- [ ] Sentry 모니터링
- [ ] API 응답 지연/실패율
- [ ] 사용자 피드백/신고 내역
- [ ] 외부 리소스/CDN 로딩 이슈

## 사후 검수

앱인토스는 출시 후에도 미니앱 검수를 진행.

- 개선 필요 시 개선 요청
- 법/정책 위반 시 긴급 운영 중단 가능

## 빌드 & 배포 체크리스트

- [ ] 타입 체크 통과 (`pnpm --filter @barreleye/<app-name> typecheck`)
- [ ] 린트 통과 (`pnpm --filter @barreleye/<app-name> lint`)
- [ ] 빌드 성공 (`pnpm --filter @barreleye/<app-name> build`)
- [ ] `apps/<app-name>/<appName>.ait` 파일 생성 확인
- [ ] 번들 용량 100MB 이하
- [ ] 콘솔 업로드 완료
- [ ] 토스앱 테스트 1회 이상 완료
- [ ] CORS Origin 설정 확인
- [ ] 검토 요청 제출

## 참고 링크

- 미니앱 출시: https://developers-apps-in-toss.toss.im/development/deploy.html
- 토스앱 테스트: https://developers-apps-in-toss.toss.im/development/test/toss.html
- 긴급 점검 설정: https://developers-apps-in-toss.toss.im/development/check.html
