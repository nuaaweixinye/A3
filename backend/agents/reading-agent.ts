// 智能体 · 拓展阅读 Agent（ReadingAgent）
// 生成分级推荐阅读清单（巩固基础/拓展视野/深入进阶），含来源与难度标注。
// Prompt 由 backend/prompts/reading.ts 提供。

import {
  runResourceAgent,
} from "@/backend/agents/resource-runner";
import type { Emitter } from "@/backend/agents/resource-runner";
import type { GeneratedResource, ResourceTask, StudentProfile } from "@/backend/types";

export async function generateReading(
  profile: StudentProfile,
  task: ResourceTask,
  emit?: Emitter,
): Promise<GeneratedResource> {
  return runResourceAgent({ profile, task, emit });
}
