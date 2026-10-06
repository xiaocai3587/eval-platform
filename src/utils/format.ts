/** '2026-09-30T10:00:00Z' → '2026-09-30 10:00:00' */
export function formatTs(iso: string): string {
  return iso.slice(0, 19).replace('T', ' ')
}

/** 秒数 → '1.23s' */
export function formatSec(sec: number): string {
  return `${sec.toFixed(2)}s`
}

/** 分数 → '0.95' */
export function formatScore(score: number): string {
  return score.toFixed(2)
}
