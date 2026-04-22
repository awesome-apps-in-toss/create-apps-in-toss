type Palette = { bg: string; color: string };

/** 앱 아바타 fallback 팔레트.
 * Toss Blue 주변에서 출발해 채도·명도 프로파일을 맞춘 큐레이션 톤 7종.
 * Tailwind 기본 조합이 아닌 의도된 조색으로 AI 팔레트 인상 탈피. */
export const FALLBACK_COLORS_LIGHT: ReadonlyArray<Palette> = [
  { bg: '#dfeaff', color: '#0c4ac9' }, // cerulean (toss-adjacent)
  { bg: '#e7e3f9', color: '#4b3aa8' }, // inky violet
  { bg: '#d8efe5', color: '#0e6a53' }, // mint teal
  { bg: '#fbe9d1', color: '#9a5f17' }, // warm amber
  { bg: '#fbe1e7', color: '#a9314a' }, // rose
  { bg: '#dcf0d6', color: '#2e6b2e' }, // forest
  { bg: '#f4d8c7', color: '#b04a1f' }, // clay terracotta
];

/** 다크 모드용 fallback — 반투명 bg + 밝은 텍스트. 인덱스는 light 와 1:1 대응. */
export const FALLBACK_COLORS_DARK: ReadonlyArray<Palette> = [
  { bg: 'rgba(76, 141, 255, 0.18)', color: '#99beff' }, // cerulean
  { bg: 'rgba(149, 130, 230, 0.18)', color: '#c2b4f0' }, // inky violet
  { bg: 'rgba(79, 200, 160, 0.18)', color: '#8fe0c4' }, // mint teal
  { bg: 'rgba(230, 170, 90, 0.18)', color: '#f0c791' }, // warm amber
  { bg: 'rgba(230, 120, 140, 0.18)', color: '#f3aebb' }, // rose
  { bg: 'rgba(120, 190, 120, 0.18)', color: '#b3daa8' }, // forest
  { bg: 'rgba(220, 140, 100, 0.18)', color: '#e8b29a' }, // clay terracotta
];

/** 편의용 alias — 기존 코드 호환 (deprecate 가능). */
export const FALLBACK_COLORS = FALLBACK_COLORS_LIGHT;

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 현재 <html data-theme> 값에 맞춰 fallback 팔레트를 반환. */
export function getFallbackColor(index: number): Palette {
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark';
  const palette = isDark ? FALLBACK_COLORS_DARK : FALLBACK_COLORS_LIGHT;
  return palette[index % palette.length]!;
}
