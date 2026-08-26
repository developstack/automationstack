"""§7.2 第 4 条的另一半：**退出码非零**。

这条只能在子进程里验——本进程一旦真的走到 `os._exit(1)`，测试套件就没了。
所以这里跑一个真正的 python 子进程，断言它的 returncode。
"""

from __future__ import annotations

import subprocess
import sys
import textwrap

SCRIPT = textwrap.dedent(
    """
    import json, sys
    from automationstack_sdk import (
        AutomationStackReporter, CaseResultInput, HttpResponse,
    )

    EMPTY = {
        "executionId": "e1",
        "outOfScope": [],
        "skippedManual": [],
        "unmatchedCases": [
            {"reason": "项目里没有这个 sourceRef 的用例", "sourceRef": "PAY-NEW-099"}
        ],
        "writtenTo": [],
    }

    def transport(request):
        return HttpResponse(status=200, body=json.dumps(EMPTY).encode("utf-8"))

    reporter = AutomationStackReporter(
        base_url="https://qa.example.com",
        idempotency_key="3f2a1b4c-5d6e-4f70-8912-a3b4c5d6e7f8",
        project_id="p",
        token="as_live_xxxxxxxx",
        transport=transport,
    )
    reporter.add_result(CaseResultInput(result="passed", source_ref="PAY-NEW-099"))
    try:
        reporter.finish()
    except Exception as error:
        # 故意把异常吞掉——框架的钩子里这是常态。退出码仍然必须非零。
        print("swallowed:", type(error).__name__)
    print("脚本自己跑完了")
    """
)


def _run(script: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, check=False
    )


def test_empty_write_forces_nonzero_exit_even_when_swallowed() -> None:
    """静默成功是最坏的情况：QA 以为结果进去了，实际一条都没写。"""
    finished = _run(SCRIPT)
    assert finished.returncode != 0, finished.stdout + finished.stderr
    # 对账单必须在退出前刷出来——`os._exit` 会跳过缓冲区刷写，所以 SDK 自己先刷。
    assert "写入 0 个测试任务" in finished.stdout
    assert "swallowed: IngestEmptyWriteError" in finished.stdout
    assert "脚本自己跑完了" in finished.stdout


def test_opting_out_leaves_the_exit_code_alone() -> None:
    """插件那边自己管退出码（session.exitstatus），SDK 不该越过它去摁。"""
    finished = _run(SCRIPT.replace("transport=transport,", "transport=transport, exit_on_empty_write=False,"))
    assert finished.returncode == 0, finished.stdout + finished.stderr


def test_successful_run_exits_zero() -> None:
    written = '"writtenTo": [{"runId": "r", "runName": "v2.3 回归", "updated": 1}],'
    finished = _run(SCRIPT.replace('"writtenTo": [],', written))
    assert finished.returncode == 0, finished.stdout + finished.stderr
    assert "写入 《v2.3 回归》" in finished.stdout
