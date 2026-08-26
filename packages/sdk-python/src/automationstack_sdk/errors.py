"""SDK 抛的三种异常，以及「让进程带着非零退出码结束」那件事。

`writtenTo` 为空必须报错且退出码非零（§7.2 第 4 条）。**静默成功是最坏的情况**：
QA 以为结果进去了，实际一条都没写。
"""

from __future__ import annotations

import atexit
import os
import sys
from typing import Optional

from .contract_types import IngestExecutionReceipt

NO_REASON_FALLBACK = (
    "服务端没有给出任何拒绝理由（本轮 results 为空？）"
    "——这一句是 SDK 说的，不是服务端说的"
)


def _build_empty_write_message(receipt: IngestExecutionReceipt) -> str:
    """把服务端逐条给出的拒绝理由**原样**拼进异常消息，一个字都不概括。

    「一条都没写进去」的原因有好几种（用例不存在、没有未提交任务收它、任务被提交
    锁掉、任务还在待评审），SDK 自己编一句「上报失败」会把它们抹平成同一件事，
    而人要照着这句话决定是去补 sourceRef 还是去建测试任务。
    """
    reasons = (
        ["{0}：{1}".format(e.source_ref, e.reason) for e in receipt.unmatched_cases]
        + ["{0}：{1}".format(e.source_ref, e.reason) for e in receipt.out_of_scope]
        + [
            "{0} @《{1}》：{2}".format(e.source_ref, e.run_name, e.reason)
            for e in receipt.skipped_manual
        ]
    )
    detail = "\n  ".join(reasons) if reasons else NO_REASON_FALLBACK
    return (
        "本轮结果一条都没有写进任何测试任务（writtenTo 为空）。"
        "服务端逐条给出的理由：\n  " + detail
    )


class IngestEmptyWriteError(Exception):
    """`writtenTo` 为空时抛的错（§7.2 第 4 条）。

    异常里挂着完整对账单，调用方（比如 pytest 插件）拿它去设自己的退出码，
    不用重新解析一遍消息文本。
    """

    def __init__(self, receipt: IngestExecutionReceipt) -> None:
        super().__init__(_build_empty_write_message(receipt))
        self.receipt = receipt


class IngestHttpError(Exception):
    """一次 HTTP 调用没成功。`server_message` 是服务端 `message` 字段的原文。"""

    def __init__(self, status: int, server_message: Optional[str], url: str) -> None:
        suffix = "：{0}".format(server_message) if server_message else ""
        super().__init__("{0} 返回 {1}{2}".format(url, status, suffix))
        self.server_message = server_message
        self.status = status


class ReporterConfigError(Exception):
    """配置缺项。构造 reporter 的那一刻就抛，绝不拖到跑完测试。"""


_pending_failure = False
_hook_registered = False


def _flush_and_exit_nonzero() -> None:
    if not _pending_failure:
        return
    # `os._exit` 会跳过缓冲区刷写，所以自己先刷一遍——对账单正是在这之前打出来的，
    # 吞掉它等于把「为什么失败」一起吞掉。
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(1)


def arm_nonzero_exit() -> None:
    """预约退出钩子。**在构造 reporter 时调**，不是在失败时调。

    Node 版那边是 `process.exitCode = 1`——一个「软」标记，不打断任何东西。
    Python 没有这个东西：`sys.exit()` 只是抛 `SystemExit`，而 reporter 常常
    跑在别人的钩子里（pytest 的 `sessionfinish`、`atexit`），异常在那里会被吞掉，
    §7.2 第 4 条要的非零退出码就没了。能真正把退出码摁成非零的只有 `os._exit`。

    代价是它会跳过**在本函数之后**注册的 atexit 钩子。所以注册时机很关键：
    atexit 是后进先出，越早注册越晚执行——在构造 reporter 时就注册，
    意味着测试进程里绝大多数钩子（它们都在跑测试的过程中才注册）都排在我们前面，
    照常执行完才轮到我们。真正会被跳过的只有比 SDK 更早导入的那几个
    （典型的是 coverage），所以 pytest 插件那边**不用**这条通道：
    它直接设 `session.exitstatus`，那是 pytest 自己的、干净的机制。
    """
    global _hook_registered  # noqa: PLW0603 — 同上，进程级的一个开关
    if _hook_registered:
        # 一个进程里建两个 reporter 时不重复注册：多注册一次没有坏处，
        # 但会让 atexit 的执行顺序更难讲清楚，而顺序正是这条通道的关键。
        return
    _hook_registered = True
    atexit.register(_flush_and_exit_nonzero)


def mark_nonzero_exit() -> None:
    """扣下扳机。`arm_nonzero_exit` 没被调过时它什么也不做——这是刻意的：
    没预约就说明调用方（插件）自己管退出码，SDK 不该越过他去改。"""
    global _pending_failure  # noqa: PLW0603 — 进程级的一个开关，没有第二个实例
    _pending_failure = True
