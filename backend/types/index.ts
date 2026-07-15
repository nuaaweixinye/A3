// 学习多智能体系统 —— 公共类型定义
// 对应赛题"基于大模型的个性化资源生成与学习多智能体系统开发"

/* ===================== 学生画像（6 个维度，赛题硬性要求 ≥6） ===================== */

export type CognitiveStyle = "visual" | "auditory" | "reading" | "kinesthetic";
export type LearningGoal = "exam" | "project" | "research" | "interest";
export type LearningPace = "fast" | "medium" | "slow";

export interface StudentProfile {
  /** 1. 知识基础水平：知识点 -> 0~100 掌握度 */
  knowledge_level: Record<string, number>;
  /** 2. 认知学习风格 */
  cognitive_style: CognitiveStyle;
  /** 3. 易错点偏好 */
  error_patterns: string[];
  /** 4. 学习目标方向 */
  learning_goal: LearningGoal;
  /** 5. 学习节奏偏好 */
  learning_pace: LearningPace;
  /** 6. 兴趣方向偏好 */
  interests: string[];
  updated_at?: string;
}

/* ===================== 学习路径与资源 ===================== */

export type ResourceType =
  | "doc" // 课程讲解文档
  | "quiz" // 练习题库
  | "mindmap" // 知识点思维导图
  | "video" // 教学视频/动画
  | "code" // 代码实操案例
  | "reading"; // 拓展阅读材料

export interface ResourceTask {
  type: ResourceType;
  topic: string;
  reason?: string;
}

export interface PathStep {
  step: number;
  title: string;
  description: string;
  resource_tasks: ResourceTask[];
  estimated_minutes: number;
}

export interface LearningPath {
  path_title: string;
  estimated_time: string;
  steps: PathStep[];
}

export interface GeneratedResource {
  id: string;
  type: ResourceType;
  title: string;
  topic: string;
  /** Markdown 正文 */
  content: string;
  /** 引用来源（防幻觉第 4 层：引用标注） */
  sources: string[];
  /** 防幻觉第 3 层：生成后事实核查结果 */
  fact_check?: FactCheckResult;
  created_at: string;
}

/** 防幻觉第 3 层：事实核查结果 */
export interface FactCheckResult {
  /** 有知识库佐证的可核声明占比 0~100 */
  score: number;
  /** 未找到佐证的声明（待人工/再检索核验） */
  flagged: string[];
  /** 可核声明总数 */
  checked: number;
}

/* ===================== LangGraph 共享状态 ===================== */

export interface LearningState {
  userMessage: string;
  profile: StudentProfile | null;
  path: LearningPath | null;
  /** 规划阶段确定的本次主主题（资源生成共用） */
  primaryTopic: string;
  /** 规划阶段确定的资源任务清单（≥5 种类型） */
  resourceTasks: ResourceTask[];
  /** 6 个资源 Agent 并行产出（加法聚合） */
  resources: GeneratedResource[];
}

/** 前端流式资源卡片状态（生成中 / 已完成） */
export interface ResourceCardState {
  id: string;
  resType: ResourceType;
  title: string;
  topic: string;
  content: string;
  sources: string[];
  fact_check?: FactCheckResult;
  done: boolean;
}

/* ===================== 加分项 ⑤：学习效果评估 ===================== */

/** 单主题学习进度（自评掌握度 + 浏览行为） */
export interface TopicProgress {
  /** 学生自评掌握度 0~100 */
  mastery: number;
  /** 是否浏览过该资源 */
  viewed: boolean;
  /** 浏览累计秒数 */
  viewSeconds: number;
}

export type ProgressTrend = "improving" | "steady" | "needs_review";

/** 评估结果：含回写画像与路径调整建议（闭环） */
export interface EvaluationResult {
  overall_score: number;
  /** 主题 -> 0~100 掌握度 */
  mastery: Record<string, number>;
  weak_points: string[];
  strong_points: string[];
  progress_trend: ProgressTrend;
  recommendations: string[];
  /** 合并回 StudentProfile.knowledge_level，形成"评估→画像"回路 */
  profile_update: {
    knowledge_level: Record<string, number>;
  };
  /** 动态路径调整建议，形成"评估→路径"回路 */
  path_adjustment: {
    action: "advance" | "review" | "steady";
    focus_topics: string[];
    summary: string;
  };
}

/* ===================== 加分项 ④：智能辅导（多轮对话） ===================== */

export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}


export type AgentEvent =
  | { type: "status"; agent: string; message: string }
  | { type: "profile"; profile: StudentProfile }
  | { type: "path"; path: LearningPath }
  | {
      type: "resource_start";
      id: string;
      resType: ResourceType;
      title: string;
      topic: string;
    }
  | { type: "resource_delta"; id: string; text: string }
  | { type: "resource"; resource: GeneratedResource }
  | { type: "done" }
  | { type: "error"; message: string };
