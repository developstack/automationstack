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

load_env_file(EXAMPLE_ROOT / ".env")

_SOURCE_REFS: Dict[str, str] = {}

_TRACES: Dict[str, CaseTrace] = {}

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
        return
    print()
    queued = 0
    for source_ref in _FAILED_SOURCE_REFS:
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
