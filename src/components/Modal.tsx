import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** 宽度类名，默认 max-w-lg */
  widthClass?: string
}

/** 通用 Modal：遮罩点击 / Esc 关闭，打开时锁定背景滚动 */
export default function Modal({ open, title, onClose, children, footer, widthClass = 'max-w-lg' }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div className={`relative flex max-h-[85vh] w-full flex-col rounded-lg border border-slate-200 bg-white shadow-xl ${widthClass}`}>
        <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 px-4">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="关闭"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
        {footer && <footer className="shrink-0 border-t border-slate-200 px-4 py-3">{footer}</footer>}
      </div>
    </div>
  )
}
