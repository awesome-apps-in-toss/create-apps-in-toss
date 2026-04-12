// ──────────────────────────────────────────
// Layer 1: 빌드 코드 (granite.config.ts, 읽기 전용)
// ──────────────────────────────────────────
export interface GraniteBrand {
  appName: string | null;
  displayName: string | null;
  primaryColor: string | null;
  icon: string | null;
}

// ──────────────────────────────────────────
// .meta-dashboard.json 스키마
// 모든 경로: 앱 폴더 기준 상대경로
//   이미지: ".meta/assets/logo.png"
//   PRD:   "docs/PRD.md"
//   UT:    "docs/user-test/report.md"
// ──────────────────────────────────────────
export interface AppConsoleConfig {
  version: number;
  // 기본 정보
  nameKo: string;
  nameEn: string;
  isGame: boolean;
  // 카테고리 (앱인토스 콘솔 기준, e.g. "생활 > 콘텐츠 > 테스트")
  aitCategory: string;
  // 노출 정보
  subtitle: string;
  description: string;
  keywords: string[];
  // 이미지 에셋 경로 (앱 폴더 기준 상대경로)
  logoPath: string | null; // 600×600
  thumbnailPath: string | null; // 1932×828 가로형
  screenshotPaths: string[]; // 세로 636×1048 ≥3장 or 가로 1504×741 ≥1장
  // 문서 경로 (앱 폴더 기준 상대경로)
  prdPath: string | null;
  utPath: string | null;
  updatedAt: string;
}

export const DEFAULT_CONSOLE_CONFIG: AppConsoleConfig = {
  version: 1,
  nameKo: '',
  nameEn: '',
  isGame: false,
  aitCategory: '',
  subtitle: '',
  description: '',
  keywords: [],
  logoPath: null,
  thumbnailPath: null,
  screenshotPaths: [],
  prdPath: null,
  utPath: null,
  updatedAt: '',
};

// ──────────────────────────────────────────
// 문서 존재 여부 (서버에서 경로 확인 후 채움)
// ──────────────────────────────────────────
export interface AppDoc {
  exists: boolean;
  path?: string;
  date?: string;
}

export interface AppDocs {
  prd: AppDoc;
  ut: AppDoc;
}

// ──────────────────────────────────────────
// 통합 AppInfo (API 응답)
// ──────────────────────────────────────────
export interface AppInfo {
  folderName: string;
  packageName: string;
  version: string;
  description: string;
  dependencies: Record<string, string>;
  // Layer 1
  granite: GraniteBrand | null;
  // Layer 2
  console: AppConsoleConfig;
  // Layer 3
  docs: AppDocs;
  // 완성도 (레이어 가중치 적용)
  completion: number;
  completionDetail: {
    layer1: number; // 0–40
    layer2: number; // 0–30
    layer3: number; // 0–30
  };
}

export interface SkillRunRequest {
  skill: 'ait-ut' | 'idea-to-prd' | 'icon-generator';
  app: string;
}
