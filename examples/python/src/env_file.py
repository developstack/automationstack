"""一个 30 行的 `.env` 读取器。

## 为什么不装 python-dotenv

Node 那份示例用的是 `node --env-file-if-exists=.env`，运行时自带。Python 没有对等物，
而**这份示例的依赖清单本身就是它要证明的东西之一**：核心包零运行时依赖、插件只依赖
pytest。为了读三行 `KEY=VALUE` 往里加第四个包，等于亲手推翻那句话。
真实项目里你想用 python-dotenv 就用，SDK 一个字都不关心。

## 为什么已存在的环境变量优先

CI 上这三样是 secret，走的是环境变量；本机是 `.env` 文件。反过来（文件覆盖环境）
意味着谁在本机忘了删 `.env`，CI 的 secret 就会被一份陈旧的本地文件悄悄顶掉。
"""

from __future__ import annotations

import os
from pathlib import Path


def load_env_file(path: Path) -> int:
    """把 `path` 里的 `KEY=VALUE` 灌进 `os.environ`，返回实际写进去几个。

    文件不存在时**什么都不做**（返回 0）：CI 上本来就没有 `.env`，
    在那里因为缺文件而报错，等于逼每条流水线都放一个空文件进去。
    """
    if not path.is_file():
        return 0
    loaded = 0
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        if key and key not in os.environ:
            os.environ[key] = value.strip().strip("\"'")
            loaded += 1
    return loaded
