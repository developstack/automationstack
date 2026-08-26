"""分批与截断（§7.2 第 1、2 条）。"""

from __future__ import annotations

from datetime import datetime, timezone

from automationstack_sdk import (
    MAX_INGEST_COMMENT_LENGTH,
    RESULTS_PER_BATCH,
    CaseResultInput,
    ExecutionWindow,
    build_execution_requests,
    chunk_results,
    derive_batch_idempotency_key,
    resolve_reporter_config,
    truncate_message,
)

from conftest import BASE_CONFIG

CONFIG = resolve_reporter_config(env={}, **BASE_CONFIG)
WINDOW = ExecutionWindow(
    finished_at=datetime(2026, 8, 25, 6, 14, 22, tzinfo=timezone.utc),
    started_at=datetime(2026, 8, 25, 6, 0, 0, tzinfo=timezone.utc),
)


def _results(count: int):
    return [
        CaseResultInput(result="passed", source_ref="PAY-{0:04d}".format(i))
        for i in range(count)
    ]


def test_empty_run_still_sends_one_request() -> None:
    """一次没匹配上任何用例的执行也该留下执行记录，
    而且 writtenTo 为空的理由必须由服务端说出来（§7.2 第 4 条）。"""
    assert chunk_results([]) == [[]]


def test_splits_at_the_batch_size() -> None:
    batches = chunk_results(_results(RESULTS_PER_BATCH * 2 + 1))
    assert [len(b) for b in batches] == [RESULTS_PER_BATCH, RESULTS_PER_BATCH, 1]


def test_each_batch_derives_its_key_from_the_run_key() -> None:
    """几批共用一个键的话第二批会命中第一批的缓存对账单，结论一条都写不进去。"""
    requests = build_execution_requests(
        config=CONFIG, results=_results(RESULTS_PER_BATCH + 5), window=WINDOW
    )
    assert len(requests) == 2
    assert requests[0].idempotency_key == CONFIG.idempotency_key
    assert requests[1].idempotency_key == derive_batch_idempotency_key(
        CONFIG.idempotency_key, 1
    )
    assert requests[0].idempotency_key != requests[1].idempotency_key


def test_wire_body_has_no_singular_run_id() -> None:
    """服务端把 `runId` 声明成了 z.never()，发过去是一条 400（D31）。"""
    wire = build_execution_requests(
        config=CONFIG, results=_results(1), window=WINDOW
    )[0].to_wire()
    assert "runId" not in wire
    assert wire["runIds"] is None
    assert wire["startedAt"] == "2026-08-25T06:00:00+00:00"
    assert wire["results"][0] == {
        "durationMs": None,
        "message": None,
        "result": "passed",
        "sourceRef": "PAY-0000",
    }


def test_truncates_long_messages_with_a_visible_marker() -> None:
    """不留标记的话人会以为是脚本自己输出成那样的。"""
    truncated = truncate_message("x" * (MAX_INGEST_COMMENT_LENGTH * 3))
    assert truncated is not None
    assert len(truncated) == MAX_INGEST_COMMENT_LENGTH
    assert truncated.endswith("（已截断，完整堆栈见 log 附件）")


def test_short_messages_pass_through_untouched() -> None:
    assert truncate_message("expected 200, got 500") == "expected 200, got 500"
    assert truncate_message(None) is None
    assert truncate_message("") is None


def test_naive_datetimes_get_a_local_offset() -> None:
    """naive 时间不带 offset 会被服务端按 UTC 理解，
    而 QA 本机基本都是 +08:00——「什么时候跑的」会整体偏八小时。"""
    wire = build_execution_requests(
        config=CONFIG,
        results=_results(1),
        window=ExecutionWindow(started_at=datetime(2026, 8, 25, 14, 0, 0)),
    )[0].to_wire()
    assert wire["startedAt"] is not None
    assert wire["startedAt"][-6] in {"+", "-"}
