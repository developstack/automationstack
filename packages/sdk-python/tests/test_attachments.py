"""附件三步：presign → 直传 → register（§5.6 / D28）。全程假 transport + tmp_path。"""

from __future__ import annotations

import pytest

from automationstack_sdk import (
    AttachmentInput,
    AttachmentInputError,
    CaseResultInput,
    AutomationStackReporter,
    load_attachments,
)

from conftest import BASE_CONFIG, RecordingTransport, receipt_with

WROTE_ONE = [{"runId": "run-a", "runName": "v2.3 回归", "updated": 1}]


def _upload(index: int, run_id: str, run_case_id: str) -> dict:
    return {
        "contentType": "image/png",
        "index": index,
        "runCaseId": run_case_id,
        "runId": run_id,
        "runName": "v2.3 回归",
        "sourceRef": "PAY-LOGIN-002",
        "storageKey": "test-runs/p/{0}/{1}/screenshot-1.png".format(run_id, run_case_id),
        "uploadUrl": "https://r2.example.com/put/{0}?sig=xxx".format(run_case_id),
    }


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


def test_same_file_uploads_once_per_run_case(tmp_path) -> None:
    """⚠️ 不去重是**有意的**：object key 含 {runId}/{runCaseId}，
    一条 sourceRef 落在两个未提交任务里就得传两份（D33 / §5.6）。"""
    png = tmp_path / "fail.png"
    png.write_bytes(b"\x89PNG-fake")
    transport = RecordingTransport(
        [
            receipt_with(WROTE_ONE),
            {
                "expiresInSeconds": 900,
                "rejected": [],
                "storageConfigured": True,
                "uploads": [_upload(0, "run-a", "rc-1"), _upload(0, "run-b", "rc-2")],
            },
            None,
            None,
            {
                "registered": [
                    {"attachmentId": "a1", "index": 0, "runCaseId": "rc-1", "storageKey": "k1"},
                    {"attachmentId": "a2", "index": 1, "runCaseId": "rc-2", "storageKey": "k2"},
                ],
                "rejected": [],
                "storageConfigured": True,
            },
        ]
    )
    reporter = _reporter(transport)
    reporter.add_result(CaseResultInput(result="failed", source_ref="PAY-LOGIN-002"))
    reporter.add_attachment(
        AttachmentInput(file_path=str(png), kind="screenshot", source_ref="PAY-LOGIN-002")
    )
    outcome = reporter.finish()
    methods = [(c.method, c.url.split("/")[-1].split("?")[0]) for c in transport.calls]
    assert methods == [
        ("POST", "executions"),
        ("POST", "presign"),
        ("PUT", "rc-1"),
        ("PUT", "rc-2"),
        ("POST", "register"),
    ]
    assert outcome.attachments is not None
    assert (outcome.attachments.uploaded, outcome.attachments.registered) == (2, 2)
    assert "authorization" not in transport.calls[2].headers


def test_storage_not_configured_degrades_without_failing(tmp_path) -> None:
    """R2 未配置时结论照常写入、正常退出（§5.6，同第二期 D9）。"""
    png = tmp_path / "fail.png"
    png.write_bytes(b"x")
    printed = []
    transport = RecordingTransport(
        [
            receipt_with(WROTE_ONE),
            {
                "expiresInSeconds": 0,
                "rejected": [
                    {"index": 0, "reason": "对象存储未配置", "runName": None, "sourceRef": "PAY-LOGIN-002"}
                ],
                "storageConfigured": False,
                "uploads": [],
            },
        ]
    )
    reporter = _reporter(transport, sink=printed.append)
    reporter.add_result(CaseResultInput(result="failed", source_ref="PAY-LOGIN-002"))
    reporter.add_attachment(
        AttachmentInput(file_path=str(png), kind="screenshot", source_ref="PAY-LOGIN-002")
    )
    outcome = reporter.finish()
    assert outcome.attachments is not None
    assert outcome.attachments.storage_configured is False
    assert "附件 存储未配置，本轮附件全部跳过；结论已正常写入" in printed
    assert any("对象存储未配置" in line for line in printed)


def test_presign_failure_does_not_sink_the_run(tmp_path) -> None:
    """结论那一轮早就写进去了，让一个连不上的 R2 把它判成失败最没道理。"""
    png = tmp_path / "fail.png"
    png.write_bytes(b"x")
    transport = RecordingTransport(
        [receipt_with(WROTE_ONE), ConnectionError("R2 连不上")]
    )
    reporter = _reporter(transport)
    reporter.add_result(CaseResultInput(result="failed", source_ref="PAY-LOGIN-002"))
    reporter.add_attachment(
        AttachmentInput(file_path=str(png), kind="screenshot", source_ref="PAY-LOGIN-002")
    )
    outcome = reporter.finish()
    assert outcome.attachments is not None
    assert any("整批失败" in line for line in outcome.attachments.rejections)


def test_missing_body_and_path_raises_at_enqueue_time() -> None:
    """本地编程错误，拖到 presign 之后才发现就等于白跑半程。"""
    transport = RecordingTransport([])
    reporter = _reporter(transport)
    with pytest.raises(AttachmentInputError):
        reporter.add_attachment(AttachmentInput(kind="log", source_ref="A-1"))


def test_unreadable_file_only_loses_that_one_attachment(tmp_path) -> None:
    """一个读不出来的文件不该让其余几百个附件跟着丢。"""
    good = tmp_path / "ok.log"
    good.write_bytes(b"hello")
    loaded, failures = load_attachments(
        [
            AttachmentInput(file_path=str(tmp_path / "gone.png"), kind="screenshot", source_ref="A-1"),
            AttachmentInput(file_path=str(good), kind="log", source_ref="A-2"),
        ]
    )
    assert [item.source_ref for item in loaded] == ["A-2"]
    assert len(failures) == 1 and "（本地）读取失败" in failures[0]
    assert loaded[0].content_type == "text/plain"
    assert loaded[0].file_name == "ok.log"
    assert loaded[0].size_bytes == 5


def test_inline_body_skips_the_disk() -> None:
    """截图常常本来就在内存里，逼用户先落盘再读回来只是白做一次 IO。"""
    loaded, failures = load_attachments(
        [AttachmentInput(body=b"\x89PNG", kind="screenshot", source_ref="A-1")]
    )
    assert failures == []
    assert loaded[0].body == b"\x89PNG"
    assert loaded[0].content_type == "image/png"
    assert loaded[0].file_name == "screenshot"
