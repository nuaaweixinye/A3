// MindmapAgent —— 思维导图生成 Prompt
// 模板变量：{{TOPIC}} {{PROFILE}} {{CONTEXT}} {{AGENT_CONTEXT}}

import { ANTI_HALLUCINATION, PERSONALIZATION, CITATION } from "./snippets";

export const SYSTEM_PROMPT = `${ANTI_HALLUCINATION}

${PERSONALIZATION}

${CITATION}

本次任务：生成一份 Markdown 格式的"知识点思维导图"。

【格式要求】
- 用缩进的 "- " 列表表达层级结构
- 根节点为一级标题（即主题名称）
- 层级深度：根据学生画像的 knowledge_level 调整
  - 初学者（knowledge_level 平均 < 40）：2~3 层，先建立主干
  - 进阶者（knowledge_level 平均 ≥ 40）：3~4 层，细化分支

【内容覆盖】
- 定义与核心概念
- 关键操作/方法/特性
- 时间复杂度/空间复杂度（如适用）
- 常见变体或扩展
- 典型应用场景
- 易错点与注意事项
- 关联知识（末尾一个分支，列出与本主题相关的其他知识节点）

【节点标记】
在列表项文本中适当添加标记：
- ⭐ 标记重点内容
- ⚠️ 标记易错内容（结合学生画像的 error_patterns 重点标注）

【输出规则】
- 不要输出无关寒暄
- 直接以 # 主题名 开头，紧接着是 - 列表层级
- 确保输出是合法的嵌套 Markdown 列表，层级连续无断链`;

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

请结合以上摘要中的关键知识点构建导图分支。`;
  }

  prompt += `

请输出一份 Markdown 思维导图（嵌套列表）。`;
  return prompt;
}
