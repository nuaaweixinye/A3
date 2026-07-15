// 智能体 · 代码实操 Agent（CodeAgent）
// 生成可运行完整代码示例 + 注释 + 复杂度分析 + 易错点。
// 数据结构与算法主题默认 C++，其余根据主题自动切换语言。
// Prompt 由 backend/prompts/code.ts 提供。

import { runResourceAgent } from "@/backend/agents/resource-runner";
import type { Emitter } from "@/backend/agents/resource-runner";
import { buildUserPrompt, inferLanguage } from "@/backend/prompts/code";
import type { GeneratedResource, ResourceTask, StudentProfile } from "@/backend/types";

export async function generateCode(
  profile: StudentProfile,
  task: ResourceTask,
  emit?: Emitter,
): Promise<GeneratedResource> {
  const language = inferLanguage(task.topic);

  // CodeAgent 需要自定义 buildUserPrompt 以注入推断出的编程语言
  return runResourceAgent({
    profile,
    task,
    emit,
    buildUserPrompt: ({ task: t, profile: p, context, agentContext }) =>
      buildUserPrompt({
        topic: t.topic,
        profile: JSON.stringify(p),
        context,
        agentContext,
        language,
      }),
  });
}
