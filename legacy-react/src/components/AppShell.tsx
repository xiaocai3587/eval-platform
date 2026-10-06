import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** 全局布局壳：紧凑顶栏（h-12，sticky）+ 全宽内容区（宽屏加大左右留白） */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 h-12 shrink-0 border-b border-slate-200 bg-white">
        <div className="flex h-full items-center gap-3 px-4 sm:px-6 3xl:px-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-primary-600 text-xs font-bold text-white">
              评
            </span>
            <span className="text-sm font-semibold text-slate-800">评测结果查看器</span>
          </Link>
          <span className="hidden text-xs text-slate-400 sm:inline">LLM / Agent Evaluation Viewer</span>
          <span className="ml-auto rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
            mock 数据 · v0.1
          </span>
        </div>
      </header>
      <main className="flex-1 px-4 py-4 sm:px-6 3xl:px-8">{children}</main>
    </div>
  )
}
