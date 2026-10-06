import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'
import { loadFiles, saveCurrentFileId, saveFiles } from '../store/files'
import type { MockFile } from '../types'

/** 生成一个模拟上传的文件（mock：与 MOCK_RECORDS 共用同一份 13 条记录数据集） */
function makeMockUploadFile(): MockFile {
  const now = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  const time = `${p(now.getHours())}:${p(now.getMinutes())}`
  const stamp = `${date.replace(/-/g, '')}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return {
    id: `f-${now.getTime()}`,
    name: `eval_upload_${stamp}.jsonl`,
    recordCount: 13,
    uploadedAt: `${date} ${time}`,
    size: `${(Math.random() * 40 + 10).toFixed(1)} KB`,
  }
}

function FileJsonlIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-primary-500" fill="none" aria-hidden>
      <path d="M4 1.5h5.5L13 5v9.5H4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.5 1.5V5H13" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-primary-500" fill="none" aria-hidden>
      <path
        d="M12 16V5m0 0-4 4m4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

/** 页面 1：文件上传 / 文件列表 */
export default function FileListPage() {
  const navigate = useNavigate()
  const [files, setFiles] = useState<MockFile[]>(() => loadFiles())
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [newId, setNewId] = useState('')

  const openFile = (f: MockFile) => {
    saveCurrentFileId(f.id)
    navigate('/records')
  }

  /** 模拟选中 / 拖入一个文件：600ms 解析后插入列表顶部 */
  const simulateUpload = () => {
    if (parsing) return
    setParsing(true)
    window.setTimeout(() => {
      const f = makeMockUploadFile()
      const next = [f, ...files]
      setFiles(next)
      saveFiles(next)
      setNewId(f.id)
      setParsing(false)
    }, 600)
  }

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-5rem)] w-full max-w-[70rem] flex-col gap-4 2xl:max-w-[85rem] 3xl:max-w-[100rem] 4xl:max-w-[120rem]">
        {/* 标题行 */}
        <div className="flex shrink-0 items-end justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">评测文件</h1>
            <p className="mt-0.5 text-xs text-slate-500">上传 .jsonl 评测结果文件，解析后查看记录明细</p>
          </div>
          <span className="text-xs text-slate-400">共 {files.length} 个文件</span>
        </div>

        {/* 拖拽上传区（仅 UI：点击 / 拖入均模拟选中一个文件） */}
        <button
          type="button"
          onClick={simulateUpload}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            simulateUpload()
          }}
          disabled={parsing}
          className={`flex shrink-0 flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-7 transition-colors ${
            dragging || parsing
              ? 'border-primary-400 bg-primary-50/50'
              : 'border-slate-300 bg-white hover:border-primary-300 hover:bg-primary-50/30'
          } ${parsing ? 'cursor-wait' : 'cursor-pointer'}`}
        >
          <UploadIcon />
          <p className="text-sm font-medium text-slate-600">
            {parsing ? '正在解析文件…' : '拖拽 .jsonl 文件到此处，或点击模拟选中文件'}
          </p>
          <p className="text-xs text-slate-400">支持 .jsonl 格式 · 单文件 ≤ 50MB（演示环境为模拟上传）</p>
        </button>

        {/* 文件列表 */}
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card">
          <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 px-4">
            <h2 className="text-sm font-semibold text-slate-700">文件列表</h2>
            <span className="text-xs text-slate-400">点击文件进入记录列表</span>
          </header>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50/95 text-xs text-slate-500 backdrop-blur">
                  <th className="px-4 py-2 font-medium">文件名</th>
                  <th className="w-24 px-4 py-2 font-medium">记录数</th>
                  <th className="w-24 px-4 py-2 font-medium">大小</th>
                  <th className="w-40 px-4 py-2 font-medium">上传时间</th>
                  <th className="w-32 px-4 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr
                    key={f.id}
                    onClick={() => openFile(f)}
                    className={`cursor-pointer border-b border-slate-100 text-sm transition-colors last:border-0 even:bg-slate-50/40 hover:bg-primary-50/50 ${
                      f.id === newId ? 'bg-primary-50/60' : ''
                    }`}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <FileJsonlIcon />
                        <span className="font-mono text-slate-800">{f.name}</span>
                        {f.id === newId && (
                          <span className="rounded bg-primary-100 px-1.5 py-px text-xs font-medium text-primary-700">新</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">{f.recordCount}</td>
                    <td className="px-4 py-2.5 text-slate-500">{f.size}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{f.uploadedAt}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="text-primary-600 hover:underline">查看记录 →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
