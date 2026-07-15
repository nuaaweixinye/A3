// CodeAgent —— 代码实操案例生成 Prompt
// 模板变量：{{TOPIC}} {{PROFILE}} {{CONTEXT}} {{AGENT_CONTEXT}} {{LANGUAGE}}

import { ANTI_HALLUCINATION, PERSONALIZATION, CITATION } from "./snippets";

export const SYSTEM_PROMPT = `${ANTI_HALLUCINATION}

${PERSONALIZATION}

${CITATION}

本次任务：生成一份 Markdown 格式的"代码实操案例"。

【编程语言选择规则】
- 数据结构与算法主题（数组/链表/栈/队列/树/图/排序/查找/哈希等）→ 使用 **C++**
- Web/前端相关主题（HTML/CSS/JS/DOM 等）→ 使用 **JavaScript/TypeScript**
- 数据处理/科学计算主题 → 使用 **Python**
- 其他主题根据知识库内容中使用的语言为准

【代码要求】
- 给出完整可运行的代码示例（含 main 函数或入口、必要的 #include / import）
- 学生复制代码即可编译/运行，不需要自行补充任何代码
- 代码带详细的中文注释，解释关键步骤
- 变量命名规范、代码风格清晰

【文档结构】
## 示例：{{TOPIC}} 的实现

\`\`\`cpp  （或其他语言标记）
// 完整可运行代码
\`\`\`

## 关键分析
- 代码的核心逻辑拆解（2~4 点）
- 关键数据结构和变量的说明

## 复杂度分析
- 时间复杂度：O(xxx)，并说明原因
- 空间复杂度：O(xxx)，并说明原因

## 易错点
- ≥2 个常见错误或注意事项

【输出规则】
- 不要输出无关寒暄
- 直接以 ## 示例 开头`;

export function buildUserPrompt(params: {
  topic: string;
  profile: string;
  context: string;
  agentContext: string;
  language?: string;
}): string {
  const { topic, profile, context, agentContext, language = "C++" } = params;
  let prompt = `【主题】${topic}

【编程语言】${language}

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

请确保代码示例与以上摘要中的编程题/关键算法形成互补。`;
  }

  prompt += `

请输出一份 Markdown 代码实操案例（使用 ${language} 语言）。`;
  return prompt;
}

/** 根据 topic 推断应使用的编程语言 */
export function inferLanguage(topic: string): string {
  const dsKeywords = [
    "数组", "链表", "栈", "队列", "树", "二叉树", "图",
    "排序", "查找", "哈希", "散列", "堆", "递归", "动态规划",
    "array", "linked list", "stack", "queue", "tree", "graph",
    "sort", "hash", "heap", "recursion", "dp",
  ];
  const webKeywords = [
    "html", "css", "javascript", "js", "dom", "web", "前端",
    "浏览器", "事件", "ajax", "fetch",
  ];
  const dataKeywords = [
    "python", "数据分析", "机器学习", "深度学习", "pandas",
    "numpy", "tensorflow", "数据挖掘",
  ];

  const lower = topic.toLowerCase();

  if (webKeywords.some((k) => lower.includes(k))) return "JavaScript";
  if (dataKeywords.some((k) => lower.includes(k))) return "Python";
  if (dsKeywords.some((k) => lower.includes(k))) return "C++";

  // 默认 C++（课程主题是数据结构与算法）
  return "C++";
}
