"""多批对账单的合并。"""

from __future__ import annotations

from automationstack_sdk import (
    IngestExecutionReceipt,
    IngestUnmatchedCaseEntry,
    IngestWrittenToEntry,
    has_no_writes,
    merge_receipts,
)


def _receipt(execution_id: str, written, unmatched=()) -> IngestExecutionReceipt:
    return IngestExecutionReceipt(
        execution_id=execution_id,
        out_of_scope=[],
        skipped_manual=[],
        unmatched_cases=list(unmatched),
        written_to=list(written),
    )


def test_written_to_sums_per_run() -> None:
    """按批打印会让同一个任务出现三行，人得自己做加法——那正是要避免的。"""
    merged = merge_receipts(
        [
            _receipt("e1", [IngestWrittenToEntry("run-a", "v2.3 回归", 78)]),
            _receipt(
                "e2",
                [
                    IngestWrittenToEntry("run-a", "v2.3 回归", 12),
                    IngestWrittenToEntry("run-b", "支付模块专项", 3),
                ],
            ),
        ]
    )
    assert {(e.run_id, e.updated) for e in merged.written_to} == {
        ("run-a", 90),
        ("run-b", 3),
    }
    # 多批时取第一批的 executionId：它是人回平台查执行记录的入口。
    assert merged.execution_id == "e1"


def test_rejections_are_concatenated_not_deduplicated() -> None:
    """去重会把「同一条 sourceRef 在两个任务各被拒一次」压成一条，那是在丢信息。"""
    entry = IngestUnmatchedCaseEntry(reason="项目里没有这个 sourceRef 的用例", source_ref="X")
    merged = merge_receipts([_receipt("e1", [], [entry]), _receipt("e2", [], [entry])])
    assert len(merged.unmatched_cases) == 2


def test_has_no_writes_ignores_http_status() -> None:
    """服务端在这种情况下返回的仍然是 200 加一份说明详尽的对账单（§5.8）。"""
    assert has_no_writes(_receipt("e1", []))
    assert not has_no_writes(_receipt("e1", [IngestWrittenToEntry("r", "n", 1)]))


def test_merging_nothing_does_not_explode() -> None:
    assert merge_receipts([]).execution_id == ""
