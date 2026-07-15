// 智能体 2：路径规划 Agent（PlannerAgent）
// 赛题必做功能 3：个性化学习路径规划与资源推送。
// 输出：一条学习路径 + 本次要生成的资源任务清单（≥5 种类型，供 6 个资源 Agent 并行生成）。

import { callSpark, extractJson, type ChatMsg } from "@/backend/ai/spark";
import { searchKnowledge, formatContext } from "@/backend/knowledge/retriever";
import type {
  LearningPath,
  ResourceType,
  ResourceTask,
  StudentProfile,
} from "@/backend/types";

const SYSTEM_PROMPT = `你是一名学习路径规划专家。根据学生画像、学习需求和课程知识库，规划一条科学、动态的个性化学习路径。
你只能输出严格的 JSON（不要 markdown 代码块、不要解释）。JSON 结构如下：
{
  "path_title": "路径标题",
  "estimated_time": "如 约2.5小时",
  "primary_topic": "本次聚焦的核心主题（简短，用于生成多种资源）",
  "resource_tasks": [
    { "type": "doc|quiz|mindmap|video|code|reading", "topic": "具体主题", "reason": "为何需要" }
  ],
  "steps": [
    {
      "step": 1,
      "title": "步骤标题",
      "description": "本步骤要做什么、为什么",
      "resource_tasks": [ { "type": "...", "topic": "...", "reason": "..." } ],
      "estimated_minutes": 30
    }
  ]
}
规则：
1. primary_topic 要贴合学生最迫切的学习需求。
2. 顶层 resource_tasks 至少包含 5 种不同 type，覆盖 doc/quiz/mindmap/video/code/reading 中的多种。
3. 路径 steps 由浅入深，3~5 步为宜。
4. 根据认知风格(cognitive_style)调整资源类型侧重：visual 多 doc/mindmap，auditory 多 video，kinesthetic 多 code/quiz，reading 多 doc/reading。学习目标 exam 侧重 quiz，project 侧重 code。`;

export interface PlanResult {
  path: LearningPath;
  primaryTopic: string;
  /** 本次要并行生成的资源任务（覆盖全部 6 种类型） */
  resourceTasks: ResourceTask[];
}

const ALL_TYPES: ResourceType[] = [
  "doc",
  "quiz",
  "mindmap",
  "video",
  "code",
  "reading",
];

export async function planPath(
  profile: StudentProfile,
  request: string,
): Promise<PlanResult> {
  const chunks = await searchKnowledge(request, 6);
  const context = formatContext(chunks);

  const userPrompt = `学生画像：
${JSON.stringify(profile)}

知识库相关内容：
"""
${context}
"""

学习需求：
"""
${request}
"""

请输出 JSON（仅 JSON），并确保顶层 resource_tasks 覆盖至少 5 种不同类型。`;

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const raw = await callSpark({ messages, stage: "planner", temperature: 0.5 });
  const parsed = extractJson<PlannerOutput>(raw);

  const path = normalizePath(parsed);
  const primaryTopic =
        (parsed?.primary_topic && String(parsed.primary_topic).trim()) ||
    request.slice(0, 30) ||
    "综合学习";
  const resourceTasks = ensureAllTypes(parsed?.resource_tasks, primaryTopic);

  return { path, primaryTopic, resourceTasks };
}

interface PlannerOutput {
  path_title?: string;
  estimated_time?: string;
  primary_topic?: string;
  resource_tasks?: ResourceTask[];
  steps?: LearningPath["steps"];
}

/** 补全为覆盖全部 6 种资源类型，缺失的用主主题兜底 */
function ensureAllTypes(
  tasks: ResourceTask[] | undefined,
  primaryTopic: string,
): ResourceTask[] {
  const list = Array.isArray(tasks) ? tasks.filter((t) => t && t.type && t.topic) : [];
  const byType = new Map<ResourceType, ResourceTask>();
  for (const t of list) {
    if (!byType.has(t.type)) byType.set(t.type, t);
  }
  for (const type of ALL_TYPES) {
    if (!byType.has(type)) {
      byType.set(type, { type, topic: primaryTopic });
    }
  }
  return ALL_TYPES.map((t) => byType.get(t)!);
}

function normalizePath(p: PlannerOutput | null | undefined): LearningPath {
  const steps = Array.isArray(p?.steps) ? p!.steps : [];
  return {
    path_title: p?.path_title || "个性化学习路径",
    estimated_time: p?.estimated_time || "约 1 小时",
    steps: steps.map((s, i) => ({
      step: i + 1,
      title: s.title || `步骤 ${i + 1}`,
      description: s.description || "",
      resource_tasks: Array.isArray(s.resource_tasks) ? s.resource_tasks : [],
      estimated_minutes: Number(s.estimated_minutes) || 30,
    })),
  };
}
