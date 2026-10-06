import { useState } from 'react'
import Card from './Card'
import type { EvalRecord, RefAnswer } from '../types'

/** 来源徽章配色：localRAG 蓝 / playskills 紫 / KG 绿 */
const FROM_STYLE: Record<string, string> = {
  localRAG: 'border-primary-200 bg-primary-50 text-primary-700',
  playskills: 'border-violet-200 bg-violet-50 text-violet-700',
  KG: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}

/** 长文本：默认截断（line-clamp-3），点击展开全文（参考答案可能长达 2000~5000 字） */
function LongText({ text, clampClass = 'line-clamp-3' }: { text: string; clampClass?: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 120
  return (
    <div>
      <p className={`text-xs leading-relaxed text-slate-700 ${long && !open ? clampClass : ''}`}>{text}</p>
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-medium text-primary-600 hover:underline"
        >
          {open ? '收起 ▴' : `展开全文（${text.length} 字）▾`}
        </button>
      )}
    </div>
  )
}

/** 单条有效参考答案（编号 = available_answer 下标，与事实矩阵列号对应） */
function RefItem({ no, content, from, score }: { no: number } & RefAnswer) {
  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-slate-700">#{no}</span>
        <span
          className={`rounded border px-1.5 py-px text-xs font-medium ${
            FROM_STYLE[from] ?? 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {from}
        </span>
        {score !== undefined && (
          <span className="rounded bg-slate-100 px-1.5 py-px font-mono text-xs text-slate-500">
            {score.toFixed(2)}
          </span>
        )}
      </div>
      <div className="mt-1.5">
        <LongText text={content} />
      </div>
    </div>
  )
}

/**
 * 参考答案卡：两种业务形态
 * - 业务 A（有参考答案）：直接展示 row_data.ref_answer
 * - 业务 B（无参考答案）：来源统计 + 按来源筛选 + 有效参考答案滚动列表（可能有 30 条、单条 2000~5000 字），
 *   可展开查看 get_ref_answer 原始获取结果（含被筛掉的条目）
 */
export default function RefAnswerCard({ record }: { record: EvalRecord }) {
  const pd = record.process_data
  const [fromFilter, setFromFilter] = useState<string>('all')
  const [rawOpen, setRawOpen] = useState(false)

  // 业务 A：直接展示 row_data.ref_answer
  if (!pd.get_ref_answer) {
    const ref = record.row_data.ref_answer
    return (
      <Card title="参考答案" extra="row_data.ref_answer · 有参考答案业务">
        {ref === undefined ? (
          <p className="py-4 text-center text-xs text-slate-400">该记录无参考答案</p>
        ) : (
          <LongText text={ref} clampClass="line-clamp-5" />
        )}
      </Card>
    )
  }

  // 业务 B：动态获取参考答案
  const gra = pd.get_ref_answer
  const methods = (['localRAG', 'playskills', 'KG'] as const).filter((k) => gra[k] !== undefined)
  const totalCount = methods.reduce((n, k) => n + (gra[k]?.length ?? 0), 0)
  const available = pd.available_answer ?? []
  const filteredOut = totalCount - available.length
  const fromCounts: Record<string, number> = {}
  available.forEach((a) => {
    fromCounts[a.from] = (fromCounts[a.from] ?? 0) + 1
  })
  const shown = fromFilter === 'all' ? available : available.filter((a) => a.from === fromFilter)

  return (
    <Card
      title="参考答案"
      extra={`${methods.join(' / ')} · 获取 ${totalCount} 条 → 有效 ${available.length} 条（筛掉 ${filteredOut}）`}
    >
      {/* 来源统计 + 筛选 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', ...Object.keys(fromCounts)] as string[]).map((f) => (
          <button
            key={f}
            onClick={() => setFromFilter(f)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
              fromFilter === f
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {f === 'all' ? `全部 ${available.length}` : `${f} ${fromCounts[f]}`}
          </button>
        ))}
        <button
          onClick={() => setRawOpen((v) => !v)}
          className="ml-auto rounded border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50"
        >
          {rawOpen ? '收起原始获取结果 ▴' : `原始获取结果（${totalCount} 条，含筛掉）▾`}
        </button>
      </div>

      {/* 原始获取结果：按方式分组，标注有效 / 已筛掉 */}
      {rawOpen && (
        <div className="mt-3 space-y-2.5 rounded border border-slate-200 bg-slate-50/60 p-3">
          {methods.map((m) => (
            <div key={m}>
              <p className="font-mono text-xs font-semibold text-slate-500">
                {m}（{gra[m]!.length} 条）
              </p>
              <div className="mt-1 space-y-1">
                {gra[m]!.map((r, i) => {
                  const kept = available.some((a) => a.content === r.content)
                  return (
                    <div
                      key={i}
                      className={`truncate rounded border px-2 py-1 text-xs ${
                        kept
                          ? 'border-slate-200 bg-white text-slate-600'
                          : 'border-slate-200 bg-slate-100 text-slate-400'
                      }`}
                      title={r.content}
                    >
                      {kept ? '✓ 有效 · ' : '✗ 已筛掉 · '}
                      {r.content}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 有效参考答案列表（数量多时滚动） */}
      <div className="mt-3 max-h-[30rem] space-y-2 overflow-y-auto pr-1">
        {shown.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">该来源下无有效参考答案</p>
        ) : (
          available
            .map((a, i) => ({ a, no: i }))
            .filter(({ a }) => fromFilter === 'all' || a.from === fromFilter)
            .map(({ a, no }) => (
              <RefItem key={`${no}-${a.from}`} no={no} {...a} />
            ))
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        编号 #n 与「原子事实评测矩阵」的列号对应；筛掉规则：score 低于阈值（如 0.6）的原始条目不参与评测。
      </p>
    </Card>
  )
}
