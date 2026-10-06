/** 步骤 / 阶段执行状态 */
export type StepStatus = 'success' | 'failed'

/** 单条执行步骤（steps_traces 数组元素） */
export interface StepTrace {
  step: number
  action: string
  status: StepStatus
  cost: number
  timestamp: string
  /** 步骤输入（结构化数据，展开后以 JSON 展示） */
  input?: Record<string, unknown>
  /** 步骤输出（结构化数据，展开后以 JSON 展示） */
  output?: Record<string, unknown>
}

/** 单维度评价值：0 / 1 数值打分，或文字状态（如「人工参与」「人工复核」） */
export type DimensionValue = number | string

/** 最终评测结果：相关性 / 一致性 / 信息量 / 正确性 / 图标相关问题 / 最终评测结果 六维度 */
export interface FinalEvaluation {
  /** 相关性 */
  relevance: DimensionValue
  /** 一致性 */
  consistency: DimensionValue
  /** 信息量 */
  informativeness: DimensionValue
  /** 正确性 */
  correctness: DimensionValue
  /** 图标相关问题（反向维度：1 = 有问题，0 = 无问题） */
  icon_issue: DimensionValue
  /** 最终评测结果：基于前五个维度综合判断 */
  final: DimensionValue
  /** 最终评测原因（整体评语） */
  comment: string
  /** 各维度的评测原因（点击维度徽章查看） */
  dimension_reasons?: {
    relevance?: string
    consistency?: string
    informativeness?: string
    correctness?: string
    icon_issue?: string
  }
}

/** 参考答案（get_ref_answer 各方式结果 / available_answer 的数组元素） */
export interface RefAnswer {
  /** 参考答案文本 */
  content: string
  /** 获取方式：localRAG / playskills / KG */
  from: string
  /** 相关度 / 置信度 */
  score?: number
}

/** 原子事实：fact_decomposition 的 value 结构（未评测初始值，作为输入传给评测模型） */
export interface AtomicFact {
  /** 原子事实内容 */
  原子事实: string
  /** 验证为正确的参考答案编号（available_answer 下标），初始为空 */
  正确: number[]
  /** 验证为错误的参考答案编号，初始为空 */
  错误: number[]
  /** 是否未验证（正确 / 错误均为空时为 true） */
  未验证: boolean
}

/** evaluation_history 数组元素：一次参考答案评测产生的 fact_decomposition 副本，每个事实追加正确性结果 */
export type FactEvaluation = Record<string, AtomicFact & { 正确性结果: string }>

/** process_data：无参考答案业务的正确性评测流程数据（字段按 case 实际环节出现，有参考答案的业务不含这些字段） */
export interface ProcessData {
  /** 环节 1：三种方式获取参考答案（每个 case 使用 1~3 种，结果为数组，元素为 dict） */
  get_ref_answer?: {
    localRAG?: RefAnswer[]
    playskills?: RefAnswer[]
    KG?: RefAnswer[]
  }
  /** 环节 2：筛选后的有效参考答案（下标即参考答案编号） */
  available_answer?: RefAnswer[]
  /** 环节 3：模型回复拆解为原子事实（未评测初始值） */
  fact_decomposition?: Record<string, AtomicFact>
  /** 环节 4：批量正确性评测历史（每个参考答案评测一次，每份为 fact_decomposition + 正确性结果） */
  evaluation_history?: FactEvaluation[]
  /** 环节 5：原子事实评测结果汇总（正确 / 错误回填参考答案编号） */
  evaluation_result?: Record<string, AtomicFact>
}

/** .jsonl 单行记录。注意：duraiton 为原始拼写，读取时兼容 duration */
export interface EvalRecord {
  row_data: {
    id: number
    /** 用户查询 */
    query: string
    /** 意图分类（如「概念解释」「代码生成」） */
    intent?: string
    /** 模型回复 */
    DisplayText: string
    /** 参考答案（有参考答案的业务才有） */
    ref_answer?: string
    /** 数据来源 */
    source: string
  }
  steps_traces: StepTrace[]
  final_evaluation: FinalEvaluation
  /** 原始拼写（保留） */
  duraiton?: number
  /** 兼容字段 */
  duration?: number
  /** token 消耗统计（评测信息展示） */
  token_usage?: {
    prompt: number
    completion: number
    total: number
  }
  process_data: ProcessData
}

/** 读取耗时：兼容原始拼写 duraiton 与正确拼写 duration */
export function getDuration(record: EvalRecord): number {
  return record.duraiton ?? record.duration ?? 0
}

/** 历史重跑状态 */
export type RunStatus = 'success' | 'failed' | 'running'

/** 历史重跑记录 */
export interface RerunRun {
  run_id: string
  status: RunStatus
  /** 五维度评测结果（running 状态下尚未产生） */
  evaluation?: FinalEvaluation
  duration: number
  steps_traces: StepTrace[]
  created_at: string
  config?: string
}

/** 模拟的 .jsonl 文件（文件列表页展示） */
export interface MockFile {
  id: string
  name: string
  recordCount: number
  uploadedAt: string
  size: string
}

/* ---------- 五维度评价值的解析与综合 ---------- */

/** 维度数值化：0 / 1 返回数值，文字状态（人工参与等）返回 null（不打分） */
export function dimScore(v: DimensionValue): number | null {
  return typeof v === 'number' ? v : null
}

/** 图标相关问题归一化：无问题（0）→ 1，有问题（1）→ 0，文字状态返回 null（不打分） */
export function iconIssueScore(v: DimensionValue): number | null {
  return typeof v === 'number' ? 1 - v : null
}

/** 综合分数：正向维度（相关性/一致性/信息量/正确性）与「无图标问题」的平均值；无数值维度返回 null */
export function getScore(ev: FinalEvaluation): number | null {
  const nums = [ev.relevance, ev.consistency, ev.informativeness, ev.correctness]
    .map(dimScore)
    .concat([iconIssueScore(ev.icon_issue)])
    .filter((n): n is number => n !== null)
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
}

/** 最终通过判断：final 为数值时返回 final === 1；文字状态（人工参与）返回 null */
export function getPassed(ev: FinalEvaluation): boolean | null {
  return typeof ev.final === 'number' ? ev.final === 1 : null
}

/**
 * 综合判断最终结果：
 * - 正向四维度全 1 且图标相关问题为 0（无问题）→ 1
 * - 正向任一维度为 0 或图标相关问题为 1（有问题）→ 0
 * - 含文字维度 → 继承该文字（如「人工参与」）
 */
export function computeFinal(
  relevance: DimensionValue,
  consistency: DimensionValue,
  informativeness: DimensionValue,
  correctness: DimensionValue,
  iconIssue: DimensionValue,
): DimensionValue {
  const dims: DimensionValue[] = [relevance, consistency, informativeness, correctness]
  const text = [...dims, iconIssue].find((d) => typeof d === 'string')
  if (text !== undefined) return text
  const positiveOk = dims.every((d) => d === 1)
  const noIconIssue = iconIssue === 0
  return positiveOk && noIconIssue ? 1 : 0
}
