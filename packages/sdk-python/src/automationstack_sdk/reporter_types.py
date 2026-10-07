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
    source_ref: str
    result: AutomationCaseResult
    duration_ms: Optional[int] = None
    message: Optional[str] = None


@dataclass(frozen=True)
class AttachmentInput:
    """一个待上传的附件。

    `body` 与 `file_path` 二选一，两个都不给会在入队时就报错——
    那是本地的编程错误，没必要拖到 presign 之后才发现。
    """

    source_ref: str
    kind: AttachmentKind
    body: Optional[bytes] = None
    file_path: Optional[str] = None
    content_type: Optional[str] = None
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
    storage_configured: bool = True
    rejections: List[str] = field(default_factory=list)
