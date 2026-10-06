import { getRerunsOf } from '../mock/mockData'
import type { RerunRun } from '../types'

// v4：icon_issue 语义反转为 1 = 有问题 / 0 = 无问题，换 key 避免读到旧语义缓存
const KEY = 'eval-viewer:reruns:v4'

type RerunMap = Record<string, RerunRun[]>

function loadMap(): RerunMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as RerunMap
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {
    // 数据损坏时忽略，回退 mock 数据
  }
  return {}
}

/** 读取某条记录的重跑历史：优先 localStorage（含新发起的重跑），否则用 mock 初始数据 */
export function loadReruns(lineNo: number): RerunRun[] {
  const map = loadMap()
  return map[String(lineNo)] ?? getRerunsOf(lineNo)
}

export function saveReruns(lineNo: number, runs: RerunRun[]): void {
  const map = loadMap()
  map[String(lineNo)] = runs
  localStorage.setItem(KEY, JSON.stringify(map))
}
