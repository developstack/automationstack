"""编程式入口（框架无关）——§7.2 五条铁律的端到端守卫。"""

from __future__ import annotations

import json

import pytest

from automationstack_sdk import (
    RESULTS_PER_BATCH,
    AutomationStackReporter,
    CaseResultInput,
    HttpResponse,
    IngestEmptyWriteError,
    IngestHttpError,
    derive_batch_idempotency_key,
)

from conftest import BASE_CONFIG, RUN_KEY, RecordingTransport, receipt_with

WROTE_TWO = [{"runId": "run-a", "runName": "v2.3 回归", "updated": 2}]
REJECT_400 = json.dumps({"message": "runId 不是可以传的字段"}).encode("utf-8")


def _reporter(transport, **overrides) -> AutomationStackReporter:
    options = {
        "exit_on_empty_write": False,
        "sink": lambda line: None,
        "sleep": lambda seconds: None,
        "transport": transport,
        **BASE_CONFIG,
    }
    options.update(overrides)
    return AutomationStackReporter(**options)


def test_add_result_sends_nothing_until_finish() -> None:
    """§7.2 第 1 条：缓冲后批量提交（D29）。"""
    transport = RecordingTransport([receipt_with(WROTE_TWO)])
    reporter = _reporter(transport)
    reporter.add_result(CaseResultInput(result="passed", source_ref="A-1"))
    reporter.add_result(CaseResultInput(result="failed", source_ref="A-2"))
    assert transport.calls == []
    assert reporter.pending_result_count == 2

    reporter.finish()
    assert len(transport.calls) == 1
    assert len(transport.body_of(0)["results"]) == 2


def test_normal_path_only_posts_executions() -> None:
    """§7.2 第 5 条：不做预检，`GET /ingest/runs` 一次都不调。"""
    transport = RecordingTransport([receipt_with(WROTE_TWO)])
    reporter = _reporter(transport)
    reporter.add_result(CaseResultInput(result="passed", source_ref="A-1"))
    reporter.finish()
    assert [(c.method, c.url) for c in transport.calls] == [
        ("POST", "https://qa.example.com/ingest/executions")
    ]


def test_retry_reuses_the_same_idempotency_key() -> None:
    """§7.2 第 2 条：重新生成就等于没有幂等。"""
    transport = RecordingTransport(
        [HttpResponse(status=503, body=b'{"message":"upstream busy"}'), receipt_with(WROTE_TWO)]
    )
    reporter = _reporter(transport)
    reporter.add_result(CaseResultInput(result="passed", source_ref="A-1"))
    reporter.finish()
    assert len(transport.calls) == 2
    assert transport.body_of(0)["idempotencyKey"] == RUN_KEY
    assert transport.body_of(1)["idempotencyKey"] == RUN_KEY


def test_four_hundred_is_not_retried() -> None:
    """请求体本身有问题，重发一百次还是同一条 400；
    重试只会把「SDK 发错了」伪装成「网络不稳」。"""
    transport = RecordingTransport(
        [HttpResponse(status=400, body=REJECT_400)]
    )
    reporter = _reporter(transport)
    reporter.add_result(CaseResultInput(result="passed", source_ref="A-1"))
    with pytest.raises(IngestHttpError) as excinfo:
        reporter.finish()
    assert len(transport.calls) == 1
    assert excinfo.value.server_message == "runId 不是可以传的字段"


def test_batches_each_carry_a_derived_key() -> None:
    transport = RecordingTransport(
        [receipt_with(WROTE_TWO), receipt_with([{"runId": "run-a", "runName": "v2.3 回归", "updated": 1}])]
    )
    reporter = _reporter(transport)
    for index in range(RESULTS_PER_BATCH + 1):
        reporter.add_result(
            CaseResultInput(result="passed", source_ref="A-{0}".format(index))
        )
    outcome = reporter.finish()
    assert len(transport.calls) == 2
    assert transport.body_of(1)["idempotencyKey"] == derive_batch_idempotency_key(
        RUN_KEY, 1
    )
    assert [(e.run_name, e.updated) for e in outcome.receipt.written_to] == [
        ("v2.3 回归", 3)
    ]


def test_empty_written_to_raises_with_server_reasons_verbatim() -> None:
    """§7.2 第 4 条：静默成功是最坏的情况。"""
    body = receipt_with([])
    body["unmatchedCases"] = [
        {"reason": "项目里没有这个 sourceRef 的用例", "sourceRef": "PAY-NEW-099"}
    ]
    body["outOfScope"] = [
        {
            "caseId": "c1",
            "reason": "任务已提交，不再接收自动化结果",
            "runName": "v2.3 回归",
            "sourceRef": "PAY-CART-031",
        }
    ]
    printed = []
    transport = RecordingTransport([body])
    reporter = _reporter(transport, sink=printed.append)
    reporter.add_result(CaseResultInput(result="passed", source_ref="PAY-NEW-099"))
    with pytest.raises(IngestEmptyWriteError) as excinfo:
        reporter.finish()
    message = str(excinfo.value)
    assert "项目里没有这个 sourceRef 的用例" in message
    assert "任务已提交，不再接收自动化结果" in message
    assert any(line.startswith("写入 0 个测试任务") for line in printed)


def test_receipt_is_printed_on_success_too() -> None:
    """§7.2 第 3 条：对账单原样打印，不是只在失败时打。"""
    printed = []
    reporter = _reporter(
        RecordingTransport([receipt_with(WROTE_TWO)]), sink=printed.append
    )
    reporter.add_result(CaseResultInput(result="passed", source_ref="A-1"))
    reporter.finish()
    assert printed[0].startswith("[automationstack] 上报对账单（execution ")
    assert "《v2.3 回归》" in printed[1]


def test_authorization_header_and_json_body() -> None:
    transport = RecordingTransport([receipt_with(WROTE_TWO)])
    reporter = _reporter(transport)
    reporter.add_result(CaseResultInput(result="passed", source_ref="A-1"))
    reporter.finish()
    headers = transport.calls[0].headers
    assert headers["authorization"] == "Bearer {0}".format(BASE_CONFIG["token"])
    assert headers["content-type"] == "application/json"
    assert json.loads(transport.calls[0].body.decode("utf-8"))["projectId"]
