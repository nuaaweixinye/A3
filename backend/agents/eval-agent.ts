// 智能体 · 学习效果评估 Agent（EvalAgent）—— 加分项 ⑤
// 输入：画像 + 自评掌握度 + 浏览行为。输出：多维度评估 + 画像回写 + 路径调整建议（闭环）。

import { callSpark, extractJson, type ChatMsg } from "@/backend/ai/spark";
import type {
  EvaluationResult,
  ProgressTrend,
  StudentProfile,
  TopicProgress,
} from "@/backend/types";

const SYSTEM_PROMPT = `你是学习效果评估专家。基于学生的学习画像、自评掌握度与浏览行为，做多维度评估，并给出画像回写与路径调整建议。
只输出严格的 JSON（不要 markdown 代码块、不要解释）。结构：
{
  "overall_score": 0到100的整数,
  "mastery": {"主题": 0到100},
  "weak_points": ["掌握不足的主题"],
  "strong_points": ["掌握扎实的主题"],
  "progress_trend": "improving" | "steady" | "needs_review",
  "recommendations": ["具体可执行的建议"],
  "profile_update": { "knowledge_level": {"主题": 0到100} },
  "path_adjustment": {
    "action": "advance" | "review" | "steady",
    "focus_topics": ["需重点复习的主题"],
    "summary": "一句话总结"
  }
}
规则：
1. overall_score 取各主题掌握度的（必要时按重要性加权）平均。
2. mastery < 60 归入 weak_points；>= 80 归入 strong_points。
3. profile_update.knowledge_level 用评估后的掌握度回写（形成"评估→画像"回路）。
4. 存在弱点时 action 为 review 且 focus_topics 列出弱点；整体优秀(>=75)时 advance；否则 steady。`;

export async function evaluate(opts: {
  profile: StudentProfile | null;
  progress: Record<string, TopicProgress>;
  topics: string[];
}): Promise<EvaluationResult> {
  const masteryInput: Record<string, number> = {};
  const viewInfo: Record<string, unknown> = {};
  for (const t of opts.topics) {
    const p = opts.progress[t];
    masteryInput[t] = p?.mastery ?? 0;
    viewInfo[t] = {
      mastery: p?.mastery ?? 0,
      viewed: p?.viewed ?? false,
      view_seconds: p?.viewSeconds ?? 0,
    };
  }

  const userPrompt = `【自评掌握度】${JSON.stringify(masteryInput)}

【浏览行为】${JSON.stringify(viewInfo)}

【学生画像】
${JSON.stringify(opts.profile ?? {})}

请输出评估 JSON（仅 JSON）。`;

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const raw = await callSpark({ messages, stage: "eval", temperature: 0.3 });
  return normalizeEval(extractJson<Partial<EvaluationResult>>(raw), masteryInput);
}

function normalizeEval(
  p: Partial<EvaluationResult>,
  fallback: Record<string, number>,
): EvaluationResult {
  const mastery =
    p.mastery && typeof p.mastery === "object" ? p.mastery : { ...fallback };
  const vals = Object.values(mastery);
  const overall =
    typeof p.overall_score === "number"
      ? clamp(p.overall_score)
      : vals.length
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : 50;
  const weak = Array.isArray(p.weak_points)
    ? p.weak_points.map(String)
    : Object.entries(mastery).filter(([, v]) => v < 60).map(([k]) => k);
  const strong = Array.isArray(p.strong_points)
    ? p.strong_points.map(String)
    : Object.entries(mastery).filter(([, v]) => v >= 80).map(([k]) => k);
  const trend: ProgressTrend = (
    ["improving", "steady", "needs_review"].includes(p.progress_trend as string)
      ? p.progress_trend
      : overall >= 70
        ? "improving"
        : overall >= 55
          ? "steady"
          : "needs_review") as ProgressTrend;
  const action = p.path_adjustment?.action;
  const validAction =
    action === "advance" || action === "review" || action === "steady"
      ? action
      : weak.length
        ? "review"
        : overall >= 75
          ? "advance"
          : "steady";

  return {
    overall_score: overall,
    mastery,
    weak_points: weak,
    strong_points: strong,
    progress_trend: trend,
    recommendations: Array.isArray(p.recommendations)
      ? p.recommendations.map(String)
      : [],
    profile_update: {
      knowledge_level:
        p.profile_update?.knowledge_level &&
        typeof p.profile_update.knowledge_level === "object"
          ? p.profile_update.knowledge_level
          : { ...mastery },
    },
    path_adjustment: {
      action: validAction,
      focus_topics: Array.isArray(p.path_adjustment?.focus_topics)
        ? p.path_adjustment.focus_topics.map(String)
        : weak,
      summary: p.path_adjustment?.summary || "",
    },
  };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
