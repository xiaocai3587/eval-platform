> # ⚠️ 此版本已停止更新（Archived / Frozen）
>
> 本目录 `legacy-react/` 是评测结果查看器的**早期 React 实现**，已整体归档，仅作对照保留，**不再修复问题、不再新增功能**。
>
> **当前维护版本为 Python 版（FastAPI + Jinja2）**，位于仓库根目录，主说明见 **[../README.md](../README.md)**。
>
> 保留原因：作为功能与视觉的对照基线。两套代码互不引用，可独立运行。

---

# 评测结果查看器 · React 版（已冻结）

读取大模型评测任务产出的 `.jsonl` 结果文件，以可视化方式查看每条记录的评测结论、原子事实评测矩阵、任务执行路径和历史重跑对比。

## 技术栈（存档信息）

| 层次 | 选型 |
| --- | --- |
| 框架 | React 18.3 |
| 构建 | Vite 5.4 |
| 语言 | TypeScript 5.5（`strict` + `noUnusedLocals`） |
| 路由 | react-router-dom 6.26（BrowserRouter） |
| 样式 | Tailwind CSS 3.4（primary 蓝色主题；自定义断点 3xl:1920px、4xl:2560px） |

设计约束：不使用 UI 组件库（Modal / Card 等全部手写）、不使用状态管理库（直接读写 localStorage）、无网络层（纯本地 mock 数据）。

## 运行方式（仅供存档参考）

在**本目录**执行：

```powershell
cd legacy-react
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build，产物在 dist/
npm run preview  # 预览构建产物
```

## 目录结构

```
legacy-react/
├── index.html
├── package.json
├── package-lock.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── scripts/
│   └── export_mock.ts              # 一次性数据导出脚本：把 mock 数据导出为 Python 版用的 JSON
└── src/
    ├── main.tsx                    # 入口
    ├── App.tsx                     # 路由定义
    ├── index.css                   # Tailwind 指令
    ├── types.ts                    # 类型定义 + 评测语义计算（score / passed / computeFinal）
    ├── pages/
    │   ├── FileListPage.tsx        # 页面 1：文件列表
    │   ├── RecordListPage.tsx      # 页面 2：记录列表（搜索 / 筛选 / 排序 / 分页）
    │   ├── RecordDetailPage.tsx    # 页面 3：记录详情
    │   └── ComparePage.tsx         # 页面 4：重跑对比
    ├── components/                 # 12 个手写组件
    │   ├── AppShell.tsx            # 布局壳
    │   ├── Card.tsx
    │   ├── Modal.tsx
    │   ├── Pagination.tsx
    │   ├── DimensionBadge.tsx      # 五维度徽章（icon_issue 反向语义）
    │   ├── PassedBadge.tsx
    │   ├── ScoreBadge.tsx
    │   ├── StatusBadge.tsx
    │   ├── JsonView.tsx            # JSON 树
    │   ├── FactMatrix.tsx          # 事实 × 参考答案 矩阵
    │   ├── TaskTimeline.tsx        # 任务路径时间线
    │   └── RefAnswerCard.tsx       # 参考答案卡
    ├── mock/
    │   └── mockData.ts             # 13 条 mock 记录（含第 13 条长参考答案重载 case）
    ├── store/
    │   ├── files.ts                # localStorage：文件列表
    │   └── reruns.ts               # localStorage：重跑记录（key v4）
    └── utils/
        └── format.ts               # 格式化工具
```

## 路由

| 路径 | 页面 |
| --- | --- |
| `/` | 文件列表 |
| `/records` | 记录列表 |
| `/records/:lineNo` | 记录详情 |
| `/records/:a/vs/:b` | 重跑对比 |

## 与 Python 版的功能对应

| React 版（本目录） | Python 版（仓库根目录） |
| --- | --- |
| `src/App.tsx` + `src/types.ts` + `src/store/*.ts` | `app.py` |
| `src/components/*`（12 个组件） | `templates/_macros.html` |
| `src/pages/*`（4 个页面） | `templates/*.html` |
| 组件内 useState / useEffect 交互 | `static/app.js` |
| `src/mock/mockData.ts` | `data/*.json` |
| localStorage 持久化 | `data/state.json`、`data/reruns_state.json` |

Python 版已通过 26 项浏览器回归测试，功能与本版完全对齐。
