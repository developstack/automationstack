"""pytest 的三个阶段 → 结论的映射表（见 `report_mapping.py` 顶部那张表）。"""

from __future__ import annotations

import pytest

from pytest_automationstack.report_mapping import (
    duration_ms,
    failure_text,
    result_of,
    source_ref_of,
)


class FakeReport:
    def __init__(self, **kwargs: object) -> None:
        self.__dict__.update(kwargs)


class FakeMarker:
    def __init__(self, args=(), kwargs=None) -> None:
        self.args = args
        self.kwargs = kwargs or {}


class FakeItem:
    def __init__(self, marker=None, nodeid="tests/test_pay.py::test_login") -> None:
        self._marker = marker
        self.nodeid = nodeid

    def get_closest_marker(self, name: str):
        return self._marker


@pytest.mark.parametrize(
    ("when", "outcome", "expected"),
    [
        ("setup", "failed", "blocked"),
        ("setup", "skipped", "skipped"),
        ("setup", "passed", None),
        ("call", "passed", "passed"),
        ("call", "failed", "failed"),
        ("call", "skipped", "skipped"),
        ("teardown", "failed", None),
        ("teardown", "passed", None),
    ],
)
def test_phase_mapping(when: str, outcome: str, expected: object) -> None:
    assert result_of(FakeReport(when=when, outcome=outcome)) == expected


def test_setup_failure_is_blocked_not_failed() -> None:
    """fixture 炸了报 failed 会让失败清单上多出一条查不动的假失败。"""
    assert result_of(FakeReport(when="setup", outcome="failed")) == "blocked"


def test_xfail_does_not_become_a_failure() -> None:
    """否则每一轮的失败清单上都固定挂着几条谁都不会去修的条目。"""
    report = FakeReport(when="call", outcome="failed", wasxfail="预期失败")
    assert result_of(report) == "skipped"


def test_marker_beats_nodeid() -> None:
    item = FakeItem(marker=FakeMarker(args=("PAY-LOGIN-001",)))
    assert source_ref_of(item, nodeid_fallback=True) == "PAY-LOGIN-001"


def test_marker_accepts_keyword_form() -> None:
    item = FakeItem(marker=FakeMarker(kwargs={"source_ref": "PAY-LOGIN-002"}))
    assert source_ref_of(item, nodeid_fallback=False) == "PAY-LOGIN-002"


def test_nodeid_fallback_is_off_by_default() -> None:
    """开着只会让整批结果掉进对账单的「未匹配」里，把真正该看的那几条淹掉。"""
    assert source_ref_of(FakeItem(), nodeid_fallback=False) is None
    assert source_ref_of(FakeItem(), nodeid_fallback=True) == (
        "tests/test_pay.py::test_login"
    )


def test_failure_text_and_duration() -> None:
    report = FakeReport(longreprtext="E   assert 1 == 2", duration=1.82)
    assert failure_text(report) == "E   assert 1 == 2"
    assert duration_ms(report) == 1820
    assert failure_text(FakeReport(longreprtext="")) is None
    assert duration_ms(FakeReport()) is None
