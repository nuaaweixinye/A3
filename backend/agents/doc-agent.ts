// 智能体 · 文档生成 Agent（DocAgent）
// 赛题必做功能 2：多智能体协同的资源生成 —— "课程讲解文档"类型。
// Prompt 由 backend/prompts/doc.ts 提供，经 runResourceAgent 完成检索约束 + 流式生成 + 引用标注。

import {
  runResourceAgent,
} from "@/backend/agents/resource-runner";
import type { Emitter } from "@/backend/agents/resource-runner";
import type { GeneratedResource, ResourceTask, StudentProfile } from "@/backend/types";

export async function generateDoc(
  profile: StudentProfile,
  task: ResourceTask,
  emit?: Emitter,
): Promise<GeneratedResource> {
  return runResourceAgent({ profile, task, emit });
}
