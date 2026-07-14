"""
讯飞星火 API 鉴权 —— 签名生成

鉴权方式：在 HTTP Header 中传入 appId + timestamp + signature
  signature = MD5(appId + timestamp + apiSecret)

适用范围：星火知识库 (ChatDoc) / 星火大模型 (Spark) / 可定制化 API (SparkCube)
"""

import hashlib
import time
from typing import Dict


def generate_signature(app_id: str, api_secret: str) -> Dict[str, str]:
    """生成讯飞 API 鉴权 Headers

    Args:
        app_id: 应用 APPID
        api_secret: 接口密钥 (APISecret)

    Returns:
        {"appId": "...", "timestamp": "...", "signature": "..."}
    """
    timestamp = str(int(time.time()))
    raw = app_id + timestamp + api_secret
    signature = hashlib.md5(raw.encode("utf-8")).hexdigest()

    return {
        "appId": app_id,
        "timestamp": timestamp,
        "signature": signature,
    }
