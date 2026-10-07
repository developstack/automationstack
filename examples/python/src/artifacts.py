"""失败现场的落盘与回捡：截图 + 完整日志。

## 为什么要落盘，而不是把日志塞进 `message`

`message` 落进 `test_run_cases.comment`，是给人在失败清单上**一眼扫**的一行字，
核心包会按 `MAX_INGEST_COMMENT_LENGTH`（2000）截断它。完整 traceback、driver 日志、
请求响应体属于附件——塞进 comment 只会让失败清单变成一面日志墙，
而真正要看的那一行反而找不到。

## 为什么走磁盘，而不是直接把字节交给 reporter

`AttachmentInput` 其实两种都收（`body` 或 `file_path`）。这里选磁盘是因为真实项目里
截图本来就是文件（playwright 的 `page.screenshot(path=...)`、appium 的 `save_screenshot`），
示例照着那个形状写，读的人换成自己的框架时不用先把它翻译回文件。
另一个好处是跑完之后现场还留在 `artifacts/` 下，附件传没传上去都能自己去看。

⚠️ 读盘不在这里做——`load_attachment` 由核心包在 `finish()` 时才调，
一轮几百张截图不必从失败的那一刻起就整轮驻留内存。
"""

from __future__ import annotations

import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from automationstack_sdk import AttachmentInput

EXAMPLE_ROOT = Path(__file__).resolve().parent.parent

ARTIFACT_DIR = EXAMPLE_ROOT / "artifacts"

_PLACEHOLDER_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _screenshot_path(source_ref: str) -> Path:
    return ARTIFACT_DIR / "{0}.png".format(source_ref)


def _log_path(source_ref: str) -> Path:
    return ARTIFACT_DIR / "{0}.log".format(source_ref)


class CaseTrace:
    """一条用例的运行记录器。

    无论成败都收着日志，只在**失败时**落盘：通过的用例不需要附件，一轮几百条全落盘
    只是白写几百个文件，还会把按任务计的附件配额（500 条/任务）喂给没人看的东西。
    """

    def __init__(self, source_ref: str) -> None:
        self.source_ref = source_ref
        self._lines: List[str] = []

    def log(self, line: str) -> None:
        stamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        self._lines.append("{0} {1}".format(stamp, line))

    def save_failure(self, longrepr: Optional[str]) -> None:
        """把「测试自己记的那几行」和「pytest 给的完整 traceback」拼成一份日志落盘。

        两段都要：只留 traceback 的话，看的人知道哪一行断言炸了，却不知道用例在炸之前
        走到了哪一步；只留自记日志的话，又缺了炸点。它们合起来才是「现场」。
        """
        self._lines.append(
            "{0} 失败：\n{1}".format(
                datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
                longrepr or "（pytest 没有给出 longrepr）",
            )
        )
        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        _log_path(self.source_ref).write_text(
            "\n".join(self._lines) + "\n", encoding="utf-8"
        )
        _screenshot_path(self.source_ref).write_bytes(
            base64.b64decode(_PLACEHOLDER_PNG_BASE64)
        )


def collect_failure_attachments(source_ref: str) -> List[AttachmentInput]:
    """回捡某条 sourceRef 的附件，捡不到就少给几条。

    文件不在时**不抛**：附件是锦上添花，让一张丢失的截图把一整轮结论拦在门外
    是最没道理的失败方式（核心包内部对附件也是同一条原则，§5.6）。
    """
    wanted = (("screenshot", _screenshot_path(source_ref)), ("log", _log_path(source_ref)))
    found: List[AttachmentInput] = []
    for kind, path in wanted:
        if path.is_file():
            found.append(
                AttachmentInput(file_path=str(path), kind=kind, source_ref=source_ref)
            )
    return found
