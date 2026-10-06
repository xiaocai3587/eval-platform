import { useState } from 'react'

/** 基础值：按类型着色（字符串绿 / 数字蓝 / 布尔紫 / null 灰） */
function ValueText({ value }: { value: unknown }) {
  if (value === null) return <span className="italic text-slate-400">null</span>
  if (typeof value === 'string') return <span className="break-all text-emerald-600">"{value}"</span>
  if (typeof value === 'number') return <span className="text-blue-600">{value}</span>
  if (typeof value === 'boolean') return <span className="text-violet-600">{String(value)}</span>
  return <span className="text-slate-600">{String(value)}</span>
}

/** JSON 树节点：对象 / 数组可点击 key 行收起展开，折叠时显示概要（{…} n 个键 / […] n 项） */
function JsonNode({ label, value }: { label?: string; value: unknown }) {
  const [open, setOpen] = useState(true)

  // 基础值：单行 key: value
  if (value === null || typeof value !== 'object') {
    return (
      <div className="whitespace-pre-wrap px-0.5 font-mono text-xs leading-relaxed">
        {label !== undefined && <span className="text-slate-500">{label}: </span>}
        <ValueText value={value} />
      </div>
    )
  }

  const isArray = Array.isArray(value)
  const entries: [string, unknown][] = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>)

  return (
    <div className="font-mono text-xs leading-relaxed">
      {/* 可折叠的 key 行 */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 rounded px-0.5 text-left transition-colors hover:bg-slate-100"
      >
        <span className="inline-block w-3 shrink-0 text-slate-400">{open ? '▾' : '▸'}</span>
        {label !== undefined && <span className="text-slate-500">{label}:</span>}
        <span className="text-slate-400">
          {open
            ? isArray
              ? '['
              : '{'
            : `${isArray ? '[…]' : '{…}'} ${entries.length} ${isArray ? '项' : '个键'}`}
        </span>
        {!open && <span className="text-slate-300">{isArray ? ']' : '}'}</span>}
      </button>
      {open && (
        <>
          <div className="ml-[7px] border-l border-slate-200 pl-3">
            {entries.map(([k, v]) => (
              <JsonNode key={k} label={k} value={v} />
            ))}
          </div>
          <div className="pl-4 text-slate-400">{isArray ? ']' : '}'}</div>
        </>
      )}
    </div>
  )
}

/** JSON 树视图：默认全展开，每个对象 / 数组节点可按 key 收起展开 */
export default function JsonView({ data }: { data: unknown }) {
  return (
    <div className="rounded border border-slate-200 bg-white px-3 py-2">
      <JsonNode value={data} />
    </div>
  )
}
