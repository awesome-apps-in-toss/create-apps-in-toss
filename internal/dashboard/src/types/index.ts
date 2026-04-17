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
  thumbnailPath: string | null; // 가로형 1932×828 (assets/thumbnail-wide.png)
  screenshotPaths: string[]; // 정사각형 1000×1000 (assets/thumbnail-square.png) 등
  // 문서 경로 (앱 폴더 기준 상대경로)
  prdPath: string | null;
  utPath: string | null;
  // 파이프라인 진행 상태 (step 번호 → 상태)
  pipelineProgress: Record<number, PipelineStepStatus>;
  updatedAt: string;
}

// ──────────────────────────────────────────
// 파이프라인 진행 상태 (메타데이터 저장)
// ──────────────────────────────────────────
export interface PipelineStepStatus {
  completedAt: string;
  /** 이 단계에서 생성된 주요 산출물 경로 */
  artifacts?: Record<string, string>;
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
  pipelineProgress: {},
  updatedAt: '',
};

// ──────────────────────────────────────────
// 문서 존재 여부 (서버에서 경로 확인 후 채움)
// ──────────────────────────────────────────
export interface AppDoc {
  exists: boolean;
  path?: string;
  date?: string;
  /** 서버가 관례적 경로에서 자동 감지한 경우 true */
  autoDetected?: boolean;
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

// ──────────────────────────────────────────
// 스킬 실행 모드
//   interactive: 대화형 — 웹에서 직접 실행 불가, CLI 명령어 복사 제공
//   automated:   자동 실행 가능 — 웹에서 바로 실행
// ──────────────────────────────────────────
export type SkillMode = 'interactive' | 'automated';

// 파이프라인 단계의 **UI용 형상**(label/produces/requires 등)은 더 이상
// 이 파일에 하드코딩하지 않는다. 런타임에 GET /api/skills 가 SKILL.md
// frontmatter를 읽어 내려주며, 프론트는 useSkills() 훅으로 소비한다.
// 여기서는 실행 허용 스킬의 **식별자(id)**만 타입 수준에서 고정한다.

/** 7단계 순차 파이프라인 스킬 id */
export type PipelineSkill =
  | 'ait-plan'
  | 'ait-assets'
  | 'ait-scaffold'
  | 'ait-tds-setup'
  | 'ait-implement'
  | 'ait-review'
  | 'ait-build';

/** 독립 실행 유틸리티 스킬 id */
export type UtilitySkill = 'ait-meta' | 'ait-ut' | 'ait-launch';

export type AllowedSkill = PipelineSkill | UtilitySkill;

export interface SkillRunRequest {
  skill: AllowedSkill;
  app: string;
}
