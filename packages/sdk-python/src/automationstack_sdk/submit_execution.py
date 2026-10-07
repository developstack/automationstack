"""正常路径上的**唯一一次**网络往返形态：`POST /ingest/executions`（§7.2 第 5 条）。

**不做预检**：跑之前没有任何需要人确认的配置——归属由用例的 sourceRef 自己
解析（§3.7），既没有「上报目标」也没有槽位。`GET /ingest/runs` 是留给人
排查用的，本包不在正常路径上调它（`tests/test_no_preflight.py` 盯着这件事）。

分批时会有多次 POST，但那是同一件事的分片，不是「先问一下再报」。
"""

from __future__ import annotations

from typing import List

from .config import ReporterConfig
from .contract_types import IngestExecutionReceipt
from .execution_batches import ExecutionWindow, build_execution_requests
from .http_client import IngestHttpClient
from .receipt_merge import merge_receipts
from .reporter_types import CaseResultInput
from .route_paths import INGEST_EXECUTIONS_ROUTE


def submit_execution(
    *,
    client: IngestHttpClient,
    config: ReporterConfig,
    results: List[CaseResultInput],
    window: ExecutionWindow,
) -> IngestExecutionReceipt:
    requests = build_execution_requests(config=config, results=results, window=window)
    receipts = []
    for request in requests:
        raw = client.post_json(INGEST_EXECUTIONS_ROUTE, request.to_wire())
        receipts.append(IngestExecutionReceipt.from_wire(raw))
    return merge_receipts(receipts)
