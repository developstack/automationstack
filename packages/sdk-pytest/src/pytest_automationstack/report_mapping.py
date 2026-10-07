"""把 pytest 的 `TestReport` 搬成核心包的 `CaseResultInput`。

**这里是整个插件唯一有判断的地方，而它判断的只有「pytest 说的这件事对应哪个结论」。**
分批、幂等、重试、对账单、退出码一律在 `automationstack_sdk` 里——插件是薄壳，
换成 unittest / robot 的壳时重写的只有这个文件。

pytest 的一条用例会产生三份 report（setup / call / teardown），
下面这张对应表是整个插件里唯一需要解释的取舍：

| pytest 的情况 | 上报的结论 | 为什么 |
|---|---|---|
| setup 失败（fixture 炸了） | `blocked` | 用例**没跑起来**，被测功能既没通过也没失败；报 `failed` 会让失败清单上多出一条查不动的假失败 |
| setup 被 skip（`skipif` 之类） | `skipped` | |
| call 通过 | `passed` | |
| call 失败 | `failed` | |
| call 里 `pytest.skip()` | `skipped` | |
| teardown 失败 | **不改结论** | 断言已经跑完了，被测功能的结论已经有了；teardown 崩了是脚本自己的问题，它在 pytest 自己的输出里一目了然，不该把一条通过的用例说成没通过 |

`xfail` 走 pytest 自己的 `wasxfail` 标记：预期失败的用例真的失败了，
对被测功能来说是「按预期」，报 `skipped` 而不是 `failed`——报 `failed` 会让
每一轮的失败清单上都固定挂着几条谁都不会去修的条目，清单一旦有噪声就没人看了。
"""

from __future__ import annotations

from typing import Optional

MARKER_NAME = "automationstack"


def source_ref_of(item: object, *, nodeid_fallback: bool) -> Optional[str]:
    """marker 优先，其次（可选地）退化到 nodeid。

    退化默认**关掉**：nodeid（`tests/test_pay.py::test_login`）与平台上录进去的
    `sourceRef` 基本不可能碰巧相等，开着只会让整批结果掉进对账单的「未匹配」里，
    把真正该看的那几条淹掉。真拿 nodeid 当 sourceRef 录用例的团队再显式打开。
    """
    marker = item.get_closest_marker(MARKER_NAME)  # type: ignore[attr-defined]
    if marker is not None:
        if marker.args:
            return str(marker.args[0])
        if "source_ref" in marker.kwargs:
            return str(marker.kwargs["source_ref"])
    if nodeid_fallback:
        return str(getattr(item, "nodeid", "")) or None
    return None


def result_of(report: object) -> Optional[str]:
    """一份 report 对应的结论；`None` = 这份 report 不产生结论（比如 teardown）。"""
    when = getattr(report, "when", None)
    outcome = getattr(report, "outcome", None)
    if when == "setup":
        if outcome == "failed":
            return "blocked"
        if outcome == "skipped":
            return "skipped"
        return None
    if when != "call":
        return None
    if getattr(report, "wasxfail", None) is not None:
        return "skipped"
    if outcome == "skipped":
        return "skipped"
    return "failed" if outcome == "failed" else "passed"


def failure_text(report: object) -> Optional[str]:
    """失败时的原始输出。截断由核心包统一做（§5.1.1「SDK 侧负责截断」）。

    插件这里**不截**：截两次意味着上限有两处定义，而 `MAX_INGEST_COMMENT_LENGTH`
    只该有一处。这里只负责把 pytest 的 longrepr 变成字符串。
    """
    text = getattr(report, "longreprtext", None)
    if not text:
        longrepr = getattr(report, "longrepr", None)
        text = str(longrepr) if longrepr is not None else None
    return text or None


def duration_ms(report: object) -> Optional[int]:
    seconds = getattr(report, "duration", None)
    return None if seconds is None else int(seconds * 1000)
