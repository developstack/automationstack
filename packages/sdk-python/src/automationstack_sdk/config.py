"""SDK 配置（§5.1 / D31）。

**只有 token + projectId + baseUrl 三样，没有第四样**，而且三样全都跨迭代不变。
尤其**没有 `runId`**：每个迭代一个新测试任务，配置里写死 runId 意味着每个迭代
都要有人去改 CI 变量，这种手动步骤第一次会忘、第二次就没人用了；
归属由用例的 sourceRef 自己解析（§3.7）。

`run_ids`（复数）是**每次调用可以传的收窄白名单**，刻意不放进环境变量：
放进配置文件它就变成了每迭代要维护的东西，D31 立刻作废。

⚠️ 环境变量名与 `packages/sdk-node/src/config.ts` **逐字一致**（`AS_` 前缀那七个）。
同一个仓库里 Node 与 Python 的脚本常常共用一份 CI 环境，改名就等于
让人维护两套 secret，而两套里总有一套会过期。
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import List, Mapping, Optional

from .errors import ReporterConfigError
from .idempotency import resolve_run_idempotency_key

_TRAILING_SLASHES = re.compile(r"/+$")

_MISSING_TOKEN = (
    "缺少 AS_TOKEN：在 https://<你的平台地址>/api-tokens 建一个个人 token，明文只显示一次"
)
_MISSING_PROJECT = "缺少 AS_PROJECT：填这个仓库对应的项目 id（跟着仓库走，建一次不再变）"
_MISSING_BASE_URL = "缺少 AS_BASE_URL：填平台地址，例如 https://qa.example.com"


@dataclass(frozen=True)
class ReporterConfig:
    base_url: str
    project_id: str
    token: str
    idempotency_key: str
    branch: Optional[str] = None
    ci_url: Optional[str] = None
    commit_sha: Optional[str] = None
    overwrite_manual: bool = False
    run_ids: Optional[List[str]] = field(default=None)


def _trimmed_or_none(value: Optional[str]) -> Optional[str]:
    trimmed = (value or "").strip()
    return trimmed or None


def _require_value(
    explicit: Optional[str], from_env: Optional[str], missing_message: str
) -> str:
    """显式参数 > 环境变量。

    显式参数是给「把配置写在自己的 conftest 里」的人留的，环境变量是给 CI 留的；
    两者都在时以代码里写的为准，否则同一份配置在本机和 CI 上表现不同，
    那是最难查的一类问题。

    缺了就**立刻抛**：缺 token 这种事必须在跑测试之前炸，而不是等跑完二十分钟
    才发现结果无处可去。
    """
    value = _trimmed_or_none(explicit) or _trimmed_or_none(from_env)
    if not value:
        raise ReporterConfigError(missing_message)
    return value


def resolve_reporter_config(
    *,
    base_url: Optional[str] = None,
    branch: Optional[str] = None,
    ci_url: Optional[str] = None,
    commit_sha: Optional[str] = None,
    env: Optional[Mapping[str, str]] = None,
    idempotency_key: Optional[str] = None,
    overwrite_manual: Optional[bool] = None,
    project_id: Optional[str] = None,
    run_ids: Optional[List[str]] = None,
    token: Optional[str] = None,
) -> ReporterConfig:
    resolved_env: Mapping[str, str] = os.environ if env is None else env
    return ReporterConfig(
        base_url=_TRAILING_SLASHES.sub(
            "", _require_value(base_url, resolved_env.get("AS_BASE_URL"), _MISSING_BASE_URL)
        ),
        branch=branch or _trimmed_or_none(resolved_env.get("AS_BRANCH")),
        ci_url=ci_url or _trimmed_or_none(resolved_env.get("AS_CI_URL")),
        commit_sha=commit_sha or _trimmed_or_none(resolved_env.get("AS_COMMIT_SHA")),
        idempotency_key=idempotency_key or resolve_run_idempotency_key(resolved_env),
        overwrite_manual=bool(overwrite_manual),
        project_id=_require_value(
            project_id, resolved_env.get("AS_PROJECT"), _MISSING_PROJECT
        ),
        run_ids=run_ids,
        token=_require_value(token, resolved_env.get("AS_TOKEN"), _MISSING_TOKEN),
    )
