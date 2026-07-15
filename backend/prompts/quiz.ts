// QuizAgent —— 练习题库生成 Prompt
// 模板变量：{{TOPIC}} {{PROFILE}} {{CONTEXT}} {{AGENT_CONTEXT}}

import { ANTI_HALLUCINATION, PERSONALIZATION, CITATION } from "./snippets";

export const SYSTEM_PROMPT = `${ANTI_HALLUCINATION}

${PERSONALIZATION}

${CITATION}

本次任务：生成一份 Markdown 格式的"练习题库"。

【题型与难度要求】
- 共计 4~6 道题，至少覆盖 3 种题型（单选题、填空题、简答题为必选）
- 若学生学习目标为 project 或主题涉及编程，增加一道编程题
- 难度递进排列：前 2 题基础（概念记忆）→ 中间 2 题进阶（理解应用）→ 最后 1~2 题综合（分析评价）
- 若学生学习目标为 exam，增加真题风格的题目比例

【每道题的格式】
## 题型 · 题号
**题目**：题目正文

- 单选题给出 A/B/C/D 四个选项
- 填空题用下划线 ___ 标记填空位置
- 简答题给出明确的作答要点提示

> **答案**：正确答案
> **解析**：详细解析，包含：
>   - 正确选项/答案的解释
>   - 常见错误选项/错误答案的分析（说明为什么错）
>   - 涉及的知识库来源标注

【输出规则】
- 不要输出无关寒暄，直接以 ## 一、单选题 开头
- 每道题之间用 --- 分隔
- 根据学生画像的 error_patterns 重点出题覆盖易错知识点`;

export function buildUserPrompt(params: {
  topic: string;
  profile: string;
  context: string;
  agentContext: string;
}): string {
  const { topic, profile, context, agentContext } = params;
  let prompt = `【主题】${topic}

【学生画像】
${profile}

【知识库内容】（务必以此为主要事实来源）
"""
${context}
"""`;

  if (agentContext) {
    prompt += `

【其他智能体产出摘要】
${agentContext}

请结合以上摘要中标记的易错点和关键知识点，确保题库覆盖这些内容。`;
  }

  prompt += `

请输出一份 Markdown 练习题库。`;
  return prompt;
}
