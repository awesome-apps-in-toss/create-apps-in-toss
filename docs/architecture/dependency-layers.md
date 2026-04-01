# Dependency Layers

## 레이어 정의

앱 내부 코드는 다음 레이어 순서를 따릅니다:

```
┌─────────────────────────────────────┐
│              App.tsx                │  ← 최상위: 라우터, 프로바이더
├─────────────────────────────────────┤
│              pages/                 │  ← 라우트 단위 컴포넌트
├─────────────────────────────────────┤
│            components/              │  ← 재사용 UI
├─────────────────────────────────────┤
│              hooks/                 │  ← 상태 로직
├─────────────────────────────────────┤
│              utils/                 │  ← 순수 함수
├─────────────────────────────────────┤
│              types/                 │  ← 타입만 (런타임 코드 없음)
└─────────────────────────────────────┘
```

## 의존성 방향

**위 → 아래만 허용**

```typescript
// ✅ 올바른 의존성
// pages/HomePage.tsx
import { Button } from '@/components/Button';
import { useUser } from '@/hooks/useUser';

// ✅ 올바른 의존성
// hooks/useUser.ts
import { formatName } from '@/utils/format';
import type { User } from '@/types/user';

// ❌ 잘못된 의존성 (아래 → 위)
// utils/format.ts
import { useUser } from '@/hooks/useUser'; // 금지!
```

## 레이어별 규칙

### types/

- 타입, 인터페이스, enum만 정의
- 런타임 코드 금지
- 다른 레이어에서 자유롭게 import 가능

```typescript
// types/user.ts
export interface User {
  id: string;
  name: string;
}
```

### utils/

- 순수 함수만 (사이드 이펙트 없음)
- React import 금지
- 테스트하기 쉬운 로직

```typescript
// utils/format.ts
export function formatDate(date: Date): string {
  return date.toLocaleDateString('ko-KR');
}
```

### hooks/

- React 훅만 (use\* prefix)
- 상태 로직 캡슐화
- components에서 재사용

```typescript
// hooks/useUser.ts
export function useUser(id: string) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: () => fetchUser(id),
  });
}
```

### components/

- 재사용 가능한 UI 컴포넌트
- Props 기반 (자체 상태 최소화)
- Named export 권장

```typescript
// components/Button.tsx
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ children, onClick }: ButtonProps) {
  return <button onClick={onClick}>{children}</button>;
}
```

### pages/

- 라우트 단위 컴포넌트
- 데이터 페칭, 레이아웃 조합
- 컴포넌트 조합만 (로직은 hooks로)

```typescript
// pages/HomePage.tsx
export function HomePage() {
  const { data: user } = useUser('me');

  return (
    <Layout>
      <Header user={user} />
      <Content />
    </Layout>
  );
}
```

## 위반 감지

ESLint 규칙으로 레이어 위반을 감지합니다:

```javascript
// 향후 추가 예정: eslint-plugin-import 또는 커스텀 규칙
// utils/ 에서 hooks/ import 시 에러
```

## 수정 가이드

### 레이어 위반 발견 시

1. **아래 → 위 의존성**: 로직을 상위 레이어로 이동
2. **순환 의존성**: 공통 코드를 하위 레이어로 추출
3. **잘못된 위치**: 파일을 올바른 디렉토리로 이동
