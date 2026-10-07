"""测试共用的假 transport。

**整个测试套件里没有一个 socket**：`Transport` 那层抽象存在的唯一目的就是这个
（见 `http_client` 顶部）。真连网的测试会在 CI 上按别人的网络状况随机红，
而这里要验的每一件事——分批、幂等键、对账单、退出码——都跟网络无关。
"""

from __future__ import annotations

import json
from typing import Any, Dict, List

from automationstack_sdk import HttpRequest, HttpResponse


class RecordingTransport:
    """把请求原样记下来，按队列吐预置的响应。"""

    def __init__(self, responses: List[Any]) -> None:
        self.calls: List[HttpRequest] = []
        self._responses = list(responses)

    def __call__(self, request: HttpRequest) -> HttpResponse:
        self.calls.append(request)
        if not self._responses:
            raise AssertionError("假 transport 收到了预期之外的第 {0} 次请求：{1}".format(
                len(self.calls), request.url
            ))
        nxt = self._responses.pop(0)
        if isinstance(nxt, HttpResponse):
            return nxt
        if isinstance(nxt, Exception):
            raise nxt
        return HttpResponse(status=200, body=json.dumps(nxt).encode("utf-8"))

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


RUN_KEY = "3f2a1b4c-5d6e-4f70-8912-a3b4c5d6e7f8"

BASE_CONFIG = {
    "base_url": "https://qa.example.com",
    "idempotency_key": RUN_KEY,
    "project_id": "11111111-2222-4333-8444-555555555555",
    "token": "as_live_xxxxxxxx",
}
