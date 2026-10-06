import type { ReactNode } from 'react'

interface CardProps {
  title: string
  extra?: ReactNode
  children: ReactNode
  className?: string
}

/** 通用卡片：标题栏 + 内容区 */
export default function Card({ title, extra, children, className = '' }: CardProps) {
  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card ${className}`}>
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {extra && <span className="text-xs text-slate-400">{extra}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}
