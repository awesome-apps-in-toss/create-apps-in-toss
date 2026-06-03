// 파이프라인 단계 세팅 교차검증 CLI
//
//   pnpm --filter @barreleye/dashboard validate
//
// SKILL.md frontmatter ↔ DEMO_SKILLS ↔ 각 앱 .meta-dashboard.json 을 스킬별로 대조해
// "단계 세팅이 어긋난 곳"을 찾아 출력한다. 오류가 하나라도 있으면 exit 1.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { listSkillMetas } from '../server/lib/skills-meta.js';
import { loadAllApps } from '../server/routes/apps.js';
import { DEMO_SKILLS } from '../src/data/demoSkills.js';
import {
  crossCheckDemoSkills,
  checkDependencyGraph,
  checkProgressDependencies,
  checkAppPaths,
} from '../server/lib/validate-pipeline.js';
import type { Issue } from '../server/lib/validate-pipeline.js';

const APPS_DIR = path.resolve(process.cwd(), '../../apps');

const ICON: Record<Issue['severity'], string> = { error: '✖', warning: '⚠' };

function lines(issues: Issue[], scope: string): Issue[] {
  return issues.filter((i) => i.scope === scope);
}

async function main(): Promise<void> {
  const [metas, apps] = await Promise.all([listSkillMetas(), loadAllApps()]);

  const issues: Issue[] = [
    ...crossCheckDemoSkills(metas, DEMO_SKILLS),
    ...checkDependencyGraph(metas),
  ];
  for (const app of apps) {
    const appDir = path.join(APPS_DIR, app.folderName);
    issues.push(...checkProgressDependencies(app.folderName, app.console.pipelineProgress, metas));
    issues.push(
      ...checkAppPaths(app.folderName, app.console, (rel) => existsSync(path.join(appDir, rel)))
    );
  }

  console.log('\n🔎 파이프라인 단계 세팅 교차검증\n');

  // ── 스킬별 (SKILL.md ↔ DEMO_SKILLS ↔ 의존성) ──
  console.log('[스킬별]  SKILL.md ↔ DEMO_SKILLS ↔ requires');
  const pipeline = metas
    .filter((m) => m.step !== null)
    .sort((a, b) => (a.step ?? 0) - (b.step ?? 0));
  for (const m of pipeline) {
    const mine = lines(issues, `skill:${m.id}`);
    const head = `  ${String(m.step).padStart(2)} ${m.id} (${m.label ?? '-'})`;
    if (mine.length === 0) {
      console.log(`  ✓ ${head.trim()}`);
    } else {
      console.log(`  ${head.trim()}`);
      for (const i of mine) console.log(`       ${ICON[i.severity]} ${i.message}`);
    }
  }

  // 그래프 전역 이슈 + DEMO 잔존 이슈
  const graphIssues = lines(issues, 'graph');
  const knownSkillScopes = new Set(pipeline.map((m) => `skill:${m.id}`));
  const orphanSkillIssues = issues.filter(
    (i) => i.scope.startsWith('skill:') && !knownSkillScopes.has(i.scope)
  );
  if (graphIssues.length || orphanSkillIssues.length) {
    console.log('\n[그래프]');
    for (const i of [...graphIssues, ...orphanSkillIssues]) {
      console.log(`  ${ICON[i.severity]} ${i.message}`);
    }
  }

  // ── 앱별 (진행 상태 + 경로) ──
  console.log('\n[앱별]  진행 상태 ↔ 의존성 / 산출물 경로');
  for (const app of apps) {
    const mine = lines(issues, `app:${app.folderName}`);
    if (mine.length === 0) {
      console.log(`  ✓ ${app.folderName}`);
    } else {
      console.log(`  ${app.folderName}`);
      for (const i of mine) console.log(`       ${ICON[i.severity]} ${i.message}`);
    }
  }

  // ── 요약 ──
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  console.log(`\n요약: 오류 ${errors}, 경고 ${warnings}`);

  if (errors > 0) {
    console.error('\n단계 세팅 오류가 있습니다. 위 ✖ 항목을 수정하세요.');
    process.exitCode = 1;
  }
}

main().catch((e: unknown) => {
  console.error('교차검증 실행 실패:', e);
  process.exitCode = 1;
});
