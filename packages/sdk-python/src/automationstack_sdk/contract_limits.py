"""契约里的数值上限的**副本**，与 `route_paths.py` 同一条理由（见那里的长注释）。

分叉由 `tests/test_contract_parity.py` 兜底：它读 Node 版的 `contract-limits.ts`
原文，逐个比对下面这七个值。
"""

from __future__ import annotations

#: 服务端一次请求的硬闸。SDK 分批时必须落在它以内。
MAX_INGEST_RESULTS_PER_REQUEST = 2000

#: 同上，附件那条线的硬闸。
MAX_INGEST_ATTACHMENTS_PER_REQUEST = 2000

#: `message` 的受理上限（超了整批 400）。SDK 侧提前截断，见下一条。
MAX_INGEST_MESSAGE_LENGTH = 20_000

#: `message` 落进 `test_run_cases.comment` 时的展示截断（§5.1.1「SDK 侧负责截断」）。
#:
#: 服务端也会再截一次，这里仍然截：`comment` 是给人在失败清单上一眼扫的，
#: 而 pytest 一条断言失败带上完整 traceback 轻松几十 KB——不截就等于每次都把
#: `MAX_INGEST_MESSAGE_LENGTH` 顶到头，请求体白白大一个数量级。完整堆栈走 `log` 附件。
MAX_INGEST_COMMENT_LENGTH = 2000

MAX_INGEST_SOURCE_REF_LENGTH = 512

#: SDK 每批发多少条结果（§5.5「超过 200 条分批」）。
#:
#: 服务端的硬闸是 2000，这里取 200 是**网络侧**的取舍：一批 200 条的体积
#: 在几十 KB 量级，超时重传的代价可控；顶到 2000 时一次重传要重发十倍的东西，
#: 而 QA 本机的上行正是最不稳的那一段。
RESULTS_PER_BATCH = 200

#: SDK 每批申请多少个附件签名。
#:
#: 取 500 而不是硬闸的 2000：服务端**按单个任务**计的条数配额就是 500
#: （`MAX_AUTOMATION_ATTACHMENTS_PER_RUN`），一次申请超过它必然有一部分被拒，
#: 分批到 500 让「被拒」只可能来自真实的配额超限，而不是 SDK 自己发太多。
ATTACHMENTS_PER_BATCH = 500
