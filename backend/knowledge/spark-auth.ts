/**
 * 讯飞星火知识库 (ChatDoc) API 鉴权
 *
 * 算法：signature = base64(hmac-sha1(apiSecret, md5(appId + timestamp)))
 * 参考：chatdoc-api-python-demo 官方示例
 */

import crypto from "crypto";

const SPARK_APP_ID = process.env.SPARK_APP_ID || "36271512";
const SPARK_API_SECRET =
  process.env.SPARK_API_SECRET || "M2VmYWUxYWU1MzcyMmUwNzUyMDc0MmQy";
const SPARK_KB_REPO_ID =
  process.env.SPARK_KB_REPO_ID || "ecf26d41a7a84afe814d7f6afb5ba6ea";

export function getSparkConfig() {
  return {
    appId: SPARK_APP_ID,
    apiSecret: SPARK_API_SECRET,
    repoId: SPARK_KB_REPO_ID,
  };
}

/**
 * ChatDoc 鉴权: signature = base64(hmac-sha1(apiSecret, md5(appId+timestamp)))
 */
export function authHeaders(): Record<string, string> {
  const ts = String(Math.floor(Date.now() / 1000));
  const checkSum = crypto
    .createHash("md5")
    .update(SPARK_APP_ID + ts)
    .digest("hex");
  const signature = crypto
    .createHmac("sha1", SPARK_API_SECRET)
    .update(checkSum)
    .digest("base64");
  return {
    appId: SPARK_APP_ID,
    timestamp: ts,
    signature,
  };
}