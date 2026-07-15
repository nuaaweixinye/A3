// 智能体 · 智能辅导 Agent（TutorAgent）—— 加分项 ④
// 基于知识库 RAG 的多轮答疑，结合画像个性化；流式输出 Markdown（可含 mermaid 图解/代码）。

import { streamSpark, type ChatMsg } from "@/backend/ai/spark";
import { searchKnowledge, formatContext } from "@/backend/knowledge/retriever";
import { ANTI_HALLUCINATION_RULES } from "@/backend/agents/resource-runner";
import type { StudentProfile, TutorTurn } from "@/backend/types";

const SYSTEM_PROMPT = `${ANTI_HALLUCINATION_RULES}

本次任务：作为学习辅导员，针对学生提问给出即时、个性化的解答。
- 用 Markdown 输出，条理清晰、突出重点。
- 若有助于理解，可附 mermaid 图解（\`\`\`mermaid 代码块）或代码示例。
- 结合学生画像调整深度：零基础多举例，进阶者直接给要点。
- 若问题超出知识库范围，明确说明「当前知识库中暂无此内容」并给出学习建议。不要输出无关寒暄。`;

/** 流式答疑：逐 token 产出生成内容 */
export async function* answerTutorStream(opts: {
  question: string;
  history: TutorTurn[];
  profile: StudentProfile | null;
}): AsyncGenerator<string, void, unknown> {
  const { question, history, profile } = opts;
  const chunks = await searchKnowledge(question, 5);
  const context = formatContext(chunks);

  const historyMsgs: ChatMsg[] = history.slice(-6).map((t) => ({
    role: t.role,
    content: t.content,
  }));

  const userPrompt = `【问题】${question}

【学生画像】
${JSON.stringify(profile ?? {})}

【知识库内容】（事实来源）
"""
${context}
"""

请结合上下文与画像作答。`;

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historyMsgs,
    { role: "user", content: userPrompt },
  ];

  yield* streamSpark({ messages, stage: "tutor", temperature: 0.6 });
}
