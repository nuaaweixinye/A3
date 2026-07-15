// 智能体 · 思维导图 Agent（MindmapAgent）
// 生成层次化的知识点思维导图，用 Markdown 嵌套列表表达层级。
// Prompt 由 backend/prompts/mindmap.ts 提供。

import {
  runResourceAgent,
} from "@/backend/agents/resource-runner";
import type { Emitter } from "@/backend/agents/resource-runner";
import type { GeneratedResource, ResourceTask, StudentProfile } from "@/backend/types";

export async function generateMindmap(
  profile: StudentProfile,
  task: ResourceTask,
  emit?: Emitter,
): Promise<GeneratedResource> {
  return runResourceAgent({ profile, task, emit });
}
