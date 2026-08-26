"""幂等键（§5.2 / §7.2 第 2 条）。

铁律是「一次进程启动生成一个 UUID，重试时**复用**」——重新生成就等于没有幂等。
这里把它拆成两层，因为一次执行可能分成多批发（§5.5 超过 200 条分批），
而 `UNIQUE (projectId, idempotencyKey)` 是**按请求**判的：几批共用一个键的话，
第二批会命中第一批的缓存对账单直接返回，后面的结论一条都写不进去，
而 SDK 看到的是两份「成功」的对账单——正是 §7.2 第 4 条说的那种静默成功。

所以：**一次进程一个 run key，每批的键从 run key 确定性派生**。
确定性是关键——重试第 3 批时重新算一遍，拿到的还是同一个键。

⚠️ 派生算法与 `packages/sdk-node/src/idempotency.ts` 是**逐字节**对齐的：
同一个 run key + 同一个批号，两个 SDK 必须算出同一个 UUID。
不这么要求也能跑，但一旦 Node 与 Python 在同一条流水线上先后跑同一轮
（迁移期常见），两边算出不同的键就会各写一次，重试的语义直接失效。
`tests/test_idempotency.py` 里钉了几个 Node 侧算出来的常量值当基准。
"""

from __future__ import annotations

import hashlib
import uuid
from typing import Mapping, Optional

#: UUID 的四个分段边界，用来把 16 字节的摘要摆成 8-4-4-4-12。
_UUID_SEGMENT_ENDS = (8, 12, 16, 20, 32)
_UUID_HEX_LENGTH = 32
_VERSION_NIBBLE_INDEX = 12
_VARIANT_NIBBLE_INDEX = 16


def resolve_run_idempotency_key(env: Mapping[str, Optional[str]]) -> str:
    """读环境变量拿一个跨进程稳定的幂等键；没有就现生成一个。

    ⚠️ `AS_IDEMPOTENCY_KEY` 是**给 CI 重试用的**，不是日常配置（所以它不违反 D31：
    它不是「往哪写」的输入，只是「这是不是同一轮」的标识）。CI 的 retry 是**新进程**，
    「一次进程一个 UUID」在那里失效——同一轮被重跑时会当成两轮全新的上报。
    把 CI 的 job/attempt id 喂进来，重试才真的复用得上。
    """
    configured = (env.get("AS_IDEMPOTENCY_KEY") or "").strip()
    if configured:
        # 不校验它是不是 uuid：真不是的话，服务端那条指着字段名的 400 比
        # SDK 自己编的一句「格式不对」更有用（同 §7.2 第 4 条「原样透传」）。
        return configured
    return str(uuid.uuid4())


def _format_as_uuid_v5(hex_digest: str) -> str:
    nibbles = list(hex_digest)
    # 版本位固定成 5、变体位固定成 8：不改这两位算出来的不是合法 UUID，
    # 服务端的 z.uuid() 会直接拒。
    nibbles[_VERSION_NIBBLE_INDEX] = "5"
    nibbles[_VARIANT_NIBBLE_INDEX] = "8"
    normalized = "".join(nibbles)
    segments = []
    cursor = 0
    for end in _UUID_SEGMENT_ENDS:
        segments.append(normalized[cursor:end])
        cursor = end
    return "-".join(segments)


def derive_batch_idempotency_key(run_key: str, batch_index: int) -> str:
    """从 run key 确定性派生第 `batch_index` 批的幂等键。

    形状是 UUIDv5（name-based，SHA-1）：服务端 `z.uuid()` 只认合法 UUID，
    而 v5 恰好就是「从一个名字算出一个 UUID」这件事的标准做法，
    不用另发明一套编码。批 0 直接用 run key 本身——最常见的那种执行只有一批，
    让它的键就是人在日志里看到的那个 run key，排查时少一层换算。

    ⚠️ 没有用 `uuid.uuid5()`：那个函数把 namespace 的 16 字节拼在 name 前面
    再做 SHA-1，而 Node 版摘的是 `f"{run_key}:{batch_index}"` 这个字符串本身。
    想用标准库那条路就得先跟 Node 那边商量出一个 namespace UUID，
    收益是零、分叉风险实打实——这里照着 Node 的字节序复刻。
    """
    if batch_index == 0:
        return run_key
    payload = "{0}:{1}".format(run_key, batch_index).encode("utf-8")
    digest = hashlib.sha1(payload).hexdigest()[:_UUID_HEX_LENGTH]  # noqa: S324
    return _format_as_uuid_v5(digest)
