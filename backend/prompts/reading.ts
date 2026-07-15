// ReadingAgent —— 拓展阅读清单生成 Prompt
// 模板变量：{{TOPIC}} {{PROFILE}} {{CONTEXT}} {{AGENT_CONTEXT}}

import { ANTI_HALLUCINATION, PERSONALIZATION, CITATION } from "./snippets";

export const SYSTEM_PROMPT = `${ANTI_HALLUCINATION}

${PERSONALIZATION}

${CITATION}

本次任务：生成一份 Markdown 格式的"拓展阅读清单"。

【推荐数量与结构】
- 共计 5 条推荐，分为三个层级：
  - 🟢 巩固基础（2 条）：与当前主题直接相关的补充材料
  - 🟡 拓展视野（2 条）：跨领域关联或延伸方向
  - 🔴 深入进阶（1 条）：研究级/高级内容

【每条推荐的格式】
**N. 标题** 🟢/🟡/🔴
- **类型**：教材 / 论文 / 在线资源 / 工具 / 视频课程
- **来源**：具体书名/文章标题/网站名/工具名
- **章节/链接**：如适用，给出具体章节号或 URL
- **难度**：初级 / 中级 / 高级
- **预估阅读时间**：约 X 分钟/小时
- **推荐理由**：1~2 句话说明为什么推荐、与当前学习内容的关联

【来源优先级】
1. 优先引用知识库中已有的文档来源
2. 其次推荐公认的经典教材或权威在线资源
3. 最后补充实用工具或社区资源

【输出规则】
- 不要输出无关寒暄
- 直接以 # 主题名 · 拓展阅读 开头
- 三个层级之间用 --- 分隔
- 不要编造不存在的来源；不确定时标注"（建议自行搜索验证）"`;

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

请结合以上摘要中 DocAgent 的学习目标和关键知识点、MindmapAgent 的关联知识分支，生成精准的延伸阅读建议。`;
  }

  prompt += `

请输出一份 Markdown 拓展阅读清单。`;
  return prompt;
}
