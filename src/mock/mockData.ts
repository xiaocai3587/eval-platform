/**
 * 本地 Mock 数据
 * - MOCK_FILES  模拟已上传的 .jsonl 文件列表
 * - MOCK_RECORDS 模拟解析后的评测记录（lineNo = 数组下标 + 1）
 * - MOCK_RERUNS  历史重跑记录（挂在第 1 条记录下）
 *
 * 两种评测业务：
 * - 业务 A（有参考答案）：#1 #2 #4 #7 #8 #10，row_data.ref_answer 存在，直接用参考答案参与五维度评测，process_data 无流程字段
 * - 业务 B（无参考答案）：#3 #5 #6 #9 #11 #12 #13，先通过 3 种方式（localRAG / playskills / KG，每个 case 用 1~3 种）
 *   获取参考答案再评测，process_data 记录正确性评测全流程：
 *   ① get_ref_answer        各方式获取的参考答案（数组，元素为 dict）
 *   ② available_answer      筛选后的有效参考答案（下标即参考答案编号）
 *   ③ fact_decomposition    模型回复拆解的原子事实（未评测初始值：正确/错误为空、未验证 true，作为输入传给评测模型）
 *   ④ evaluation_history    批量正确性评测历史（每个参考答案评测一次，每份为 fact_decomposition 副本 + 每个事实的正确性结果）
 *   ⑤ evaluation_result     原子事实评测结果汇总（正确/错误数组回填参考答案编号；两者均空 → 未验证 true）
 *   相关性 / 一致性 / 信息量 / 图标相关问题在其他环节评测，正确性是本流程重点
 *
 * final_evaluation 六维度说明：
 * - relevance 相关性 / consistency 一致性 / informativeness 信息量 / correctness 正确性（正向：1 好 0 差）/
 *   icon_issue 图标相关问题（反向：1 = 有问题，0 = 无问题）：
 *   取值 0 | 1，或文字状态（如「人工参与」「人工复核」）
 * - final 最终评测结果：由前五个维度综合判断 —— 正向四维度全 1 且图标相关问题为 0（无问题）→ 1；
 *   正向任一维度为 0 或图标相关问题为 1（有问题）→ 0；含文字维度 → 继承该文字（转人工），
 *   人工复核完成后也可落回 0 / 1 数值结论（见记录 #10）
 *
 * steps_traces 每步含 input / output 结构化详情（详情页时间线展开后以 JSON 展示）
 */
import type { AtomicFact, EvalRecord, FactEvaluation, MockFile, RefAnswer, RerunRun } from '../types'

/** 模拟已上传的 .jsonl 文件列表（mock：所有文件共用同一份 13 条记录数据集 MOCK_RECORDS） */
export const MOCK_FILES: MockFile[] = [
  { id: 'f-001', name: 'eval_run_20260930_agent_v2.jsonl', recordCount: 13, uploadedAt: '2026-09-30 18:42', size: '63.8 KB' },
  { id: 'f-002', name: 'eval_run_20260928_agent_v1.jsonl', recordCount: 13, uploadedAt: '2026-09-28 20:15', size: '62.1 KB' },
  { id: 'f-003', name: 'eval_math_bench_20260927.jsonl', recordCount: 13, uploadedAt: '2026-09-27 11:08', size: '59.6 KB' },
]

/* ---------- 记录 #13（重载 case）辅助生成：30 条长参考答案 + 原子事实判定规则 ---------- */

/** 5 个原子事实的判定规则：按有效参考答案编号（available_answer 下标）给出正确性结果 */
const R13_FACT_RULES: Array<{ text: string; judge: (refNo: number) => '正确' | '错误' | '未验证' }> = [
  { text: 'HTTP 以明文形式在客户端与服务器之间传输数据，报文可被链路上的中间人窃听或篡改', judge: (i) => (i % 8 === 5 ? '未验证' : '正确') },
  { text: 'HTTPS 在 HTTP 与 TCP 之间加入 TLS 加密层，默认端口为 443', judge: (i) => (i % 10 === 7 ? '未验证' : '正确') },
  { text: 'HTTPS 的握手开销会使页面加载时间增加 50% 以上', judge: (i) => (i % 6 === 1 ? '正确' : '错误') },
  { text: 'HTTPS 先用非对称加密协商会话密钥，之后使用对称加密传输业务数据', judge: (i) => (i % 12 === 9 ? '未验证' : '正确') },
  { text: '浏览器通过校验 CA 签发的 X.509 证书链确认服务器身份，防止中间人伪造', judge: (i) => (i % 6 === 4 ? '未验证' : '正确') },
]

/** localRAG 获取的 14 条长参考答案（含 3 条低相关被筛掉） */
const R13_LOCAL_RAG: RefAnswer[] = [
  { content: 'HTTP（超文本传输协议）是应用层协议，以明文形式在客户端与服务器之间传输请求与响应报文。报文中的 URL、首部、Cookie 与正文均不经任何加密，链路上的任何中间节点（代理、路由器、接入网络）都可以完整读取甚至篡改内容，典型风险包括会话劫持、Cookie 窃取、页面注入与运营商广告插入等。因此 HTTP 适合承载公开无损的资讯内容，不适合传输登录凭证、支付信息等敏感数据。', from: 'localRAG', score: 0.93 },
  { content: 'HTTPS 中 TLS 握手的完整流程：客户端发出 ClientHello，携带支持的 TLS 版本、密码套件与随机数；服务器返回 ServerHello、X.509 证书与密钥交换参数；双方基于 ECDHE 等算法协商出预主密钥，再分别派生出会话密钥；握手结束后进入对称加密的应用数据传输阶段。TLS 1.3 将完整握手压缩到 1-RTT，恢复连接可进一步降为 0-RTT。', from: 'localRAG', score: 0.91 },
  { content: 'HTTPS 的加密体系分为两段：握手阶段使用非对称加密（RSA、ECDHE 等）完成身份认证与会话密钥协商，解决密钥分发问题；协商完成后，业务数据全部改用对称加密（AES-128/256、ChaCha20）传输。这样既借助非对称算法安全地交换密钥，又利用对称算法获得接近明文的传输性能，现代 CPU 的 AES-NI 指令集使对称加解密开销几乎可以忽略。', from: 'localRAG', score: 0.9 },
  { content: '浏览器校验 HTTPS 证书的过程：服务器出示由 CA 签发的 X.509 证书，浏览器沿「根 CA → 中间 CA → 站点证书」逐级验证数字签名，并检查域名匹配、有效期与吊销状态。操作系统与浏览器内置受信任的根 CA 列表，只有能追溯到可信根且未被篡改的证书才会被接受，从而防止中间人伪造服务器身份；证书过期、域名不匹配或签名无效时，浏览器会显示告警并阻断连接。', from: 'localRAG', score: 0.89 },
  { content: '关于 HTTPS 性能的现代实测结论：TLS 1.2 完整握手约增加一次往返与几毫秒的计算开销，TLS 1.3 降至 1-RTT，会话恢复可 0-RTT；配合会话复用、OCSP Stapling 与 HTTP/2 多路复用，HTTPS 的整体延迟开销通常在个位数毫秒量级，相比网络本身的 RTT 几乎可以忽略。Google 与 Mozilla 的大规模实测均表明，全站切换 HTTPS 后页面加载性能没有出现明显下降。', from: 'localRAG', score: 0.92 },
  { content: 'HTTP/2 在主流浏览器中要求基于 HTTPS 部署（通过 TLS 之上的 ALPN 协商）。它引入二进制分帧、头部压缩（HPACK）与多路复用，同一连接可并行承载多个请求而互不阻塞，缓解了 HTTP/1.1 的队头阻塞问题。因此启用 HTTPS 往往同时解锁 HTTP/2 与后续 HTTP/3（QUIC）等现代协议能力，反而带来加载速度与并发性能的收益。', from: 'localRAG', score: 0.86 },
  { content: '默认端口：HTTP 使用 80 端口，HTTPS 使用 443 端口。URL 未显式写端口时浏览器按 scheme 选择默认端口：http://example.com 即访问 80，https://example.com 即访问 443。HTTPS 也可部署在其他端口上，但 443 是防火墙、代理与企业网络普遍放行的标准端口，生产环境几乎都使用默认端口。', from: 'localRAG', score: 0.84 },
  { content: 'TLS 会话复用机制：客户端与服务器可在首次握手后缓存会话参数（会话 ID 或会话票据 Session Ticket），后续连接直接基于缓存恢复会话，跳过完整握手。TLS 1.3 支持 0-RTT 恢复，客户端在第一个往返中即可携带应用数据，显著降低重复访问的延迟；但 0-RTT 数据存在重放风险，应仅用于幂等请求。', from: 'localRAG', score: 0.83 },
  { content: 'HSTS（HTTP 严格传输安全）：服务器通过 Strict-Transport-Security 响应头声明，浏览器在 max-age 指定的有效期内只允许以 HTTPS 访问该站点，并将 http:// 请求自动升级为 https://，防止首次访问或误输入 http 时被降级劫持。配合 preload 预加载列表，域名可在浏览器出厂时内置，进一步消除降级窗口。', from: 'localRAG', score: 0.81 },
  { content: 'HTTPS 页面中的混合内容（Mixed Content）：若 HTML 通过 HTTPS 加载，而页面中的脚本、样式或图片仍以 http:// 引用，即构成混合内容。主动型混合内容（脚本、iframe）会被浏览器直接阻断，被动型（图片等）虽可显示但会削弱地址栏锁形标识的安全语义。迁移 HTTPS 后应将所有子资源统一升级为 https 引用。', from: 'localRAG', score: 0.79 },
  { content: 'SSL/TLS 协议演进：网景公司 1994 年前后推出 SSL 2.0/3.0，IETF 在其基础上标准化为 TLS 1.0（1999）、TLS 1.1（2006）、TLS 1.2（2008）与 TLS 1.3（2018）。SSL 与早期 TLS 因 POODLE、BEAST 等漏洞已被现代浏览器禁用，当前主流是 TLS 1.2 与 TLS 1.3。「HTTPS 使用 SSL 加密」是过时说法，准确表述是 HTTP over TLS。', from: 'localRAG', score: 0.77 },
  { content: '个人博客旧文：小网站没必要上 HTTPS——握手要多好几个往返、证书还要花钱，切换后页面明显变慢，等流量大了再考虑不迟。（观点停留在 2015 年前后的测试数据，未考虑 TLS 1.3 与会话复用）', from: 'localRAG', score: 0.55 },
  { content: '某证书厂商营销软文：不装证书的网站会流失九成客户！立即选购我们的高端证书，一键加速、自动续期、赠送网站体检，限时五折……（正文以产品推销为主，几乎不含可验证的技术细节）', from: 'localRAG', score: 0.48 },
  { content: 'SSH 端口转发教程：使用 ssh -L 8080:localhost:80 把远程服务端口映射到本地，再配合隧道访问内网页面……（主题为 SSH 隧道与端口转发，与 HTTP/HTTPS 协议对比的相关性较低）', from: 'localRAG', score: 0.52 },
]

/** playskills 获取的 8 条长参考答案（含 2 条低相关被筛掉） */
const R13_PLAYSKILLS: RefAnswer[] = [
  { content: '技术选型建议——什么场景必须使用 HTTPS：凡涉及登录、支付、个人信息的站点一律使用 HTTPS；纯静态展示页也建议启用，因为 HTTPS 已成为浏览器「不安全」标注、SEO 排名与 HTTP/2 可用性的基础门槛。内网系统可用自签证书或内部 CA，公开服务使用公共 CA 的免费证书。总体原则：全站默认 HTTPS，例外场景逐个说明。', from: 'playskills', score: 0.88 },
  { content: 'DV / OV / EV 证书的区别：DV（域名验证）只验证域名控制权，签发最快，适合个人与中小站点；OV（组织验证）额外验证申请企业实体，证书主体中包含公司信息；EV（扩展验证）审核最严格，历史上以绿色地址栏为标识。三者的加密强度并无差别，差别在于身份保证等级、审核周期与价格；Let\'s Encrypt 等免费 CA 使 DV 证书成本趋近于零。', from: 'playskills', score: 0.85 },
  { content: 'Let\'s Encrypt 免费证书实践：通过 ACME 协议自动完成域名验证与证书签发，证书有效期 90 天，配合 certbot、acme.sh 等工具可全自动续期。单域名、多域名（SAN）与通配符证书均可免费申请，无需人工审批。它把 HTTPS 的边际成本降到接近于零，是近年全网加密普及最主要的推动力之一。', from: 'playskills', score: 0.83 },
  { content: 'HTTP 迁移 HTTPS 检查清单：① 申请并安装证书，开启 443 端口；② 全站子资源改 https 引用，消除混合内容；③ 配置 301 跳转与 HSTS；④ 更新 sitemap、Canonical 与外部平台链接；⑤ 仅启用 TLS 1.2/1.3 并关闭弱套件；⑥ 观察抓取与收录波动。迁移后保留 80 → 443 跳转至少半年，避免存量链接失效。', from: 'playskills', score: 0.8 },
  { content: 'CDN 与反向代理中的 TLS 终结：常见架构是客户端到 CDN / 负载均衡器之间走 HTTPS，回源链路走 HTTP 或 mTLS。TLS 在边缘节点终结，证书与握手集中管理，减轻源站负担，也便于统一开启 HTTP/2 与 WAF。安全要求高的业务应给回源链路同样启用 mTLS，防止内网明文传输与伪造回源请求。', from: 'playskills', score: 0.78 },
  { content: '内网 mTLS（双向 TLS）：与普通 HTTPS 仅由客户端验证服务器不同，mTLS 要求双向出示证书，服务间调用彼此验证身份，适合零信任架构下的微服务通信。落地要点包括内部 CA 与证书自动轮换、Sidecar（如 Envoy）透明接管 TLS、关闭明文兜底端口等。', from: 'playskills', score: 0.75 },
  { content: '论坛旧帖（2014）：我们站点切 HTTPS 后 P95 响应从 800ms 涨到 1300ms，握手太慢，最后又切回了 HTTP。（个案数据年代久远，未考虑会话复用与现代 TLS 优化，参考价值有限）', from: 'playskills', score: 0.57 },
  { content: 'WebSocket 入门示例：前端 new WebSocket("wss://example.com/socket") 建立长连接，服务端用 ws 库广播消息……（以代码演示为主，与 HTTP/HTTPS 协议对比主题相关性低）', from: 'playskills', score: 0.44 },
]

/** KG 获取的 8 条长参考答案（含 1 条低相关被筛掉） */
const R13_KG: RefAnswer[] = [
  { content: '【知识图谱 · 实体】HTTPS：超文本传输安全协议，URI scheme 为 https，默认端口 443，由 HTTP 与 TLS 组合而成（RFC 2818 定义，随 TLS 版本演进）。提供机密性（对称加密）、完整性（MAC / AEAD）与服务器身份认证（X.509 证书），是万维网保护页面与 API 传输的标准方式。关联实体：HTTP、TLS、CA。', from: 'KG', score: 0.9 },
  { content: '【知识图谱 · 实体】HTTP：超文本传输协议，无状态的应用层协议，默认端口 80（RFC 9110 系列）。报文为可读文本，不提供加密与完整性保护，可被链路窃听或篡改；版本包括 1.0 / 1.1 / 2 / 3。与 HTTPS 的关系：HTTPS = HTTP over TLS，在 HTTP 与 TCP 之间增加 TLS 层。', from: 'KG', score: 0.87 },
  { content: '【知识图谱 · 实体】TLS 1.3：RFC 8446（2018 年发布）。完整握手 1-RTT、会话恢复支持 0-RTT；仅保留 AEAD 加密与具备前向保密的 (EC)DHE 密钥交换，删除 RSA 密钥传输、CBC 套件与压缩等遗留机制。安全性与握手性能显著优于 TLS 1.2，是当前 HTTPS 部署的推荐版本。', from: 'KG', score: 0.86 },
  { content: '【知识图谱 · 实体】X.509 证书与 CA：X.509 定义公钥证书格式（主体、公钥、有效期、签发者、签名算法等字段）；CA（证书颁发机构）作为受信任签发者，通过 PKI 体系构成「根证书 → 中间 CA → 站点证书」的信任链，浏览器以内置根证书库作为信任锚完成逐级校验。', from: 'KG', score: 0.84 },
  { content: '【知识图谱 · 实体】AES-NI：主流 CPU 内置的 AES 指令集扩展，以硬件实现 AES 加解密，使 HTTPS 对称加密吞吐达到每核数 GB/s。加解密不再是 HTTPS 的性能瓶颈，现代服务器的 TLS 开销主要来自握手往返而非数据加密。', from: 'KG', score: 0.82 },
  { content: '【知识图谱 · 实体】HSTS：HTTP 严格传输安全（RFC 6797），响应头 Strict-Transport-Security: max-age=...，浏览器在有效期内强制对该域名使用 HTTPS 并拒绝明文降级；支持 includeSubDomains 与 preload 预加载机制。', from: 'KG', score: 0.76 },
  { content: '【知识图谱 · 实体】HTTPS 与 SEO：主流搜索引擎自 2014 年起将 HTTPS 作为轻量排序信号；浏览器对 HTTP 站点标注「不安全」，且 HTTP/2 及部分 Web 平台能力仅限安全上下文。综合看，HTTPS 对搜索排名与用户信任有正向作用。', from: 'KG', score: 0.74 },
  { content: '【知识图谱 · 实体】超文本：1960 年代 Ted Nelson 提出 Hypertext 概念，1989 年 Tim Berners-Lee 在 CERN 提出 WWW 并设计 HTTP 的前身……（以历史沿革为主，未涉及 HTTP 与 HTTPS 的技术对比）', from: 'KG', score: 0.5 },
]

/** 有效参考答案：三种方式合并后按 score ≥ 0.6 筛选（14 + 8 + 8 = 30 条，筛掉 6 条 → 24 条有效，下标即参考答案编号） */
const R13_AVAILABLE: RefAnswer[] = [...R13_LOCAL_RAG, ...R13_PLAYSKILLS, ...R13_KG].filter((r) => (r.score ?? 0) >= 0.6)

/** fact_decomposition：模型回复拆解的原子事实（未评测初始值） */
const R13_FACT_DECOMPOSITION: Record<string, AtomicFact> = Object.fromEntries(
  R13_FACT_RULES.map((f, i) => [`事实${i + 1}`, { 原子事实: f.text, 正确: [], 错误: [], 未验证: true }] as [string, AtomicFact]),
)

/** evaluation_history：每个有效参考答案评测一次（每份为 fact_decomposition 副本 + 每个事实的正确性结果） */
const R13_HISTORY: FactEvaluation[] = R13_AVAILABLE.map((_, refNo) =>
  Object.fromEntries(
    R13_FACT_RULES.map((f, i) => [
      `事实${i + 1}`,
      { 原子事实: f.text, 正确: [], 错误: [], 未验证: true, 正确性结果: f.judge(refNo) },
    ] as [string, AtomicFact & { 正确性结果: string }]),
  ),
)

/** evaluation_result：正确 / 错误编号回填（验证 89 + 反驳 20 + 未验证 11 = 5 × 24） */
const R13_RESULT: Record<string, AtomicFact> = Object.fromEntries(
  R13_FACT_RULES.map((f, i) => {
    const 正确: number[] = []
    const 错误: number[] = []
    R13_AVAILABLE.forEach((_, refNo) => {
      const verdict = f.judge(refNo)
      if (verdict === '正确') 正确.push(refNo)
      else if (verdict === '错误') 错误.push(refNo)
    })
    return [`事实${i + 1}`, { 原子事实: f.text, 正确, 错误, 未验证: 正确.length === 0 && 错误.length === 0 }] as [string, AtomicFact]
  }),
)

/** 当前文件解析出的评测记录（13 条，覆盖两种业务、六维度 0/1/文字状态、failed 步骤、3~9 步、30 条参考答案重载 case） */
export const MOCK_RECORDS: EvalRecord[] = [
  {
    // 业务 A：有参考答案
    row_data: {
      id: 1,
      query: '什么是机器学习？',
      intent: '概念解释',
      DisplayText: '机器学习是人工智能的一个分支，指让计算机通过数据自动学习规律，并据此进行预测或决策，而无需针对每个任务显式编程的技术。',
      ref_answer: '机器学习（Machine Learning）是人工智能的分支，通过数据训练算法模型，使系统自动学习规律并改进性能，无需显式编程。核心方法包括监督学习、无监督学习与强化学习。',
      source: 'manual',
    },
    steps_traces: [
      { step: 1, action: '解析问题意图', status: 'success', cost: 0.12, timestamp: '2026-09-30T10:00:00Z', input: { query: '什么是机器学习？', lang: 'zh', task_type: 'concept_definition' }, output: { intent: '定义类问题', topic: '机器学习', confidence: 0.97 } },
      { step: 2, action: '检索知识库', status: 'success', cost: 0.35, timestamp: '2026-09-30T10:00:01Z', input: { query: '机器学习 定义 概念', top_k: 5, filters: { source: 'corpus' } }, output: { hits: 5, top_score: 0.92, sources: ['ml_basics.md', 'ai_glossary.md', 'ml_survey.pdf'] } },
      { step: 3, action: '生成候选答案', status: 'success', cost: 0.42, timestamp: '2026-09-30T10:00:02Z', input: { prompt: '基于检索结果，解释什么是机器学习', context_docs: 5, max_tokens: 512 }, output: { draft_tokens: 218, finish_reason: 'stop', preview: '机器学习是人工智能的一个分支……' } },
      { step: 4, action: '事实一致性校验', status: 'success', cost: 0.18, timestamp: '2026-09-30T10:00:03Z', input: { claims: 4, references: 3 }, output: { verified: 4, contradicted: 0, score: 1.0 } },
      { step: 5, action: '格式化输出', status: 'success', cost: 0.16, timestamp: '2026-09-30T10:00:04Z', input: { sections: ['定义', '核心思想'], format: 'markdown' }, output: { format: 'markdown', chars: 356 } },
    ],
    final_evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 1, icon_issue: 0, final: 1, comment: '定义准确、结构清晰，覆盖核心概念', dimension_reasons: { relevance: '问题询问机器学习定义，回复紧扣主题作答', consistency: '回复内部表述一致，无自相矛盾', informativeness: '覆盖定义、学习方式与核心思想，信息量充足', correctness: '4 项原子事实全部经参考答案验证正确', icon_issue: '回复未使用图标字符，不存在渲染问题' } },
    duraiton: 1.23,
    token_usage: { prompt: 862, completion: 421, total: 1283 },
    process_data: {},
  },
  {
    // 业务 A：有参考答案
    row_data: {
      id: 2,
      query: '如何用 Python 实现快速排序算法？',
      intent: '代码生成',
      DisplayText: '选取基准元素将数组分为两部分，递归排序后合并。示例：def quicksort(arr): return arr if len(arr) <= 1 else quicksort([x for x in arr[1:] if x < arr[0]]) + [arr[0]] + quicksort([x for x in arr[1:] if x >= arr[0]])',
      ref_answer: '快速排序：分治思想。选取基准元素 pivot，将数组分为小于和大于基准两部分，递归排序后合并。平均时间复杂度 O(n log n)，最坏 O(n²)。Python 实现可用列表推导式或原地分区（lomuto partition）。',
      source: 'auto',
    },
    steps_traces: [
      { step: 1, action: '识别任务类型', status: 'success', cost: 0.1, timestamp: '2026-09-30T10:00:06Z', input: { query: '如何用 Python 实现快速排序算法？', hints: ['Python', '快速排序'] }, output: { task_type: 'code_generation', language: 'python', framework: null } },
      { step: 2, action: '生成代码草稿', status: 'success', cost: 0.66, timestamp: '2026-09-30T10:00:07Z', input: { prompt: '实现快速排序，附带复杂度说明', max_tokens: 800, temperature: 0.2 }, output: { code_lines: 6, uses_recursion: true, style: 'list_comprehension' } },
      { step: 3, action: '代码沙箱试运行', status: 'success', cost: 0.94, timestamp: '2026-09-30T10:00:08Z', input: { code_hash: 'a3f9c2', test_cases: ['[]', '[3,1,2]', '[5,5,5]', '[1..100]'] }, output: { passed: 4, failed: 0, exec_ms: 42 } },
      { step: 4, action: '输出最终代码', status: 'success', cost: 0.35, timestamp: '2026-09-30T10:00:09Z', input: { format: 'code_block', with_explanation: true }, output: { chars: 412, complexity: '平均 O(n log n)' } },
    ],
    final_evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 1, icon_issue: 0, final: 1, comment: '算法正确，复杂度说明略有缺失', dimension_reasons: { relevance: '回复为所要求的 Python 快速排序实现', consistency: '代码实现与复杂度说明相互一致', informativeness: '实现完整，但平均/最坏复杂度对比说明偏简', correctness: '沙箱 4 组测试用例全部通过', icon_issue: '代码块内无图标字符' } },
    duraiton: 2.05,
    token_usage: { prompt: 1104, completion: 689, total: 1793 },
    process_data: {},
  },
  {
    // 业务 B：无参考答案，3 种方式全用（localRAG + playskills + KG）
    row_data: {
      id: 3,
      query: '今天穿什么衣服合适？',
      intent: '生活建议',
      DisplayText: '（回答未完成）今天天气……建议穿着舒适透气的衣物即可。',
      source: 'auto',
    },
    steps_traces: [
      { step: 1, action: '解析问题意图', status: 'success', cost: 0.11, timestamp: '2026-09-30T10:00:12Z', input: { query: '今天穿什么衣服合适？', lang: 'zh' }, output: { intent: '生活建议', needs: ['天气', '位置'], confidence: 0.88 } },
      { step: 2, action: '查询天气接口', status: 'success', cost: 0.28, timestamp: '2026-09-30T10:00:13Z', input: { city: null, date: '2026-09-30' }, output: { status: 'missing_location', temp_c: null, note: '未提供地理位置，使用默认气候数据' } },
      { step: 3, action: '生成穿衣建议', status: 'failed', cost: 0.48, timestamp: '2026-09-30T10:00:14Z', input: { context: '默认气候数据', style: '简洁建议', max_tokens: 256 }, output: { error: 'context_length_exceeded', truncated: true, partial: '今天天气……' } },
      { step: 4, action: 'get_ref_answer', status: 'success', cost: 0.62, timestamp: '2026-09-30T10:00:15Z', input: { methods: ['localRAG', 'playskills', 'KG'] }, output: { localRAG: 2, playskills: 1, KG: 1, total: 4 } },
      { step: 5, action: 'filter_available_answer', status: 'success', cost: 0.21, timestamp: '2026-09-30T10:00:16Z', input: { total: 4, min_score: 0.6 }, output: { available: 3, filtered: 1 } },
      { step: 6, action: 'fact_decomposition', status: 'success', cost: 0.35, timestamp: '2026-09-30T10:00:17Z', input: { DisplayText: '（回答未完成）今天天气……建议穿着舒适透气的衣物即可。' }, output: { facts: 3 } },
      { step: 7, action: 'evaluate_correctness', status: 'success', cost: 0.94, timestamp: '2026-09-30T10:00:18Z', input: { facts: 3, ref_answers: 3 }, output: { rounds: 3, verified: 5, contradicted: 0, unverified: 4 } },
      { step: 8, action: 'summarize_correctness', status: 'success', cost: 0.18, timestamp: '2026-09-30T10:00:19Z', input: { facts: 3 }, output: { correctness: 1, note: '已验证事实均正确，1 项事实未验证' } },
    ],
    final_evaluation: { relevance: 0, consistency: 1, informativeness: 0, correctness: 1, icon_issue: 0, final: 0, comment: '与问题相关性不足（未结合位置与天气），且生成上下文被截断、信息量有限', dimension_reasons: { relevance: '用户询问当日穿衣建议，回复未结合具体位置与天气数据，相关性不足', consistency: '可见部分内部表述一致', informativeness: '生成上下文超长被截断，仅剩半句建议，信息量严重不足', correctness: '已验证事实（穿着舒适透气衣物的建议）经 2 个参考答案确认正确', icon_issue: '回复无图标字符' } },
    duraiton: 3.17,
    token_usage: { prompt: 1687, completion: 203, total: 1890 },
    process_data: {
      get_ref_answer: {
        localRAG: [
          { content: '春秋季节建议穿长袖 T 恤加薄外套，面料舒适透气。', from: 'localRAG', score: 0.86 },
          { content: '冬季户外穿衣需注重分层保暖，内层排汗中层保暖外层防风。', from: 'localRAG', score: 0.41 },
        ],
        playskills: [{ content: '气温 20°C 以上时适合穿着透气轻便的衣物。', from: 'playskills', score: 0.78 }],
        KG: [{ content: '穿衣建议需结合当日气温、湿度与活动量综合判断。', from: 'KG', score: 0.83 }],
      },
      available_answer: [
        { content: '春秋季节建议穿长袖 T 恤加薄外套，面料舒适透气。', from: 'localRAG', score: 0.86 },
        { content: '气温 20°C 以上时适合穿着透气轻便的衣物。', from: 'playskills', score: 0.78 },
        { content: '穿衣建议需结合当日气温、湿度与活动量综合判断。', from: 'KG', score: 0.83 },
      ],
      fact_decomposition: {
        事实1: { 原子事实: '回答建议穿着舒适透气的衣物', 正确: [], 错误: [], 未验证: true },
        事实2: { 原子事实: '当日天气条件适合户外活动', 正确: [], 错误: [], 未验证: true },
        事实3: { 原子事实: '回答给出了完整的穿搭建议', 正确: [], 错误: [], 未验证: true },
      },
      evaluation_history: [
        {
          事实1: { 原子事实: '回答建议穿着舒适透气的衣物', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: '当日天气条件适合户外活动', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
          事实3: { 原子事实: '回答给出了完整的穿搭建议', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
        },
        {
          事实1: { 原子事实: '回答建议穿着舒适透气的衣物', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: '当日天气条件适合户外活动', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
          事实3: { 原子事实: '回答给出了完整的穿搭建议', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
        },
        {
          事实1: { 原子事实: '回答建议穿着舒适透气的衣物', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: '当日天气条件适合户外活动', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
          事实3: { 原子事实: '回答给出了完整的穿搭建议', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
        },
      ],
      evaluation_result: {
        事实1: { 原子事实: '回答建议穿着舒适透气的衣物', 正确: [0, 1, 2], 错误: [], 未验证: false },
        事实2: { 原子事实: '当日天气条件适合户外活动', 正确: [], 错误: [], 未验证: true },
        事实3: { 原子事实: '回答给出了完整的穿搭建议', 正确: [0, 1], 错误: [], 未验证: false },
      },
    },
  },
  {
    // 业务 A：有参考答案
    row_data: {
      id: 4,
      query: '求解一元二次方程 x² - 5x + 6 = 0',
      intent: '数学计算',
      DisplayText: '因式分解得 (x - 2)(x - 3) = 0，解得 x = 2 或 x = 3。代入验算均成立。',
      ref_answer: 'x² - 5x + 6 = 0，因式分解 (x - 2)(x - 3) = 0，解得 x = 2 或 x = 3。判别式 Δ = 25 - 24 = 1 > 0，有两个不等实根。',
      source: 'manual',
    },
    steps_traces: [
      { step: 1, action: '解析方程结构', status: 'success', cost: 0.09, timestamp: '2026-09-30T10:00:16Z', input: { equation: 'x² - 5x + 6 = 0' }, output: { a: 1, b: -5, c: 6, discriminant: 1 } },
      { step: 2, action: '选择求解方法', status: 'success', cost: 0.21, timestamp: '2026-09-30T10:00:17Z', input: { a: 1, b: -5, c: 6, discriminant: 1 }, output: { method: '因式分解', reason: '判别式为完全平方数' } },
      { step: 3, action: '调用计算工具', status: 'success', cost: 0.44, timestamp: '2026-09-30T10:00:18Z', input: { expr: '(x-2)*(x-3)', tool: 'symbolic_solver' }, output: { roots: [2, 3], verified: true, exec_ms: 8 } },
      { step: 4, action: '校验结果', status: 'success', cost: 0.25, timestamp: '2026-09-30T10:00:19Z', input: { roots: [2, 3], equation: 'x² - 5x + 6 = 0' }, output: { substitution_ok: true, all_passed: true } },
    ],
    final_evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 1, icon_issue: 0, final: 1, comment: '求解过程完整，结果正确', dimension_reasons: { relevance: '直接求解用户给出的一元二次方程', consistency: '求解过程与结论相互印证，代入验算成立', informativeness: '给出因式分解过程、根与验算，信息完整', correctness: 'x=2 与 x=3 均经计算工具验证正确', icon_issue: '回复无图标字符' } },
    duraiton: 1.1,
    token_usage: { prompt: 645, completion: 298, total: 943 },
    process_data: {},
  },
  {
    // 业务 B：无参考答案，2 种方式（localRAG + KG）；主观偏好事实未验证 → 信息量转人工
    row_data: {
      id: 5,
      query: '推荐三部适合周末晚上看的电影',
      intent: '推荐生成',
      DisplayText: '1. 《楚门的世界》——温暖又引人深思；2. 《布达佩斯大饭店》——视觉享受；3. 《心灵奇旅》——治愈放松。',
      source: 'dataset',
    },
    steps_traces: [
      { step: 1, action: '理解偏好', status: 'success', cost: 0.14, timestamp: '2026-09-30T10:00:21Z', input: { query: '推荐三部适合周末晚上看的电影', lang: 'zh' }, output: { genre: null, mood: '轻松 / 治愈', count: 3 } },
      { step: 2, action: '生成推荐列表', status: 'success', cost: 0.52, timestamp: '2026-09-30T10:00:22Z', input: { mood: '轻松', count: 3 }, output: { picked: ['楚门的世界', '布达佩斯大饭店', '心灵奇旅'] } },
      { step: 3, action: 'get_ref_answer', status: 'success', cost: 0.58, timestamp: '2026-09-30T10:00:23Z', input: { methods: ['localRAG', 'KG'] }, output: { localRAG: 2, KG: 2, total: 4 } },
      { step: 4, action: 'filter_available_answer', status: 'success', cost: 0.19, timestamp: '2026-09-30T10:00:24Z', input: { total: 4, min_score: 0.6 }, output: { available: 2, filtered: 2 } },
      { step: 5, action: 'fact_decomposition', status: 'success', cost: 0.33, timestamp: '2026-09-30T10:00:25Z', input: { DisplayText: '推荐三部电影及一句话理由' }, output: { facts: 3 } },
      { step: 6, action: 'evaluate_correctness', status: 'success', cost: 0.71, timestamp: '2026-09-30T10:00:26Z', input: { facts: 3, ref_answers: 2 }, output: { rounds: 2, verified: 3, contradicted: 0, unverified: 3 } },
      { step: 7, action: 'summarize_correctness', status: 'success', cost: 0.16, timestamp: '2026-09-30T10:00:27Z', input: { facts: 3 }, output: { correctness: 1, note: '已验证事实均正确，1 项主观偏好事实未验证' } },
    ],
    // 信息量维度涉及主观偏好 → 文字状态「人工参与」，final 继承该文字
    final_evaluation: { relevance: 1, consistency: 1, informativeness: '人工参与', correctness: 1, icon_issue: 0, final: '人工参与', comment: '推荐基本相关，信息量维度涉及主观偏好，转人工评估', dimension_reasons: { relevance: '推荐的三部电影符合周末观影场景', consistency: '片单与推荐理由表述一致', informativeness: '信息量涉及「是否足够多样 / 深入」的主观偏好，自动评测无法判定，转人工参与', correctness: '片单与一句话理由经参考答案验证正确，主观氛围断言未验证', icon_issue: '回复无图标字符' } },
    duraiton: 2.63,
    token_usage: { prompt: 1276, completion: 542, total: 1818 },
    process_data: {
      get_ref_answer: {
        localRAG: [
          { content: '适合周末观看的治愈系电影：《楚门的世界》《心灵奇旅》《菊次郎的夏天》。', from: 'localRAG', score: 0.82 },
          { content: '经典悬疑片片单：《看不见的客人》《控方证人》。', from: 'localRAG', score: 0.44 },
        ],
        KG: [
          { content: '《布达佩斯大饭店》是韦斯·安德森执导的喜剧片，以对称构图与高饱和色彩著称。', from: 'KG', score: 0.79 },
          { content: '《心灵奇旅》由皮克斯出品，探讨人生意义。', from: 'KG', score: 0.51 },
        ],
      },
      available_answer: [
        { content: '适合周末观看的治愈系电影：《楚门的世界》《心灵奇旅》《菊次郎的夏天》。', from: 'localRAG', score: 0.82 },
        { content: '《布达佩斯大饭店》是韦斯·安德森执导的喜剧片，以对称构图与高饱和色彩著称。', from: 'KG', score: 0.79 },
      ],
      fact_decomposition: {
        事实1: { 原子事实: '回答推荐了《楚门的世界》《布达佩斯大饭店》《心灵奇旅》三部电影', 正确: [], 错误: [], 未验证: true },
        事实2: { 原子事实: '这三部电影均适合周末晚上的轻松氛围', 正确: [], 错误: [], 未验证: true },
        事实3: { 原子事实: '回答为每部电影附带了一句话推荐理由', 正确: [], 错误: [], 未验证: true },
      },
      evaluation_history: [
        {
          事实1: { 原子事实: '回答推荐了《楚门的世界》《布达佩斯大饭店》《心灵奇旅》三部电影', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: '这三部电影均适合周末晚上的轻松氛围', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
          事实3: { 原子事实: '回答为每部电影附带了一句话推荐理由', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
        },
        {
          事实1: { 原子事实: '回答推荐了《楚门的世界》《布达佩斯大饭店》《心灵奇旅》三部电影', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: '这三部电影均适合周末晚上的轻松氛围', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
          事实3: { 原子事实: '回答为每部电影附带了一句话推荐理由', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
        },
      ],
      evaluation_result: {
        事实1: { 原子事实: '回答推荐了《楚门的世界》《布达佩斯大饭店》《心灵奇旅》三部电影', 正确: [0, 1], 错误: [], 未验证: false },
        事实2: { 原子事实: '这三部电影均适合周末晚上的轻松氛围', 正确: [], 错误: [], 未验证: true },
        事实3: { 原子事实: '回答为每部电影附带了一句话推荐理由', 正确: [0], 错误: [], 未验证: false },
      },
    },
  },
  {
    // 业务 B：无参考答案，2 种方式（localRAG + playskills）；事实 2 被参考答案反驳 → 正确性 0
    row_data: {
      id: 6,
      query: '请解释 CAP 定理及其在分布式系统中的取舍',
      intent: '概念解释',
      DisplayText: 'CAP 定理指分布式系统在一致性（C）、可用性（A）、分区容忍性（P）三者中最多同时满足两个……（对 CP/AP 的举例存在概念混淆）',
      source: 'auto',
    },
    steps_traces: [
      { step: 1, action: '解析问题意图', status: 'success', cost: 0.13, timestamp: '2026-09-30T10:00:28Z', input: { query: '请解释 CAP 定理及其在分布式系统中的取舍' }, output: { intent: '概念解释 + 权衡分析', topic: 'CAP theorem' } },
      { step: 2, action: '检索理论文档', status: 'success', cost: 0.46, timestamp: '2026-09-30T10:00:29Z', input: { query: 'CAP 定理 分布式系统 取舍', top_k: 5 }, output: { hits: 5, top_score: 0.94 } },
      { step: 3, action: '一致性示例推导', status: 'failed', cost: 0.87, timestamp: '2026-09-30T10:00:30Z', input: { scenario: 'CP 系统：ZooKeeper', detail_level: '深入' }, output: { error: 'concept_confusion', note: 'CP / AP 示例混淆' } },
      { step: 4, action: 'get_ref_answer', status: 'success', cost: 0.55, timestamp: '2026-09-30T10:00:31Z', input: { methods: ['localRAG', 'playskills'] }, output: { localRAG: 2, playskills: 1, total: 3 } },
      { step: 5, action: 'filter_available_answer', status: 'success', cost: 0.2, timestamp: '2026-09-30T10:00:32Z', input: { total: 3, min_score: 0.6 }, output: { available: 2, filtered: 1 } },
      { step: 6, action: 'fact_decomposition', status: 'success', cost: 0.4, timestamp: '2026-09-30T10:00:33Z', input: { DisplayText: 'CAP 定理解释与 CP/AP 取舍举例' }, output: { facts: 3 } },
      { step: 7, action: 'evaluate_correctness', status: 'success', cost: 1.02, timestamp: '2026-09-30T10:00:34Z', input: { facts: 3, ref_answers: 2 }, output: { rounds: 2, verified: 3, contradicted: 2, unverified: 1 } },
      { step: 8, action: 'summarize_correctness', status: 'success', cost: 0.19, timestamp: '2026-09-30T10:00:35Z', input: { facts: 3 }, output: { correctness: 0, note: '事实 2 被 2 个参考答案反驳' } },
    ],
    final_evaluation: { relevance: 1, consistency: 0, informativeness: 1, correctness: 0, icon_issue: 0, final: 0, comment: '定理表述正确，但 CP/AP 取舍举例有概念性错误，一致性与正确性不通过', dimension_reasons: { relevance: '回复围绕 CAP 定理及其取舍展开，切题', consistency: 'CP/AP 举例与定理表述相互矛盾（前文说最多满足两个，举例却称无需考虑可用性）', informativeness: '覆盖定理定义、取舍分析与系统实例', correctness: '事实「CP 系统在保证一致性时无需考虑可用性」被 2 个参考答案反驳', icon_issue: '回复无图标字符' } },
    duraiton: 3.82,
    token_usage: { prompt: 2103, completion: 876, total: 2979 },
    process_data: {
      get_ref_answer: {
        localRAG: [
          { content: 'CAP 定理：分布式系统在发生网络分区时，一致性（C）与可用性（A）不可兼得，需在 CP 与 AP 间取舍。', from: 'localRAG', score: 0.91 },
          { content: 'BASE 理论是 AP 系统的实践延伸。', from: 'localRAG', score: 0.38 },
        ],
        playskills: [{ content: 'CP 系统（如 ZooKeeper、etcd）保证一致性，分区期间牺牲可用性拒绝部分请求；AP 系统（如 Eureka）保证可用性，允许返回旧数据。', from: 'playskills', score: 0.85 }],
      },
      available_answer: [
        { content: 'CAP 定理：分布式系统在发生网络分区时，一致性（C）与可用性（A）不可兼得，需在 CP 与 AP 间取舍。', from: 'localRAG', score: 0.91 },
        { content: 'CP 系统（如 ZooKeeper、etcd）保证一致性，分区期间牺牲可用性拒绝部分请求；AP 系统（如 Eureka）保证可用性，允许返回旧数据。', from: 'playskills', score: 0.85 },
      ],
      fact_decomposition: {
        事实1: { 原子事实: 'CAP 定理指分布式系统在 C、A、P 三者中最多同时满足两个', 正确: [], 错误: [], 未验证: true },
        事实2: { 原子事实: 'CP 系统在保证一致性时无需考虑可用性', 正确: [], 错误: [], 未验证: true },
        事实3: { 原子事实: 'ZooKeeper 是典型的 CP 系统', 正确: [], 错误: [], 未验证: true },
      },
      evaluation_history: [
        {
          事实1: { 原子事实: 'CAP 定理指分布式系统在 C、A、P 三者中最多同时满足两个', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: 'CP 系统在保证一致性时无需考虑可用性', 正确: [], 错误: [], 未验证: true, 正确性结果: '错误' },
          事实3: { 原子事实: 'ZooKeeper 是典型的 CP 系统', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
        },
        {
          事实1: { 原子事实: 'CAP 定理指分布式系统在 C、A、P 三者中最多同时满足两个', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: 'CP 系统在保证一致性时无需考虑可用性', 正确: [], 错误: [], 未验证: true, 正确性结果: '错误' },
          事实3: { 原子事实: 'ZooKeeper 是典型的 CP 系统', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
        },
      ],
      evaluation_result: {
        事实1: { 原子事实: 'CAP 定理指分布式系统在 C、A、P 三者中最多同时满足两个', 正确: [0, 1], 错误: [], 未验证: false },
        事实2: { 原子事实: 'CP 系统在保证一致性时无需考虑可用性', 正确: [], 错误: [0, 1], 未验证: false },
        事实3: { 原子事实: 'ZooKeeper 是典型的 CP 系统', 正确: [1], 错误: [], 未验证: false },
      },
    },
  },
  {
    // 业务 A：有参考答案
    row_data: {
      id: 7,
      query: '番茄炒蛋怎么做才好吃？',
      intent: '菜谱指导',
      DisplayText: '鸡蛋加少许盐打散，热油快炒至刚凝固盛出；番茄去皮切块，中火炒出沙后倒回鸡蛋，加盐和一点糖提鲜，翻匀出锅。',
      ref_answer: '番茄炒蛋：鸡蛋打散加少许盐，热油快炒至刚凝固盛出；番茄去皮切块，中火炒出沙后倒回鸡蛋，加盐与少量糖提鲜翻匀。关键点：番茄去皮、控制火候、糖提鲜。',
      source: 'dataset',
    },
    steps_traces: [
      { step: 1, action: '识别菜谱任务', status: 'success', cost: 0.1, timestamp: '2026-09-30T10:00:36Z', input: { query: '番茄炒蛋怎么做才好吃？' }, output: { task_type: '菜谱指导', cuisine: '家常菜', difficulty: '简单' } },
      { step: 2, action: '检索菜谱知识', status: 'success', cost: 0.37, timestamp: '2026-09-30T10:00:37Z', input: { query: '番茄炒蛋 技巧 出沙', top_k: 5 }, output: { hits: 5, top_score: 0.91 } },
      { step: 3, action: '整理步骤', status: 'success', cost: 0.42, timestamp: '2026-09-30T10:00:38Z', input: { recipes: 5, dedupe: true }, output: { steps: 5, tips: ['去皮', '加糖提鲜'] } },
      { step: 4, action: '输出做法', status: 'success', cost: 0.28, timestamp: '2026-09-30T10:00:39Z', input: { format: '分步说明', audience: '家庭厨房' }, output: { chars: 142 } },
    ],
    final_evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 1, icon_issue: 0, final: 1, comment: '步骤清晰，火候与调味描述到位', dimension_reasons: { relevance: '回复为所问的番茄炒蛋做法指导', consistency: '步骤先后逻辑一致，无矛盾', informativeness: '含完整步骤、去皮与火候技巧、调味说明', correctness: '做法与参考菜谱一致，关键技巧验证正确', icon_issue: '回复无图标字符' } },
    duraiton: 1.32,
    token_usage: { prompt: 934, completion: 467, total: 1401 },
    process_data: {},
  },
  {
    // 业务 A：有参考答案
    row_data: {
      id: 8,
      query: '什么是量子纠缠？能否通俗解释？',
      intent: '科普解释',
      DisplayText: '量子纠缠指两个（或多个）粒子的量子态彼此关联，无论相距多远，测量其中一个会瞬间确定另一个的测量结果。可以类比一双分居两地的手套……',
      ref_answer: '量子纠缠：多个粒子的量子态相互关联形成纠缠态，测量其中一个粒子会瞬间确定其他关联粒子的状态。注意：纠缠不能用于超光速传递信息。手套类比有助于理解但有其局限。',
      source: 'manual',
    },
    steps_traces: [
      { step: 1, action: '解析问题意图', status: 'success', cost: 0.12, timestamp: '2026-09-30T10:00:42Z', input: { query: '什么是量子纠缠？能否通俗解释？' }, output: { intent: '科普解释', require: '通俗类比', depth: '入门' } },
      { step: 2, action: '检索物理资料', status: 'success', cost: 0.58, timestamp: '2026-09-30T10:00:43Z', input: { query: '量子纠缠 通俗解释 类比', top_k: 8 }, output: { hits: 8, top_score: 0.9 } },
      { step: 3, action: '构建类比', status: 'success', cost: 0.73, timestamp: '2026-09-30T10:00:44Z', input: { candidates: ['分居两地的手套', '抛硬币', '量子骰子'] }, output: { chosen: '分居两地的手套', fit_score: 0.86 } },
      { step: 4, action: '检查科学严谨性', status: 'success', cost: 0.51, timestamp: '2026-09-30T10:00:45Z', input: { claims: 6 }, output: { verified: 5, needs_clarify: 1, clarify_topic: '不能超光速通信' } },
      { step: 5, action: '生成通俗解释', status: 'success', cost: 0.94, timestamp: '2026-09-30T10:00:47Z', input: { analogy: '分居两地的手套', max_tokens: 600 }, output: { tokens: 402, finish_reason: 'stop' } },
      { step: 6, action: '补充常见误解', status: 'success', cost: 0.62, timestamp: '2026-09-30T10:00:48Z', input: { misconceptions: ['纠缠可超光速通信', '测量会破坏纠缠'] }, output: { clarified: 2 } },
      { step: 7, action: '格式化输出', status: 'success', cost: 0.31, timestamp: '2026-09-30T10:00:50Z', input: { format: 'markdown' }, output: { chars: 745 } },
    ],
    final_evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 1, icon_issue: 0, final: 1, comment: '类比基本恰当，但对「不能超光速通信」的澄清不足', dimension_reasons: { relevance: '通俗解释量子纠缠，切合提问要求', consistency: '类比、定义与误解澄清相互一致', informativeness: '含定义、类比与两条常见误解澄清', correctness: '核心概念表述经参考答案验证正确', icon_issue: '回复无图标字符' } },
    duraiton: 4.15,
    token_usage: { prompt: 1898, completion: 1024, total: 2922 },
    process_data: {},
  },
  {
    // 业务 B：无参考答案，仅 1 种方式（localRAG）
    row_data: {
      id: 9,
      query: '计算 123 × 456 + 789 的值',
      intent: '数学计算',
      DisplayText: '123 × 456 = 56088，56088 + 789 = 56877。',
      source: 'seed',
    },
    steps_traces: [
      { step: 1, action: '解析算式', status: 'success', cost: 0.08, timestamp: '2026-09-30T10:00:52Z', input: { expression: '123 × 456 + 789' }, output: { ops: ['×', '+'], precedence_ok: true } },
      { step: 2, action: '调用计算工具', status: 'success', cost: 0.22, timestamp: '2026-09-30T10:00:53Z', input: { expr: '123*456+789', tool: 'calculator' }, output: { result: 56877, exec_ms: 3 } },
      { step: 3, action: 'get_ref_answer', status: 'success', cost: 0.31, timestamp: '2026-09-30T10:00:54Z', input: { methods: ['localRAG'] }, output: { localRAG: 2, total: 2 } },
      { step: 4, action: 'filter_available_answer', status: 'success', cost: 0.12, timestamp: '2026-09-30T10:00:55Z', input: { total: 2, min_score: 0.6 }, output: { available: 1, filtered: 1 } },
      { step: 5, action: 'fact_decomposition', status: 'success', cost: 0.24, timestamp: '2026-09-30T10:00:56Z', input: { DisplayText: '分步计算结果' }, output: { facts: 2 } },
      { step: 6, action: 'evaluate_correctness', status: 'success', cost: 0.42, timestamp: '2026-09-30T10:00:57Z', input: { facts: 2, ref_answers: 1 }, output: { rounds: 1, verified: 2, contradicted: 0, unverified: 0 } },
      { step: 7, action: 'summarize_correctness', status: 'success', cost: 0.11, timestamp: '2026-09-30T10:00:58Z', input: { facts: 2 }, output: { correctness: 1, note: '全部事实验证正确' } },
    ],
    final_evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 1, icon_issue: 0, final: 1, comment: '计算准确，过程简洁', dimension_reasons: { relevance: '直接计算用户给出的算式', consistency: '分步计算前后一致', informativeness: '给出分步计算过程与结果，简洁明确', correctness: '两步计算（乘法与加法）均经参考答案验证正确', icon_issue: '回复无图标字符' } },
    duraiton: 1.5,
    token_usage: { prompt: 512, completion: 156, total: 668 },
    process_data: {
      get_ref_answer: {
        localRAG: [
          { content: '123 × 456 = 56088，56088 + 789 = 56877。', from: 'localRAG', score: 0.95 },
          { content: '近似估算：123 × 456 ≈ 56000，加 789 ≈ 57000。', from: 'localRAG', score: 0.52 },
        ],
      },
      available_answer: [{ content: '123 × 456 = 56088，56088 + 789 = 56877。', from: 'localRAG', score: 0.95 }],
      fact_decomposition: {
        事实1: { 原子事实: '123 × 456 = 56088', 正确: [], 错误: [], 未验证: true },
        事实2: { 原子事实: '56088 + 789 = 56877', 正确: [], 错误: [], 未验证: true },
      },
      evaluation_history: [
        {
          事实1: { 原子事实: '123 × 456 = 56088', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: '56088 + 789 = 56877', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
        },
      ],
      evaluation_result: {
        事实1: { 原子事实: '123 × 456 = 56088', 正确: [0], 错误: [], 未验证: false },
        事实2: { 原子事实: '56088 + 789 = 56877', 正确: [0], 错误: [], 未验证: false },
      },
    },
  },
  {
    // 业务 A：有参考答案
    row_data: {
      id: 10,
      query: '长期久坐腰酸背痛，有什么缓解办法？',
      intent: '健康建议',
      DisplayText: '建议每 45 分钟起身活动 2~3 分钟，工作间隙做猫式伸展、臀桥等动作，平时加强核心训练……（部分建议缺少医学依据标注）',
      ref_answer: '久坐缓解方法：① 每隔 30~60 分钟起身活动 3~5 分钟；② 工作间隙做猫式伸展、臀桥强化核心肌群；③ 调整坐姿与椅背支撑；④ 症状持续需就医排查。以上建议来自职业健康指南。',
      source: 'dataset',
    },
    steps_traces: [
      { step: 1, action: '理解健康咨询', status: 'success', cost: 0.12, timestamp: '2026-09-30T10:00:57Z', input: { query: '长期久坐腰酸背痛，有什么缓解办法？' }, output: { intent: '健康建议', severity: '轻度', domain: '职业健康' } },
      { step: 2, action: '检索医学资料', status: 'failed', cost: 0.66, timestamp: '2026-09-30T10:00:58Z', input: { query: '久坐 腰酸 缓解 循证', top_k: 5, timeout_ms: 500 }, output: { error: 'retrieval_timeout', hits: 0 } },
      { step: 3, action: '基于常识生成建议', status: 'success', cost: 0.44, timestamp: '2026-09-30T10:01:00Z', input: { fallback: '内部常识库', topic: '久坐缓解' }, output: { suggestions: 4, evidence_level: 'low' } },
      { step: 4, action: '添加免责声明', status: 'success', cost: 0.2, timestamp: '2026-09-30T10:01:01Z', input: { risk_level: '健康类内容' }, output: { disclaimer: '本建议不构成医疗诊断，如症状持续请就医' } },
    ],
    // 相关性维度存疑 → 文字状态「人工复核」，人工复核完成后 final 落回数值 1
    final_evaluation: { relevance: '人工复核', consistency: 1, informativeness: 1, correctness: 1, icon_issue: 0, final: 1, comment: '检索失败后降级回答，相关性存疑转人工复核，复核后判定通过', dimension_reasons: { relevance: '医学资料检索超时后降级为常识库回答，证据等级低，相关性存疑转人工复核', consistency: '建议与免责声明表述一致', informativeness: '4 条缓解建议基本覆盖常见场景', correctness: '已验证事实（起身频率、伸展动作）验证正确', icon_issue: '回复无图标字符' } },
    duraiton: 1.48,
    token_usage: { prompt: 1076, completion: 583, total: 1659 },
    process_data: {},
  },
  {
    // 业务 B：无参考答案，2 种方式（playskills + KG）；数据类断言未验证；表格图标乱码 → 图标相关问题 1（有问题）
    row_data: {
      id: 11,
      query: '比较 React 和 Vue 两个框架的优缺点',
      intent: '对比分析',
      DisplayText: 'React：生态庞大、灵活度高、适合大型团队协作；上手曲线较陡。Vue：官方约定优、上手快、单文件组件开发体验好；生态规模略小。可从学习曲线、生态、性能、就业等维度展开……',
      source: 'manual',
    },
    steps_traces: [
      { step: 1, action: '解析比较类问题', status: 'success', cost: 0.13, timestamp: '2026-09-30T10:01:04Z', input: { query: '比较 React 和 Vue 两个框架的优缺点' }, output: { compare_type: '框架对比', subjects: ['React', 'Vue'] } },
      { step: 2, action: '检索双框架资料', status: 'success', cost: 0.64, timestamp: '2026-09-30T10:01:05Z', input: { queries: ['React 优缺点', 'Vue 优缺点'], top_k: 5 }, output: { hits: 10, top_score: 0.88 } },
      { step: 3, action: '生成对比表格', status: 'success', cost: 0.68, timestamp: '2026-09-30T10:01:10Z', input: { rows: 4, format: 'table' }, output: { table_cols: 3, chars: 388, icons: ['⚛', '✅', '❌'] } },
      { step: 4, action: 'get_ref_answer', status: 'success', cost: 0.61, timestamp: '2026-09-30T10:01:11Z', input: { methods: ['playskills', 'KG'] }, output: { playskills: 1, KG: 2, total: 3 } },
      { step: 5, action: 'filter_available_answer', status: 'success', cost: 0.22, timestamp: '2026-09-30T10:01:12Z', input: { total: 3, min_score: 0.6 }, output: { available: 2, filtered: 1 } },
      { step: 6, action: 'fact_decomposition', status: 'success', cost: 0.38, timestamp: '2026-09-30T10:01:13Z', input: { DisplayText: 'React / Vue 对比分析' }, output: { facts: 3 } },
      { step: 7, action: 'evaluate_correctness', status: 'success', cost: 0.86, timestamp: '2026-09-30T10:01:14Z', input: { facts: 3, ref_answers: 2 }, output: { rounds: 2, verified: 4, contradicted: 0, unverified: 2 } },
      { step: 8, action: 'summarize_correctness', status: 'success', cost: 0.17, timestamp: '2026-09-30T10:01:15Z', input: { facts: 3 }, output: { correctness: 1, note: '已验证事实均正确，1 项数据类断言未验证' } },
    ],
    // 其余维度均通过，但对比表格中 ⚛ / ✅ 等图标字符在部分平台渲染为乱码 → 图标相关问题维度 1（有问题）
    final_evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 1, icon_issue: 1, final: 0, comment: '对比维度全面，但表格中使用的图标字符在部分平台渲染为乱码，图标相关问题不通过', dimension_reasons: { relevance: '对比维度切合 React / Vue 框架比较的提问', consistency: '双框架描述与对比表格相互一致', informativeness: '含多维度对比表格与文字分析，信息量充足', correctness: '已验证事实（生态、上手难度等）验证正确，star 数断言无参考答案覆盖未验证', icon_issue: '对比表格中使用的 ⚛ / ✅ / ❌ 图标字符在部分平台渲染为乱码，判定有问题' } },
    duraiton: 3.69,
    token_usage: { prompt: 2245, completion: 1187, total: 3432 },
    process_data: {
      get_ref_answer: {
        playskills: [{ content: 'React 优势：生态庞大（React Native / Next.js）、灵活度高、社区资源丰富；劣势：上手曲线陡、需要自行做技术选型。Vue 优势：官方约定清晰、单文件组件、上手快；劣势：生态规模较小。', from: 'playskills', score: 0.88 }],
        KG: [
          { content: 'React 由 Meta 开源，采用虚拟 DOM 与 JSX；Vue 由尤雨溪创建，提供响应式数据绑定与模板语法。', from: 'KG', score: 0.84 },
          { content: '2025 年前端框架满意度调查：Svelte 位列第一。', from: 'KG', score: 0.47 },
        ],
      },
      available_answer: [
        { content: 'React 优势：生态庞大（React Native / Next.js）、灵活度高、社区资源丰富；劣势：上手曲线陡、需要自行做技术选型。Vue 优势：官方约定清晰、单文件组件、上手快；劣势：生态规模较小。', from: 'playskills', score: 0.88 },
        { content: 'React 由 Meta 开源，采用虚拟 DOM 与 JSX；Vue 由尤雨溪创建，提供响应式数据绑定与模板语法。', from: 'KG', score: 0.84 },
      ],
      fact_decomposition: {
        事实1: { 原子事实: 'React 生态庞大、灵活度高', 正确: [], 错误: [], 未验证: true },
        事实2: { 原子事实: 'Vue 官方约定清晰、上手速度快', 正确: [], 错误: [], 未验证: true },
        事实3: { 原子事实: 'Vue 的 GitHub star 数已超过 React', 正确: [], 错误: [], 未验证: true },
      },
      evaluation_history: [
        {
          事实1: { 原子事实: 'React 生态庞大、灵活度高', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: 'Vue 官方约定清晰、上手速度快', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实3: { 原子事实: 'Vue 的 GitHub star 数已超过 React', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
        },
        {
          事实1: { 原子事实: 'React 生态庞大、灵活度高', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: 'Vue 官方约定清晰、上手速度快', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实3: { 原子事实: 'Vue 的 GitHub star 数已超过 React', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
        },
      ],
      evaluation_result: {
        事实1: { 原子事实: 'React 生态庞大、灵活度高', 正确: [0, 1], 错误: [], 未验证: false },
        事实2: { 原子事实: 'Vue 官方约定清晰、上手速度快', 正确: [0, 1], 错误: [], 未验证: false },
        事实3: { 原子事实: 'Vue 的 GitHub star 数已超过 React', 正确: [], 错误: [], 未验证: true },
      },
    },
  },
  {
    // 业务 B：无参考答案，3 种方式全用；π 第 38 位起的事实被 2 个参考答案反驳 → 正确性 0
    row_data: {
      id: 12,
      query: '圆周率 π 小数点后 50 位分别是多少？',
      intent: '知识检索',
      DisplayText: '3.14159265358979323846264338327950288419716939937...（第 38 位起数字有误）',
      source: 'seed',
    },
    steps_traces: [
      { step: 1, action: '解析问题', status: 'success', cost: 0.09, timestamp: '2026-09-30T10:01:14Z', input: { query: '圆周率 π 小数点后 50 位分别是多少？' }, output: { task_type: '常量检索', precision: 50 } },
      { step: 2, action: '检索常量表', status: 'success', cost: 0.33, timestamp: '2026-09-30T10:01:15Z', input: { constant: 'pi', digits: 50 }, output: { found: true, source: 'math_constants.json', digits_available: 50 } },
      { step: 3, action: '提取位数', status: 'success', cost: 0.51, timestamp: '2026-09-30T10:01:16Z', input: { from: 1, to: 50 }, output: { extracted: 50, checksum_prefix: '3.14159265358979323846' } },
      { step: 4, action: 'get_ref_answer', status: 'success', cost: 0.57, timestamp: '2026-09-30T10:01:17Z', input: { methods: ['localRAG', 'playskills', 'KG'] }, output: { localRAG: 2, playskills: 1, KG: 1, total: 4 } },
      { step: 5, action: 'filter_available_answer', status: 'success', cost: 0.2, timestamp: '2026-09-30T10:01:18Z', input: { total: 4, min_score: 0.6 }, output: { available: 4, filtered: 0 } },
      { step: 6, action: 'fact_decomposition', status: 'success', cost: 0.36, timestamp: '2026-09-30T10:01:19Z', input: { DisplayText: 'π 小数点后 50 位数字' }, output: { facts: 3 } },
      { step: 7, action: 'evaluate_correctness', status: 'success', cost: 1.08, timestamp: '2026-09-30T10:01:20Z', input: { facts: 3, ref_answers: 4 }, output: { rounds: 4, verified: 10, contradicted: 2, unverified: 2 } },
      { step: 8, action: 'summarize_correctness', status: 'success', cost: 0.18, timestamp: '2026-09-30T10:01:21Z', input: { facts: 3 }, output: { correctness: 0, note: '事实 2（第 38~42 位数字）被 2 个参考答案反驳' } },
    ],
    final_evaluation: { relevance: 1, consistency: 0, informativeness: 0, correctness: 0, icon_issue: 0, final: 0, comment: '长数字精度不足，第 38 位起输出错误', dimension_reasons: { relevance: '回复给出了 π 小数点后 50 位数字', consistency: '开头 20 位与末尾数字前后不一致，长数字精度漂移', informativeness: '仅输出数字序列，缺少位数标注与说明', correctness: '第 38~42 位数字「51051」被 2 个参考答案反驳（正确应为 93751）', icon_issue: '回复无图标字符' } },
    duraiton: 3.32,
    token_usage: { prompt: 823, completion: 412, total: 1235 },
    process_data: {
      get_ref_answer: {
        localRAG: [
          { content: 'π 前 50 位：3.14159265358979323846264338327950288419716939937510。', from: 'localRAG', score: 0.93 },
          { content: 'π 是无理数，小数位无限不循环。', from: 'localRAG', score: 0.87 },
        ],
        playskills: [{ content: '高精度 π 值（前 50 位）：3.141592653589793238462643383279502884197169399375105820974944。', from: 'playskills', score: 0.91 }],
        KG: [{ content: '圆周率 π：无理数，常用近似 3.14159265358979323846。', from: 'KG', score: 0.85 }],
      },
      available_answer: [
        { content: 'π 前 50 位：3.14159265358979323846264338327950288419716939937510。', from: 'localRAG', score: 0.93 },
        { content: '高精度 π 值（前 50 位）：3.141592653589793238462643383279502884197169399375105820974944。', from: 'playskills', score: 0.91 },
        { content: 'π 是无理数，小数位无限不循环。', from: 'localRAG', score: 0.87 },
        { content: '圆周率 π：无理数，常用近似 3.14159265358979323846。', from: 'KG', score: 0.85 },
      ],
      fact_decomposition: {
        事实1: { 原子事实: '圆周率 π 是无理数', 正确: [], 错误: [], 未验证: true },
        事实2: { 原子事实: 'π 小数点后第 38~42 位为 51051', 正确: [], 错误: [], 未验证: true },
        事实3: { 原子事实: 'π 小数点后前 10 位为 1415926535', 正确: [], 错误: [], 未验证: true },
      },
      evaluation_history: [
        {
          事实1: { 原子事实: '圆周率 π 是无理数', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: 'π 小数点后第 38~42 位为 51051', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
          事实3: { 原子事实: 'π 小数点后前 10 位为 1415926535', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
        },
        {
          事实1: { 原子事实: '圆周率 π 是无理数', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: 'π 小数点后第 38~42 位为 51051', 正确: [], 错误: [], 未验证: true, 正确性结果: '错误' },
          事实3: { 原子事实: 'π 小数点后前 10 位为 1415926535', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
        },
        {
          事实1: { 原子事实: '圆周率 π 是无理数', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: 'π 小数点后第 38~42 位为 51051', 正确: [], 错误: [], 未验证: true, 正确性结果: '错误' },
          事实3: { 原子事实: 'π 小数点后前 10 位为 1415926535', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
        },
        {
          事实1: { 原子事实: '圆周率 π 是无理数', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
          事实2: { 原子事实: 'π 小数点后第 38~42 位为 51051', 正确: [], 错误: [], 未验证: true, 正确性结果: '未验证' },
          事实3: { 原子事实: 'π 小数点后前 10 位为 1415926535', 正确: [], 错误: [], 未验证: true, 正确性结果: '正确' },
        },
      ],
      evaluation_result: {
        事实1: { 原子事实: '圆周率 π 是无理数', 正确: [0, 1, 2, 3], 错误: [], 未验证: false },
        事实2: { 原子事实: 'π 小数点后第 38~42 位为 51051', 正确: [], 错误: [1, 2], 未验证: false },
        事实3: { 原子事实: 'π 小数点后前 10 位为 1415926535', 正确: [0, 1, 2, 3], 错误: [], 未验证: false },
      },
    },
  },
  {
    // 业务 B（重载 case）：3 种方式获取 30 条长参考答案，筛选后 24 条有效；5 个原子事实中「性能下降 50%」被 20 条反驳 → 正确性 0
    row_data: {
      id: 13,
      query: '详细介绍 HTTP 与 HTTPS 的区别，包括原理、安全性、性能与适用场景',
      intent: '技术科普',
      DisplayText: 'HTTP（超文本传输协议）以明文方式在客户端与服务器之间传输数据，报文可被链路上的中间人直接窃听甚至篡改。HTTPS 则在 HTTP 与 TCP 之间加入 TLS 加密层：连接建立时先通过非对称加密（RSA / ECDHE）协商出会话密钥，之后的业务数据全部使用对称加密（AES）传输，默认端口也从 80 换为 443。服务器需持有 CA 签发的 X.509 证书，浏览器通过校验证书链（根 CA → 中间 CA → 站点证书）确认服务器身份，防止中间人伪造。性能方面，HTTPS 的握手开销会使页面加载时间增加 50% 以上，对低延迟业务影响明显。此外，全面启用 HTTPS 后可进一步获得 HTTP/2 多路复用与 HSTS 强制加密等能力。',
      source: 'auto',
    },
    steps_traces: [
      { step: 1, action: '解析问题意图', status: 'success', cost: 0.14, timestamp: '2026-09-30T10:01:24Z', input: { query: '详细介绍 HTTP 与 HTTPS 的区别，包括原理、安全性、性能与适用场景', lang: 'zh' }, output: { intent: '技术科普', aspects: ['原理', '安全性', '性能', '适用场景'], confidence: 0.95 } },
      { step: 2, action: '检索技术文档', status: 'success', cost: 0.71, timestamp: '2026-09-30T10:01:25Z', input: { query: 'HTTP HTTPS 区别 原理 安全性 性能', top_k: 8 }, output: { hits: 18, top_score: 0.93, sources: ['rfc9110.md', 'rfc8446.md', 'web_fundamentals.md'] } },
      { step: 3, action: '撰写对比回复', status: 'success', cost: 2.86, timestamp: '2026-09-30T10:01:26Z', input: { prompt: '从原理、安全性、性能与适用场景四方面对比 HTTP 与 HTTPS', context_docs: 18, max_tokens: 1024 }, output: { chars: 468, finish_reason: 'stop' } },
      { step: 4, action: 'get_ref_answer', status: 'success', cost: 1.52, timestamp: '2026-09-30T10:01:29Z', input: { methods: ['localRAG', 'playskills', 'KG'] }, output: { localRAG: 14, playskills: 8, KG: 8, total: 30 } },
      { step: 5, action: 'filter_available_answer', status: 'success', cost: 0.43, timestamp: '2026-09-30T10:01:31Z', input: { total: 30, min_score: 0.6 }, output: { available: 24, filtered: 6 } },
      { step: 6, action: 'fact_decomposition', status: 'success', cost: 0.61, timestamp: '2026-09-30T10:01:32Z', input: { DisplayText: 'HTTP 与 HTTPS 四方面对比回复' }, output: { facts: 5 } },
      { step: 7, action: 'evaluate_correctness', status: 'success', cost: 5.87, timestamp: '2026-09-30T10:01:33Z', input: { facts: 5, ref_answers: 24 }, output: { rounds: 24, verified: 89, contradicted: 20, unverified: 11 } },
      { step: 8, action: 'summarize_correctness', status: 'success', cost: 0.21, timestamp: '2026-09-30T10:01:39Z', input: { facts: 5 }, output: { correctness: 0, note: '事实 3（性能下降 50% 以上）被 20 个参考答案反驳' } },
    ],
    final_evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 0, icon_issue: 0, final: 0, comment: '四方面对比完整，但「握手使页面加载时间增加 50% 以上」的断言与主流实测资料相悖，正确性不通过', dimension_reasons: { relevance: '回复围绕 HTTP / HTTPS 的原理、安全性、性能与适用场景展开，切题', consistency: '四个方面的表述相互一致，无自相矛盾', informativeness: '覆盖明文风险、TLS 层、加密协商、证书链与生态能力，信息量充足', correctness: '事实「握手开销使页面加载时间增加 50% 以上」被 20 个参考答案反驳（TLS 1.3 实测开销为毫秒级）', icon_issue: '回复无图标字符' } },
    duraiton: 12.35,
    token_usage: { prompt: 3812, completion: 2154, total: 5966 },
    process_data: {
      get_ref_answer: { localRAG: R13_LOCAL_RAG, playskills: R13_PLAYSKILLS, KG: R13_KG },
      available_answer: R13_AVAILABLE,
      fact_decomposition: R13_FACT_DECOMPOSITION,
      evaluation_history: R13_HISTORY,
      evaluation_result: R13_RESULT,
    },
  },
]

/** 历史重跑记录：key 为记录的 lineNo（挂在第 1 条数据下） */
export const MOCK_RERUNS: Record<number, RerunRun[]> = {
  1: [
    {
      run_id: 'run-a1f3e9',
      status: 'success',
      evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 1, icon_issue: 0, final: 1, comment: '定义准确，结构清晰' },
      duration: 1.45,
      created_at: '2026-09-28T14:32:00Z',
      config: '{"model":"agent-v2","temperature":0.3,"top_k":5}',
      steps_traces: [
        { step: 1, action: '解析问题意图', status: 'success', cost: 0.14, timestamp: '2026-09-28T14:32:00Z', input: { query: '什么是机器学习？', lang: 'zh', task_type: 'concept_definition' }, output: { intent: '定义类问题', topic: '机器学习', confidence: 0.95 } },
        { step: 2, action: '检索知识库', status: 'success', cost: 0.41, timestamp: '2026-09-28T14:32:01Z', input: { query: '机器学习 定义', top_k: 5 }, output: { hits: 4, top_score: 0.9 } },
        { step: 3, action: '生成候选答案', status: 'success', cost: 0.52, timestamp: '2026-09-28T14:32:02Z', input: { prompt: '基于检索结果解释机器学习', context_docs: 4, max_tokens: 512 }, output: { draft_tokens: 205, finish_reason: 'stop' } },
        { step: 4, action: '事实一致性校验', status: 'success', cost: 0.22, timestamp: '2026-09-28T14:32:03Z', input: { claims: 4, references: 2 }, output: { verified: 4, contradicted: 0, score: 1.0 } },
        { step: 5, action: '格式化输出', status: 'success', cost: 0.16, timestamp: '2026-09-28T14:32:04Z', input: { sections: ['定义'], format: 'markdown' }, output: { chars: 341 } },
      ],
    },
    {
      run_id: 'run-b7c2d4',
      status: 'failed',
      // 缺少「事实一致性校验」步骤 → 一致性维度 0
      evaluation: { relevance: 1, consistency: 0, informativeness: 1, correctness: 1, icon_issue: 0, final: 0, comment: '跳过事实一致性校验，一致性维度不通过' },
      duration: 2.13,
      created_at: '2026-09-29T09:18:00Z',
      config: '{"model":"agent-v1","temperature":0.7,"top_k":3}',
      // 与原始记录相比缺少「事实一致性校验」→ 对比页红色高亮（删除步骤）
      steps_traces: [
        { step: 1, action: '解析问题意图', status: 'success', cost: 0.12, timestamp: '2026-09-29T09:18:00Z', input: { query: '什么是机器学习？', lang: 'zh' }, output: { intent: '定义类问题', topic: '机器学习', confidence: 0.96 } },
        { step: 2, action: '检索知识库', status: 'success', cost: 0.46, timestamp: '2026-09-29T09:18:01Z', input: { query: '机器学习', top_k: 3 }, output: { hits: 3, top_score: 0.87 } },
        { step: 3, action: '生成候选答案', status: 'success', cost: 0.85, timestamp: '2026-09-29T09:18:03Z', input: { prompt: '解释机器学习', context_docs: 3, max_tokens: 256, temperature: 0.7 }, output: { draft_tokens: 160, finish_reason: 'stop', creativity_bias: true } },
        { step: 4, action: '格式化输出', status: 'success', cost: 0.2, timestamp: '2026-09-29T09:18:04Z', input: { format: 'plain' }, output: { chars: 288 } },
      ],
    },
    {
      run_id: 'run-c9e8f1',
      status: 'success',
      evaluation: { relevance: 1, consistency: 1, informativeness: 1, correctness: 1, icon_issue: 0, final: 1, comment: '新增引用来源核对，各维度均通过' },
      duration: 1.05,
      created_at: '2026-09-30T16:45:00Z',
      config: '{"model":"agent-v2","temperature":0.2,"top_k":8}',
      // 与原始记录相比新增「引用来源核对」→ 对比页绿色高亮（新增步骤）
      steps_traces: [
        { step: 1, action: '解析问题意图', status: 'success', cost: 0.1, timestamp: '2026-09-30T16:45:00Z', input: { query: '什么是机器学习？', lang: 'zh', task_type: 'concept_definition' }, output: { intent: '定义类问题', topic: '机器学习', confidence: 0.98 } },
        { step: 2, action: '检索知识库', status: 'success', cost: 0.3, timestamp: '2026-09-30T16:45:01Z', input: { query: '机器学习 定义 概念', top_k: 8 }, output: { hits: 8, top_score: 0.95 } },
        { step: 3, action: '生成候选答案', status: 'success', cost: 0.38, timestamp: '2026-09-30T16:45:02Z', input: { prompt: '基于检索结果，解释什么是机器学习并标注引用', context_docs: 8, max_tokens: 512 }, output: { draft_tokens: 230, finish_reason: 'stop', citations: 3 } },
        { step: 4, action: '引用来源核对', status: 'success', cost: 0.15, timestamp: '2026-09-30T16:45:03Z', input: { citations: 3, sources: ['ml_basics.md', 'ai_glossary.md', 'ml_survey.pdf'] }, output: { matched: 3, broken: 0 } },
        { step: 5, action: '事实一致性校验', status: 'success', cost: 0.17, timestamp: '2026-09-30T16:45:03Z', input: { claims: 5, references: 3 }, output: { verified: 5, contradicted: 0, score: 1.0 } },
        { step: 6, action: '格式化输出', status: 'success', cost: 0.12, timestamp: '2026-09-30T16:45:04Z', input: { sections: ['定义', '核心思想', '参考'], format: 'markdown' }, output: { chars: 402 } },
      ],
    },
  ],
}

/** 按 lineNo（1-based）取记录 */
export function getRecordByLineNo(lineNo: number): EvalRecord | undefined {
  return MOCK_RECORDS[lineNo - 1]
}

/** 取某条记录的历史重跑列表 */
export function getRerunsOf(lineNo: number): RerunRun[] {
  return MOCK_RERUNS[lineNo] ?? []
}
