/**
 * knowledge-lib — 讯飞星火知识库 (ChatDoc) 调用封装
 *
 * 用法：
 *   import { search, factCheck, uploadFile, listFiles } from "knowledge-lib";
 */

export { authHeaders, getSparkConfig } from "./spark-auth";
export { search, factCheck, uploadFile, listFiles } from "./spark-kb";
export type {
  SearchResultItem,
  FactCheckResult,
  UploadResult,
} from "./spark-kb";