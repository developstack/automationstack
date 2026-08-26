"""§7.2 第 4 条的**手工触发入口**：一条都没写进去时，进程必须非零退出。

    ./.venv/bin/python -m src.report_empty_write
    echo $?          # 1

## 为什么单独一个入口，而不是给主入口加个开关

这条路径的全部价值在于**能被亲眼看到**。藏在 `--force-empty` 之类的开关后面，
就得先有人知道那个开关存在；而知道它存在的人，本来也就不需要被说服。
单独一条命令，任何人跑一次就看得见退出码。

它报一条**故意不存在**的 sourceRef：项目里没有这条用例 → 全量落进 `unmatchedCases`
→ `writtenTo` 为空 → 核心包抛 `IngestEmptyWriteError` 并把退出码摁成 1。
顺带演示对账单三类拒绝里的「未匹配」——它与「越界」是两件事，
平台从不把它们合并成一句「上报失败」（§5.8）。

⚠️ 服务端这时返回的仍然是 **200**：HTTP 状态码表达「请求本身有没有问题」，
对账单表达「业务上发生了什么」。把「没有任何任务收这批用例」做成 404，
SDK 就分不清是路由错了还是业务结果。翻译成非零退出码是 SDK 的职责。

## 它同时也是「不装 pytest 也能用核心包」的完整证据

**这个文件从头到尾没有 import pytest。** `automationstack-sdk` 的 `dependencies`
是空的，它不认识任何测试框架；README 里那段十行的用法，可跑的版本就是下面的 `main()`。
你要接的是 robot / unittest / 一个自己写的 runner，照着这个形状搬即可：
`AutomationStackReporter()` → 若干次 `add_result` → 一次 `finish()`。
"""

from __future__ import annotations

import sys
from pathlib import Path

from automationstack_sdk import (
    AutomationStackReporter,
    CaseResultInput,
    IngestEmptyWriteError,
)

from .env_file import load_env_file

#: 故意写成一个不可能存在的 sourceRef。
#: 种子脚本**不会**造它——造了这个入口就演示不了任何东西了。
MISSING_SOURCE_REF = "AUTO-DOES-NOT-EXIST-999"

_DEMO_DURATION_MS = 42

#: 「示例自己的前提没成立」用 2，与第 4 条那条正常演示路径（1）区分开：
#: 两种情况要做的事完全不同（一个去看平台数据，一个是演示成功了）。
_EXIT_PREMISE_BROKEN = 2

_EXIT_EMPTY_WRITE = 1


def main() -> int:
    load_env_file(Path(__file__).resolve().parent.parent / ".env")
    # 构造时就解析并校验配置：缺 AS_TOKEN 这种事必须在这一行炸，
    # 而不是等一轮测试跑完二十分钟才发现结果无处可去。
    reporter = AutomationStackReporter()
    print(
        "[example] 故意上报一条不存在的用例：{0}（幂等键 {1}）".format(
            MISSING_SOURCE_REF, reporter.idempotency_key
        )
    )
    reporter.add_result(
        CaseResultInput(
            duration_ms=_DEMO_DURATION_MS,
            result="passed",
            source_ref=MISSING_SOURCE_REF,
        )
    )
    try:
        reporter.finish()
    except IngestEmptyWriteError as error:
        # ⚠️ 先把 stdout 刷干净再往 stderr 写。对账单走 stdout，下面这两行走 stderr，
        # 而 stdout 一旦被重定向进管道/文件（CI 日志就是）就变成块缓冲——不刷的话
        # 「一条都没写进去」会印在对账单**前面**，读的人先看见结论再看见原因，
        # 而这两半本来就是同一件事。
        sys.stdout.flush()
        # 这就是要演示的那条路径：对账单已由核心包原样打完，这里再把逐条理由打一遍
        # （核心包把服务端原文带在 message 里），然后非零退出。
        print("[example] 一条都没写进去：\n{0}".format(error), file=sys.stderr)
        print("[example] 按 §7.2 第 4 条，进程以退出码 1 结束", file=sys.stderr)
        return _EXIT_EMPTY_WRITE
    # 走到这里说明服务端居然写进去了——那不是「示例通过」，是这个演示的前提没成立。
    sys.stdout.flush()
    print(
        "[example] ⚠️ 预期是一条都写不进去，实际却写进去了："
        "请确认演示项目里没有 {0} 这条 sourceRef".format(MISSING_SOURCE_REF),
        file=sys.stderr,
    )
    return _EXIT_PREMISE_BROKEN


if __name__ == "__main__":
    sys.exit(main())
