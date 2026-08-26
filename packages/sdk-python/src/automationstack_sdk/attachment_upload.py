"""附件三步：presign → 直传 → register（§5.6 / D28）。

**只用 HTTP 客户端，没有 S3 SDK**：预签名 URL 就是一次普通的 PUT，
引一个 boto3 只会给用户的环境加一串传递依赖并撞版本（§7.3 里 Java 那条理由，
Python 这边保持一致）。

⚠️ **同一个本地文件会被传多次，这是有意的，不要去做去重**：object key 规则
含 `{runId}/{runCaseId}`，一条 sourceRef 可能落在多个未提交任务里（D33），
presign 就会按解析出的 run_case 逐个返回 URL。省下这几份 object 的代价是
给附件删除引入引用计数，那是一条以后一定会踩的坑（§5.6 那段）。
所以这里严格按 `uploads` 的条数上传——`index` 指回请求里的第几个附件。
"""

from __future__ import annotations

from typing import Any, Dict, List

from .attachment_contract_types import (
    IngestAttachmentPresignReceipt,
    IngestAttachmentRegisterItemWire,
    IngestAttachmentRegisterReceipt,
    IngestAttachmentUpload,
)
from .config import ReporterConfig
from .contract_limits import ATTACHMENTS_PER_BATCH
from .http_client import IngestHttpClient
from .reporter_types import AttachmentOutcome, LoadedAttachment
from .route_paths import (
    INGEST_ATTACHMENTS_PRESIGN_ROUTE,
    INGEST_ATTACHMENTS_REGISTER_ROUTE,
)


def _build_presign_body(
    chunk: List[LoadedAttachment], config: ReporterConfig
) -> Dict[str, Any]:
    return {
        "attachments": [
            {
                "contentType": item.content_type,
                "kind": item.kind,
                "sizeBytes": item.size_bytes,
                "sourceRef": item.source_ref,
            }
            for item in chunk
        ],
        "projectId": config.project_id,
        # 与结论那一轮**必须传同一份**：少传一次，附件会挂到本轮结论压根没写过的任务上。
        "runIds": config.run_ids,
    }


def _put_one(
    *,
    chunk: List[LoadedAttachment],
    client: IngestHttpClient,
    upload: IngestAttachmentUpload,
    register_items: List[IngestAttachmentRegisterItemWire],
    failures: List[str],
) -> None:
    if upload.index < 0 or upload.index >= len(chunk):
        # 服务端给回了一个不存在的下标。只可能是契约漂移，逐条记下来而不是抛——
        # 一个坏下标不该让其余几百个附件全丢。
        failures.append(
            "{0}：presign 返回了越界的 index {1}".format(upload.source_ref, upload.index)
        )
        return
    source = chunk[upload.index]
    try:
        client.put_binary(upload.upload_url, upload.content_type, source.body)
    except Exception as error:  # noqa: BLE001 — 一个附件传不上不该带走整批
        # 这一条是**本地**的失败，措辞上明确标出来：与服务端原样透传的拒绝理由
        # 混在一起时，人得能一眼分清该去查网络还是去查平台。
        failures.append(
            "{0} @《{1}》：（本地）直传失败 {2}".format(
                upload.source_ref, upload.run_name, error
            )
        )
        return
    register_items.append(
        IngestAttachmentRegisterItemWire(
            file_name=source.file_name,
            kind=source.kind,
            run_case_id=upload.run_case_id,
            run_id=upload.run_id,
            storage_key=upload.storage_key,
        )
    )


def _format_presign_rejections(receipt: IngestAttachmentPresignReceipt) -> List[str]:
    lines = []
    for rejection in receipt.rejected:
        target = " @《{0}》".format(rejection.run_name) if rejection.run_name else ""
        # reason 原样，一个字不改（§7.2 第 4 条）。
        lines.append("{0}{1}：{2}".format(rejection.source_ref, target, rejection.reason))
    return lines


def _upload_chunk(
    *,
    chunk: List[LoadedAttachment],
    client: IngestHttpClient,
    config: ReporterConfig,
    outcome: AttachmentOutcome,
) -> None:
    presigned = IngestAttachmentPresignReceipt.from_wire(
        client.post_json(
            INGEST_ATTACHMENTS_PRESIGN_ROUTE, _build_presign_body(chunk, config)
        )
    )
    outcome.storage_configured = outcome.storage_configured and presigned.storage_configured
    outcome.rejections.extend(_format_presign_rejections(presigned))
    register_items: List[IngestAttachmentRegisterItemWire] = []
    failures: List[str] = []
    for upload in presigned.uploads:
        # 串行直传：几百个附件并发会把 QA 本机的上行打满，结论那一轮的重试反而卡死。
        _put_one(
            chunk=chunk,
            client=client,
            failures=failures,
            register_items=register_items,
            upload=upload,
        )
    outcome.rejections.extend(failures)
    outcome.uploaded += len(register_items)
    if not register_items:
        return
    registered = IngestAttachmentRegisterReceipt.from_wire(
        client.post_json(
            INGEST_ATTACHMENTS_REGISTER_ROUTE,
            {"attachments": [item.to_wire() for item in register_items]},
        )
    )
    outcome.registered += registered.registered_count
    outcome.rejections.extend(
        "{0}：{1}".format(rejection.storage_key, rejection.reason)
        for rejection in registered.rejected
    )


def upload_attachments(
    *,
    attachments: List[LoadedAttachment],
    client: IngestHttpClient,
    config: ReporterConfig,
) -> AttachmentOutcome:
    """⚠️ **附件传不上去不能拖垮整次上报**（§5.6，与第二期 D9 同构）。

    所以这里对每一批各自兜住异常：结论那一轮早就写进去了，
    让一个连不上的 R2 把一次成功的上报判成失败是最没道理的失败方式。
    """
    outcome = AttachmentOutcome()
    for start in range(0, len(attachments), ATTACHMENTS_PER_BATCH):
        chunk = attachments[start : start + ATTACHMENTS_PER_BATCH]
        try:
            _upload_chunk(chunk=chunk, client=client, config=config, outcome=outcome)
        except Exception as error:  # noqa: BLE001 — 见上面的 docstring
            outcome.rejections.append("（本地）附件这一批整批失败：{0}".format(error))
    return outcome
