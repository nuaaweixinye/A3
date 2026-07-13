"""
知识库服务配置 —— 纯星火知识库模式
所有参数通过环境变量控制，均已内置默认值，零配置即可运行。
"""

import os

# 讯飞星火知识库凭证
SPARK_APP_ID = os.getenv("SPARK_APP_ID", "36271512")
SPARK_API_SECRET = os.getenv("SPARK_API_SECRET", "M2VmYWUxYWU1MzcyMmUwNzUyMDc0MmQy")
SPARK_KB_REPO_ID = os.getenv("SPARK_KB_REPO_ID", "ecf26d41a7a84afe814d7f6afb5ba6ea")

# 检索默认 Top-K
DEFAULT_TOP_K = int(os.getenv("DEFAULT_TOP_K", "5"))
