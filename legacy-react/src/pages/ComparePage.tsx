import { Fragment } from 'react'
import { Link, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import Card from '../components/Card'
import DimensionBadge from '../components/DimensionBadge'
import StatusBadge from '../components/StatusBadge'
import { getRecordByLineNo } from '../mock/mockData'
import { loadReruns } from '../store/reruns'
import { getDuration } from '../types'
import type { DimensionValue, StepTrace } from '../types'
import { formatSec, formatTs } from '../utils/format'

/** 对齐行：left 原始步骤 / right 重跑步骤（缺一侧即新增 / 删除） */
interface AlignRow {
  left?: StepTrace
  right?: StepTrace
}

/** 按 action 名做 LCS 对齐，生成双列展示行 */
function diffAlign(base: StepTrace[], run: StepTrace[]): AlignRow[] {
  const n = base.length
  const m = run.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        base[i].action === run[j].action ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const rows: AlignRow[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (base[i].action === run[j].action) {
      rows.push({ left: base[i], right: run[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ left: base[i] })
      i++
    } else {
      rows.push({ right: run[j] })
      j++
    }
  }
  while (i < n) rows.push({ left: base[i++] })
  while (j < m) rows.push({ right: run[j++] })
  return rows
}

/** 数值指标对比卡：箭头 + 颜色标识升降 */
function NumMetric({
  label,
  base,
  run,
  fmt,
  deltaFmt,
  better,
}: {
  label: string
  base: number
  run: number
  fmt: (v: number) => string
  deltaFmt: (d: number) => string
  better: 'higher' | 'lower' | 'neutral'
}) {
  const diff = run - base
  const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '＝'
  const isBetter = better === 'higher' ? diff > 0 : better === 'lower' ? diff < 0 : false
  const isWorse = better === 'higher' ? diff < 0 : better === 'lower' ? diff > 0 : false
  const tone =
    diff === 0 || better === 'neutral'
      ? 'text-slate-400'
      : isBetter
        ? 'text-green-600'
        : isWorse
          ? 'text-red-600'
          : 'text-slate-400'
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-card">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2 font-mono">
        <span className="text-sm text-slate-600">{fmt(base)}</span>
        <span className="text-slate-300">→</span>
        <span className="text-sm font-semibold text-slate-800">{fmt(run)}</span>
        <span className={`ml-auto text-xs font-semibold ${tone}`}>
          {arrow} {diff === 0 ? '持平' : deltaFmt(diff)}
        </span>
      </div>
    </div>
  )
}

/**
 * 维度指标对比卡：数值 0→1 提升（绿）/ 1→0 退化（红）/ 相同持平；文字状态（人工参与等）或状态变化用蓝色标识
 * invert = 反向维度（如图标相关问题 1 = 有问题）：1→0 为提升（问题修复），0→1 为退化（出现问题）
 */
function DimMetric({
  label,
  base,
  run,
  strong,
  invert,
}: {
  label: string
  base: DimensionValue
  run: DimensionValue
  strong?: boolean
  invert?: boolean
}) {
  const bothNum = typeof base === 'number' && typeof run === 'number'
  let arrow: string
  let text: string
  let tone: string
  if (bothNum) {
    const improved = invert ? run < base : run > base
    const worsened = invert ? run > base : run < base
    if (improved) {
      arrow = '↑'
      text = '提升'
      tone = 'text-green-600'
    } else if (worsened) {
      arrow = '↓'
      text = '退化'
      tone = 'text-red-600'
    } else {
      arrow = '＝'
      text = '持平'
      tone = 'text-slate-400'
    }
  } else if (base === run) {
    arrow = '＝'
    text = '持平'
    tone = 'text-sky-600'
  } else {
    arrow = '⟳'
    text = '状态变化'
    tone = 'text-sky-600'
  }
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 shadow-card ${
        strong ? 'border-primary-200 bg-primary-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <p className={`text-xs ${strong ? 'font-semibold text-primary-700' : 'text-slate-500'}`}>{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <DimensionBadge value={base} invert={invert} />
        <span className="text-slate-300">→</span>
        <DimensionBadge value={run} invert={invert} />
        <span className={`ml-auto text-xs font-semibold ${tone}`}>
          {arrow} {text}
        </span>
      </div>
    </div>
  )
}

/** 双列时间线单元格（视觉与 TaskTimeline 一致；空占位保持连线连续） */
function StepNode({
  step,
  highlight,
  showLine,
}: {
  step?: StepTrace
  highlight?: 'added' | 'removed'
  showLine: boolean
}) {
  if (!step) {
    return (
      <div className="relative min-h-12">
        {showLine && <span aria-hidden className="absolute left-[13px] top-0 h-full w-0.5 rounded bg-slate-100" />}
      </div>
    )
  }
  return (
    <div className="relative flex gap-3 pb-4">
      {showLine && (
        <span
          aria-hidden
          className={`absolute left-[13px] top-9 h-[calc(100%-2.25rem)] w-0.5 rounded ${
            highlight === 'removed' ? 'bg-red-200' : highlight === 'added' ? 'bg-green-200' : 'bg-slate-200'
          }`}
        />
      )}
      <span
        className={`relative z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-semibold ${
          highlight === 'removed'
            ? 'border-red-300 bg-red-50 text-red-500'
            : highlight === 'added'
              ? 'border-green-300 bg-green-50 text-green-700'
              : step.status === 'failed'
                ? 'border-red-300 bg-red-50 text-red-600'
                : 'border-primary-200 bg-primary-50 text-primary-700'
        }`}
      >
        {step.step}
      </span>
      <div
        className={`min-w-0 flex-1 self-start rounded-md border px-3 py-2 ${
          highlight === 'removed'
            ? 'border-red-200 bg-red-50/60'
            : highlight === 'added'
              ? 'border-green-200 bg-green-50/60'
              : 'border-slate-200 bg-slate-50/60'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-medium ${highlight === 'removed' ? 'text-red-500 line-through' : 'text-slate-800'}`}>
            {step.action}
          </span>
          {!highlight && <StatusBadge status={step.status} size="xs" />}
          {highlight === 'added' && (
            <span className="rounded border border-green-200 bg-green-100 px-1.5 py-px text-xs font-medium text-green-700">
              + 新增
            </span>
          )}
          {highlight === 'removed' && (
            <span className="rounded border border-red-200 bg-red-100 px-1.5 py-px text-xs font-medium text-red-600">
              − 已删除
            </span>
          )}
          <span className="ml-auto font-mono text-xs text-slate-500">{formatSec(step.cost)}</span>
        </div>
        <div className="mt-0.5 font-mono text-xs text-slate-400">{formatTs(step.timestamp)}</div>
      </div>
    </div>
  )
}

/** 页面 4：原始记录 vs 重跑记录对比 */
export default function ComparePage() {
  const { lineNo: lineNoStr, runId } = useParams()
  const lineNo = Number(lineNoStr)
  const record = getRecordByLineNo(lineNo)
  const run = record ? loadReruns(lineNo).find((r) => r.run_id === runId) : undefined

  if (!record || !run) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-sm text-slate-600">
            未找到对比对象（记录 #{lineNoStr} · run {runId}）
          </p>
          <Link
            to={`/records/${lineNoStr}`}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            ← 返回记录详情
          </Link>
        </div>
      </AppShell>
    )
  }

  // running 状态的重跑尚未产生评测结果
  if (!run.evaluation) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-sm text-slate-600">该次重跑仍在运行中，暂无评测结果可对比</p>
          <Link
            to={`/records/${lineNoStr}`}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            ← 返回记录详情
          </Link>
        </div>
      </AppShell>
    )
  }

  const baseEv = record.final_evaluation
  const runEv = run.evaluation
  const aligned = diffAlign(record.steps_traces, run.steps_traces)

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[85rem] pb-6 2xl:max-w-[105rem] 3xl:max-w-[120rem] 4xl:max-w-[140rem]">
        {/* 顶部 */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={`/records/${lineNo}`}
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 transition-colors hover:bg-slate-50"
          >
            ← 返回详情
          </Link>
          <h1 className="text-lg font-semibold text-slate-800">重跑对比</h1>
          <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-600">
            {run.run_id}
          </span>
          <span className="min-w-0 max-w-[360px] truncate text-sm text-slate-500" title={record.row_data.query}>
            #{lineNo} {record.row_data.query}
          </span>
          <span className="ml-auto text-xs text-slate-400">
            图例：<span className="font-medium text-green-600">+ 新增步骤</span> ·{' '}
            <span className="font-medium text-red-600">− 已删除步骤</span>
          </span>
        </div>

        {/* 指标对比：相关性 / 一致性 / 信息量 / 正确性 / 图标相关问题 / 最终评测结果 / 耗时 / 步骤数 */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 4xl:grid-cols-8">
          <DimMetric label="相关性" base={baseEv.relevance} run={runEv.relevance} />
          <DimMetric label="一致性" base={baseEv.consistency} run={runEv.consistency} />
          <DimMetric label="信息量" base={baseEv.informativeness} run={runEv.informativeness} />
          <DimMetric label="正确性" base={baseEv.correctness} run={runEv.correctness} />
          <DimMetric label="图标相关问题" base={baseEv.icon_issue} run={runEv.icon_issue} invert />
          <DimMetric label="最终评测结果" base={baseEv.final} run={runEv.final} strong />
          <NumMetric
            label="耗时"
            base={getDuration(record)}
            run={run.duration}
            fmt={formatSec}
            deltaFmt={(d) => `${d > 0 ? '+' : ''}${d.toFixed(2)}s`}
            better="lower"
          />
          <NumMetric
            label="步骤数"
            base={record.steps_traces.length}
            run={run.steps_traces.length}
            fmt={(v) => String(v)}
            deltaFmt={(d) => `${d > 0 ? '+' : ''}${d}`}
            better="neutral"
          />
        </div>

        {/* 任务路径双列对齐 */}
        <Card
          title="任务路径对比"
          extra={`${record.steps_traces.length} 步 → ${run.steps_traces.length} 步`}
          className="mt-4"
        >
          <div className="mb-3 grid grid-cols-2 gap-x-6 border-b border-slate-100 pb-2 text-xs font-medium text-slate-500 3xl:gap-x-10">
            <span>原始记录</span>
            <span>重跑记录</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 3xl:gap-x-10">
            {aligned.map((row, idx) => {
              const isLast = idx === aligned.length - 1
              return (
                <Fragment key={idx}>
                  <StepNode
                    step={row.left}
                    highlight={row.left && !row.right ? 'removed' : undefined}
                    showLine={!isLast}
                  />
                  <StepNode
                    step={row.right}
                    highlight={row.right && !row.left ? 'added' : undefined}
                    showLine={!isLast}
                  />
                </Fragment>
              )
            })}
          </div>
        </Card>

        {/* 重跑配置 */}
        {run.config && (
          <Card title="重跑配置" className="mt-4">
            <pre className="overflow-x-auto rounded border border-slate-100 bg-slate-50 p-2.5 font-mono text-xs text-slate-600">
              {run.config}
            </pre>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
