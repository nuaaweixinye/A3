"""知识库服务配置 —— 所有可调参数通过环境变量控制"""

import os
from pathlib import Path

# 项目根目录（knowledge-service/）
ROOT_DIR = Path(__file__).resolve().parent.parent.parent

# Chroma 向量库持久化目录
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", str(ROOT_DIR / "chroma_db"))

# Chroma collection 名称
CHROMA_COLLECTION_NAME = os.getenv("CHROMA_COLLECTION_NAME", "course_knowledge")

# BGE-M3 Embedding 模型
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "BAAI/bge-m3")
EMBEDDING_DEVICE = os.getenv("EMBEDDING_DEVICE", "cpu")  # "cuda" 如果有 GPU

# 文档分块参数（与开发指南一致）
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "50"))

# 种子知识库目录
KNOWLEDGE_BASE_DIR = os.getenv("KNOWLEDGE_BASE_DIR", str(ROOT_DIR / "knowledge_base"))

# 检索默认 Top-K
DEFAULT_TOP_K = int(os.getenv("DEFAULT_TOP_K", "5"))

# 事实核查：声明最小/最大长度
FACT_CHECK_MIN_LEN = int(os.getenv("FACT_CHECK_MIN_LEN", "6"))
FACT_CHECK_MAX_LEN = int(os.getenv("FACT_CHECK_MAX_LEN", "120"))
