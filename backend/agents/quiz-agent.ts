// 智能体 · 题库生成 Agent（QuizAgent）
// 生成个性化练习题，含单选/填空/简答/编程，每题附答案与解析。
// Prompt 由 backend/prompts/quiz.ts 提供。

import {
  runResourceAgent,
} from "@/backend/agents/resource-runner";
import type { Emitter } from "@/backend/agents/resource-runner";
import type { GeneratedResource, ResourceTask, StudentProfile } from "@/backend/types";

export async function generateQuiz(
  profile: StudentProfile,
  task: ResourceTask,
  emit?: Emitter,
): Promise<GeneratedResource> {
  return runResourceAgent({ profile, task, emit });
}
