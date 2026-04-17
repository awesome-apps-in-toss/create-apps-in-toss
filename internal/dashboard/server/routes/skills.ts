import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import matter from 'gray-matter';

const router: Router = Router();
const SKILLS_DIR = path.resolve(process.cwd(), '../../.claude/skills');

export interface SkillInputDescriptor {
  key: string;
  type: string;
  required?: boolean;
  values?: string[];
}

export interface SkillOutputDescriptor {
  key: string;
  type: string;
  path?: string;
  required?: boolean;
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  mode: 'interactive' | 'automated';
  step: number | null;
  requires: string[];
  inputs: SkillInputDescriptor[];
  outputs: SkillOutputDescriptor[];
  idempotencyKey: string;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function asObjectArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  );
}

function normalizeMode(value: unknown): 'interactive' | 'automated' {
  return value === 'interactive' ? 'interactive' : 'automated';
}

function normalizeStep(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeInputs(value: unknown): SkillInputDescriptor[] {
  return asObjectArray(value).map((entry) => ({
    key: asString(entry['key'], ''),
    type: asString(entry['type'], 'text'),
    required: entry['required'] === true,
    ...(Array.isArray(entry['values']) && { values: asStringArray(entry['values']) }),
  }));
}

function normalizeOutputs(value: unknown): SkillOutputDescriptor[] {
  return asObjectArray(value).map((entry) => {
    const out: SkillOutputDescriptor = {
      key: asString(entry['key'], ''),
      type: asString(entry['type'], 'text'),
    };
    if (typeof entry['path'] === 'string') out.path = entry['path'];
    if (entry['required'] === true) out.required = true;
    return out;
  });
}

async function readSkillMeta(skillId: string): Promise<SkillMeta | null> {
  const skillPath = path.join(SKILLS_DIR, skillId, 'SKILL.md');
  let raw: string;
  try {
    raw = await fs.readFile(skillPath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (err) {
    console.warn(`[skills] frontmatter parse failed: ${skillId}`, err);
    return null;
  }

  const data = parsed.data as Record<string, unknown>;
  const name = asString(data['name'], skillId);
  const description = asString(data['description'], '');

  return {
    id: skillId,
    name,
    description,
    mode: normalizeMode(data['mode']),
    step: normalizeStep(data['step']),
    requires: asStringArray(data['requires']),
    inputs: normalizeInputs(data['inputs']),
    outputs: normalizeOutputs(data['outputs']),
    idempotencyKey: asString(data['idempotencyKey'], skillId),
  };
}

// GET /api/skills → 동적 스캔된 스킬 메타 목록
router.get('/', async (_req, res) => {
  let entries: string[];
  try {
    entries = await fs.readdir(SKILLS_DIR);
  } catch {
    res.json({ skills: [] });
    return;
  }

  const metas: SkillMeta[] = [];
  for (const entry of entries) {
    const stat = await fs.stat(path.join(SKILLS_DIR, entry)).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const meta = await readSkillMeta(entry);
    if (meta) metas.push(meta);
  }

  metas.sort((a, b) => {
    if (a.step !== null && b.step !== null) return a.step - b.step;
    if (a.step !== null) return -1;
    if (b.step !== null) return 1;
    return a.id.localeCompare(b.id);
  });

  res.json({ skills: metas });
});

export { router as skillsRouter };
