# -*- coding: utf-8 -*-
"""评测结果查看器 · Python 版（FastAPI + Jinja2 服务端渲染）

功能：
  /                                 文件上传（真实解析 .jsonl）/ 文件列表
  /records                          记录列表（搜索 / 筛选 / 排序 / 分页，URL 查询参数驱动）
  /records/{line_no}                记录详情（三栏评测对象 / 事实矩阵 / 任务路径 / 历史重跑）
  /records/{line_no}/compare/{rid}  原始记录 vs 重跑记录对比
  POST /upload                      解析上传的 .jsonl（或内容为 jsonl 的 .json）文件，按文件独立保存记录
  POST /api/rerun/{line_no}         发起重跑（1 秒后模拟完成）

记录按「文件」隔离：上传文件的记录存于 data/uploads/<file_id>.json，
列表 / 详情 / 重跑 / 对比均只作用于当前选中的文件。

运行方式见项目根目录 README.md。
"""
import json
import random
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import quote, urlencode

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# ---------------------------------------------------------------- 基础设施

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
UPLOAD_DIR = DATA_DIR / 'uploads'          # 上传文件的记录，按文件独立存放
PAGE_SIZE = 10
MAX_UPLOAD_MB = 50                          # 与页面提示保持一致的体积上限
DEFAULT_RERUN_CONFIG = '{"model":"agent-v2","temperature":0.3,"top_k":5}'

# 五个评测维度元信息（final 单独突出展示，不进徽章行）
DIMENSIONS = [
    {'key': 'relevance', 'label': '相关性', 'invert': False},
    {'key': 'consistency', 'label': '一致性', 'invert': False},
    {'key': 'informativeness', 'label': '信息量', 'invert': False},
    {'key': 'correctness', 'label': '正确性', 'invert': False},
    {'key': 'icon_issue', 'label': '图标相关问题', 'invert': True},
]

# 事实矩阵格子样式：正确绿 / 错误红 / 未验证灰
VERDICT_STYLE = {
    '正确': 'bg-green-50 text-green-600',
    '错误': 'bg-red-50 text-red-600',
    '未验证': 'bg-slate-100 text-slate-400',
}

# ---------------------------------------------------------------- 字段名配置（唯一需要改的地方）
#
# 对接自有 .jsonl 时，只需修改本字典的「值」——值 = 你的数据里的真实字段名，
# 键 = 程序内部使用的规范名（请勿修改键名）。
# 数据加载时会按此表把深层结构（记录 / 步骤 / 评测 / 事实 / 参考答案）一并重命名，
# 其余业务代码与模板都不需要改动。注意：各「值」需保持唯一，避免同名冲突。
FIELDS = {
    # 记录顶层
    'row_data': 'row_data',
    'steps_traces': 'steps_traces',
    'final_evaluation': 'final_evaluation',
    'process_data': 'process_data',
    'token_usage': 'token_usage',
    'duraiton': 'duraiton',                 # 记录耗时；原始拼写，读取逻辑也兼容 duration

    # row_data
    'query': 'query',
    'intent': 'intent',
    'DisplayText': 'DisplayText',           # 模型回复
    'ref_answer': 'ref_answer',             # 参考答案（可选）
    'source': 'source',

    # steps_traces 单步
    'step': 'step',
    'action': 'action',
    'status': 'status',
    'cost': 'cost',
    'timestamp': 'timestamp',
    'input': 'input',
    'output': 'output',

    # final_evaluation
    'relevance': 'relevance',
    'consistency': 'consistency',
    'informativeness': 'informativeness',
    'correctness': 'correctness',
    'icon_issue': 'icon_issue',
    'final': 'final',
    'comment': 'comment',
    'dimension_reasons': 'dimension_reasons',

    # token_usage
    'prompt': 'prompt',
    'completion': 'completion',
    'total': 'total',

    # process_data（事实矩阵 / 参考答案流程）
    'get_ref_answer': 'get_ref_answer',
    'available_answer': 'available_answer',
    'fact_decomposition': 'fact_decomposition',
    'evaluation_history': 'evaluation_history',
    'evaluation_result': 'evaluation_result',
    'localRAG': 'localRAG',
    'playskills': 'playskills',
    'KG': 'KG',
    'content': 'content',                   # 参考答案文本
    'from': 'from',                         # 答案来源
    '原子事实': '原子事实',
    '正确': '正确',
    '错误': '错误',
    '未验证': '未验证',
    '正确性结果': '正确性结果',
}

app = FastAPI(title='评测结果查看器')
templates = Jinja2Templates(directory=str(BASE_DIR / 'templates'))
app.mount('/static', StaticFiles(directory=str(BASE_DIR / 'static')), name='static')

# ---------------------------------------------------------------- 数据读写（pyweb/data/*.json）


def _read_json(name: str, default: Any) -> Any:
    path = DATA_DIR / f'{name}.json'
    if not path.exists():
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _write_json(name: str, data: Any) -> None:
    path = DATA_DIR / f'{name}.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _rename_fields(obj: Any, mapping: Optional[dict] = None) -> Any:
    """按 FIELDS 把数据里的原始字段名统一为内部规范名（递归处理所有层级）。

    默认 mapping=FIELDS，其「值」默认等于「键」，因此默认是「无改动」的空操作；
    只重命名出现在映射「值」里的键，其余键（如动态的事实键）原样保留。
    """
    inv = {actual: canonical for canonical, actual in (mapping or FIELDS).items()}

    def walk(o: Any) -> Any:
        if isinstance(o, list):
            return [walk(x) for x in o]
        if isinstance(o, dict):
            return {inv.get(k, k): walk(v) for k, v in o.items()}
        return o

    return walk(obj)


# 由 scripts/export_mock.ts 从 React mock 数据导出（只读）
MOCK_FILES: list = _read_json('files', [])
MOCK_RECORDS: list = [_rename_fields(r) for r in _read_json('records', [])]
MOCK_RERUNS: dict = {k: [_rename_fields(r) for r in v] for k, v in _read_json('reruns', {}).items()}


def load_state() -> dict:
    """会话状态：用户上传的文件 / 当前选中文件 / 新上传文件高亮 id"""
    return _read_json('state', {'uploaded': [], 'current_file_id': '', 'new_id': ''})


def save_state(state: dict) -> None:
    _write_json('state', state)


MOCK_FILE_IDS = {f['id'] for f in MOCK_FILES}


def load_files() -> list:
    """文件列表 = 用户上传的 + 内置 mock 文件"""
    return load_state().get('uploaded', []) + MOCK_FILES


def get_current_file(files: list) -> dict:
    cid = load_state().get('current_file_id', '')
    for f in files:
        if f['id'] == cid:
            return f
    return files[0]


def resolve_current_file(file_param: str = '') -> dict:
    """确定当前文件：URL 带 file 参数则记住它，否则沿用上次选中（找不到回退第一个）"""
    if file_param:
        state = load_state()
        state['current_file_id'] = file_param
        save_state(state)
    return get_current_file(load_files())


def load_file_records(file_id: str) -> list:
    """取某个文件的评测记录：上传文件读 data/uploads/<id>.json，内置 mock 文件用导出数据"""
    if file_id in MOCK_FILE_IDS:
        return MOCK_RECORDS
    path = UPLOAD_DIR / f'{file_id}.json'
    if not path.exists():
        return []
    with open(path, encoding='utf-8') as f:
        return [_rename_fields(r) for r in json.load(f)]


def get_record(file_id: str, line_no: int) -> Optional[dict]:
    """lineNo = jsonl 行号（1-based），仅在该文件内查找"""
    records = load_file_records(file_id)
    if 1 <= line_no <= len(records):
        return records[line_no - 1]
    return None


def parse_jsonl(raw: bytes) -> tuple:
    """逐行解析 .jsonl → (记录数组, 非法行数)；空行跳过，非法 / 非记录行计数后跳过"""
    text = raw.decode('utf-8-sig', errors='replace')
    records: list = []
    bad = 0
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            bad += 1
            continue
        if isinstance(obj, dict) and FIELDS['row_data'] in obj:
            records.append(obj)
        else:
            bad += 1
    return records, bad


def human_size(n: int) -> str:
    """字节数 → 展示用体积字符串"""
    return f'{n / 1024:.1f} KB' if n < 1024 * 1024 else f'{n / 1024 / 1024:.1f} MB'


# ---------------------------------------------------------------- 重跑记录（按「文件 + 行号」隔离）


def rerun_key(file_id: str, line_no: int) -> str:
    return f'{file_id}::{line_no}'


def load_reruns(file_id: str, line_no: int) -> list:
    """优先读用户发起的重跑（reruns_state.json），否则用导出的 mock 初始数据"""
    overlay = _read_json('reruns_state', {})
    key = rerun_key(file_id, line_no)
    if key in overlay:
        return overlay[key]
    if file_id in MOCK_FILE_IDS:            # 内置 mock 文件沿用旧的按行号初始数据
        if str(line_no) in overlay:
            return overlay[str(line_no)]
        return MOCK_RERUNS.get(str(line_no), [])
    return []


def save_reruns(file_id: str, line_no: int, runs: list) -> None:
    overlay = _read_json('reruns_state', {})
    overlay[rerun_key(file_id, line_no)] = runs
    _write_json('reruns_state', overlay)


# ---------------------------------------------------------------- 评测计算（语义与 React 版 types.ts 一致）


def get_duration(record: dict) -> float:
    """兼容原始拼写 duraiton 与正确拼写 duration"""
    return record.get('duraiton', record.get('duration', 0)) or 0


def is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def get_passed(ev: dict):
    """final 为数值时 1 → True / 0 → False；文字状态（人工参与）→ None"""
    f = ev.get('final')
    return (f == 1) if is_num(f) else None


def compute_final(relevance, consistency, informativeness, correctness, icon_issue):
    """正向四维度全 1 且图标无问题 → 1；任一异常 → 0；含文字维度 → 继承该文字"""
    dims = [relevance, consistency, informativeness, correctness]
    for d in [*dims, icon_issue]:
        if isinstance(d, str):
            return d
    positive_ok = all(d == 1 for d in dims)
    no_issue = icon_issue == 0
    return 1 if (positive_ok and no_issue) else 0


def format_sec(sec: Any) -> str:
    return f'{float(sec):.2f}s'


def format_ts(iso: str) -> str:
    return iso[:19].replace('T', ' ')


def verdict_at(history: list, i: int, k: str) -> str:
    """事实矩阵格子：第 i 个参考答案对事实 k 的正确性结果（越界 / 缺失 → 未验证）"""
    try:
        h = history[i]
        if h and k in h:
            return h[k].get('正确性结果', '未验证')
    except (IndexError, KeyError, TypeError):
        pass
    return '未验证'


def page_items(page: int, total_pages: int) -> list:
    """页码序列（页数多时折叠为省略号）"""
    if total_pages <= 7:
        return list(range(1, total_pages + 1))
    items: list = [1]
    start = max(2, page - 1)
    end = min(total_pages - 1, page + 1)
    if start > 2:
        items.append('…')
    items.extend(range(start, end + 1))
    if end < total_pages - 1:
        items.append('…')
    items.append(total_pages)
    return items


def diff_align(base: list, run: list) -> list:
    """按 action 名做 LCS 对齐，生成双列展示行 [{left, right}]（缺一侧即新增 / 删除）"""
    n, m = len(base), len(run)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            if base[i]['action'] == run[j]['action']:
                dp[i][j] = dp[i + 1][j + 1] + 1
            else:
                dp[i][j] = max(dp[i + 1][j], dp[i][j + 1])
    rows = []
    i = j = 0
    while i < n and j < m:
        if base[i]['action'] == run[j]['action']:
            rows.append({'left': base[i], 'right': run[j]})
            i += 1
            j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]:
            rows.append({'left': base[i]})
            i += 1
        else:
            rows.append({'right': run[j]})
            j += 1
    while i < n:
        rows.append({'left': base[i]})
        i += 1
    while j < m:
        rows.append({'right': run[j]})
        j += 1
    return rows


def records_url(q: str = '', filter: str = 'all', sort: str = 'default',
                page: int = 1, file: str = '') -> str:
    """记录列表页 URL 构造（保持全部查询参数，含当前文件）"""
    params = {'q': q, 'filter': filter, 'sort': sort, 'page': page}
    if file:
        params['file'] = file
    return '/records?' + urlencode(params)


def jitter(v: float) -> float:
    """数值随机扰动（模拟重跑差异）"""
    return max(0.01, round(v * (0.8 + random.random() * 0.4) * 100) / 100)


def flip(v: Any) -> Any:
    """维度随机翻转（85% 保持原值；文字状态不翻转）"""
    if not is_num(v):
        return v
    return v if random.random() < 0.85 else 1 - v


def _dim_metric(label: str, base_v: Any, run_v: Any, invert=False, strong=False) -> dict:
    """对比页维度指标：提升绿 / 退化红 / 持平灰；文字状态或状态变化蓝"""
    if is_num(base_v) and is_num(run_v):
        improved = run_v < base_v if invert else run_v > base_v
        worsened = run_v > base_v if invert else run_v < base_v
        if improved:
            arrow, text, tone = '↑', '提升', 'text-green-600'
        elif worsened:
            arrow, text, tone = '↓', '退化', 'text-red-600'
        else:
            arrow, text, tone = '＝', '持平', 'text-slate-400'
    elif base_v == run_v:
        arrow, text, tone = '＝', '持平', 'text-sky-600'
    else:
        arrow, text, tone = '⟳', '状态变化', 'text-sky-600'
    return {'label': label, 'base': base_v, 'run': run_v, 'invert': invert,
            'strong': strong, 'arrow': arrow, 'text': text, 'tone': tone}


def _num_metric(label: str, base_v: float, run_v: float, kind: str, fmt='sec') -> dict:
    """对比页数值指标：kind=lower 越小越好 / neutral 中性"""
    diff = run_v - base_v
    arrow = '↑' if diff > 0 else '↓' if diff < 0 else '＝'
    if diff == 0 or kind == 'neutral':
        tone = 'text-slate-400'
    elif (diff < 0) if kind == 'lower' else (diff > 0):
        tone = 'text-green-600'
    else:
        tone = 'text-red-600'
    if diff == 0:
        delta = '持平'
    elif fmt == 'sec':
        delta = f'{diff:+.2f}s'
    else:
        delta = f'{diff:+d}'
    base_str = format_sec(base_v) if fmt == 'sec' else str(base_v)
    run_str = format_sec(run_v) if fmt == 'sec' else str(run_v)
    return {'label': label, 'base_str': base_str, 'run_str': run_str,
            'arrow': arrow, 'delta': delta, 'tone': tone}


# 模板全局函数与常量
templates.env.globals.update({
    'format_sec': format_sec,
    'format_ts': format_ts,
    'get_passed': get_passed,
    'get_duration': get_duration,
    'DIMENSIONS': DIMENSIONS,
    'VERDICT_STYLE': VERDICT_STYLE,
    'records_url': records_url,
    'verdict_at': verdict_at,
})


# ---------------------------------------------------------------- 页面路由


@app.get('/')
async def files_page(request: Request, error: str = ''):
    files = load_files()
    state = load_state()
    return templates.TemplateResponse(request, 'files.html', {
        'files': files,
        'new_id': state.get('new_id', ''),
        'error': error,
    })


@app.post('/upload')
async def upload_file(file: Optional[UploadFile] = File(None)):
    """真实解析上传文件（.jsonl 或内容为 jsonl 的 .json）：每行一个评测记录，
    按文件独立存入 data/uploads/<id>.json"""
    if file is None or not file.filename:
        return RedirectResponse('/?error=' + quote('请先选择一个 .jsonl / .json 文件'), status_code=303)

    name = Path(file.filename).name
    # 允许 .jsonl，也允许扩展名为 .json 但内容实为 jsonl（每行一个 JSON）的文件
    if not name.lower().endswith(('.jsonl', '.json')):
        return RedirectResponse('/?error=' + quote('只支持 .jsonl / .json 格式的文件'), status_code=303)

    raw = await file.read()
    await file.close()
    if not raw.strip():
        return RedirectResponse('/?error=' + quote('文件内容为空'), status_code=303)
    if len(raw) > MAX_UPLOAD_MB * 1024 * 1024:
        return RedirectResponse('/?error=' + quote(f'文件超过 {MAX_UPLOAD_MB}MB 上限'), status_code=303)

    records, bad = parse_jsonl(raw)
    if not records:
        return RedirectResponse('/?error=' + quote(f'未解析出任何评测记录（{bad} 行无法识别）'), status_code=303)

    now = datetime.now()
    file_id = f'f-{int(now.timestamp() * 1000)}'
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with open(UPLOAD_DIR / f'{file_id}.json', 'w', encoding='utf-8') as fh:
        json.dump(records, fh, ensure_ascii=False, indent=2)

    meta = {
        'id': file_id,
        'name': name,
        'recordCount': len(records),
        'uploadedAt': now.strftime('%Y-%m-%d %H:%M'),
        'size': human_size(len(raw)),
    }
    state = load_state()
    state['uploaded'] = [meta] + state.get('uploaded', [])
    state['new_id'] = file_id
    state['current_file_id'] = file_id
    save_state(state)
    return RedirectResponse('/', status_code=303)


@app.get('/records')
async def records_page(request: Request, q: str = '', filter: str = 'all',
                       sort: str = 'default', page: int = 1, file: str = ''):
    # 从文件列表点进来：记住当前文件；记录只取该文件自己的
    current_file = resolve_current_file(file)
    records = load_file_records(current_file['id'])

    rows = []
    for i, r in enumerate(records):
        ev = r.get('final_evaluation', {})
        steps = r.get('steps_traces', [])
        rows.append({
            'line_no': i + 1,
            'query': r['row_data']['query'],
            'steps_count': len(steps),
            'has_failed': any(s.get('status') == 'failed' for s in steps),
            'passed': get_passed(ev),
            'duration': get_duration(r),
        })

    all_count = len(rows)
    passed_count = sum(1 for r in rows if r['passed'] is True)
    failed_count = sum(1 for r in rows if r['passed'] is False)
    manual_count = all_count - passed_count - failed_count

    kw = q.strip().lower()
    if kw:
        rows = [r for r in rows if kw in r['query'].lower()]
    if filter == 'passed':
        rows = [r for r in rows if r['passed'] is True]
    elif filter == 'failed':
        rows = [r for r in rows if r['passed'] is False]
    elif filter == 'manual':
        rows = [r for r in rows if r['passed'] is None]

    if sort == 'duration-desc':
        rows.sort(key=lambda r: r['duration'], reverse=True)
    elif sort == 'duration-asc':
        rows.sort(key=lambda r: r['duration'])

    total = len(rows)
    total_pages = max(1, -(-total // PAGE_SIZE))
    safe_page = min(max(1, page), total_pages)
    paged = rows[(safe_page - 1) * PAGE_SIZE: safe_page * PAGE_SIZE]

    return templates.TemplateResponse(request, 'records.html', {
        'current_file': current_file,
        'rows': paged,
        'all_count': all_count,
        'passed_count': passed_count,
        'failed_count': failed_count,
        'manual_count': manual_count,
        'total': total,
        'total_pages': total_pages,
        'page': safe_page,
        'page_from': (safe_page - 1) * PAGE_SIZE + 1,
        'page_to': min(safe_page * PAGE_SIZE, total),
        'pages': page_items(safe_page, total_pages),
        'q': q,
        'filter': filter,
        'sort': sort,
    })


@app.get('/records/{line_no}')
async def record_detail(request: Request, line_no: int, ref_from: str = 'all', file: str = ''):
    current_file = resolve_current_file(file)
    record = get_record(current_file['id'], line_no)
    if not record:
        return templates.TemplateResponse(request, 'error.html', {
            'message': f'记录不存在（lineNo = {line_no}）',
            'back_url': f"/records?{urlencode({'file': current_file['id']})}",
            'back_label': '← 返回记录列表',
        }, status_code=404)

    ev = record['final_evaluation']
    pd = record.get('process_data') or {}
    steps = record.get('steps_traces', [])
    duration = get_duration(record)
    has_ref_flow = 'fact_decomposition' in pd
    has_ref_answer = 'ref_answer' in record['row_data']
    failed_count = sum(1 for s in steps if s.get('status') == 'failed')

    # 参考答案上下文（业务 B：动态获取流程）
    ref_ctx = None
    gra = pd.get('get_ref_answer')
    if gra:
        methods = [m for m in ('localRAG', 'playskills', 'KG') if m in gra]
        available = pd.get('available_answer') or []
        from_counts: dict = {}
        for a in available:
            from_counts[a['from']] = from_counts.get(a['from'], 0) + 1
        total_count = sum(len(gra[m]) for m in methods)
        ref_ctx = {
            'methods': methods,
            'total': total_count,
            'available': available,
            'shown': [(i, a) for i, a in enumerate(available)
                      if ref_from == 'all' or a['from'] == ref_from],
            'filtered_out': total_count - len(available),
            'from_counts': from_counts,
            'raw_groups': [(m, gra[m]) for m in methods],
            'kept_contents': {a['content'] for a in available},
            'from': ref_from,
        }

    return templates.TemplateResponse(request, 'record_detail.html', {
        'line_no': line_no,
        'record': record,
        'ev': ev,
        'pd': pd,
        'steps': steps,
        'duration': duration,
        'has_ref_flow': has_ref_flow,
        'has_ref_answer': has_ref_answer,
        'failed_count': failed_count,
        'ref_ctx': ref_ctx,
        'ref_from': ref_from,
        'current_file': current_file,
        'reruns': load_reruns(current_file['id'], line_no),
        'default_rerun_config': DEFAULT_RERUN_CONFIG,
    })


@app.post('/api/rerun/{line_no}')
async def start_rerun(line_no: int, config: str = Form(''), file: str = Form('')):
    current_file = resolve_current_file(file)
    record = get_record(current_file['id'], line_no)
    if not record:
        return JSONResponse({'ok': False, 'error': '记录不存在'}, status_code=404)
    run_id = 'run-' + ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=6))
    run = {
        'run_id': run_id,
        'status': 'running',
        'duration': 0,
        'steps_traces': [],
        'created_at': datetime.now().isoformat(),
        'config': config.strip() or None,
    }
    save_reruns(current_file['id'], line_no, [run] + load_reruns(current_file['id'], line_no))
    # 1 秒后模拟完成（running → success，与 React 版 setTimeout 行为一致）
    t = threading.Timer(1.0, _finish_rerun, args=(current_file['id'], line_no, run_id))
    t.daemon = True
    t.start()
    return JSONResponse({'ok': True, 'run_id': run_id})


def _finish_rerun(file_id: str, line_no: int, run_id: str) -> None:
    record = get_record(file_id, line_no)
    if not record:
        return
    ev = record['final_evaluation']
    relevance = flip(ev['relevance'])
    consistency = flip(ev['consistency'])
    informativeness = flip(ev['informativeness'])
    correctness = flip(ev['correctness'])
    icon_issue = flip(ev['icon_issue'])
    runs = load_reruns(file_id, line_no)
    for r in runs:
        if r['run_id'] == run_id:
            r['status'] = 'success'
            r['duration'] = jitter(get_duration(record))
            r['steps_traces'] = [{**s, 'cost': jitter(s['cost'])} for s in record['steps_traces']]
            r['evaluation'] = {
                'relevance': relevance,
                'consistency': consistency,
                'informativeness': informativeness,
                'correctness': correctness,
                'icon_issue': icon_issue,
                'final': compute_final(relevance, consistency, informativeness, correctness, icon_issue),
                'comment': ev['comment'],
            }
    save_reruns(file_id, line_no, runs)


@app.get('/records/{line_no}/compare/{run_id}')
async def compare_page(request: Request, line_no: int, run_id: str, file: str = ''):
    current_file = resolve_current_file(file)
    detail_url = f"/records/{line_no}?{urlencode({'file': current_file['id']})}"
    record = get_record(current_file['id'], line_no)
    run = None
    if record:
        run = next((r for r in load_reruns(current_file['id'], line_no) if r['run_id'] == run_id), None)
    if not record or not run:
        return templates.TemplateResponse(request, 'error.html', {
            'message': f'未找到对比对象（记录 #{line_no} · run {run_id}）',
            'back_url': detail_url, 'back_label': '← 返回记录详情',
        }, status_code=404)
    if not run.get('evaluation'):
        return templates.TemplateResponse(request, 'error.html', {
            'message': '该次重跑仍在运行中，暂无评测结果可对比',
            'back_url': detail_url, 'back_label': '← 返回记录详情',
        })

    base_ev = record['final_evaluation']
    run_ev = run['evaluation']
    dim_metrics = [_dim_metric(d['label'], base_ev[d['key']], run_ev[d['key']],
                               invert=d['invert']) for d in DIMENSIONS]
    dim_metrics.append(_dim_metric('最终评测结果', base_ev['final'], run_ev['final'], strong=True))
    num_metrics = [
        _num_metric('耗时', get_duration(record), run['duration'], 'lower', fmt='sec'),
        _num_metric('步骤数', len(record['steps_traces']), len(run['steps_traces']), 'neutral', fmt='int'),
    ]
    return templates.TemplateResponse(request, 'compare.html', {
        'line_no': line_no,
        'record': record,
        'run': run,
        'current_file': current_file,
        'dim_metrics': dim_metrics,
        'num_metrics': num_metrics,
        'aligned': diff_align(record['steps_traces'], run['steps_traces']),
    })
