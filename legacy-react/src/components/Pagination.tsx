interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  className?: string
}

/** 生成页码序列（页数多时折叠为省略号） */
function pageItems(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const items: (number | '…')[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(totalPages - 1, page + 1)
  if (start > 2) items.push('…')
  for (let p = start; p <= end; p++) items.push(p)
  if (end < totalPages - 1) items.push('…')
  items.push(totalPages)
  return items
}

/** 紧凑分页：左侧统计信息 + 右侧页码 */
export default function Pagination({ page, pageSize, total, onChange, className = '' }: PaginationProps) {
  if (total === 0) return null
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const btn = 'inline-flex h-7 min-w-7 items-center justify-center rounded border px-1.5 text-xs transition-colors'

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <span className="text-xs text-slate-500">
        共 <span className="font-medium text-slate-700">{total}</span> 条 · 第 {from}–{to} 条
      </span>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label="上一页"
        >
          ‹
        </button>
        {pageItems(page, totalPages).map((item, i) =>
          item === '…' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-400">
              …
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item)}
              className={
                item === page
                  ? `${btn} border-primary-600 bg-primary-600 text-white`
                  : `${btn} border-slate-200 text-slate-600 hover:bg-slate-50`
              }
            >
              {item}
            </button>
          ),
        )}
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40`}
          aria-label="下一页"
        >
          ›
        </button>
      </div>
    </div>
  )
}
