import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import FileListPage from './pages/FileListPage'
import RecordListPage from './pages/RecordListPage'
import RecordDetailPage from './pages/RecordDetailPage'
import ComparePage from './pages/ComparePage'

/**
 * 路由定义
 * /                                文件上传 / 文件列表页
 * /records                         记录列表页（搜索、筛选、排序、分页）
 * /records/:lineNo                 记录详情页（任务路径时间线、重跑）
 * /records/:lineNo/compare/:runId  原始记录 vs 重跑记录对比页
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FileListPage />} />
        <Route path="/records" element={<RecordListPage />} />
        <Route path="/records/:lineNo" element={<RecordDetailPage />} />
        <Route path="/records/:lineNo/compare/:runId" element={<ComparePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
