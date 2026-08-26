"""多批的对账单合成一份给人看。

分批是 SDK 的实现细节，人关心的是「这一轮结果扩散到了哪些任务」（D34）。
按批打印会让同一个任务出现三行、每行一个数字，人得自己做加法——
而这正是 §7.2 第 3 条要避免的：`writtenTo` 是唯一的披露点，它必须一眼能读。
"""

from __future__ import annotations

from typing import Dict, List

from .contract_types import IngestExecutionReceipt, IngestWrittenToEntry


def merge_receipts(receipts: List[IngestExecutionReceipt]) -> IngestExecutionReceipt:
    """⚠️ **只有 `writtenTo` 按 runId 合并求和，三类拒绝一律原样拼接、不去重**。

    去重会把「同一条 sourceRef 在两个任务各被拒一次」压成一条，那是在丢信息；
    「逐条列出、绝不静默丢弃」是沿用 `InvalidRunCases` 的既定语义。
    """
    written_to: Dict[str, IngestWrittenToEntry] = {}
    out_of_scope = []
    skipped_manual = []
    unmatched_cases = []
    for receipt in receipts:
        out_of_scope.extend(receipt.out_of_scope)
        skipped_manual.extend(receipt.skipped_manual)
        unmatched_cases.extend(receipt.unmatched_cases)
        for entry in receipt.written_to:
            previous = written_to.get(entry.run_id)
            written_to[entry.run_id] = IngestWrittenToEntry(
                run_id=entry.run_id,
                run_name=entry.run_name,
                updated=(previous.updated if previous else 0) + entry.updated,
            )
    return IngestExecutionReceipt(
        # 多批时 executionId 有多个，取第一批的：它是人回平台查执行记录的入口，
        # 而同一个 run key 派生出的这几行在报告里本来就是相邻的。
        execution_id=receipts[0].execution_id if receipts else "",
        out_of_scope=out_of_scope,
        skipped_manual=skipped_manual,
        unmatched_cases=unmatched_cases,
        written_to=list(written_to.values()),
    )


def has_no_writes(receipt: IngestExecutionReceipt) -> bool:
    """`writtenTo` 为空 = 一条都没写进去。

    **这是 SDK 唯一据以报错的信号**（§7.2 第 4 条），不看 HTTP 状态码：
    服务端在这种情况下返回的仍然是 200 加一份说明详尽的对账单（§5.8——
    状态码表达「请求本身有没有问题」，对账单表达「业务上发生了什么」）。
    """
    return len(receipt.written_to) == 0
