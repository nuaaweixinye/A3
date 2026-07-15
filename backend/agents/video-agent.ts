// 智能体 · 教学视频 Agent（VideoAgent）
// 生成分镜脚本（旁白 + SVG 动画 + 时长），旁白全文显示在字幕区。
// 配音由前端用浏览器内置语音合成朗读（占位配音，后续接入讯飞 TTS）。
// Prompt 由 backend/prompts/video.ts 提供。

import {
  runResourceAgent,
} from "@/backend/agents/resource-runner";
import type { Emitter } from "@/backend/agents/resource-runner";
import type { GeneratedResource, ResourceTask, StudentProfile } from "@/backend/types";

export async function generateVideo(
  profile: StudentProfile,
  task: ResourceTask,
  emit?: Emitter,
): Promise<GeneratedResource> {
  return runResourceAgent({ profile, task, emit });
}
