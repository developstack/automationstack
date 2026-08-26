"""对账单打印（§7.2 第 3 条）。字样与规格里给的样例逐字一致。"""

from __future__ import annotations

import unicodedata
from dataclasses import replace

from automationstack_sdk import (
    AttachmentOutcome,
    IngestExecutionReceipt,
    IngestOutOfScopeEntry,
    IngestSkippedManualEntry,
    IngestUnmatchedCaseEntry,
    IngestWrittenToEntry,
    format_attachment_lines,
    format_receipt_lines,
)

RECEIPT = IngestExecutionReceipt(
    execution_id="exec-1",
    out_of_scope=[
        IngestOutOfScopeEntry(
            case_id="case-31",
            reason="不在任何未提交任务的范围内",
            run_name=None,
            source_ref="PAY-CART-031",
        )
    ],
    skipped_manual=[
        IngestSkippedManualEntry(
            reason="已有人工结论", run_name="v2.3 回归", source_ref="PAY-CART-007"
        )
    ],
    unmatched_cases=[
        IngestUnmatchedCaseEntry(
            reason="项目里没有这个 sourceRef 的用例", source_ref="PAY-NEW-099"
        )
    ],
    written_to=[
        IngestWrittenToEntry(run_id="run-a", run_name="v2.3 回归", updated=78),
        IngestWrittenToEntry(run_id="run-b", run_name="支付模块专项", updated=12),
    ],
)


def test_written_to_prints_one_line_per_run() -> None:
    """写进三个任务日志里就得有三行——它是「扩散到了哪些任务」的唯一披露点（D34）。"""
    lines = format_receipt_lines(RECEIPT)
    written = [line for line in lines if line.startswith("写入 ")]
    assert len(written) == 2
    assert "《v2.3 回归》" in written[0] and "78 条" in written[0]
    assert "《支付模块专项》" in written[1] and "12 条" in written[1]


def test_three_rejection_categories_print_verbatim() -> None:
    """跳过 / 未匹配 / 越界三类逐条打，理由是服务端原文。"""
    lines = format_receipt_lines(RECEIPT)
    assert "跳过 1 条（已有人工结论）：PAY-CART-007 @《v2.3 回归》" in lines
    assert "未匹配 1 条（项目里没有这个 sourceRef 的用例）：PAY-NEW-099" in lines
    assert "越界 1 条（不在任何未提交任务的范围内）：PAY-CART-031" in lines


def test_nothing_is_swallowed() -> None:
    text = "\n".join(format_receipt_lines(RECEIPT))
    for source_ref in ("PAY-CART-007", "PAY-NEW-099", "PAY-CART-031"):
        assert source_ref in text


def test_out_of_scope_names_the_run_when_there_is_one() -> None:
    """否则对账单读起来自相矛盾：说越界，却不说被哪个任务拒了。"""
    lines = format_receipt_lines(
        replace(
            RECEIPT,
            out_of_scope=[
                IngestOutOfScopeEntry(
                    case_id="case-1",
                    reason="任务还在待评审",
                    run_name="支付模块专项",
                    source_ref="PAY-CART-031",
                )
            ],
        )
    )
    assert "越界 1 条（任务还在待评审）：PAY-CART-031 @《支付模块专项》" in lines


def test_empty_written_to_still_prints_a_line() -> None:
    """什么都不打会让「一条都没写」和「日志被截断了」看起来一模一样。"""
    assert "写入 0 个测试任务" in format_receipt_lines(replace(RECEIPT, written_to=[]))


def _terminal_width(text: str) -> int:
    """刻意在测试里把宽度规则重写一遍，而不是 import 生产代码里那个私有函数：
    共用一份实现的话，规则写错了两边会一起错，这条断言就白写了。"""
    return sum(2 if ord(char) > 0x1100 and unicodedata.east_asian_width(char) in "WF" else 1 for char in text)


def test_run_names_are_column_aligned() -> None:
    """中文按两格宽算，否则任务名一长一短时数字对不齐。"""
    lines = [line for line in format_receipt_lines(RECEIPT) if line.startswith("写入 ")]
    assert _terminal_width(lines[0].split("78 条")[0]) == _terminal_width(
        lines[1].split("12 条")[0]
    )


def test_attachment_degradation_prints_separately() -> None:
    """附件不参与退出码判定，但拒绝理由要逐条列出（§5.6）。"""
    assert format_attachment_lines(
        AttachmentOutcome(rejections=["A：存储未配置"], storage_configured=False)
    ) == [
        "附件 存储未配置，本轮附件全部跳过；结论已正常写入",
        "附件 被拒：A：存储未配置",
    ]
    assert format_attachment_lines(AttachmentOutcome()) == []
