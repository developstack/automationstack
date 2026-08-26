"""把攒了一整轮的结果切成若干个请求体（§7.2 第 1 条「缓冲后批量提交」）。

**不逐条发**：`ensureRunWritable` 对 `test_runs` 行加 `FOR UPDATE`，逐条上报
就是逐条开事务抢同一把行锁，80 条就是 80 次串行往返；QA 本机的网络还不稳，
跑一条报一条既慢又碎（§5.5 / D29）。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from .config import ReporterConfig
from .contract_limits import MAX_INGEST_COMMENT_LENGTH, RESULTS_PER_BATCH
from .contract_types import IngestExecutionRequestWire, IngestExecutionResultWire
from .idempotency import derive_batch_idempotency_key
from .reporter_types import CaseResultInput

_TRUNCATION_SUFFIX = "…（已截断，完整堆栈见 log 附件）"


@dataclass(frozen=True)
class ExecutionWindow:
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


def _to_iso(moment: Optional[datetime]) -> Optional[str]:
    """服务端要的是 ISO-8601。

    `datetime.isoformat()` 对 naive 时间不带时区后缀，服务端会按 UTC 理解——
    而 QA 本机基本都是 +08:00，那会让「什么时候跑的」整体偏八小时。
    所以 naive 的一律先按本地时区补上 offset，再序列化。
    """
    if moment is None:
        return None
    if moment.tzinfo is None:
        moment = moment.astimezone()
    return moment.isoformat()


def truncate_message(message: Optional[str]) -> Optional[str]:
    """截断在 SDK 侧先做一次（§5.1.1 明确写了「SDK 侧负责」）。

    尾巴上留一句话说明被截了：不留的话，人在失败清单上看到的是一句
    戛然而止的 traceback，会以为是脚本自己输出成那样的。
    """
    if not message:
        return None
    if len(message) <= MAX_INGEST_COMMENT_LENGTH:
        return message
    keep = MAX_INGEST_COMMENT_LENGTH - len(_TRUNCATION_SUFFIX)
    return message[:keep] + _TRUNCATION_SUFFIX


def _to_wire_result(item: CaseResultInput) -> IngestExecutionResultWire:
    return IngestExecutionResultWire(
        duration_ms=item.duration_ms,
        message=truncate_message(item.message),
        result=item.result,
        source_ref=item.source_ref,
    )


def chunk_results(
    results: List[CaseResultInput], batch_size: int = RESULTS_PER_BATCH
) -> List[List[CaseResultInput]]:
    if not results:
        # 空数组仍然要发一批：一次「过滤条件没匹配上任何用例」的执行照样该留下
        # 执行记录，而且 `writtenTo` 为空这件事必须由服务端的对账单说出来
        # （§7.2 第 4 条要透传的正是它的理由），SDK 自己短路掉就没有理由可透传。
        return [[]]
    return [results[start : start + batch_size] for start in range(0, len(results), batch_size)]


def build_execution_requests(
    *,
    config: ReporterConfig,
    results: List[CaseResultInput],
    window: ExecutionWindow,
) -> List[IngestExecutionRequestWire]:
    """⚠️ **每批一个不同的幂等键，但每个键都从同一个 run key 确定性派生**。

    `UNIQUE (projectId, idempotencyKey)` 是按请求判的：几批共用一个键时，
    第二批会命中第一批的缓存对账单直接返回，后面的结论一条都写不进去，
    而 SDK 拿到的是两份看起来都成功的对账单。派生保证了重试第 N 批时
    算出来的还是同一个键——这才是「重试复用幂等键」（§7.2 第 2 条）。
    """
    started_at = _to_iso(window.started_at)
    finished_at = _to_iso(window.finished_at)
    return [
        IngestExecutionRequestWire(
            branch=config.branch,
            ci_url=config.ci_url,
            commit_sha=config.commit_sha,
            finished_at=finished_at,
            idempotency_key=derive_batch_idempotency_key(
                config.idempotency_key, batch_index
            ),
            overwrite_manual=config.overwrite_manual,
            project_id=config.project_id,
            results=[_to_wire_result(item) for item in batch],
            run_ids=config.run_ids,
            started_at=started_at,
        )
        for batch_index, batch in enumerate(chunk_results(results))
    ]
