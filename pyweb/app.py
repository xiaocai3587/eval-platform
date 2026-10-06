# -*- coding: utf-8 -*-
"""评测结果查看器 · Python 版（FastAPI + Jinja2 服务端渲染）

与 React 版（src/，保留不动）功能对齐：
  /                                 文件上传（模拟）/ 文件列表
  /records                          记录列表（搜索 / 筛选 / 排序 / 分页，URL 查询参数驱动）
  /records/{line_no}                记录详情（三栏评测对象 / 事实矩阵 / 任务路径 / 历史重跑）
  /records/{line_no}/compare/{rid}  原始记录 vs 重跑记录对比
  POST /upload                      模拟上传一个 .jsonl 文件
  POST /api/rerun/{line_no}         发起重跑（1 秒后模拟完成）

运行方式见 pyweb/README.md（或项目根 README）。
"""
import json
import random
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlencode

from fastapi import FastAPI, Form, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# ---------------------------------------------------------------- 基础设施

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
PAGE_SIZE = 10
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


# 由 scripts/export_mock.ts 从 React mock 数据导出（只读）
MOCK_FILES: list = _read_json('files', [])
MOCK_RECORDS: list = _read_json('records', [])
MOCK_RERUNS: dict = _read_json('reruns', {})


def load_state() -> dict:
    """会话状态：模拟上传的文件 / 当前选中文件 / 新上传文件高亮 id"""
    return _read_json('state', {'uploaded': [], 'current_file_id': '', 'new_id': ''})


def save_state(state: dict) -> None:
    _write_json('state', state)


def load_files() -> list:
    return load_state().get('uploaded', []) + MOCK_FILES


def get_current_file(files: list) -> dict:
    cid = load_state().get('current_file_id', '')
    for f in files:
        if f['id'] == cid:
            return f
    return files[0]


def get_record(line_no: int) -> Optional[dict]:
    """lineNo = jsonl 行号（1-based）"""
    if 1 <= line_no <= len(MOCK_RECORDS):
        return MOCK_RECORDS[line_no - 1]
    return None


def load_reruns(line_no: int) -> list:
    """优先读用户发起的重跑（reruns_state.json），否则用导出的 mock 初始数据"""
    overlay = _read_json('reruns_state', {})
    key = str(line_no)
    if key in overlay:
        return overlay[key]
    return MOCK_RERUNS.get(key, [])


def save_reruns(line_no: int, runs: list) -> None:
    overlay = _read_json('reruns_state', {})
    overlay[str(line_no)] = runs
    _write_json('reruns_state', overlay)


# ---------------------------------------------------------------- 评测计算（语义与 React 版 types.ts 一致）


def get_duration(record: dict) -> float:
    """兼容原始拼写 duraiton 与正确拼写 duration"""
    return record.get('duraiton', record.get('duration', 0)) or 0


def is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def dim_score(v: Any):
    return v if is_num(v) else None


def icon_issue_score(v: Any):
    return (1 - v) if is_num(v) else None


def get_score(ev: dict):
    """综合分：正向四维度 + 「无图标问题」的平均值；无数值维度返回 None"""
    nums = [dim_score(ev.get(k)) for k in ('relevance', 'consistency', 'informativeness', 'correctness')]
    nums.append(icon_issue_score(ev.get('icon_issue')))
    nums = [n for n in nums if n is not None]
    if not nums:
        return None
    return int(sum(nums) / len(nums) * 100 + 0.5) / 100


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


def format_score(score: Any) -> str:
    return f'{float(score):.2f}'


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


def records_url(q: str = '', filter: str = 'all', sort: str = 'default', page: int = 1) -> str:
    """记录列表页 URL 构造（保持全部查询参数）"""
    params = {'q': q, 'filter': filter, 'sort': sort, 'page': page}
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
    'format_score': format_score,
    'get_score': get_score,
    'get_passed': get_passed,
    'get_duration': get_duration,
    'DIMENSIONS': DIMENSIONS,
    'VERDICT_STYLE': VERDICT_STYLE,
    'records_url': records_url,
    'verdict_at': verdict_at,
})


# ---------------------------------------------------------------- 页面路由


@app.get('/')
async def files_page(request: Request):
    files = load_files()
    state = load_state()
    return templates.TemplateResponse(request, 'files.html', {
        'files': files,
        'new_id': state.get('new_id', ''),
    })


@app.post('/upload')
async def upload_file():
    """模拟上传：生成一个文件记录插到列表顶部（演示环境无真实解析）"""
    state = load_state()
    now = datetime.now()
    f = {
        'id': f"f-{int(now.timestamp() * 1000)}",
        'name': f"eval_upload_{now.strftime('%Y%m%d_%H%M%S')}.jsonl",
        'recordCount': len(MOCK_RECORDS),
        'uploadedAt': now.strftime('%Y-%m-%d %H:%M'),
        'size': f'{random.uniform(10, 50):.1f} KB',
    }
    state['uploaded'] = [f] + state.get('uploaded', [])
    state['new_id'] = f['id']
    save_state(state)
    return RedirectResponse('/', status_code=303)


@app.get('/records')
async def records_page(request: Request, q: str = '', filter: str = 'all',
                       sort: str = 'default', page: int = 1, file: str = ''):
    # 从文件列表点进来：记住当前文件
    if file:
        state = load_state()
        state['current_file_id'] = file
        save_state(state)
    files = load_files()
    current_file = get_current_file(files)

    rows = []
    for i, r in enumerate(MOCK_RECORDS):
        ev = r.get('final_evaluation', {})
        steps = r.get('steps_traces', [])
        rows.append({
            'line_no': i + 1,
            'query': r['row_data']['query'],
            'steps_count': len(steps),
            'has_failed': any(s.get('status') == 'failed' for s in steps),
            'score': get_score(ev),
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

    if sort == 'score-desc':
        rows.sort(key=lambda r: r['score'] if r['score'] is not None else -1, reverse=True)
    elif sort == 'score-asc':
        rows.sort(key=lambda r: r['score'] if r['score'] is not None else -1)
    elif sort == 'duration-desc':
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
async def record_detail(request: Request, line_no: int, ref_from: str = 'all'):
    record = get_record(line_no)
    if not record:
        return templates.TemplateResponse(request, 'error.html', {
            'message': f'记录不存在（lineNo = {line_no}）',
            'back_url': '/records', 'back_label': '← 返回记录列表',
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
        'reruns': load_reruns(line_no),
        'default_rerun_config': DEFAULT_RERUN_CONFIG,
    })


@app.post('/api/rerun/{line_no}')
async def start_rerun(line_no: int, config: str = Form('')):
    record = get_record(line_no)
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
    save_reruns(line_no, [run] + load_reruns(line_no))
    # 1 秒后模拟完成（running → success，与 React 版 setTimeout 行为一致）
    t = threading.Timer(1.0, _finish_rerun, args=(line_no, run_id))
    t.daemon = True
    t.start()
    return JSONResponse({'ok': True, 'run_id': run_id})


def _finish_rerun(line_no: int, run_id: str) -> None:
    record = get_record(line_no)
    if not record:
        return
    ev = record['final_evaluation']
    relevance = flip(ev['relevance'])
    consistency = flip(ev['consistency'])
    informativeness = flip(ev['informativeness'])
    correctness = flip(ev['correctness'])
    icon_issue = flip(ev['icon_issue'])
    runs = load_reruns(line_no)
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
    save_reruns(line_no, runs)


@app.get('/records/{line_no}/compare/{run_id}')
async def compare_page(request: Request, line_no: int, run_id: str):
    record = get_record(line_no)
    run = None
    if record:
        run = next((r for r in load_reruns(line_no) if r['run_id'] == run_id), None)
    if not record or not run:
        return templates.TemplateResponse(request, 'error.html', {
            'message': f'未找到对比对象（记录 #{line_no} · run {run_id}）',
            'back_url': f'/records/{line_no}', 'back_label': '← 返回记录详情',
        }, status_code=404)
    if not run.get('evaluation'):
        return templates.TemplateResponse(request, 'error.html', {
            'message': '该次重跑仍在运行中，暂无评测结果可对比',
            'back_url': f'/records/{line_no}', 'back_label': '← 返回记录详情',
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
        'dim_metrics': dim_metrics,
        'num_metrics': num_metrics,
        'aligned': diff_align(record['steps_traces'], run['steps_traces']),
    })
