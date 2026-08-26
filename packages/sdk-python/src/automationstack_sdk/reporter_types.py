"""SDK 的**公开输入结构**。这是本包唯一认识的「一条结果长什么样」。

刻意**不掺任何测试框架的类型**：pytest 的 `TestReport`、unittest 的 `TestCase`
都是它们随时会改的东西，让它们出现在这里等于把本包的大版本焊死在框架版本上。
用户（或者 `pytest-automationstack` 那层薄壳）把框架给的对象搬成下面这两个形状，
那段搬运代码在**插件里或用户的仓库里**——框架升级时改的是那十几行，不用等核心包发版。

这也是为什么本包的 `dependencies` 是空的：不装 pytest 也能用它上报。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from .contract_types import AttachmentKind, AutomationCaseResult


@dataclass(frozen=True)
class CaseResultInput:
    #: 用例上的 `sourceRef`，归属**唯一**的输入（§3.7）。
    #: 没有任何办法指定「写进哪个测试任务」，那是刻意的（D31）。
    source_ref: str
    result: AutomationCaseResult
    #: ⚠️ 服务端收下但本期不落库（`test_run_cases` 没有这一列）。照填不误。
    duration_ms: Optional[int] = None
    #: 失败时的一行说明，落进 `test_run_cases.comment`。
    #: 超过 `MAX_INGEST_COMMENT_LENGTH` 会被截断——完整堆栈请作为 `log` 附件传，
    #: `comment` 是给人在失败清单上一眼扫的，不是日志容器。
    message: Optional[str] = None


@dataclass(frozen=True)
class AttachmentInput:
    """一个待上传的附件。

    `body` 与 `file_path` 二选一，两个都不给会在入队时就报错——
    那是本地的编程错误，没必要拖到 presign 之后才发现。
    """

    #: 附件挂在哪条用例上，与结论走同一条归属路径。
    source_ref: str
    kind: AttachmentKind
    #: 直接给字节。截图/日志常常本来就在内存里，逼用户先落盘没有道理。
    body: Optional[bytes] = None
    file_path: Optional[str] = None
    #: 不给就按 `kind` 猜一个；PUT 时必须用 presign 回来的值，不是这个值。
    content_type: Optional[str] = None
    #: 不给就取 `file_path` 的 basename；两个都没有就用 `{kind}` 兜底。
    file_name: Optional[str] = None


@dataclass(frozen=True)
class LoadedAttachment:
    """读盘/取字节之后的样子。`attachment_upload` 只认这个，不碰文件系统语义。"""

    body: bytes
    content_type: str
    file_name: str
    kind: AttachmentKind
    size_bytes: int
    source_ref: str


@dataclass
class AttachmentOutcome:
    """附件那一轮的结果，只用来打印——它不参与退出码判定（§5.6）。"""

    registered: int = 0
    uploaded: int = 0
    #: R2 未配置时 False：结论照常上报成功，只有附件部分降级。
    storage_configured: bool = True
    #: 逐条的拒绝理由，**服务端原文**，SDK 不概括。
    rejections: List[str] = field(default_factory=list)
