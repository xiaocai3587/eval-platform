import type { DimensionValue } from '../types'

/**
 * 维度值徽章：1 绿 ✓ / 0 红 ✕ / 文字状态（人工参与等）蓝
 * invert = 反向维度（如图标相关问题：1 = 有问题 → 红 ✕，0 = 无问题 → 绿 ✓）
 */
export default function DimensionBadge({ value, invert }: { value: DimensionValue; invert?: boolean }) {
  if (typeof value === 'number') {
    // 正向维度：1 好；反向维度：0 好。ok 表示该取值代表「无问题」
    const ok = invert ? value === 0 : value === 1
    return ok ? (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-green-200 bg-green-50 px-2 py-0.5 font-mono text-xs font-semibold text-green-700">
        ✓ {value}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-red-200 bg-red-50 px-2 py-0.5 font-mono text-xs font-semibold text-red-700">
        ✕ {value}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
      <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
      {value}
    </span>
  )
}
