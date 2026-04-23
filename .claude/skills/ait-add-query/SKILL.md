---
name: ait-add-query
description: 서버에서 데이터를 받아와 화면에 보여주는 TanStack Query 를 앱에 붙입니다. 로딩/에러/캐시 처리가 자동으로 됩니다.
argument-hint: ''
mode: automated
step: null
label: 서버 데이터 연결
produces: TanStack Query + QueryProvider 설정
requires: [ait-scaffold]
inputs: []
outputs:
  - { key: queryProvider, type: config, path: 'apps/<appName>/src/providers/QueryProvider.tsx' }
idempotencyKey: ait-add-query
---

# 서버 데이터 연결 추가

API 에서 데이터를 받아와 화면에 뿌리고 싶을 때 **TanStack Query** 를 붙여줍니다.
로딩 스피너, 에러 메시지, 재시도, 캐시 — 이걸 수동으로 짜지 않아도 되는 게 장점이에요.

## 쓰기 좋은 때

- 외부 API / 우리 서버에서 데이터를 주기적으로 가져와야 할 때
- "로딩 중…", "에러났어요" 같은 상태를 반복해서 그리게 될 때
- 같은 데이터를 여러 화면에서 공유하게 될 때 (자동 캐시)

단순 로컬 상태만 다루면 필요 없어요. `useState` 로 충분합니다.

## 실행 절차

1. **Idempotent 체크**: `package.json` 에 `@tanstack/react-query` 가 이미 있으면 "이미 설치됨" 로그만 남기고 종료. `QueryProvider` 래핑 누락만 재점검해서 빠진 부분만 채운다.

2. 앱 디렉토리 확인: `apps/<app-name>/`. 없으면 스캐폴딩 미완료 상태로 보고 실패 메시지로 종료 (외부 스킬 호출 권유 금지).

3. 패키지 설치
   ```bash
   pnpm --filter @barreleye/<app-name> add @tanstack/react-query
   ```

3. `src/providers/QueryProvider.tsx` 생성 (아래 보일러플레이트).

4. `src/main.tsx` 에서 `<QueryProvider>` 로 `<App />` 을 감싸기.

5. 예시 훅 하나 (`src/hooks/useExampleQuery.ts`) 를 만들어 `useQuery` 쓰는 법 시연.

6. `pnpm --filter @barreleye/<app-name> typecheck`

## 보일러플레이트

**src/providers/QueryProvider.tsx**
```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1분 동안은 캐시된 값 그대로 사용
      retry: 1,
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

**예시 훅**
```tsx
import { useQuery } from '@tanstack/react-query';

export function useExampleQuery() {
  return useQuery({
    queryKey: ['example'],
    queryFn: async () => {
      const res = await fetch('/api/example');
      if (!res.ok) throw new Error('failed');
      return res.json() as Promise<{ message: string }>;
    },
  });
}
```

## 완료 체크

- [ ] `main.tsx` 가 `QueryProvider` 로 감싸져 있음
- [ ] 예시 훅을 화면에서 호출하면 로딩 → 결과가 교체됨
- [ ] typecheck 통과

---

## 종료

설치·Provider 래핑·typecheck 가 끝나면 **짧은 완료 보고 한 번**만 출력하고 세션을 마무리한다.

**형식**:

```
✅ TanStack Query 추가 완료
설치: @tanstack/react-query
세팅: src/providers/QueryProvider.tsx, src/main.tsx 래핑, 예시 훅 1개
```

**규칙**: 완료 보고 1회 후 종료.
