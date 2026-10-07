"""公开入口 `add_attachment`：把附件挂到**这一轮的那个** reporter 上。

插件自己只管结论，附件是仓库侧的事（截图归 playwright / appium，插件谁都不认识）。
所以这条入口要验的只有两件事：开着的时候附件确实随本轮一起发出去，
关着的时候**一声不吭地什么都不做**——后者才是这条入口最容易被写坏的一半。
"""

from __future__ import annotations

import pytest_automationstack
from pytest_automationstack import plugin

from conftest import WROTE_ALL, RecordingTransport, install_fake_reporter, receipt_with

WIRING = '''
import pytest
from automationstack_sdk import AttachmentInput
from pytest_automationstack import add_attachment

@pytest.hookimpl(tryfirst=True)
def pytest_sessionfinish(session):
    queued = add_attachment(
        session.config,
        AttachmentInput(
            body=b"fake-screenshot-bytes",
            content_type="image/png",
            file_name="shot.png",
            kind="screenshot",
            source_ref="PAY-LOGIN-002",
        ),
    )
    print("[wiring] queued={0}".format(queued))
'''

SAMPLE = '''
import pytest

@pytest.mark.automationstack("PAY-LOGIN-002")
def test_passes():
    assert True
'''

PRESIGNED = {
    "expiresInSeconds": 900,
    "rejected": [],
    "storageConfigured": True,
    "uploads": [
        {
            "contentType": "image/png",
            "index": 0,
            "runCaseId": "rc-1",
            "runId": "run-a",
            "runName": "v2.3 回归",
            "sourceRef": "PAY-LOGIN-002",
            "storageKey": "k1",
            "uploadUrl": "https://r2.example.com/put/rc-1?sig=xxx",
        }
    ],
}

REGISTERED = {"registered": [{"index": 0}], "rejected": [], "storageConfigured": True}


def test_no_op_without_the_flag(pytester, monkeypatch) -> None:
    """没加 `--automationstack` 时是安静的空操作：不抛异常、不发请求、不改退出码。

    仓库的 conftest 里写满了这个调用，也必须能在一台没有 AS_TOKEN 的机器上
    直接 `pytest` 跑通——「装了插件不等于开始往平台写东西」这条约定，
    公开入口不该成为破坏它的那条缝。
    """
    transport = RecordingTransport([receipt_with(WROTE_ALL)])
    install_fake_reporter(monkeypatch, transport)
    pytester.makeconftest(WIRING)
    pytester.makepyfile(SAMPLE)
    result = pytester.runpytest()
    result.assert_outcomes(passed=1)
    assert transport.calls == []
    assert result.ret == 0
    result.stdout.fnmatch_lines(["*queued=False*"])


def test_queues_onto_the_session_reporter(pytester, monkeypatch) -> None:
    """开着的时候：附件跟着**同一轮**结论走，一次 POST 之后才是 presign。"""
    transport = RecordingTransport(
        [receipt_with(WROTE_ALL), PRESIGNED, {}, REGISTERED]
    )
    install_fake_reporter(monkeypatch, transport)
    pytester.makeconftest(WIRING)
    pytester.makepyfile(SAMPLE)
    result = pytester.runpytest("--automationstack")
    result.stdout.fnmatch_lines(["*queued=True*"])
    urls = [call.url for call in transport.calls]
    assert urls == [
        "https://qa.example.com/ingest/executions",
        "https://qa.example.com/ingest/attachments/presign",
        "https://r2.example.com/put/rc-1?sig=xxx",
        "https://qa.example.com/ingest/attachments/register",
    ]
    presigned = transport.body_of(1)["attachments"]
    assert [(a["sourceRef"], a["kind"]) for a in presigned] == [
        ("PAY-LOGIN-002", "screenshot")
    ]


def test_queueing_happens_before_the_one_request(pytester, monkeypatch) -> None:
    """§7.2 第 1 条对附件同样成立：调用只入队，真正上传在 `finish()` 那一下。

    验的是顺序：`queued=True` 打在对账单**之前**——对账单是 POST 回来之后才渲染的，
    所以入队那一刻一个请求都还没发出去。这也是 `tryfirst` 必须存在的原因。
    """
    transport = RecordingTransport(
        [receipt_with(WROTE_ALL), PRESIGNED, {}, REGISTERED]
    )
    install_fake_reporter(monkeypatch, transport)
    pytester.makeconftest(WIRING)
    pytester.makepyfile(SAMPLE)
    result = pytester.runpytest("--automationstack")
    result.stdout.fnmatch_lines(["*queued=True*", "*上报对账单*"])


def test_is_exported_from_the_package_root() -> None:
    """公开面要在 `__all__` 里登记，不然「公开」只是嘴上说说。"""
    assert "add_attachment" in pytest_automationstack.__all__
    assert pytest_automationstack.add_attachment is plugin.add_attachment
