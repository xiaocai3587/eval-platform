import { MOCK_FILES } from '../mock/mockData'
import type { MockFile } from '../types'

const LIST_KEY = 'eval-viewer:files'
const CURRENT_KEY = 'eval-viewer:current-file'

/** 读取文件列表（含模拟上传的文件），失败回退到默认 mock 列表 */
export function loadFiles(): MockFile[] {
  try {
    const raw = localStorage.getItem(LIST_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as MockFile[]
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // 数据损坏时回退到默认列表
  }
  return MOCK_FILES
}

export function saveFiles(files: MockFile[]): void {
  localStorage.setItem(LIST_KEY, JSON.stringify(files))
}

export function loadCurrentFileId(): string {
  return localStorage.getItem(CURRENT_KEY) ?? ''
}

export function saveCurrentFileId(id: string): void {
  localStorage.setItem(CURRENT_KEY, id)
}

/** 取当前文件（找不到时回退到列表第一个） */
export function getCurrentFile(files: MockFile[]): MockFile {
  const id = loadCurrentFileId()
  return files.find((f) => f.id === id) ?? files[0]
}
