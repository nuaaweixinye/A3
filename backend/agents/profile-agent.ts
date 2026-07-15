// 智能体 1：画像构建 Agent（ProfileAgent）
// 赛题必做功能 1：对话式学习画像自主构建，抽取 ≥6 维度画像。

import { callSpark, extractJson, type ChatMsg } from "@/backend/ai/spark";
import type { StudentProfile } from "@/backend/types";

const SYSTEM_PROMPT = `你是一名学习画像分析专家。基于学生的对话内容，抽取并更新其个性化学习画像。
你只能输出严格的 JSON（不要 markdown 代码块、不要任何解释文字）。JSON 结构如下：
{
  "knowledge_level": {"知识点名称": 0到100的整数},
  "cognitive_style": "visual" | "auditory" | "reading" | "kinesthetic",
  "error_patterns": ["易错类型1", "易错类型2"],
  "learning_goal": "exam" | "project" | "research" | "interest",
  "learning_pace": "fast" | "medium" | "slow",
  "interests": ["兴趣方向1", "兴趣方向2"]
}
规则：
1. 共 6 个维度，必须全部输出。
2. knowledge_level 的 key 用简短中文知识点名（如 "基础概念"、"核心原理"），value 为掌握程度（0=完全不会，100=精通）。
3. 若信息不足以判断某维度，给出合理默认值：knowledge_level 为 {}、cognitive_style 为 "visual"、error_patterns 与 interests 为 []、learning_goal 为 "interest"、learning_pace 为 "medium"。
4. 若提供了"当前画像历史"，应在其基础上增量更新，而非完全推翻。`;

export async function extractProfile(
  message: string,
  history: StudentProfile | null = null,
): Promise<StudentProfile> {
  const userPrompt = `当前画像历史：${history ? JSON.stringify(history) : "（空）"}

学生最新发言：
"""
${message}
"""

请综合判断并输出更新后的 6 维度画像 JSON（仅 JSON）。`;

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const raw = await callSpark({ messages, stage: "profile", temperature: 0.3 });
  const parsed = extractJson<Partial<StudentProfile>>(raw);
  return normalizeProfile(parsed);
}

/** 校验并补全为合法的 6 维度画像 */
function normalizeProfile(p: Partial<StudentProfile>): StudentProfile {
  return {
    knowledge_level:
      p.knowledge_level && typeof p.knowledge_level === "object"
        ? Object.fromEntries(
            Object.entries(p.knowledge_level).map(([k, v]) => [
              k,
              Math.max(0, Math.min(100, Number(v) || 0)),
            ]),
          )
        : {},
    cognitive_style: (["visual", "auditory", "reading", "kinesthetic"].includes(
      p.cognitive_style as string,
    )
      ? p.cognitive_style
      : "visual") as StudentProfile["cognitive_style"],
    error_patterns: Array.isArray(p.error_patterns)
      ? p.error_patterns.map(String)
      : [],
    learning_goal: (["exam", "project", "research", "interest"].includes(
      p.learning_goal as string,
    )
      ? p.learning_goal
      : "interest") as StudentProfile["learning_goal"],
    learning_pace: (["fast", "medium", "slow"].includes(p.learning_pace as string)
      ? p.learning_pace
      : "medium") as StudentProfile["learning_pace"],
    interests: Array.isArray(p.interests) ? p.interests.map(String) : [],
    updated_at: new Date().toISOString(),
  };
}
