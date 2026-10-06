import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import Pagination from '../components/Pagination'
import PassedBadge from '../components/PassedBadge'
import ScoreBadge from '../components/ScoreBadge'
import { MOCK_RECORDS } from '../mock/mockData'
import { getCurrentFile, loadFiles } from '../store/files'
import { getDuration, getPassed, getScore } from '../types'
import { formatSec } from '../utils/format'

type FilterKey = 'all' | 'passed' | 'failed' | 'manual'
type SortKey = 'default' | 'score-desc' | 'score-asc' | 'duration-desc' | 'duration-asc'

const PAGE_SIZE = 10

/** 页面 2：记录列表（搜索 / 筛选 / 排序 / 分页，全部前端对 mock 数据生效） */
export default function RecordListPage() {
  const navigate = useNavigate()
  const currentFile = useMemo(() => getCurrentFile(loadFiles()), [])

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sort, setSort] = useState<SortKey>('default')
  const [page, setPage] = useState(1)

  /** 附带 lineNo（= jsonl 行号，1-based） */
  const rows = useMemo(() => MOCK_RECORDS.map((r, i) => ({ ...r, lineNo: i + 1 })), [])
  // 通过状态由 final 维度派生：true / false / null（人工参与等文字状态，未判定）
  const passedCount = rows.filter((r) => getPassed(r.final_evaluation) === true).length
  const failedCount = rows.filter((r) => getPassed(r.final_evaluation) === false).length
  const manualCount = rows.length - passedCount - failedCount

  // 搜索 / 筛选 / 排序变化时重置回第 1 页
  useEffect(() => {
    setPage(1)
  }, [search, filter, sort])

  const filtered = useMemo(() => {
    let list = rows
    const kw = search.trim().toLowerCase()
    if (kw) list = list.filter((r) => r.row_data.query.toLowerCase().includes(kw))
    if (filter === 'passed') list = list.filter((r) => getPassed(r.final_evaluation) === true)
    else if (filter === 'failed') list = list.filter((r) => getPassed(r.final_evaluation) === false)
    else if (filter === 'manual') list = list.filter((r) => getPassed(r.final_evaluation) === null)
    return list
  }, [rows, search, filter])

  const sorted = useMemo(() => {
    const list = [...filtered]
    switch (sort) {
      case 'score-desc':
        list.sort((a, b) => (getScore(b.final_evaluation) ?? -1) - (getScore(a.final_evaluation) ?? -1))
        break
      case 'score-asc':
        list.sort((a, b) => (getScore(a.final_evaluation) ?? -1) - (getScore(b.final_evaluation) ?? -1))
        break
      case 'duration-desc':
        list.sort((a, b) => getDuration(b) - getDuration(a))
        break
      case 'duration-asc':
        list.sort((a, b) => getDuration(a) - getDuration(b))
        break
    }
    return list
  }, [filtered, sort])

  const total = sorted.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const openDetail = (lineNo: number) => navigate(`/records/${lineNo}`)

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-5rem)] w-full max-w-[80rem] flex-col gap-3 2xl:max-w-[95rem] 3xl:max-w-[110rem] 4xl:max-w-[130rem]">
        {/* 顶部：返回 + 当前文件信息 */}
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link
            to="/"
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 transition-colors hover:bg-slate-50"
          >
            ← 文件列表
          </Link>
          <h1 className="text-lg font-semibold text-slate-800">记录列表</h1>
          <span className="max-w-[280px] truncate rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-xs text-slate-600" title={currentFile.name}>
            {currentFile.name}
          </span>
          <span className="ml-auto text-xs text-slate-500">
            共 <span className="font-medium text-slate-700">{rows.length}</span> 条记录 · 通过{' '}
            <span className="font-medium text-green-600">{passedCount}</span> · 不通过{' '}
            <span className="font-medium text-red-600">{failedCount}</span> · 人工参与{' '}
            <span className="font-medium text-sky-600">{manualCount}</span>
          </span>
        </div>

        {/* 工具栏：搜索 / 筛选 / 排序 */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 Query 关键词…"
              className="h-8 w-64 rounded border border-slate-200 bg-white pl-8 pr-7 text-xs text-slate-700 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            <svg viewBox="0 0 16 16" className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" fill="none" aria-hidden>
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1.5 flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="清空搜索"
              >
                ✕
              </button>
            )}
          </div>

          {/* 筛选：全部 / 通过 / 不通过 / 人工参与 */}
          <div className="flex items-center rounded border border-slate-200 bg-white p-0.5">
            {(
              [
                ['all', '全部', rows.length],
                ['passed', '通过', passedCount],
                ['failed', '不通过', failedCount],
                ['manual', '人工参与', manualCount],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`flex h-7 items-center gap-1 rounded px-2.5 text-xs transition-colors ${
                  filter === key ? 'bg-primary-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
                <span className={`font-mono ${filter === key ? 'text-primary-100' : 'text-slate-400'}`}>{count}</span>
              </button>
            ))}
          </div>

          {/* 排序 */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600 focus:border-primary-400 focus:outline-none"
          >
            <option value="default">默认顺序（行号）</option>
            <option value="score-desc">分数 降序</option>
            <option value="score-asc">分数 升序</option>
            <option value="duration-desc">耗时 降序</option>
            <option value="duration-asc">耗时 升序</option>
          </select>

          <span className="ml-auto text-xs text-slate-400">
            {search.trim() || filter !== 'all' || sort !== 'default' ? `筛选后 ${total} 条` : ''}
          </span>
        </div>

        {/* 记录表格 */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full table-fixed text-left">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50/95 text-xs text-slate-500 backdrop-blur">
                  <th className="w-12 px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Query</th>
                  <th className="w-16 px-3 py-2 font-medium">步骤数</th>
                  <th className="w-16 px-3 py-2 font-medium">Score</th>
                  <th className="w-24 px-3 py-2 font-medium">Passed</th>
                  <th className="w-20 px-3 py-2 font-medium">耗时</th>
                  <th className="w-24 px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((r) => {
                  const hasFailedStep = r.steps_traces.some((s) => s.status === 'failed')
                  return (
                    <tr
                      key={r.lineNo}
                      onClick={() => openDetail(r.lineNo)}
                      className="cursor-pointer border-b border-slate-100 text-sm transition-colors last:border-0 even:bg-slate-50/40 hover:bg-primary-50/50"
                    >
                      <td className="px-3 py-2.5 font-mono text-slate-500">{r.lineNo}</td>
                      <td className="max-w-0 truncate px-3 py-2.5 text-slate-800" title={r.row_data.query}>
                        {r.row_data.query}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`font-mono ${hasFailedStep ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                          {r.steps_traces.length}
                          {hasFailedStep && <span title="存在失败步骤"> ⚠</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <ScoreBadge score={getScore(r.final_evaluation)} />
                      </td>
                      <td className="px-3 py-2.5">
                        <PassedBadge passed={getPassed(r.final_evaluation)} />
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600">{formatSec(getDuration(r))}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-primary-600 hover:underline">详情 →</span>
                      </td>
                    </tr>
                  )
                })}
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                      无匹配记录，试试调整搜索关键词或筛选条件
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer className="shrink-0 border-t border-slate-200 px-4 py-2">
            <Pagination page={safePage} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
          </footer>
        </section>
      </div>
    </AppShell>
  )
}
