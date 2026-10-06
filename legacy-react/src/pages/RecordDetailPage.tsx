import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppShell from '../components/AppShell'
import Card from '../components/Card'
import DimensionBadge from '../components/DimensionBadge'
import FactMatrix from '../components/FactMatrix'
import JsonView from '../components/JsonView'
import Modal from '../components/Modal'
import RefAnswerCard from '../components/RefAnswerCard'
import StatusBadge from '../components/StatusBadge'
import TaskTimeline from '../components/TaskTimeline'
import { getRecordByLineNo } from '../mock/mockData'
import { loadReruns, saveReruns } from '../store/reruns'
import { computeFinal, getDuration } from '../types'
import type { DimensionValue, RerunRun } from '../types'
import { formatSec } from '../utils/format'

const DEFAULT_RERUN_CONFIG = '{"model":"agent-v2","temperature":0.3,"top_k":5}'

/** 数值随机扰动（模拟重跑差异） */
function jitter(v: number): number {
  return Math.max(0.01, Math.round(v * (0.8 + Math.random() * 0.4) * 100) / 100)
}

/** 维度随机翻转（模拟重跑差异：85% 保持原值；文字状态如「人工参与」不翻转） */
function flip(v: DimensionValue): DimensionValue {
  return typeof v === 'number' ? (Math.random() < 0.85 ? v : 1 - v) : v
}

/** 评测信息行：label 居左、值居右（评测对象卡右栏竖排） */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="font-mono text-sm text-slate-700">{value}</span>
    </div>
  )
}

/** 长文本：超过阈值默认截断，点击展示全部（模型回复 / 参考答案可达 2000~5000 字，默认 5 行；评测原因用 2 行） */
function LongText({
  text,
  clampClass = 'line-clamp-5',
  threshold = 160,
}: {
  text: string
  clampClass?: string
  threshold?: number
}) {
  const [open, setOpen] = useState(false)
  const long = text.length > threshold
  return (
    <div className="mt-1">
      <p className={`text-sm leading-relaxed text-slate-700 ${long && !open ? clampClass : ''}`}>{text}</p>
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-medium text-primary-600 hover:underline"
        >
          {open ? '收起 ▴' : `展示全部（${text.length} 字）▾`}
        </button>
      )}
    </div>
  )
}

/** 五个评测维度元信息（final 单独突出展示，不进徽章行） */
type DimKey = 'relevance' | 'consistency' | 'informativeness' | 'correctness' | 'icon_issue'

interface DimMeta {
  key: DimKey
  label: string
  /** 反向维度（图标相关问题：1 = 有问题） */
  invert?: boolean
}

const DIMENSIONS: DimMeta[] = [
  { key: 'relevance', label: '相关性' },
  { key: 'consistency', label: '一致性' },
  { key: 'informativeness', label: '信息量' },
  { key: 'correctness', label: '正确性' },
  { key: 'icon_issue', label: '图标相关问题', invert: true },
]

/** 维度原因弹窗数据 */
interface DimModal {
  meta: DimMeta
  value: DimensionValue
  reason?: string
}

/**
 * 页面 3：记录详情（评测分析主线）
 * 布局自上而下：评测对象 · 评测结论 · 评测信息（左中右三栏合并单卡，含 row_data JSON 折叠）→
 * 参考答案 → 原子事实评测矩阵（业务 B）→ 任务路径（折叠面板）→ 历史重跑（置底）
 * process_data 以右侧可隐藏浮窗展示（顶部按钮呼出，不占用页面主布局）
 */
export default function RecordDetailPage() {
  const { lineNo: lineNoStr } = useParams()
  const navigate = useNavigate()
  const lineNo = Number(lineNoStr)
  const record = getRecordByLineNo(lineNo)

  const [reruns, setReruns] = useState<RerunRun[]>(() => loadReruns(lineNo))
  const [modalOpen, setModalOpen] = useState(false)
  const [configText, setConfigText] = useState(DEFAULT_RERUN_CONFIG)
  // 任务路径折叠面板展开状态（默认收起，关注评测分析主线）
  const [timelineOpen, setTimelineOpen] = useState(false)
  // 评测对象卡内 row_data 原始 JSON 展开状态（默认收起）
  const [rowOpen, setRowOpen] = useState(false)
  // process_data 右侧浮窗开关（默认隐藏）
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 维度原因弹窗（点击五维度徽章打开）
  const [dimModal, setDimModal] = useState<DimModal | null>(null)

  // lineNo 变化时重新加载该记录的重跑历史
  useEffect(() => {
    setReruns(loadReruns(lineNo))
  }, [lineNo])

  if (!record) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-sm text-slate-600">记录不存在（lineNo = {lineNoStr}）</p>
          <Link
            to="/records"
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            ← 返回记录列表
          </Link>
        </div>
      </AppShell>
    )
  }

  const ev = record.final_evaluation
  const duration = getDuration(record)
  const pd = record.process_data
  const hasRefFlow = pd.fact_decomposition !== undefined
  const failedCount = record.steps_traces.filter((s) => s.status === 'failed').length

  /** 重跑：立即插入一条 running（尚无评测结果），1 秒后模拟完成变 success */
  const startRerun = () => {
    const runId = `run-${Math.random().toString(36).slice(2, 8)}`
    const running: RerunRun = {
      run_id: runId,
      status: 'running',
      duration: 0,
      steps_traces: [],
      created_at: new Date().toISOString(),
      config: configText.trim() || undefined,
    }
    const next = [running, ...reruns]
    setReruns(next)
    saveReruns(lineNo, next)
    setModalOpen(false)

    // 模拟 1 秒后 running → success：五个维度小概率翻转，再综合出最终结果
    window.setTimeout(() => {
      const relevance = flip(ev.relevance)
      const consistency = flip(ev.consistency)
      const informativeness = flip(ev.informativeness)
      const correctness = flip(ev.correctness)
      const iconIssue = flip(ev.icon_issue)
      setReruns((prev) => {
        const updated = prev.map((r) =>
          r.run_id === runId
            ? {
                ...r,
                status: 'success' as const,
                duration: jitter(duration),
                steps_traces: record.steps_traces.map((s) => ({ ...s, cost: jitter(s.cost) })),
                evaluation: {
                  relevance,
                  consistency,
                  informativeness,
                  correctness,
                  icon_issue: iconIssue,
                  final: computeFinal(relevance, consistency, informativeness, correctness, iconIssue),
                  comment: ev.comment,
                },
              }
            : r,
        )
        saveReruns(lineNo, updated)
        return updated
      })
    }, 1000)
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[85rem] pb-6 2xl:max-w-[105rem] 3xl:max-w-[120rem] 4xl:max-w-[140rem]">
        {/* 顶部：返回 + 标题 + process_data 浮窗开关 + 重跑按钮 */}
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link
            to="/records"
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 transition-colors hover:bg-slate-50"
          >
            ← 记录列表
          </Link>
          <h1 className="text-lg font-semibold text-slate-800">记录 #{lineNo}</h1>
          <span className="min-w-0 max-w-[420px] truncate text-sm text-slate-500" title={record.row_data.query}>
            {record.row_data.query}
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">
              {record.row_data.ref_answer !== undefined ? '有参考答案业务' : '无参考答案业务'}
            </span>
            <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-500">
              source: {record.row_data.source}
            </span>
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              title="右侧浮窗查看评测流程原始数据"
              className={`h-8 rounded border px-3 text-xs font-medium transition-colors ${
                drawerOpen
                  ? 'border-primary-300 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              ▤ process_data
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="h-8 rounded bg-primary-600 px-3 text-xs font-medium text-white transition-colors hover:bg-primary-700"
            >
              ↻ 重跑此条
            </button>
          </span>
        </div>

        {/* ① 评测对象 · 评测结论 · 评测信息（合并单卡，避免分栏高度不齐产生空白） */}
        <Card
          title="评测对象"
          extra={`row_data · ${record.row_data.ref_answer !== undefined ? '含参考答案（见下方参考答案卡）' : '无参考答案，动态获取'}`}
        >
          {/* 左中右三栏：评测对象 | final_evaluation | 评测信息 */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3fr)] lg:gap-0">
            {/* 左：评测对象（query / intent / DisplayText，字段展示形式一致） */}
            <div className="min-w-0 space-y-3 lg:pr-6">
              <div>
                <p className="text-xs font-medium text-slate-400">query</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-800">{record.row_data.query}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">intent</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-800">{record.row_data.intent ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400">DisplayText（模型回复）</p>
                <LongText text={record.row_data.DisplayText} />
              </div>
            </div>

            {/* 中：final_evaluation 精简结论（五维度徽章 + 最终结果 / 原因） */}
            <div className="min-w-0 space-y-2.5 lg:border-l lg:border-slate-100 lg:px-6">
              <p className="text-xs font-medium text-slate-400">
                final_evaluation（六维度综合评测 · 点击维度查看原因）
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {DIMENSIONS.map((d) => (
                  <button
                    key={d.key}
                    onClick={() => setDimModal({ meta: d, value: ev[d.key], reason: ev.dimension_reasons?.[d.key] })}
                    title="点击查看评测原因"
                    className="flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50/60 px-2 py-1 transition-colors hover:border-primary-300 hover:bg-primary-50"
                  >
                    <span className="text-xs text-slate-500">{d.label}</span>
                    <DimensionBadge value={ev[d.key]} invert={d.invert} />
                  </button>
                ))}
              </div>
              {/* 最终评测结果：0 / 1 或文字结果（人工参与等） */}
              <div className="flex items-center gap-2.5 rounded border border-primary-200 bg-primary-50/50 px-3 py-2">
                <span className="text-xs font-semibold text-primary-700">最终评测结果</span>
                <DimensionBadge value={ev.final} />
                <span className="ml-auto font-mono text-xs text-slate-400">final</span>
              </div>
              {/* 最终评测原因：默认 2 行截断，可展示全部 */}
              <div>
                <p className="text-xs font-medium text-slate-400">最终评测原因</p>
                <LongText text={ev.comment} clampClass="line-clamp-2" threshold={80} />
              </div>
            </div>

            {/* 右：评测信息（耗时 / 步骤数 / 消耗 token） */}
            <div className="min-w-0 space-y-2.5 lg:border-l lg:border-slate-100 lg:pl-6">
              <p className="text-xs font-medium text-slate-400">评测信息</p>
              <div className="space-y-1.5">
                <InfoRow label="耗时" value={formatSec(duration)} />
                <InfoRow label="步骤数" value={`${record.steps_traces.length} 步`} />
                <InfoRow
                  label="消耗 token"
                  value={record.token_usage ? record.token_usage.total.toLocaleString() : '—'}
                />
                {record.token_usage && (
                  <div className="flex items-center justify-between rounded border border-slate-100 bg-slate-50/30 px-2.5 py-1 text-xs text-slate-400">
                    <span>prompt / completion</span>
                    <span className="font-mono">
                      {record.token_usage.prompt.toLocaleString()} / {record.token_usage.completion.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* row_data 原始 JSON：卡底横跨三栏（默认收起） */}
          <div className="mt-3 border-t border-slate-100 pt-2.5">
            <button
              onClick={() => setRowOpen((v) => !v)}
              className="flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2.5 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50"
            >
              {rowOpen ? '收起 row_data JSON ▴' : '展开 row_data JSON ▾'}
            </button>
            {rowOpen && (
              <div className="mt-2">
                <JsonView data={record.row_data} />
              </div>
            )}
          </div>
        </Card>

        {/* ③ 参考答案（业务 A 单条 / 业务 B 获取流程列表） */}
        <div className="mt-4">
          <RefAnswerCard record={record} />
        </div>

        {/* ④ 原子事实评测矩阵（业务 B：无参考答案，走完整评测流程） */}
        {hasRefFlow && pd.available_answer && pd.evaluation_history && pd.evaluation_result && (
          <div className="mt-4">
            <Card title="原子事实评测矩阵" extra="evaluation_history × evaluation_result">
              <FactMatrix
                factDecomposition={pd.fact_decomposition!}
                evaluationHistory={pd.evaluation_history}
                evaluationResult={pd.evaluation_result}
                availableAnswer={pd.available_answer}
              />
            </Card>
          </div>
        )}

        {/* ⑤ 任务路径（折叠面板，默认收起） */}
        <div className="mt-4 overflow-hidden rounded-lg border border-primary-200 bg-primary-50/40">
          <button
            onClick={() => setTimelineOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-primary-50"
          >
            <span className="w-4 text-primary-600">{timelineOpen ? '▾' : '▸'}</span>
            <span className="text-sm font-semibold text-primary-700">任务路径</span>
            <span className="text-xs text-slate-500">
              共 {record.steps_traces.length} 步 · 总耗时 {formatSec(duration)}
              {failedCount > 0 ? ` · ${failedCount} 个失败步骤` : ''}
            </span>
            <span className="ml-auto text-xs font-medium text-primary-600">{timelineOpen ? '收起 ▴' : '展开 ▾'}</span>
          </button>
          {timelineOpen && (
            <div className="border-t border-primary-100 bg-white px-4 py-3">
              <TaskTimeline steps={record.steps_traces} />
            </div>
          )}
        </div>

        {/* ⑥ 历史重跑（置底） */}
        <div className="mt-4">
          <Card title="历史重跑" extra={`${reruns.length} 次运行`}>
            {reruns.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                暂无重跑记录，点击右上角「重跑此条」发起一次重跑
              </p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs text-slate-400">
                    <th className="pb-1.5 font-medium">run_id</th>
                    <th className="pb-1.5 font-medium">状态</th>
                    <th className="pb-1.5 font-medium">最终结果</th>
                    <th className="pb-1.5 font-medium">耗时</th>
                    <th className="pb-1.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {reruns.map((r) => (
                    <tr key={r.run_id} className="border-t border-slate-100 text-sm">
                      <td className="py-2 font-mono text-xs text-slate-600">{r.run_id}</td>
                      <td className="py-2">
                        <StatusBadge status={r.status} size="xs" />
                      </td>
                      <td className="py-2">
                        {r.status === 'running' || !r.evaluation ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <DimensionBadge value={r.evaluation.final} />
                        )}
                      </td>
                      <td className="py-2 font-mono text-slate-600">
                        {r.status === 'running' ? '—' : formatSec(r.duration)}
                      </td>
                      <td className="py-2 text-right">
                        {r.status === 'running' ? (
                          <span className="text-xs text-slate-300">对比（进行中）</span>
                        ) : (
                          <button
                            onClick={() => navigate(`/records/${lineNo}/compare/${r.run_id}`)}
                            className="text-xs text-primary-600 hover:underline"
                          >
                            对比 →
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      {/* process_data 右侧可隐藏浮窗（覆盖在页面右侧，不挤占主布局；关闭后滑出屏幕） */}
      <div
        className={`fixed right-0 top-12 z-40 flex h-[calc(100vh-3rem)] w-[560px] max-w-[90vw] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-200 ${
          drawerOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full'
        }`}
        aria-hidden={!drawerOpen}
      >
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <h2 className="text-sm font-semibold text-slate-800">
            process_data
            <span className="ml-2 text-xs font-normal text-slate-400">
              {Object.keys(pd).length > 0 ? `${Object.keys(pd).length} 个流程字段 · 原始数据` : '评测流程原始数据'}
            </span>
          </h2>
          <button
            onClick={() => setDrawerOpen(false)}
            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50"
          >
            ✕ 关闭
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {Object.keys(pd).length > 0 ? (
            <JsonView data={pd} />
          ) : (
            <p className="py-8 text-center text-xs text-slate-400">
              该记录使用 row_data.ref_answer 直接评测，无参考答案获取与原子事实评测流程
            </p>
          )}
        </div>
      </div>

      {/* 维度原因 Modal：当前取值 + 该维度的评测原因 */}
      <Modal
        open={dimModal !== null}
        onClose={() => setDimModal(null)}
        title={dimModal ? `${dimModal.meta.label} · 评测原因` : ''}
      >
        {dimModal && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">当前取值</span>
              <DimensionBadge value={dimModal.value} invert={dimModal.meta.invert} />
              <span className="font-mono text-xs text-slate-400">{dimModal.meta.key}</span>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">评测原因</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">
                {dimModal.reason ?? '无原因记录'}
              </p>
            </div>
          </div>
        )}
      </Modal>

      {/* 重跑 Modal：可选配置 + 开始重跑 */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`重跑此条 · 记录 #${lineNo}`}
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setModalOpen(false)}
              className="h-8 rounded border border-slate-200 px-3 text-xs text-slate-600 transition-colors hover:bg-slate-50"
            >
              取消
            </button>
            <button
              onClick={startRerun}
              className="h-8 rounded bg-primary-600 px-3 text-xs font-medium text-white transition-colors hover:bg-primary-700"
            >
              ↻ 开始重跑
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-500">可选：填写本次重跑的配置（JSON 格式），留空则使用默认配置。</p>
        <textarea
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          rows={8}
          spellCheck={false}
          placeholder='{"model":"agent-v2","temperature":0.3}'
          className="mt-2 w-full resize-y rounded border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-slate-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
        />
      </Modal>
    </AppShell>
  )
}
