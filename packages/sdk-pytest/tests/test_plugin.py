"""插件端到端：真的跑一遍 pytest 子会话，只有 HTTP 是假的。"""

from __future__ import annotations

from automationstack_sdk import MAX_INGEST_COMMENT_LENGTH

from conftest import WROTE_ALL, RecordingTransport, install_fake_reporter, receipt_with

SAMPLE = '''
import pytest

@pytest.mark.automationstack("PAY-LOGIN-001")
def test_passes():
    assert True

@pytest.mark.automationstack("PAY-LOGIN-002")
def test_fails():
    assert 1 == 2

@pytest.mark.automationstack("PAY-LOGIN-003")
@pytest.mark.skip(reason="等接口")
def test_skipped():
    assert True

def test_without_marker():
    assert True
'''


def test_off_by_default_sends_nothing(pytester, monkeypatch) -> None:
    """装个包就偷偷往平台写东西是不能接受的。"""
    transport = RecordingTransport([receipt_with(WROTE_ALL)])
    install_fake_reporter(monkeypatch, transport)
    pytester.makepyfile(SAMPLE)
    result = pytester.runpytest()
    result.assert_outcomes(passed=2, failed=1, skipped=1)
    assert transport.calls == []


def test_buffers_then_submits_once(pytester, monkeypatch) -> None:
    """§7.2 第 1 条：四条用例只换来一次 POST，而不是跑一条报一条。"""
    transport = RecordingTransport([receipt_with(WROTE_ALL)])
    install_fake_reporter(monkeypatch, transport)
    pytester.makepyfile(SAMPLE)
    result = pytester.runpytest("--automationstack")
    assert [c.url for c in transport.calls] == [
        "https://qa.example.com/ingest/executions"
    ]
    body = transport.body_of(0)
    assert {(r["sourceRef"], r["result"]) for r in body["results"]} == {
        ("PAY-LOGIN-001", "passed"),
        ("PAY-LOGIN-002", "failed"),
        ("PAY-LOGIN-003", "skipped"),
    }
    # 没标 marker 的那条不上报，但也不静默——收工时说一句是谁。
    assert "test_without_marker" not in str(body)
    result.stdout.fnmatch_lines(["*1 条用例没有 sourceRef*test_without_marker*"])


def test_never_calls_the_runs_endpoint(pytester, monkeypatch) -> None:
    """§7.2 第 5 条：不做预检。"""
    transport = RecordingTransport([receipt_with(WROTE_ALL)])
    install_fake_reporter(monkeypatch, transport)
    pytester.makepyfile(SAMPLE)
    pytester.runpytest("--automationstack")
    assert all("/ingest/runs" not in call.url for call in transport.calls)


def test_prints_the_receipt(pytester, monkeypatch) -> None:
    """§7.2 第 3 条：对账单是用户唯一的反馈渠道。"""
    receipt = receipt_with([{"runId": "run-a", "runName": "v2.3 回归", "updated": 3}])
    receipt["skippedManual"] = [
        {"reason": "已有人工结论", "runName": "v2.3 回归", "sourceRef": "PAY-LOGIN-003"}
    ]
    transport = RecordingTransport([receipt])
    install_fake_reporter(monkeypatch, transport)
    pytester.makepyfile(SAMPLE)
    result = pytester.runpytest("--automationstack")
    result.stdout.fnmatch_lines(
        [
            "*上报对账单*",
            "*写入 *v2.3 回归*3 条*",
            "跳过 1 条（已有人工结论）：PAY-LOGIN-003 @《v2.3 回归》",
        ]
    )


def test_empty_written_to_fails_the_session(pytester, monkeypatch) -> None:
    """§7.2 第 4 条：退出码非零，服务端理由原样透传。"""
    receipt = receipt_with([])
    receipt["unmatchedCases"] = [
        {"reason": "项目里没有这个 sourceRef 的用例", "sourceRef": "PAY-LOGIN-001"}
    ]
    transport = RecordingTransport([receipt])
    install_fake_reporter(monkeypatch, transport)
    pytester.makepyfile(
        '''
import pytest

@pytest.mark.automationstack("PAY-LOGIN-001")
def test_passes():
    assert True
'''
    )
    result = pytester.runpytest("--automationstack")
    # 用例本身全过了，但一条都没写进去 → 整轮判失败。
    result.assert_outcomes(passed=1)
    assert result.ret == 1
    result.stdout.fnmatch_lines(["*项目里没有这个 sourceRef 的用例*"])


def test_upload_failure_also_fails_the_session(pytester, monkeypatch) -> None:
    """网络/鉴权炸了同样不能静默：QA 会以为结果进去了。"""

    def exploding(request):
        raise ConnectionError("连不上平台")

    install_fake_reporter(monkeypatch, exploding)
    pytester.makepyfile(
        '''
import pytest

@pytest.mark.automationstack("PAY-LOGIN-001")
def test_passes():
    assert True
'''
    )
    result = pytester.runpytest("--automationstack")
    assert result.ret == 1
    result.stdout.fnmatch_lines(["*上报失败*连不上平台*"])


def test_long_traceback_goes_to_a_log_attachment(pytester, monkeypatch) -> None:
    """comment 是给人一眼扫的，不是日志容器；超了才传附件，不超不浪费配额。"""
    transport = RecordingTransport(
        [
            receipt_with(WROTE_ALL),
            {
                "expiresInSeconds": 900,
                "rejected": [],
                "storageConfigured": True,
                "uploads": [
                    {
                        "contentType": "text/plain",
                        "index": 0,
                        "runCaseId": "rc-1",
                        "runId": "run-a",
                        "runName": "v2.3 回归",
                        "sourceRef": "PAY-LOGIN-002",
                        "storageKey": "k1",
                        "uploadUrl": "https://r2.example.com/put/rc-1?sig=xxx",
                    }
                ],
            },
            {},  # PUT
            {"registered": [{"index": 0}], "rejected": [], "storageConfigured": True},
        ]
    )
    install_fake_reporter(monkeypatch, transport)
    pytester.makepyfile(
        '''
import pytest

@pytest.mark.automationstack("PAY-LOGIN-002")
def test_fails_loudly():
    assert "{0}" == "x"
'''.format("y" * (MAX_INGEST_COMMENT_LENGTH + 500))
    )
    pytester.runpytest("--automationstack")
    urls = [call.url for call in transport.calls]
    assert "https://qa.example.com/ingest/attachments/presign" in urls
    assert "https://r2.example.com/put/rc-1?sig=xxx" in urls
    comment = transport.body_of(0)["results"][0]["message"]
    assert len(comment) == MAX_INGEST_COMMENT_LENGTH
    assert comment.endswith("（已截断，完整堆栈见 log 附件）")


def test_nodeid_fallback_is_opt_in(pytester, monkeypatch) -> None:
    transport = RecordingTransport([receipt_with(WROTE_ALL)])
    install_fake_reporter(monkeypatch, transport)
    pytester.makepyfile("def test_plain():\n    assert True\n")
    pytester.runpytest("--automationstack", "--automationstack-nodeid-fallback")
    refs = [r["sourceRef"] for r in transport.body_of(0)["results"]]
    assert refs == ["test_nodeid_fallback_is_opt_in.py::test_plain"]
