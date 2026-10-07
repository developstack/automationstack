"""插件测试的公共件。

`pytester` 让我们在**子会话**里真的跑一遍 pytest——插件的绝大部分行为
（marker 怎么收集、三个阶段怎么走、exitstatus 到底是几）只有真跑一遍才验得到，
手搓假 report 只能验映射表那一半。

网络那一半仍然是假的：reporter 用核心包的 `Transport` 注入，
整个测试套件里没有一个 socket。
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from automationstack_sdk import AutomationStackReporter, HttpRequest, HttpResponse

pytest_plugins = ["pytester"]

BASE_CONFIG = {
    "base_url": "https://qa.example.com",
    "idempotency_key": "3f2a1b4c-5d6e-4f70-8912-a3b4c5d6e7f8",
    "project_id": "11111111-2222-4333-8444-555555555555",
    "token": "as_live_xxxxxxxx",
}


class RecordingTransport:
    def __init__(self, responses: List[Any]) -> None:
        self.calls: List[HttpRequest] = []
        self._responses = list(responses)

    def __call__(self, request: HttpRequest) -> HttpResponse:
        self.calls.append(request)
        payload = self._responses.pop(0) if self._responses else {}
        return HttpResponse(status=200, body=json.dumps(payload).encode("utf-8"))

    def body_of(self, index: int) -> Dict[str, Any]:
        return json.loads(self.calls[index].body.decode("utf-8"))


def receipt_with(written_to: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "executionId": "22222222-3333-4444-8555-666666666666",
        "outOfScope": [],
        "skippedManual": [],
        "unmatchedCases": [],
        "writtenTo": written_to,
    }


WROTE_ALL = [{"runId": "run-a", "runName": "v2.3 回归", "updated": 3}]


def install_fake_reporter(monkeypatch: Any, transport: RecordingTransport) -> None:
    """把插件建 reporter 的那一步换成注入了假 transport 的同一个类。

    换的是 `_make_reporter` 而不是整个 reporter：这样测试跑的仍然是核心包
    **真正的**那条路径（缓冲、分批、幂等、对账单），只有最外面那次 HTTP 是假的。
    换成 mock reporter 的话，验的就只剩「插件调没调 add_result」了。
    """
    from pytest_automationstack import plugin

    def factory() -> AutomationStackReporter:
        return AutomationStackReporter(
            exit_on_empty_write=False, transport=transport, **BASE_CONFIG
        )

    monkeypatch.setattr(plugin, "_make_reporter", factory)
