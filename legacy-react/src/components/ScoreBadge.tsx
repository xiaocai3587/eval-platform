import { formatScore } from '../utils/format'

/** 综合分徽章：null = 人工参与（蓝）· >=0.8 绿 · >=0.6 琥珀 · <0.6 红 */
export default function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
        人工参与
      </span>
    )
  }
  const tone =
    score >= 0.8
      ? 'border-green-200 bg-green-50 text-green-700'
      : score >= 0.6
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-red-200 bg-red-50 text-red-700'
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs font-semibold ${tone}`}>
      {formatScore(score)}
    </span>
  )
}
