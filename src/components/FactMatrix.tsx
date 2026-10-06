import type { AtomicFact, FactEvaluation, RefAnswer } from '../types'

/** 评测格子样式：正确绿 / 错误红 / 未验证灰 */
const VERDICT_STYLE: Record<string, string> = {
  正确: 'bg-green-50 text-green-600',
  错误: 'bg-red-50 text-red-600',
  未验证: 'bg-slate-100 text-slate-400',
}

interface FactMatrixProps {
  /** 行：原子事实拆解（未评测初始值） */
  factDecomposition: Record<string, AtomicFact>
  /** 格子：每个参考答案评测一次的历史 */
  evaluationHistory: FactEvaluation[]
  /** 汇总列：原子事实评测结果（正确/错误回填参考答案编号） */
  evaluationResult: Record<string, AtomicFact>
  /** 列：有效参考答案（下标即编号） */
  availableAnswer: RefAnswer[]
}

/**
 * 原子事实评测矩阵（核心组件）
 * 行 = 原子事实，列 = 参考答案编号（#0..#n），格子 = 该参考答案对该事实的正确性结果；
 * 末列汇总 = evaluation_result（✓ 正确 [编号] / ✕ 错误 [编号] / 未验证）。
 * 参考答案可能多达 30 个 → 容器横向滚动，行头（原子事实）与汇总列 sticky 固定。
 */
export default function FactMatrix({
  factDecomposition,
  evaluationHistory,
  evaluationResult,
  availableAnswer,
}: FactMatrixProps) {
  const factKeys = Object.keys(factDecomposition)

  if (factKeys.length === 0 || availableAnswer.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-400">无原子事实或参考答案数据</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[260px] bg-white pr-3 text-left font-medium text-slate-400">
              原子事实
            </th>
            {availableAnswer.map((a, i) => (
              <th
                key={i}
                className="min-w-[2rem] rounded bg-slate-50 px-1 py-1 text-center font-mono font-medium text-slate-500"
                title={a.content.slice(0, 80)}
              >
                #{i}
              </th>
            ))}
            <th className="sticky right-0 z-10 min-w-[110px] bg-white pl-3 text-left font-medium text-slate-400">
              汇总
            </th>
          </tr>
        </thead>
        <tbody>
          {factKeys.map((k) => {
            const res = evaluationResult[k]
            const hasWrong = res !== undefined && res.错误.length > 0
            const unverified = res === undefined || res.未验证
            return (
              <tr key={k}>
                {/* 行头：原子事实（sticky left） */}
                <td
                  className="sticky left-0 z-10 max-w-[380px] truncate bg-white py-1.5 pr-3 text-slate-700"
                  title={factDecomposition[k].原子事实}
                >
                  <span className="mr-1.5 font-mono text-slate-400">{k}</span>
                  {factDecomposition[k].原子事实}
                </td>
                {/* 格子：各参考答案的正确性结果 */}
                {availableAnswer.map((_, i) => {
                  const verdict = evaluationHistory[i]?.[k]?.正确性结果 ?? '未验证'
                  return (
                    <td
                      key={i}
                      className={`min-w-[2rem] rounded py-1.5 text-center font-mono font-semibold ${
                        VERDICT_STYLE[verdict] ?? 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {verdict === '正确' ? '✓' : verdict === '错误' ? '✕' : '—'}
                    </td>
                  )
                })}
                {/* 汇总列（sticky right）：evaluation_result */}
                <td className="sticky right-0 z-10 bg-white py-1.5 pl-3">
                  {res === undefined ? (
                    <span className="text-slate-400">—</span>
                  ) : hasWrong ? (
                    <span className="whitespace-nowrap rounded border border-red-200 bg-red-50 px-1.5 py-px font-mono text-xs font-medium text-red-600">
                      ✕ 错误 [{res.错误.join(',')}]
                    </span>
                  ) : unverified ? (
                    <span className="whitespace-nowrap rounded border border-sky-200 bg-sky-50 px-1.5 py-px text-xs font-medium text-sky-600">
                      未验证
                    </span>
                  ) : (
                    <span className="whitespace-nowrap rounded border border-green-200 bg-green-50 px-1.5 py-px font-mono text-xs font-medium text-green-700">
                      ✓ 正确 [{res.正确.join(',')}]
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-400">
        图例：✓ 正确 · ✕ 错误 · — 未验证；列号 #n 对应「参考答案」卡中的编号；按列看 = 某参考答案的判定质量，按行看
        = 某事实的验证结论。
      </p>
    </div>
  )
}
