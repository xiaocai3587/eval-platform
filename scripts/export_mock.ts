/**
 * 一次性导出脚本：把 src/mock/mockData.ts 中的 MOCK 数据导出为 pyweb/data/*.json
 * 运行：npx tsx scripts/export_mock.ts
 * （React 原项目保持不动；Python 版只读导出的 JSON）
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MOCK_FILES, MOCK_RECORDS, MOCK_RERUNS } from '../src/mock/mockData'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../pyweb/data')
mkdirSync(outDir, { recursive: true })

const dump = (name: string, data: unknown) => {
  const file = resolve(outDir, `${name}.json`)
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`✓ ${file}`)
}

dump('files', MOCK_FILES)
dump('records', MOCK_RECORDS)
// MOCK_RERUNS 的 key 为数字，转字符串 key 以便 Python 侧统一处理
const rerunsStr: Record<string, unknown> = {}
for (const [k, v] of Object.entries(MOCK_RERUNS)) rerunsStr[String(k)] = v
dump('reruns', rerunsStr)

console.log(`导出完成：${MOCK_FILES.length} 个文件 / ${MOCK_RECORDS.length} 条记录`)
