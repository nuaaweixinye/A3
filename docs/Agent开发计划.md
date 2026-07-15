# Agent 二次开发计划

> 基于 A3-test 当前版本，聚焦 **六大资源 Agent** 的功能实现与协同优化
> 借鉴 OpenMAIC 架构思路，保持"个性化私教系统"的产品定位
>
> **负责范围**：DocAgent / QuizAgent / MindmapAgent / VideoAgent / CodeAgent / ReadingAgent
> 以及支撑它们的 `resource-runner`、RAG 检索层、SynthesisAgent、交叉验证等共享模块

---

## 一、总体目标

赛题要求 6 种形式的学习资源，对应 6 个资源 Agent。当前这 6 个 Agent 的**骨架已通**（全部经 `resource-runner` 完成"检索 → 流式生成 → 事实核查"），但存在三个层面的不足：

1. **内容质量不够高** —— Prompt 同质化严重（6 个 Agent 的 System Prompt 仅换了一句话），Mock 输出非常通用
2. **Agent 之间无协同** —— 6 个 Agent 并行执行但彼此不感知，产物之间没有关联
3. **基础设施薄弱** —— 无重试、无超时、无缓存、执行过程不可观测

本计划的改进方向：

1. **六大 Agent 个体能力增强** —— 每个 Agent 的 Prompt 精细化、输出结构化、质量可衡量
2. **六大 Agent 间协同深化** —— Agent 之间从"独立工作"升级为"感知彼此、相互配合"
3. **共享基础设施完善** —— 共享执行器增强、资源缓存、交叉验证、可观测性

---

## 二、共享基础设施（六大 Agent 共用）

### 2.1 Agent 执行引擎增强

**现状**：`resource-runner.ts` 是所有 6 个资源 Agent 的共享运行器，流程为「RAG 检索 → 流式生成 → emit 推送 → factCheck」。但缺少错误处理和超时控制。

**改进**：

**a) 重试机制** ~~已完成~~
- ~~在 `runResourceAgent()` 中增加重试逻辑~~
- ~~指数退避：首次重试等 1s，第二次等 2s，最多 2 次~~
- ~~仅对网络错误/超时重试，模型拒答/内容违规不重试~~
- ~~重试失败后返回带 `error` 标记的降级资源对象（含已生成的部分内容），**不阻塞其他 5 个 Agent**~~

**b) 超时控制** ~~已完成~~
- ~~每个资源 Agent 执行设超时上限（默认 120s），通过 `AbortController` 实现~~
- ~~超时后优雅终止，返回已生成的部分内容（而非全部丢弃）~~
- ~~在 `backend/ai/spark.ts` 的 `streamSpark` 中增加 `signal` 参数~~

**c) JSON 输出鲁棒性**
- 增强 `extractJson()`：处理常见 LLM 输出问题——尾部多余逗号、未闭合引号、markdown 代码块残留
- 对需要结构化字段的 Agent 输出增加 schema 校验（zod）

### 2.2 Agent 配置化与 Prompt 模板化 ~~已完成~~

~~**现状**：6 个 Agent 的 System Prompt 以字符串常量形式写在各自的 `.ts` 文件中。修改 Prompt 需要改代码、重新构建。~~

~~**改进**：~~

- ~~创建 `backend/prompts/` 目录，每个资源 Agent 的 Prompt 放到独立 `.ts` 文件（通过函数参数注入变量值）~~
- ~~`backend/prompts/snippets.ts` 存放共享片段（防幻觉/个性化/引用）~~
- ~~每个 Agent 对应一个 `prompts/xxx.ts`，导出 `SYSTEM_PROMPT` 和 `buildUserPrompt()`~~

~~实际目录结构：~~
```
backend/prompts/
├── snippets.ts                     # 共享 Prompt 片段
├── doc.ts                          # DocAgent Prompt + buildUserPrompt
├── quiz.ts                         # QuizAgent Prompt + buildUserPrompt
├── mindmap.ts                      # MindmapAgent Prompt + buildUserPrompt
├── video.ts                        # VideoAgent Prompt + buildUserPrompt
├── code.ts                         # CodeAgent Prompt + buildUserPrompt + inferLanguage
└── reading.ts                      # ReadingAgent Prompt + buildUserPrompt
```

- ~~在 `resource-runner.ts` 中增加 `loadPromptModule(agentType)` 函数，动态 import 对应 Prompt 模块~~
- ~~各 Agent 文件从"内嵌 Prompt 字符串"简化为薄包装（~10 行），仅调用 `runResourceAgent`~~
- ~~新增 `backend/agents/registry.ts`，统一管理 6 个 Agent 的 temperature/timeout/retryCount~~

### 2.3 检索结果共享（请求级缓存）

**现状**：6 个 Agent 的 topic 通常相同或相近，但每个 Agent 独立调用 `searchKnowledge()`，造成重复检索。

**改进**：
- 在 LangGraph State 中新增 `knowledgeChunks` 通道，同一请求内对相同 topic 复用检索结果
- `resource-runner` 在检索前先检查 state 中是否已有同 topic 的检索结果
- 减少对 ChatDoc API 的重复调用（6 次 → 1 次，当 6 个 Agent 的 topic 相同时）

### 2.4 Agent 可观测性

**现状**：Agent 执行过程无结构化日志，调试靠 `console.log`。

**改进**：
- 在 `resource-runner` 中增加执行日志：开始时间 / 结束时间 / 耗时 / 使用的 model / 是否重试 / 是否超时 / factCheck 分数
- 开发模式下在 SSE 的 `resource` 事件中附加 `debug` 信息
- 不引入独立监控系统，保持轻量

---

## 三、六大资源 Agent 具体改进

### 3.1 DocAgent（讲解文档）

**当前状态**：生成通用 Markdown 文档结构（标题 → 学习目标 → 核心概念 → 典型示例 → 复杂度分析 → 易错提醒 → 小结）。

**改进**：

| 改进点 | 说明 | 状态 |
|--------|------|------|
| **难度分层标注** | ~~每节标题旁标注难度：🟢 初级 / 🟡 中级 / 🔴 高级。根据画像的 `knowledge_level` 决定各节的详略程度~~ | ✅ |
| **视觉型适配** | ~~当 `cognitive_style === "visual"` 时，增加表格/列表/对比图（Mermaid）的比例~~ | ✅ |
| **输出结构约束** | ~~Prompt 中明确要求"必须包含 ≥3 个小节、≥1 个表格、≥1 个代码块或 Mermaid 图"~~ | ✅ |
| **学习目标前置** | ~~文档开头明确列出 3~5 条可衡量的学习目标（如"能够解释数组与链表的区别"），与知识库内容对齐~~ | ✅ |
| **小结强化** | ~~文档末尾小结改为"本节你应掌握"清单形式（要点列表），便于学生自检~~ | ✅ |

### 3.2 QuizAgent（练习题库）

**当前状态**：生成 4~6 道混合题型（单选/填空/简答/编程），每题附答案与解析。

**改进**：

| 改进点 | 说明 | 状态 |
|--------|------|------|
| **难度递进** | ~~题序按难度排列：前 2 题基础（概念记忆）→ 中间 2 题进阶（理解应用）→ 最后 1~2 题综合（分析评价）~~ | ✅ |
| **题型多样性保证** | ~~Prompt 强制要求至少覆盖 3 种题型（单选 + 填空 + 简答），编程题在 `learning_goal === "project"` 时出现~~ | ✅ |
| **错因分析** | ~~每道题的解析中增加"常见错误选项分析"——解释为什么错误选项不对~~ | ✅ |
| **与 DocAgent 联动** | 读取 DocAgent 的摘要，确保题库覆盖 Doc 中标记的"易错点"（需要 AgentContext，见 4.2） | ⬜ |
| **考试模式适配** | ~~当 `learning_goal === "exam"` 时，增加真题风格的题目比例~~ | ✅ |

### 3.3 MindmapAgent（思维导图）

**当前状态**：生成 Markdown 嵌套列表形式的层级结构，由前端 `markmap-lib` 渲染为可视化思维导图。

**改进**：

| 改进点 | 说明 | 状态 |
|--------|------|------|
| **节点标记** | ~~在列表项中添加标记：⭐ 重点 / ⚠️ 易错。Prompt 要求 LLM 根据画像的 `error_patterns` 和知识库内容自动标注~~ | ✅ |
| **层级深度控制** | ~~根据画像的 `knowledge_level` 调整：初学者 2~3 层（先建立主干），进阶者 3~4 层（细化分支）~~ | ✅ |
| **跨主题关联** | ~~最后增加"关联知识"分支，列出与本主题相关的其他知识节点（为拓展阅读提供线索）~~ | ✅ |
| **markmap 兼容性检查** | 非 LLM 规则校验：确保输出是合法的嵌套 Markdown 列表；层级 ≥ 2 层；无断链 | ⬜ |

### 3.4 VideoAgent（教学视频）

**当前状态**：生成 Markdown 分镜脚本（每分镜含旁白 + 内嵌 SVG 动画 + 时长）。前端 `VideoPlayer` 轮播 SVG 并调用浏览器 TTS 朗读旁白。**不生成真正的视频文件**。

**改进**：

| 改进点 | 说明 | 状态 |
|--------|------|------|
| **SVG 动画多样性** | ~~当前 SVG 模板固定（蓝色矩形 + 文字）。Prompt 中增加多种 SVG 布局模板示例：数组/栈/队列的 `rect` 序列动画、树的 `circle`+`line` 递归展开、排序算法的元素交换动画~~ | ✅ |
| **旁白全文显示** | ~~分镜中正在朗读的旁白文字完整显示在字幕区，前端逐字高亮当前朗读进度。Prompt 中强调旁白文字应适合朗读——口语化、连贯、避免特殊符号~~ | ✅ |
| **分镜数自适应** | ~~根据主题复杂度调整分镜数：基础概念 3~4 镜，复杂算法 5~7 镜~~ | ✅ |
| **旁白口语化优化** | ~~Prompt 中增加口语化要求："像老师在黑板前边画边讲，用'我们来看'、'注意这里'、'你可能想问'等自然过渡语"~~ | ✅ |
| **SVG 规范性校验** | 非 LLM 规则检查：viewBox 是否为 `0 0 400 200`、是否含 `<style>` 和 `@keyframes`、是否使用了规定配色 | ⬜ |

### 3.5 CodeAgent（代码实操）

**当前状态**：生成 Python 代码示例 + 注释 + 复杂度分析 + 易错点。

**改进**：

| 改进点 | 说明 | 状态 |
|--------|------|------|
| **多语言支持** | ~~根据主题和场景智能选择语言：**数据结构与算法主题默认使用 C++**；Web/前端使用 JavaScript；数据处理使用 Python。新增 `inferLanguage()` 函数自动判定~~ | ✅ |
| **代码完整性** | ~~直接给出可运行的完整代码（含 `main` 函数或入口），包含必要的 `#include` / `import`，学生复制即可编译运行~~ | ✅ |
| **代码质量检查** | 非 LLM 规则检查：代码块是否使用正确的语言标记、是否包含中文注释、是否有复杂度分析小节 | ⬜ |
| **与 QuizAgent 联动** | 如有编程题，CodeAgent 的示例应与 Quiz 中的编程题形成互补而非重复（需要 AgentContext） | ⬜ |

### 3.6 ReadingAgent（拓展阅读）

**当前状态**：生成 5 条左右的推荐阅读清单，含来源和简短说明。

**改进**：

| 改进点 | 说明 | 状态 |
|--------|------|------|
| **来源结构化** | ~~每条推荐包含：类型（教材/论文/在线资源/工具）、标题、章节/链接、难度、预估阅读时间、推荐理由~~ | ✅ |
| **与 Doc/Mindmap 联动** | 读取 DocAgent 的"学习目标"和"小结"中的关键知识点，以及 MindmapAgent 的"关联知识"分支，生成精准的延伸阅读建议（需要 AgentContext） | ⬜ |
| **分级推荐** | ~~分为"巩固基础"（与当前主题直接相关）、"拓展视野"（跨领域关联）、"深入进阶"（研究级）三个层级~~ | ✅ |
| **知识库来源优先** | ~~Prompt 强调优先引用知识库中已有的文档来源，再建议外部教材/资源~~ | ✅ |

---

## 四、六大 Agent 间协同机制

### 4.1 新增：综合摘要 Agent（SynthesisAgent）

**动机**：6 个资源 Agent 并行产出后，产物之间没有关联整合。学生面对 6 份独立材料，缺乏全局视角——"该先看哪个？它们之间什么关系？"

**设计**：
- 在 LangGraph 图中新增 `synthesis_agent` 节点
- 位置：6 个资源 Agent 全部完成 → **汇聚到 SynthesisAgent** → END
- 输入：所有 6 份 `GeneratedResource` 的 content + 学生学习画像
- 输出：一份"学习导览"（Study Guide），包含：
  - **建议学习顺序**（先看哪个、后看哪个，为什么）
  - **跨资源知识关联**（"文档第 3 节对应题库第 2 题，建议看完文档立即练习"）
  - **重点标注**（结合画像的 error_patterns 和 weak_points）
  - **预估总学习时长**

**LangGraph 图更新**：
```
path_planner
  ├─→ doc_gen ──────┐
  ├─→ quiz_gen ─────┤
  ├─→ mindmap_gen ──┤
  ├─→ video_gen ────┤──→ synthesis_agent → END
  ├─→ code_gen ─────┤
  └─→ reading_gen ──┘
```

- 不带 synthesis 的旧行为保留为可选项（通过请求参数 `enableSynthesis` 控制）
- SynthesisAgent **不调度**任何 Agent，只在生成完成后做**汇总整合**（后处理角色）
- 与 OpenMAIC Director Agent 完全不同——不引入 LLM 决策循环，保持一次性 Pipeline 模式

### 4.2 共享记忆总线（AgentContext）

**动机**：6 个 Agent 并行运行时互不感知。但某些 Agent 的产出对其他 Agent 的内容生成有帮助——例如 Doc 标记了"易错点"，Quiz 应该围绕这些易错点出题。

**设计**：
- 各 Agent 在生成完成后，由 `resource-runner` 提取一份轻量摘要写入 LangGraph State
- 摘要内容：Agent 类型、关键知识点列表、标记的易错点/重点

```typescript
// 在 LangGraph State 中新增
agentContext: Annotation<Record<string, {
  agentType: ResourceType;
  keyPoints: string[];     // 该 Agent 产出的关键知识点
  flags: string[];         // 标记的易错点/重点
}>>({
  reducer: (prev, update) => ({ ...prev, ...update }),
  default: () => ({}),
})
```

- 在 LangGraph 图中，Agent 间的边调整为**先完成的可先写入 context，后启动的可读取已有 context**
- 实现方式：不改变并行 fan-out，而是在 `runResourceAgent` 的 `buildUserPrompt` 阶段注入当前已完成的 Agent 摘要
- 由于 6 个 Agent 是并行的，AgentContext 的可用性取决于执行顺序——这没关系，能读到就读，读不到不影响生成

**协同场景**：

```
DocAgent 产出摘要               QuizAgent 读取
  keyPoints: ["数组定义",         → 出题覆盖"数组定义"和"时间复杂度"
              "时间复杂度"]
  flags: ["下标越界",             → 增加一道关于下标越界的陷阱题
          "动态扩容"]

MindmapAgent 产出摘要            ReadingAgent 读取
  keyPoints: ["栈的应用",         → 推荐"表达式求值"相关阅读材料
              "递归与栈"]
```

### 4.3 跨 Agent 交叉验证

**动机**：当前防幻觉机制（4 层）中，第 3 层 factCheck 仅回查知识库。可增加 Agent 间互相检查作为补充质量保障。

**设计**：
- 在 6 个资源 Agent 全部完成后，可选地运行交叉检查：

**LLM 交叉检查**（针对事实密集型 Agent）：
- DocAgent 的输出 → 由 QuizAgent 视角的 LLM 审视："文档中是否遗漏了应该出题的核心概念？"
- CodeAgent 的输出 → 由 DocAgent 视角的 LLM 审视："代码示例是否正确体现了文档中的核心原理？"

**规则检查**（非 LLM，零成本）：
- MindmapAgent：层级 ≥ 2 层
- VideoAgent：分镜数 ≥ 3 个、SVG viewBox 格式正确
- QuizAgent：题目数 ≥ 4 道、每题都有答案和解析
- CodeAgent：含代码块和复杂度分析
- DocAgent：含 ≥ 1 个表格和 ≥ 1 个代码块/Mermaid 图
- ReadingAgent：推荐条目 ≥ 4 条

- 输出 `crossCheck: { passed: boolean; issues: string[] }`，附在 `GeneratedResource` 上
- 前端卡片展示"🔍 交叉验证"状态

### 4.4 资源生成缓存层

**动机**：同一主题 + 同一画像特征 = 生成结果应可复用。当前每次对话完全重新生成。

**设计**：
- 创建 `backend/agents/cache.ts`
- 缓存 Key = `hash(topic + resourceType + cognitive_style + learning_goal + knowledgeLevelKeys)`
- 缓存存储：内存 Map（开发） + 可选 SQLite（生产）
- 命中时直接返回已有 `GeneratedResource`，跳过 LLM 调用
- 缓存过期：默认 24 小时，画像 `knowledge_level` 大幅变化时主动失效
- SSE 中增加 `resource_cache_hit` 事件，前端展示"♻️ 复用已有资源"

---

## 五、知识库与 RAG 增强（支撑六大 Agent 的检索层）

### 5.1 检索结果结构化

**现状**：`searchKnowledge()` 返回扁平文本列表，所有 Agent 共用同一份检索结果。

**改进**：
- 检索结果增加 `conceptName`、`difficulty` 字段
- 各 Agent 可根据结构化信息做更精准的内容组织
- 在 `resource-runner` 的 `buildUserPrompt` 中按难度排序（先基础后进阶），与画像的 `knowledge_level` 对齐

### 5.2 知识库缺口自动标记

**现状**：检索无结果或分数低时静默降级——Agent 照样生成，但质量下降且无人知晓。

**改进**：
- 当检索结果分数 < 阈值或结果为空时，Agent 在生成内容中显式标注"（当前知识库中暂无此内容，建议查阅教材补充）"
- 同时汇总到 `backend/knowledge/gap-tracker.ts`，记录缺口主题和出现频次
- 暴露 `/api/kb/gaps` 端点供前端管理界面查看

---

## 六、优先排序（聚焦六大资源 Agent）

### P0（必须做，显著影响 Agent 质量和鲁棒性）

| 编号 | 内容 | 涉及文件 |
|------|------|----------|
| ~~P0-1~~ | ~~Agent 执行引擎增强（重试 + 超时 + signal）~~ | ~~`resource-runner.ts`、`spark.ts`~~ | ✅ |
| ~~P0-2~~ | ~~六大 Agent Prompt 精细化（逐个优化 System Prompt）~~ | ~~6 个 Agent 文件 + `prompts/`~~ | ✅ |
| P0-3 | 检索结果共享（请求级去重） | `resource-runner.ts`、`graph.ts` | ⬜ |
| P0-4 | JSON 输出鲁棒性增强 | `spark.ts`（`extractJson`） | ⬜ |
| P0-5 | 非 LLM 规则检查（各 Agent 输出的基本格式校验） | 新增 `quality-check.ts` | ⬜ |

### P1（应该做，提升内容质量和 Agent 协同）

| 编号 | 内容 | 涉及文件 | 状态 |
|------|------|----------|------|
| ~~P1-1~~ | ~~Agent 配置化 + Prompt 模板化（.md 文件管理）~~ | ~~新增 `registry.ts`、`prompts/`~~ | ✅ |
| P1-2 | 共享记忆总线（AgentContext） | `graph.ts`、`resource-runner.ts`、`types/index.ts` | ⬜ |
| P1-3 | 新增 SynthesisAgent（综合摘要） | 新增 `synthesis-agent.ts`、`prompts/synthesis/` | ⬜ |
| P1-4 | 资源缓存层 | 新增 `cache.ts` | ⬜ |
| P1-5 | VideoAgent SVG 动画多样性增强 | `video-agent.ts`、SVG 模板库 | ⬜ |
| ~~P1-6~~ | ~~CodeAgent 多语言支持（C++/Python/JS 自动切换）~~ | ~~`code-agent.ts`~~ | ✅ |

### P2（可以做，锦上添花）

| 编号 | 内容 | 涉及文件 |
|------|------|----------|
| P2-1 | Agent 可观测性（结构化执行日志） | 新增 `logger.ts` |
| P2-2 | 跨 Agent 交叉验证（LLM 部分） | 新增 `cross-check.ts` |
| P2-3 | 知识库缺口检测与标记 | `retriever.ts`、新增 `gap-tracker.ts` |
| P2-4 | 检索结果结构化（conceptName/difficulty） | `retriever.ts`、`spark-kb.ts` |

---

## 七、不改动的范围

以下不属于六大资源 Agent 的开发范围，**不在本计划内**：

- ❌ **PlannerAgent 的资源类型选择逻辑**（`ensureAllTypes` 等）—— 由 Planner 开发者负责。赛题要求 6 种资源，Planner 保证每次调用 6 个 Agent，你只需确保每个 Agent 被调用时产出高质量内容
- ❌ **ProfileAgent（画像构建）**—— 由画像开发者负责
- ❌ **TutorAgent（智能辅导）**—— 由辅导开发者负责
- ❌ **EvalAgent（学习效果评估）**—— 由评估开发者负责
- ❌ **前端 UI 改动** —— 与 Agent 输出格式相关的新增字段（如 `crossCheck`、`agentContext`）需要在 `types/index.ts` 中声明类型，但前端渲染由前端开发者负责
- ❌ **不引入 Director Agent（调度式多智能体）** —— 保持 Pipeline 模式
- ❌ **不引入角色扮演（AI Student/Teacher personas）** —— 保持"私教工具"定位
- ❌ **不引入多 LLM Provider 抽象** —— 赛题要求面向讯飞星火
- ❌ **不生成真正的视频文件** —— VideoAgent 继续输出分镜脚本 + SVG 动画，不做 ffmpeg 渲染
