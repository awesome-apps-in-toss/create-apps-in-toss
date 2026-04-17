import { Router } from 'express';
import { listSkillMetas } from '../lib/skills-meta.js';

const router: Router = Router();

// GET /api/skills → 동적 스캔된 스킬 메타 목록
router.get('/', async (_req, res) => {
  const skills = await listSkillMetas();
  res.json({ skills });
});

export { router as skillsRouter };
export type { SkillMeta, SkillInputDescriptor, SkillOutputDescriptor } from '../lib/skills-meta.js';
