# 评测结果查看器

读取大模型评测任务产出的 `.jsonl` 结果文件，以可视化方式查看每条记录的**评测结论、原子事实评测矩阵、任务执行路径和历史重跑对比**。

本项目为 **FastAPI + Jinja2 服务端渲染**实现，可独立运行——只需 Python，不需要 Node.js。

仓库根目录就是 Python 版应用本体；早期的 React 实现已整体归档到 [`legacy-react/`](legacy-react/)，**已冻结、不再更新**，仅作对照保留。

---

## 技术栈

| 层次 | 选型 |
| --- | --- |
| Web 框架 | FastAPI |
| 模板引擎 | Jinja2（服务端渲染） |
| 样式 | Tailwind CSS（Play CDN，内联 config 对齐原主题色与断点） |
| 前端交互 | 原生 JavaScript（`static/app.js`，无任何前端框架） |
| 数据存储 | 本地 JSON 文件（`data/`） |

无 UI 组件库、无状态管理库、无数据库、无前端构建步骤。

---

## 目录结构

```
eval-platform/
├── app.py                  # 全部后端逻辑：路由 + 评测计算 + JSON 读写
├── requirements.txt        # Python 依赖（4 个）
├── templates/              # Jinja2 模板
│   ├── base.html           # 布局壳 + Tailwind CDN 配置（主题色 / 3xl:1920px、4xl:2560px 断点）
│   ├── _macros.html        # 复用组件宏：卡片 / 维度徽章 / 状态徽章 / JSON 树 / 事实矩阵 / 任务时间线
│   ├── files.html          # 页面 1：文件列表 + 真实上传（选择 / 拖拽 .jsonl / .json）
│   ├── records.html        # 页面 2：记录列表（搜索 / 筛选 / 排序 / 分页）
│   ├── record_detail.html  # 页面 3：记录详情（三栏布局 + process_data 右抽屉 + 重跑）
│   ├── compare.html        # 页面 4：原始记录 vs 重跑记录对比
│   └── error.html          # 404 / 运行中提示
├── static/
│   └── app.js              # 原生 JS：上传 / 弹窗 / 抽屉 / 折叠展开 / 长文本展开 / 重跑提交
├── data/                   # 数据文件（见下文「数据文件说明」）
├── legacy-react/           # React 存档版（已冻结，说明见 legacy-react/README.md）
├── README.md               # 本文档
└── .gitignore
```

---

## 环境要求

- **Python 3.9 或更高**（开发验证环境为 Python 3.13）
- 浏览器需**联网**：Tailwind 样式通过 CDN 加载

依赖仅 4 个（见 [requirements.txt](requirements.txt)）：

```
fastapi>=0.110
uvicorn[standard]>=0.29
jinja2>=3.1
python-multipart>=0.0.9
```

---

## 快速开始

```powershell
# 1. 克隆仓库后进入项目根目录
cd eval-platform

# 2. 创建虚拟环境
python -m venv .venv

# 3. 激活虚拟环境
.\.venv\Scripts\activate          # Windows PowerShell
# source .venv/bin/activate       # macOS / Linux

# 4. 安装依赖
pip install -r requirements.txt

# 5. 启动服务
python -m uvicorn app:app --port 8000
```

浏览器打开 **<http://localhost:8000>**。按 `Ctrl+C` 停止服务。

---

## 部署

### 局域网 / 内网访问

监听所有网卡，同 WiFi 下的手机或其他电脑可访问：

```powershell
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

访问地址为 `http://<本机IP>:8000`（本机 IP 可用 `ipconfig` 查看）。

### 后台常驻运行

**Windows（PowerShell，隐藏窗口后台运行）**：

```powershell
Start-Process -FilePath ".\.venv\Scripts\python.exe" `
  -ArgumentList "-m","uvicorn","app:app","--host","0.0.0.0","--port","8000" `
  -WindowStyle Hidden
```

停止时用 `Get-NetTCPConnection -LocalPort 8000` 查出 PID 后 `Stop-Process -Id <PID>`。

**Linux**：

```bash
nohup .venv/bin/python -m uvicorn app:app --host 0.0.0.0 --port 8000 > app.log 2>&1 &
```

### 生产环境注意事项

- **建议单进程运行**：重跑功能使用进程内定时器（`threading.Timer`）+ 文件写入，多进程（`--workers`）下会产生并发写冲突
- 若部署在 Nginx 等反向代理之后，启动时加上 `--proxy-headers`
- 服务本身无内置认证，**请勿直接暴露到公网**；如需公网访问，请置于内网或自行加一层认证
- 页面样式依赖 Tailwind CDN，**离线环境无法正常显示**，需改为本地构建 CSS

---

## 路由一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/` | 文件列表页，含真实上传入口；`?error=` 显示上传错误提示 |
| POST | `/upload` | 真实解析上传的 `.jsonl` / `.json` 文件（每行一条记录），按文件独立保存后 303 重定向回 `/` |
| GET | `/records` | 记录列表页（仅显示当前文件的记录） |
| GET | `/records/{line_no}` | 记录详情页（`line_no` 为 jsonl 行号，从 1 开始） |
| POST | `/api/rerun/{line_no}` | 发起一次重跑，返回 `{ok, run_id}`；1 秒后模拟完成 |
| GET | `/records/{line_no}/compare/{run_id}` | 原始记录 vs 该次重跑记录的对比页 |

**上传规则**：接受 `.jsonl`，以及扩展名为 `.json` 但内容实为 jsonl（每行一个 JSON）的文件（UTF-8），单文件 ≤ 50MB；每行需为一个含记录容器字段（默认 `row_data`，可用 `FIELDS` 配置）的 JSON 对象，空行跳过、非法行计数后跳过；若整份文件未解析出任何记录则回到文件页并提示错误。

**记录按文件隔离**：上传文件的记录存于 `data/uploads/<file_id>.json`，列表 / 详情 / 重跑 / 对比均只作用于当前选中的文件；页面间跳转通过 `file` 参数保留当前文件上下文。

**记录列表支持 URL 查询参数**（可收藏 / 分享链接，无需前端状态）：

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `q` | 任意关键词 | 按 Query 内容模糊搜索 |
| `filter` | `all` / `passed` / `failed` / `manual` | 全部 / 通过 / 不通过 / 人工参与 |
| `sort` | `default` / `duration-desc` / `duration-asc` | 排序方式 |
| `page` | 整数 | 页码（每页 10 条） |
| `file` | 文件 id | 从文件列表点进来时记住当前文件 |

示例：`/records?filter=failed&sort=duration-asc&page=1`

---

## 数据文件说明

全部位于 `data/`：

| 文件 | 性质 | 内容 |
| --- | --- | --- |
| `files.json` | 只读 mock | 内置文件列表初始数据（3 个） |
| `records.json` | 只读 mock | 内置文件的评测记录数组，**当前 13 条**，每条含 `row_data` / `steps_traces` / `final_evaluation` / `process_data` |
| `reruns.json` | 只读 mock | 内置文件的重跑记录初始数据，键为行号（1-based） |
| `state.json` | 运行时生成 | 用户上传的文件列表、当前选中文件、新上传高亮 id |
| `reruns_state.json` | 运行时生成 | 用户实际发起的重跑记录，键为 `{file_id}::{line_no}` |
| `uploads/<file_id>.json` | 运行时生成 | 每个上传文件独立保存的评测记录数组 |

`state.json`、`reruns_state.json`、`uploads/` 已在 `.gitignore` 中排除，克隆下来即为干净初始状态。

**重置到初始状态**：删除 `state.json`、`reruns_state.json` 和 `uploads/` 目录即可（服务无需重启，下次请求会重新生成）。

**接入真实数据**：直接在文件页上传 `.jsonl` 即可——每行一个评测记录（需含 `row_data` 字段），服务会解析后按文件独立存储。注意原始字段拼写 `duraiton` 被刻意保留，读取逻辑已兼容 `duration`。

> 历史上的数据来源：`records.json` 等初始数据由 `legacy-react/scripts/export_mock.ts` 从 React 版的 mock 数据一次性导出，该脚本已归档，**正常使用不需要再执行**。

---

## 字段名配置（FIELDS）

若自有的 `.jsonl` 字段名与默认不同，**只需修改 [app.py](app.py) 顶部的 `FIELDS` 字典**，其余业务代码与模板都无需改动。

- 字典的「键」= 程序内部规范名（**不要改**）；「值」= 你数据里的真实字段名（默认与键相同）。
- 数据加载时（内置 mock 文件与用户上传的文件）会按此表把**所有层级**的字段名统一成规范名，包括 `steps_traces` 单步、`final_evaluation` 各维度、`process_data` 里的事实与参考答案结构。
- 上传校验（是否含记录容器）也读取该表，无需另改。
- 各「值」需保持唯一，避免同名冲突。改完重启服务即可生效。

例如把你的数据字段 `data` / `question` / `reply` / `eval` 对接上来：

```python
FIELDS = {
    'row_data': 'data',          # 顶层记录容器
    'query': 'question',         # 提问
    'DisplayText': 'reply',      # 模型回复
    'final_evaluation': 'eval',  # 评测结果
    # …其余按需修改
}
```

---

## 重跑功能（当前为模拟实现）

> ⚠️ 重跑结果目前是**本地模拟**，不调用任何真实评测服务。详情页「历史重跑」、重跑弹窗、对比页均已加「模拟数据」标识。

### 机制
1. 详情页点「重跑此条」→ `POST /api/rerun/{line_no}`（`app.py` 的 `start_rerun`）。
2. 后端立即写入一条 `status=running` 的空记录，并启动 `threading.Timer(1.0, _finish_rerun)`。
3. 约 1 秒后 `_finish_rerun` 生成「结果」，全部由原记录派生：
   - 步骤：直接复制原 `steps_traces`，用 `jitter()` 给每步 `cost` 加 ±20% 随机扰动；
   - 维度：用 `flip()` 以 85% 保原值 / 15% 取反，随机翻转 `relevance` / `consistency` / `informativeness` / `correctness` / `icon_issue`；
   - `final` 由 `compute_final()` 重算，`comment` 原样复制；
   - 结果写回 `data/reruns_state.json`（键为 `{file_id}::{line_no}`）。
4. 前端 `setTimeout(1500)` 后整页刷新，展示「成功」的模拟结果。
5. 用户填写的配置会存入 run 的 `config` 字段，但**当前不被使用**。

### 如何改成真实重跑
只需替换 `_finish_rerun`，其余 UI / 存储 / 对比逻辑都不用动：
1. 在 `_finish_rerun`（或 `start_rerun` 内）改为真实调用你的评测服务（HTTP 请求 / 本地脚本 / 消息队列），拿到真实的 `steps_traces` 与 `final_evaluation`；
2. 若返回字段名与内部规范名不一致，用上文的 `FIELDS` 映射，或直接把值按规范名写入；
3. 用真实返回填充 run 的 `status` / `duration` / `steps_traces` / `evaluation`，再 `save_reruns(...)` 落盘；
4. 评测若为异步，可保留 `running` 中间态，由回调或轮询更新即可——页面已支持「进行中」状态与「对比（进行中）」占位。

### 如何测试
- **手动**：打开任一记录详情 → 右上角「重跑此条」→ 填/不填配置 → 开始重跑 → 约 1.5 秒后出现一条 `success` 记录 → 点「对比 →」查看差异。
- **接口**：
  ```bash
  curl -X POST -F 'config={}' -F 'file=f-001' http://127.0.0.1:8000/api/rerun/5
  # → {"ok": true, "run_id": "run-xxxxxx"}
  curl "http://127.0.0.1:8000/records/5/compare/run-xxxxxx?file=f-001"
  ```
- **预期**：同一记录多次重跑，维度结果与耗时会因随机而不同；`data/reruns_state.json` 中该记录会累积多次运行。

---

## 关于第 13 条记录

`records.json` 的第 13 条是一个**长参考答案重载 case**（HTTP vs HTTPS 技术对比）：

- 30 条参考答案，经相关度筛选后 24 条有效（`score >= 0.6`，筛掉 6 条）
- 24 轮批量评测，事实矩阵 5 事实 × 24 参考答案
- 其中「正确性」为 0（红 ✕）、`icon_issue` 为 0（绿 ✓，该维度为反向：1 = 有问题）
- 另有 8 个执行步骤，适合验证时间线与 JSON 展开

访问 `/records/13` 可查看。

---

## 评测语义说明

五个评测维度各自取值 `0` / `1`，或文字状态（如「人工参与」）：

| 维度 | 含义 |
| --- | --- |
| 相关性 / 一致性 / 信息量 / 正确性 | 1 = 良好，0 = 不达标 |
| 图标相关问题 | **反向维度**：1 = 有问题（红 ✕），0 = 无问题（绿 ✓） |

- **综合分数**：四个正向维度 + 「无图标问题」（即 `1 - icon_issue`）的平均值
- **最终评测结果**：正向四维度全为 1 且图标相关问题为 0 → `1`；任一维度为 0 或图标相关问题为 1 → `0`；含文字维度则继承该文字

以上逻辑在 `app.py` 中实现，语义与 React 存档版 `legacy-react/src/types.ts` 一致。

---

## 常见问题

**端口被占用**：换一个端口，如 `--port 8001`。

**页面没有样式**：Tailwind 通过 CDN 加载，需联网。离线环境需改用本地构建的 CSS。

**重跑记录点进去显示「仍在运行中」**：重跑需约 1 秒完成，稍后刷新即可。

**中文乱码**：数据文件均以 UTF-8 读写；若自行替换数据，请确保保存为 UTF-8。
