"""把「失败现场」接到 `pytest-automationstack` 上：截图 + 完整日志走预签名 PUT。

## 这个文件为什么存在

插件自己**只**在一种情况下传附件：断言输出超过 `MAX_INGEST_COMMENT_LENGTH`（2000）时
把完整堆栈另传一份 `log`。它不截图，也不知道你的框架把现场留在哪——
截图是 playwright / appium / selenium 各自的事，插件不认识它们中的任何一个。
所以「失败 → 收集现场 → 挂到这条 sourceRef 上」这段接线在**你的仓库里**，
就是下面这几十行；换测试框架时要改的也只有它。

## 三段接线，各自的落点

1. `pytest_collection_modifyitems`：记下 nodeid → sourceRef，`trace` fixture 要用；
2. `pytest_runtest_logreport`：call 阶段失败就把现场落盘（`artifacts/`）；
3. `pytest_sessionfinish`：用插件的公开入口 `add_attachment()` 把落盘的文件挂上去，
   **必须赶在插件调 `finish()` 之前**。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import pytest
from pytest_automationstack import add_attachment

from src.artifacts import CaseTrace, collect_failure_attachments
from src.env_file import load_env_file

EXAMPLE_ROOT = Path(__file__).resolve().parent

#: ⚠️ 在 **import 时**读 `.env`，不是在 `pytest_configure` 里。
#: 插件的 `pytest_configure` 就是它构造 reporter（并因此校验 AS_TOKEN）的地方，
#: 而 conftest 与插件的 hook 谁先跑取决于注册顺序——把配置的可用性押在那个顺序上，
#: 表现会是「偶尔缺 token」。conftest 模块的 import 一定早于任何 hook，这里没有竞争。
load_env_file(EXAMPLE_ROOT / ".env")

#: nodeid → sourceRef。marker 挂在 item 上，而失败报告只有 nodeid，得自己搭这座桥。
_SOURCE_REFS: Dict[str, str] = {}

#: nodeid → 这条用例的现场记录器。
_TRACES: Dict[str, CaseTrace] = {}

#: 本轮失败的 sourceRef，收工时按它去 `artifacts/` 回捡附件。
_FAILED_SOURCE_REFS: List[str] = []


@pytest.fixture
def trace(request: Any) -> CaseTrace:
    """给用例一支笔，把「跑到哪一步了」记下来；只有失败时才会落盘成附件。"""
    source_ref = _SOURCE_REFS.get(request.node.nodeid, request.node.nodeid)
    recorder = CaseTrace(source_ref)
    _TRACES[request.node.nodeid] = recorder
    return recorder


def pytest_collection_modifyitems(items: List[Any]) -> None:
    for item in items:
        marker = item.get_closest_marker("automationstack")
        if marker is None:
            continue
        # 与插件读 marker 的规则保持一致（位置参数优先，其次 source_ref=）。
        # 这里不 import 插件的 `source_ref_of`：那是它的内部模块，
        # 而这几行的意思一眼就能看完，比多一条内部依赖划算。
        if marker.args:
            _SOURCE_REFS[item.nodeid] = str(marker.args[0])
        elif "source_ref" in marker.kwargs:
            _SOURCE_REFS[item.nodeid] = str(marker.kwargs["source_ref"])


def pytest_runtest_logreport(report: Any) -> None:
    """只认 call 阶段的失败。

    setup 炸了插件会报 `blocked`（用例根本没跑起来），那时没有「现场」可言——
    截一张登录页的图挂上去，只会让看失败清单的人以为用例跑到了那一步。
    """
    if report.when != "call" or not report.failed:
        return
    source_ref = _SOURCE_REFS.get(report.nodeid)
    if source_ref is None:
        return
    recorder = _TRACES.get(report.nodeid) or CaseTrace(source_ref)
    recorder.save_failure(report.longreprtext)
    _FAILED_SOURCE_REFS.append(source_ref)


@pytest.hookimpl(tryfirst=True)
def pytest_sessionfinish(session: Any) -> None:
    """⚠️ `tryfirst` 不是装饰用的。

    插件的 `pytest_sessionfinish` 就是调 `finish()`（发请求、打对账单）的那一下；
    附件必须在**那之前**入队，晚一步就永远发不出去了。同名 hook 的调用顺序按注册
    顺序倒序来，conftest 恰好排在插件前面——但「恰好」不是可以依赖的东西，
    `tryfirst` 把它变成显式的。
    """
    if not session.config.getoption("--automationstack", default=False):
        # 没加开关时整条附件线原地静默。`add_attachment()` 本身也是空操作（返回
        # False），这里提前返回只是为了连示例自己的这几行也一起闭嘴：不带开关的
        # `pytest` 必须能在没有 AS_TOKEN 的机器上跑通，它的输出也该干干净净。
        return
    # 收工时 pytest 那行进度条（`.Fs... [100%]`）还没换行，不断一下的话
    # 下面第一行会直接粘在 `[100%]` 后面。对账单是这份示例的交付物，
    # 让它从行首开始值这一个 print()。
    print()
    queued = 0
    for source_ref in _FAILED_SOURCE_REFS:
        # `add_attachment()` 是插件的公开入口：附件挂在**这一轮的那个** reporter 上。
        # 自己 new 一个 AutomationStackReporter 就是另一次执行、另一个 execution id，
        # 附件会挂到一份没有结论的记录上。
        attachments = collect_failure_attachments(source_ref)
        queued += sum(
            1 for attachment in attachments if add_attachment(session.config, attachment)
        )
        print(
            "[example] {0} 带 {1} 个附件（截图 + 完整日志）".format(
                source_ref, len(attachments)
            )
        )
    print(
        "[example] {0} 个附件只是入了队；一个请求都还没发，它们随插件收工时"
        "那一次上报一起走".format(queued)
    )
