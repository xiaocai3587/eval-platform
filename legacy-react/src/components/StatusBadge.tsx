import type { RunStatus, StepStatus } from '../types'

type BadgeStatus = StepStatus | RunStatus

const STYLES: Record<BadgeStatus, { dot: string; badge: string; label: string }> = {
  success: {
    dot: 'bg-green-500',
    badge: 'border-green-200 bg-green-50 text-green-700',
    label: '成功',
  },
  failed: {
    dot: 'bg-red-500',
    badge: 'border-red-200 bg-red-50 text-red-700',
    label: '失败',
  },
  running: {
    dot: 'bg-orange-500 animate-pulse',
    badge: 'border-orange-200 bg-orange-50 text-orange-700',
    label: '运行中',
  },
}

/** 状态徽章：success 绿 / failed 红 / running 橙（带脉冲圆点） */
export default function StatusBadge({ status, size = 'sm' }: { status: BadgeStatus; size?: 'xs' | 'sm' }) {
  const s = STYLES[status] ?? {
    dot: 'bg-slate-400',
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
    label: String(status),
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border font-medium ${s.badge} ${
        size === 'xs' ? 'px-1.5 py-px text-xs' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}
