"""把用户给的附件描述读成字节。

**唯一碰文件系统的地方**——上传那一层只认 `LoadedAttachment`，
这样它可以被完全不落盘地测试。
"""

from __future__ import annotations

import os
from typing import List, Tuple

from .contract_types import AttachmentKind
from .reporter_types import AttachmentInput, LoadedAttachment

_KIND_FALLBACK_CONTENT_TYPE = {
    "log": "text/plain",
    "other": "application/octet-stream",
    "screenshot": "image/png",
    "video": "video/mp4",
}

#: 只列真的会从测试框架里出来的那几种。
#:
#: 猜不出来时**不猜**，回落到按 `kind` 给的默认值——猜错的 contentType 会让附件
#: 在报告页上以「下载」而不是「预览」的方式出现，比 `application/octet-stream`
#: 更迷惑人。（没有用 `mimetypes.guess_type`：它读系统的 mime.types，
#: 同一份附件在 macOS 与 CI 的 Linux 上会得到不同的结果，而附件的渲染方式
#: 不该跟着跑测试的机器变。）
_EXTENSION_CONTENT_TYPE = {
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".json": "application/json",
    ".log": "text/plain",
    ".mp4": "video/mp4",
    ".png": "image/png",
    ".txt": "text/plain",
    ".webm": "video/webm",
    ".zip": "application/zip",
}


class AttachmentInputError(Exception):
    """本地的编程错误：既没有 `body` 也没有 `file_path`。"""


def _resolve_content_type(item: AttachmentInput) -> str:
    if item.content_type:
        return item.content_type
    source = item.file_path or item.file_name
    if source:
        by_extension = _EXTENSION_CONTENT_TYPE.get(os.path.splitext(source)[1].lower())
        if by_extension:
            return by_extension
    return _KIND_FALLBACK_CONTENT_TYPE.get(item.kind, "application/octet-stream")


def _resolve_file_name(item: AttachmentInput) -> str:
    if item.file_name:
        return item.file_name
    return os.path.basename(item.file_path) if item.file_path else item.kind


def assert_attachment_input(item: AttachmentInput) -> None:
    """入队时的同步校验。**只查「本地编程错误」这一种**。

    真正的读盘留到 `finish()`——附件在磁盘上待到最后一刻，
    一轮几百张截图不必整轮驻留内存。但「两个都没给」这件事在 presign 之后
    才发现就等于白跑半程，所以入队这一刻就抛。
    """
    if not item.body and not item.file_path:
        raise AttachmentInputError(
            "附件 {0}/{1} 既没有 body 也没有 file_path".format(item.source_ref, item.kind)
        )


def load_attachment(item: AttachmentInput) -> LoadedAttachment:
    """`body` 优先于 `file_path`：截图和日志常常本来就在内存里，
    先落盘再读回来只是白做一次 IO。"""
    assert_attachment_input(item)
    if item.body is not None:
        body = item.body
    else:
        with open(str(item.file_path), "rb") as handle:
            body = handle.read()
    return LoadedAttachment(
        body=body,
        content_type=_resolve_content_type(item),
        file_name=_resolve_file_name(item),
        kind=item.kind,
        size_bytes=len(body),
        source_ref=item.source_ref,
    )


def load_attachments(
    inputs: List[AttachmentInput],
) -> Tuple[List[LoadedAttachment], List[str]]:
    """一个读不出来的文件不该让其余几百个附件跟着丢，所以逐个兜。

    返回 `(loaded, failures)`；`failures` 里每条都是一句话——
    静默丢附件与静默丢结论一样糟。
    """
    loaded: List[LoadedAttachment] = []
    failures: List[str] = []
    for item in inputs:
        try:
            loaded.append(load_attachment(item))
        except Exception as error:  # noqa: BLE001 — 逐个兜，一个坏文件不带走整批
            failures.append(
                "{0}/{1}：（本地）读取失败 {2}".format(item.source_ref, item.kind, error)
            )
    return loaded, failures
