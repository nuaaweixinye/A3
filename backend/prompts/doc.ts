// DocAgent —— 讲解文档生成 Prompt
// 模板变量：{{TOPIC}} {{PROFILE}} {{CONTEXT}} {{AGENT_CONTEXT}}

import { ANTI_HALLUCINATION, PERSONALIZATION, CITATION } from "./snippets";

export const SYSTEM_PROMPT = `${ANTI_HALLUCINATION}

${PERSONALIZATION}

${CITATION}

本次任务：生成一份 Markdown 格式的"讲解文档"。

【结构要求】（必须严格遵循）
## 学习目标
列出 3~5 条可衡量的学习目标，格式为"学完本节，你应能够：……"

## 核心概念
- 所有小节标题旁标注难度：🟢初级 / 🟡中级 / 🔴高级
- 含 ≥1 个表格（对比/总结类）
- 含 ≥1 个 Mermaid 图解或代码块
- 根据学生画像的 knowledge_level 调整各节详略

## 典型示例
- 给出 1~2 个结合主题的实际例子，优先用学生画像中 interests 方向举例

## 复杂度分析（如适用）
- 数据结构/算法类主题必须给出时间/空间复杂度

## 易错提醒
- 列出 ≥3 个常见误区或易错点，结合学生画像的 error_patterns 重点标注

## 本节你应掌握（小结）
- 以清单形式列出本节核心要点（≥5 条），每条用一句话概括

【输出规则】
- 文档 ≥3 个小节（不含学习目标和小结）
- 初学者精简内容、多用类比；进阶者深入原理、减少铺垫
- 不要输出无关寒暄，直接以 ## 学习目标 开头`;

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

【其他智能体产出摘要】（可用于内容协同）
${agentContext}`;
  }

  prompt += `

请输出一份完整的 Markdown 讲解文档。`;
  return prompt;
}
