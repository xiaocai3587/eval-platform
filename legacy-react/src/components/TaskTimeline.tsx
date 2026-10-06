import { useState } from 'react'
import type { StepTrace } from '../types'
import { formatSec, formatTs } from '../utils/format'
import JsonView from './JsonView'
import StatusBadge from './StatusBadge'

/** 对比页高亮类型：added = 重跑新增步骤，removed = 重跑已删除步骤 */
export type StepHighlight = 'added' | 'removed'

interface TaskTimelineProps {
  steps: StepTrace[]
  /** 步骤高亮标记（对比页用）：key 为 action 名称 */
  highlights?: Record<string, StepHighlight>
}

/**
 * 任务路径时间线（核心组件）
 * 竖向时间线：序号节点 + 连线 + action / 状态 / 耗时 / timestamp
 * 每个节点下方可展开查看 input / output 详情（JSON 格式）
 */
export default function TaskTimeline({ steps, highlights }: TaskTimelineProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (stepNo: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(stepNo)) next.delete(stepNo)
      else next.add(stepNo)
      return next
    })
  }

  if (steps.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-400">无步骤记录</p>
  }

  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const hl = highlights?.[s.action]
        const isLast = i === steps.length - 1
        return (
          <li key={`${s.step}-${s.action}`} className="relative flex gap-3 pb-4 last:pb-0">
            {/* 节点间连线（最后一个节点不画） */}
            {!isLast && (
              <span
                aria-hidden
                className={`absolute left-[13px] top-9 h-[calc(100%-2.25rem)] w-0.5 rounded ${
                  hl === 'removed' ? 'bg-red-200' : hl === 'added' ? 'bg-green-200' : 'bg-slate-200'
                }`}
              />
            )}

            {/* 序号节点 */}
            <span
              className={`relative z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold ${
                hl === 'removed'
                  ? 'border-red-300 bg-red-50 text-red-500'
                  : hl === 'added'
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : s.status === 'failed'
                      ? 'border-red-300 bg-red-50 text-red-600'
                      : 'border-primary-200 bg-primary-50 text-primary-700'
              }`}
            >
              {s.step}
            </span>

            {/* 节点内容 */}
            <div
              className={`min-w-0 flex-1 rounded-md border px-3 py-2 ${
                hl === 'removed'
                  ? 'border-red-200 bg-red-50/60'
                  : hl === 'added'
                    ? 'border-green-200 bg-green-50/60'
                    : 'border-slate-200 bg-slate-50/60'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-medium ${hl === 'removed' ? 'text-red-500 line-through' : 'text-slate-800'}`}>
                  {s.action}
                </span>
                {!hl && <StatusBadge status={s.status} size="xs" />}
                {hl === 'added' && (
                  <span className="rounded border border-green-200 bg-green-100 px-1.5 py-px text-xs font-medium text-green-700">
                    + 新增步骤
                  </span>
                )}
                {hl === 'removed' && (
                  <span className="rounded border border-red-200 bg-red-100 px-1.5 py-px text-xs font-medium text-red-600">
                    − 已删除
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-slate-500">{formatSec(s.cost)}</span>
              </div>
              <div className="mt-0.5 font-mono text-xs text-slate-400">{formatTs(s.timestamp)}</div>

              <button
                onClick={() => toggle(s.step)}
                className="mt-1.5 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 hover:underline"
              >
                {expanded.has(s.step) ? '收起 input/output ▴' : '展开查看 input/output ▾'}
              </button>
              {expanded.has(s.step) && (
                <div className="mt-2 space-y-2">
                  {(['input', 'output'] as const).map((key) => (
                    <div key={key}>
                      <p className="mb-1 font-mono text-xs font-semibold text-slate-500">{key}</p>
                      {s[key] === undefined ? (
                        <p className="rounded border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-400">
                          （无数据）
                        </p>
                      ) : (
                        <JsonView data={s[key]} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
