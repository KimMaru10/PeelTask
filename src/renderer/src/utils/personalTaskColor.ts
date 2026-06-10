// 個人タスクのカラーパレット (#RRGGBB)。
// Tailwind の各色 -600 相当を採用し、白文字との視認性も確保。
export const PERSONAL_TASK_COLORS = [
  { name: 'バイオレット', value: '#7c3aed' },
  { name: 'ブルー', value: '#2563eb' },
  { name: 'エメラルド', value: '#059669' },
  { name: 'アンバー', value: '#d97706' },
  { name: 'オレンジ', value: '#ea580c' },
  { name: 'ローズ', value: '#e11d48' },
  { name: 'ピンク', value: '#db2777' },
  { name: 'スレート', value: '#475569' }
] as const

export const DEFAULT_PERSONAL_TASK_COLOR = PERSONAL_TASK_COLORS[0].value

export function resolvePersonalTaskColor(color: string | null | undefined): string {
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) return color
  return DEFAULT_PERSONAL_TASK_COLOR
}
