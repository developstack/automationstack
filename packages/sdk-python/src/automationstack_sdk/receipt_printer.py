"""对账单的渲染（§7.2 第 3 条）。**本包唯一往终端写东西的地方。**

集中在一处是有意的：散落各处的 `print` 会让「哪些信息一定会被打出来」
变成一件要通读全包才能回答的事，而对账单是用户**唯一**的反馈渠道。
渲染是纯函数（`format_receipt_lines`），输出只有 `print_receipt` 一处——
测试断言的是前者，后者只负责把字符串交给 sink。

三类拒绝**按服务端给的 `reason` 原文分组**，一条不漏地列出 sourceRef。
分组而不是逐行重复类别标题，是因为同一类里的理由通常只有两三种；
但**理由本身一个字都不改写**——§7.2 第 4 条要的就是原样透传，
SDK 自己概括一句「上报失败」会把「用例不存在」和「任务还在待评审」抹平成同一件事。
"""

from __future__ import annotations

import re
import sys
from typing import Callable, List, Tuple

from .contract_types import IngestExecutionReceipt
from .reporter_types import AttachmentOutcome

ReceiptSink = Callable[[str], None]

_CJK_PATTERN = re.compile(
    "[\u1100-\u115f\u2e80-\u4dbf\u4e00-\u9fff\uac00-\ud7a3"
    "\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]"
)


def _display_width(text: str) -> int:
    """中文按两格宽算，否则任务名一长一短时 `writtenTo` 那几行的数字对不齐。

    没有用 `unicodedata.east_asian_width`：它把 `Ambiguous`（比如「《》」两侧
    偶尔出现的希腊字母、箭头）也算成宽，各家终端对那一类的实际渲染并不一致。
    这里与 Node 版共用同一张字符表，两个 SDK 打出来的对账单能对得上行。
    """
    return sum(2 if _CJK_PATTERN.match(char) else 1 for char in text)


def _pad_to_width(text: str, target: int) -> str:
    return text + " " * max(0, target - _display_width(text))


def _group_by_reason(entries: List[Tuple[str, str]], category: str) -> List[str]:
    grouped: List[Tuple[str, List[str]]] = []
    index_of = {}
    for label, reason in entries:
        if reason in index_of:
            grouped[index_of[reason]][1].append(label)
        else:
            index_of[reason] = len(grouped)
            grouped.append((reason, [label]))
    return [
        "{0} {1} 条（{2}）：{3}".format(category, len(labels), reason, "、".join(labels))
        for reason, labels in grouped
    ]


def _format_written_to(receipt: IngestExecutionReceipt) -> List[str]:
    names = ["《{0}》".format(entry.run_name) for entry in receipt.written_to]
    widest = max([_display_width(name) for name in names] + [0])
    return [
        "写入 {0}  {1} 条".format(_pad_to_width(name, widest), entry.updated)
        for name, entry in zip(names, receipt.written_to)
    ]


def format_receipt_lines(receipt: IngestExecutionReceipt) -> List[str]:
    """⚠️ `writtenTo` 为空时**也要打**一行说明。

    什么都不打会让「一条都没写」和「日志被截断了」看起来一模一样。
    """
    lines = ["[automationstack] 上报对账单（execution {0}）".format(receipt.execution_id)]
    if receipt.written_to:
        lines.extend(_format_written_to(receipt))
    else:
        lines.append("写入 0 个测试任务")
    lines.extend(
        _group_by_reason(
            [
                ("{0} @《{1}》".format(e.source_ref, e.run_name), e.reason)
                for e in receipt.skipped_manual
            ],
            "跳过",
        )
    )
    lines.extend(
        _group_by_reason(
            [(e.source_ref, e.reason) for e in receipt.unmatched_cases], "未匹配"
        )
    )
    lines.extend(
        _group_by_reason(
            [
                (
                    "{0} @《{1}》".format(e.source_ref, e.run_name)
                    if e.run_name
                    else e.source_ref,
                    e.reason,
                )
                for e in receipt.out_of_scope
            ],
            "越界",
        )
    )
    return lines


def format_attachment_lines(outcome: AttachmentOutcome) -> List[str]:
    """附件那一轮单独打。

    它**不参与退出码判定**：R2 没配置、配额用完都只是降级，结论那一轮早就写进去了，
    让附件拖垮整次上报是 §5.6 明确否掉的（同第二期 D9）。
    """
    if outcome.uploaded == 0 and not outcome.rejections:
        return []
    if outcome.storage_configured:
        lines = [
            "附件 已登记 {0} 个（上传 {1} 个）".format(outcome.registered, outcome.uploaded)
        ]
    else:
        lines = ["附件 存储未配置，本轮附件全部跳过；结论已正常写入"]
    lines.extend("附件 被拒：{0}".format(reason) for reason in outcome.rejections)
    return lines


def default_sink(line: str) -> None:
    print(line, file=sys.stdout)


def print_receipt(receipt, attachments, sink: ReceiptSink = default_sink) -> None:
    for line in format_receipt_lines(receipt):
        sink(line)
    if attachments is not None:
        for line in format_attachment_lines(attachments):
            sink(line)
