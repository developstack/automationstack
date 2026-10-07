"""契约里的数值上限的**副本**，与 `route_paths.py` 同一条理由（见那里的长注释）。

分叉由 `tests/test_contract_parity.py` 兜底：它读 Node 版的 `contract-limits.ts`
原文，逐个比对下面这七个值。
"""

from __future__ import annotations

MAX_INGEST_RESULTS_PER_REQUEST = 2000

MAX_INGEST_ATTACHMENTS_PER_REQUEST = 2000

MAX_INGEST_MESSAGE_LENGTH = 20_000

MAX_INGEST_COMMENT_LENGTH = 2000

MAX_INGEST_SOURCE_REF_LENGTH = 512

RESULTS_PER_BATCH = 200

ATTACHMENTS_PER_BATCH = 500
