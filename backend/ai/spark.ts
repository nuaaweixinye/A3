// 讯飞星火大模型客户端 —— OpenAI 兼容接口
// 出题企业：科大讯飞（赛题硬性要求 AI 辅助工具须选用讯飞相关工具）
//
// 兼容端点：https://spark-api-open.xf-yun.com/v1/chat/completions
// 鉴权：HTTP Header  Authorization: Bearer <SPARK_API_KEY>
//   SPARK_API_KEY 即讯飞开放平台控制台生成的"接口密钥"(APIPassword)
//
// 未配置密钥时自动进入 mock 模式，输出与赛题场景一致的占位内容，
// 保证前端可端到端联调；拿到密钥后填入 .env 即切换为真实调用。

import type { ResourceType } from "@/backend/types";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 分阶段模型路由的"阶段"：画像 / 规划 / 各资源类型 / 辅导 / 评估 */
export type Stage = "profile" | "planner" | ResourceType | "tutor" | "eval";

const DEFAULT_BASE_URL = "https://spark-api-open.xf-yun.com/v1";
const DEFAULT_MODEL = "4.0Ultra";

function baseUrl(): string {
  return process.env.SPARK_BASE_URL || DEFAULT_BASE_URL;
}

export function isMockMode(): boolean {
  return !process.env.SPARK_API_KEY;
}

/** 分阶段模型路由：不同任务阶段使用不同模型（参考 OpenMAIC MODEL_ROUTES 设计） */
function modelForStage(stage: Stage): string {
  let routes: Record<string, string> = {};
  const raw = process.env.MODEL_ROUTES;
  if (raw) {
    try {
      routes = JSON.parse(raw);
    } catch {
      /* 忽略格式错误 */
    }
  }
  return routes[stage] || process.env.SPARK_DEFAULT_MODEL || DEFAULT_MODEL;
}

/**
 * 从可能包含 markdown 代码块/多余文字的模型输出中提取 JSON 对象。
 * 防御性解析：先尝试整体 parse，失败则截取首个 { 到末个 }。
 */
export function extractJson<T = unknown>(text: string): T {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    /* fall through */
  }
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return JSON.parse(cleaned.slice(first, last + 1)) as T;
  }
  throw new Error("无法从模型输出中解析 JSON");
}

interface CallOptions {
  messages: ChatMsg[];
  stage: Stage;
  temperature?: number;
  signal?: AbortSignal;
}

/** 非流式调用：返回完整文本 */
export async function callSpark(opts: CallOptions): Promise<string> {
  if (isMockMode()) {
    return mockResponse(opts);
  }
  const model = modelForStage(opts.stage);
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SPARK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`星火接口错误 ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/** 流式调用：异步生成器，逐 token 产出文本增量 */
export async function* streamSpark(
  opts: CallOptions,
): AsyncGenerator<string, void, unknown> {
  if (isMockMode()) {
    yield* mockStream(mockResponse(opts));
    return;
  }
  const model = modelForStage(opts.stage);
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SPARK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      stream: true,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`星火接口错误 ${res.status}: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch {
        /* 跳过不完整的 SSE 帧 */
      }
    }
  }
}

/* ===================== Mock 模式（无密钥时） ===================== */

async function* mockStream(text: string): AsyncGenerator<string> {
  // 按字符/小段切分，模拟真实流式打字效果
  const chunks = text.match(/[\s\S]{1,6}/g) ?? [text];
  for (const c of chunks) {
    yield c;
    await new Promise((r) => setTimeout(r, 8));
  }
}

function mockResponse(opts: CallOptions): string {
  switch (opts.stage) {
    case "profile":
      return JSON.stringify(mockProfile(), null, 2);
    case "planner":
      return JSON.stringify(mockPlan(), null, 2);
    case "quiz":
      return mockQuiz(extractTopic(opts.messages));
    case "mindmap":
      return mockMindmap(extractTopic(opts.messages));
    case "code":
      return mockCode(extractTopic(opts.messages));
    case "reading":
      return mockReading(extractTopic(opts.messages));
    case "video":
      return mockVideo(extractTopic(opts.messages));
    case "tutor":
      return mockTutor(extractQuestion(opts.messages));
    case "eval":
      return JSON.stringify(mockEval(opts.messages), null, 2);
    case "doc":
    default:
      return mockDoc(extractTopic(opts.messages));
  }
}

/** 从辅导 Prompt 中解析学生提问（tutor-agent 的 user prompt 含【问题】xxx） */
function extractQuestion(messages: ChatMsg[]): string {
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const m = user.match(/【问题】([^\n]*)/);
  if (m && m[1].trim()) return m[1].trim();
  return user.slice(0, 60);
}

/** 从 Prompt 中解析主题（resource-runner 的 user prompt 含【主题】xxx） */
function extractTopic(messages: ChatMsg[]): string {
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const m = user.match(/【主题】([^\n]*)/);
  if (m && m[1].trim()) return m[1].trim();
  return "综合学习";
}

function mockProfile() {
  return {
    knowledge_level: { 基础概念: 30, 核心原理: 20, 实际应用: 25 },
    cognitive_style: "visual",
    error_patterns: ["概念混淆", "细节遗漏"],
    learning_goal: "exam",
    learning_pace: "medium",
    interests: ["理论学习", "实践应用"],
  };
}

function mockPlan() {
  return {
    path_title: "综合学习 · 系统化起步路径",
    estimated_time: "约 4 小时",
    steps: [
      {
        step: 1,
        title: "夯实基础概念",
        description: "从核心定义入手，建立整体认知框架。",
        resource_tasks: [
          { type: "doc", topic: "基础概念入门", reason: "构建认知基础" },
          { type: "quiz", topic: "基础概念练习", reason: "巩固理解" },
        ],
        estimated_minutes: 60,
      },
      {
        step: 2,
        title: "深入核心原理",
        description: "理解关键原理与内在逻辑，掌握分析方法。",
        resource_tasks: [{ type: "doc", topic: "核心原理解析" }],
        estimated_minutes: 50,
      },
      {
        step: 3,
        title: "实践与应用",
        description: "结合实际案例，将理论转化为解决问题的能力。",
        resource_tasks: [
          { type: "doc", topic: "实际应用案例" },
          { type: "code", topic: "动手实践" },
        ],
        estimated_minutes: 90,
      },
    ],
  };
}

function mockDoc(topic: string): string {
  return `# ${topic} · 个性化讲解文档

> 本文档由"文档生成智能体"基于知识库生成（mock 模式），适合视觉型、中等节奏的学习者。

## 学习目标
- 理解 ${topic} 的核心定义与特性
- 掌握典型操作的时间复杂度
- 识别常见易错点

## 核心概念
${topic} 是本课程的关键内容。理解其核心原理有助于建立系统的知识体系，并在实际应用中融会贯通。

> （参考：知识库 · ${topic}）

## 知识要点
| 要点 | 说明 |
| --- | --- |
| 基本定义 | 掌握核心概念与术语 |
| 关键特性 | 理解主要特点与适用场景 |
| 实际应用 | 学会在具体问题中运用 |

## 易错提醒
1. 对基本概念理解不清晰，容易混淆。
2. 实际应用中忽略关键约束条件。
3. 分析问题时遗漏特殊情况。

## 小结
建议结合配套题库进行练习，巩固对 ${topic} 的理解。

---
*（mock 模式输出：填入讯飞星火密钥后，本文档将由星火大模型基于 RAG 检索内容真实生成。）*`;
}

function mockQuiz(topic: string): string {
  return `# ${topic} · 练习题库（mock）

## 一、单选题
**1. 关于 ${topic}，下列说法正确的是？**
- A. ${topic} 只有一种固定的学习方式
- B. ${topic} 的核心概念可以通过多种角度理解
- C. ${topic} 不需要实际练习就能掌握
- D. ${topic} 与其他知识点完全无关

> **答案：B**　**解析：** ${topic} 的核心概念可以从不同角度理解，结合多种学习方式效果更佳。（参考：知识库 · ${topic}）

**2. 学习 ${topic} 时，以下哪种方法最有效？**
- A. 只看理论不做练习　- B. 死记硬背　- C. 理论结合实践　- D. 跳过基础直接进阶

> **答案：C**　**解析：** 理论结合实践是最有效的学习路径。

## 二、填空题
**3.** ${topic} 的核心要素包括 ______ 和 ______。
> **答案：** 基本概念；实际应用

## 三、简答题
**4.** 请简述学习 ${topic} 时需要注意的关键点。
> **参考要点：** 需注意概念理解、原理掌握、实际应用三个层面的平衡。

## 四、综合题
**5.** 请结合所学知识，分析 ${topic} 在实际场景中的应用。
> 提示：从定义出发，结合具体案例展开分析。

---
*（mock 模式：接入星火后由题库智能体真实生成）*`;
}

function mockMindmap(topic: string): string {
  return `# ${topic} · 知识点思维导图（mock）

- ${topic}
  - 基本概念
    - 定义与背景
    - 核心术语
  - 核心原理
    - 关键理论
    - 分析方法
    - 适用条件
  - 实际应用
    - 典型场景
    - 案例分析
  - 常见误区
    - 概念混淆
    - 应用不当
  - 延伸学习
    - 关联知识
    - 进阶方向

---
*（mock 模式：接入星火后由导图智能体真实生成层级结构）*`;
}

function mockCode(topic: string): string {
  return `# ${topic} · 代码实操案例（mock）

## 示例：${topic} 的基本实现

\`\`\`python
# ${topic} 基础演示
def demo():
    # 初始化
    data = [3, 1, 4, 1, 5, 9, 2, 6]
    print("原始数据:", data)

    # 基本操作
    print("元素总数:", len(data))
    print("最大值:", max(data))
    print("最小值:", min(data))

    # 查找
    target = 5
    idx = data.index(target) if target in data else -1
    print(f"值 {target} 的位置: {idx}")

demo()
\`\`\`

## 关键分析
- 初始化：理解数据的基本结构
- 操作：掌握核心方法与流程
- 查找：学会定位特定元素

## 易错点
1. 未处理空数据的情况。
2. 边界索引计算错误。

---
*（mock 模式：接入星火后由代码智能体生成并校验）*`;
}

function mockReading(topic: string): string {
  return `# ${topic} · 拓展阅读清单（mock）

基于课程知识库推荐以下学习材料：

1. **知识库 · ${topic}**　— 本系统的原始课程素材，含核心概念与应用案例。
2. **教材补充**　— 推荐教材中 ${topic} 对应章节，建议精读核心理论。
3. **在线资源**　— 相关公开课 / 教学视频，多角度理解 ${topic}。
4. **真题练习**　— 历年考试中 ${topic} 相关题目，检验掌握程度。
5. **延伸主题**　— 由 ${topic} 衍生的进阶内容，拓展知识广度。

> 说明：真实模式下，阅读智能体会结合 RAG 检索结果给出更精准的来源与章节引用。

---
*（mock 模式输出）*`;
}

function mockVideo(topic: string): string {
  return `# ${topic} · 教学视频分镜脚本（mock）

> 由"视频生成智能体"产出分镜脚本，点击右上角"▶ 语音播放"可用浏览器语音朗读旁白（占位配音；接入讯飞 TTS 后替换）。

## 分镜 1（15s）
- **旁白**：你好，这一节我们来学习 ${topic}。它是这门课程中非常重要的知识点。
- **画面**：标题卡片"${topic}"，背景渐变蓝色。

## 分镜 2（20s）
- **旁白**：首先，我们来理解 ${topic} 的核心概念。它的关键在于把握基本定义和主要特性。
- **画面**：动画演示概念图示，关键词逐一高亮。

## 分镜 3（20s）
- **旁白**：接下来看看它的实际应用。通过具体案例，我们可以更直观地理解 ${topic} 的作用。
- **画面**：案例动画演示，流程步骤依次展开。

## 分镜 4（15s）
- **旁白**：最后提醒大家注意几个常见误区。多做练习，巩固对 ${topic} 的理解吧！
- **画面**：要点以图标列表呈现，结尾出现"练习"按钮。

---
*（mock 模式：接入星火 + 讯飞 TTS 后，分镜与配音将由大模型真实生成）*`;
}

/* ============ 加分项 ④/⑤ 的 mock ============ */

function mockTutor(question: string): string {
  return `**关于：${question}**

根据课程知识库，简要解答如下：

1. **核心要点**：这是一个课程中的常见问题。建议先厘清基本概念，再逐步深入分析。
2. **图解思路**：
   \`\`\`mermaid
   flowchart LR
     A[输入] --> B{判断条件}
     B -- 是 --> C[处理分支1]
     B -- 否 --> D[处理分支2]
     C --> E[输出]
     D --> E
   \`\`\`
3. **示例**：结合具体场景分析，逐步拆解问题。
4. **易错提醒**：注意特殊情况与边界条件的处理。

> （参考：知识库）

---
*（mock 模式：接入星火后由辅导智能体基于 RAG 真实作答）*`;
}

/** mock 评估：从 Prompt 中解析自评掌握度，做真实计算（让闭环演示可信） */
function mockEval(messages: ChatMsg[]): Record<string, unknown> {
  const user = messages.find((m) => m.role === "user")?.content ?? "";
  const mastery: Record<string, number> = {};
  const m = user.match(/【自评掌握度】\s*([\s\S]*?)(?:\n【|\n$|$)/);
  if (m) {
    try {
      const obj = JSON.parse(m[1].trim());
      for (const [k, v] of Object.entries(obj)) {
        mastery[k] = Math.max(0, Math.min(100, Number(v) || 0));
      }
    } catch {
      /* ignore */
    }
  }
  const topics = Object.keys(mastery);
  if (topics.length === 0) {
    mastery["基础概念"] = 55;
    mastery["核心原理"] = 45;
    mastery["实际应用"] = 60;
  }
  const vals = Object.values(mastery);
  const overall = vals.length
    ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    : 50;
  const weak = Object.entries(mastery)
    .filter(([, v]) => v < 60)
    .map(([k]) => k);
  const strong = Object.entries(mastery)
    .filter(([, v]) => v >= 80)
    .map(([k]) => k);
  const trend = overall >= 70 ? "improving" : overall >= 55 ? "steady" : "needs_review";

  const recommendations: string[] = [];
  if (weak.length) {
    recommendations.push(`针对薄弱主题（${weak.join("、")}）回到「学习记录」重看讲解文档与题库。`);
  }
  if (overall < 60) {
    recommendations.push("整体掌握度偏低，建议放慢节奏（learning_pace 调整为 slow）并增加练习。");
  } else {
    recommendations.push("保持当前节奏，尝试代码实操与拓展阅读以巩固。");
  }
  recommendations.push("可进入「智能辅导」对仍不清晰的知识点进行即时追问。");

  return {
    overall_score: overall,
    mastery,
    weak_points: weak,
    strong_points: strong,
    progress_trend: trend,
    recommendations,
    profile_update: { knowledge_level: mastery },
    path_adjustment: {
      action: weak.length ? "review" : overall >= 75 ? "advance" : "steady",
      focus_topics: weak,
      summary: weak.length
        ? `检测到 ${weak.length} 个薄弱主题，建议优先复习。`
        : "各主题掌握均衡，可进入下一阶段。",
    },
  };
}
