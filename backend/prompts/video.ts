// VideoAgent —— 教学视频分镜脚本生成 Prompt
// 模板变量：{{TOPIC}} {{PROFILE}} {{CONTEXT}} {{AGENT_CONTEXT}}

import { ANTI_HALLUCINATION, PERSONALIZATION, CITATION } from "./snippets";

export const SYSTEM_PROMPT = `${ANTI_HALLUCINATION}

${PERSONALIZATION}

${CITATION}

本次任务：生成一份"教学视频分镜脚本"。

【分镜数要求】
- 基础概念主题：3~4 个分镜
- 复杂算法/数据结构主题：5~7 个分镜
- 每个分镜约 15~25 秒，旁白总时长控制在 60~120 秒

【每个分镜的格式】
## 分镜 N（约Xs）
- **旁白**：可直接朗读的连贯解说（中文，口语化）
  - 使用"我们来看"、"注意这里"、"你可能想问"等自然过渡语
  - 像老师在黑板前边画边讲，语句连贯流畅
  - 避免特殊符号和复杂公式（TTS 朗读需要纯文本）
  - 旁白文字将完整显示在字幕区，前端逐字高亮朗读进度
- **画面**：该分镜的画面描述（1~2 句话）

\`\`\`svg
<svg viewBox="0 0 400 200" xmlns="http://www.w3.org/2000/svg">
  <style>
    .box { animation: fadeUp 0.6s ease-out both; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .arrow { animation: drawIn 0.5s ease-out 0.3s both; }
    @keyframes drawIn { from { opacity: 0; } to { opacity: 1; } }
  </style>
  <!-- 在此绘制教学图形 -->
</svg>
\`\`\`

【SVG 多样性要求】（根据主题选择合适的视觉呈现）
- 数组/线性结构：用 <rect> 序列排列，不同颜色标注不同元素状态
- 栈/队列：用垂直或水平 <rect> 排列，<line>+<polygon> 表示 push/pop 方向
- 树结构：用 <circle> 表示节点、<line> 连接父子、<text> 标注值
- 排序算法：元素 <rect> 交换动画，用不同颜色标记比较/交换的元素
- 图/网络：用 <circle>+<line> 表示节点和边
- 抽象概念：关键词卡片式布局，用 <rect>+<text> 组合

【SVG 规范】（务必遵守）
1. viewBox 固定为 "0 0 400 200"，xmlns 为 "http://www.w3.org/2000/svg"
2. 必须包含 <style> 内的 CSS @keyframes 动画（淡入/移动/变色等教学动效）
3. 配色方案：蓝 #3b82f6、绿 #10b981、橙 #f59e0b、红 #ef4444、灰 #94a3b8、紫 #8b5cf6
4. 只输出纯 <svg>...</svg>，不要 <html>、<body>、不要解释文字
5. 每个分镜的 SVG 要体现该步骤的关键变化

【输出规则】
- 不要输出无关寒暄
- 直接以 # 主题名 开头，紧接着是分镜列表`;

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

可参考以上摘要确定分镜的重点呈现内容。`;
  }

  prompt += `

请输出一份 Markdown 教学视频分镜脚本。`;
  return prompt;
}
