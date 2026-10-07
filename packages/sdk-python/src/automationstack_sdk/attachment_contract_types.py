"""附件三步（presign → 直传 → register）的契约副本，§5.6 / D28。

单独一个模块，是照着服务端自己的切法来的：那边也分成 `execution-contract.ts`
与 `attachment-contract.ts` 两份。附件这条线的字段数是结论那条线的两倍多，
混在一份里读起来要先分辨「这个 dataclass 是哪条线上的」——对着服务端的文件
边界切，两边找对应物时不用换算。

与 `contract_types.py` 同一条理由：响应侧走 `from_wire`，请求侧走 `to_wire`。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .contract_types import AttachmentKind


@dataclass(frozen=True)
class IngestAttachmentUpload:
    content_type: str
    index: int
    run_case_id: str
    run_id: str
    run_name: str
    source_ref: str
    storage_key: str
    upload_url: str

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestAttachmentUpload":
        return cls(
            content_type=str(raw["contentType"]),
            index=int(raw["index"]),
            run_case_id=str(raw["runCaseId"]),
            run_id=str(raw["runId"]),
            run_name=str(raw.get("runName", "")),
            source_ref=str(raw.get("sourceRef", "")),
            storage_key=str(raw["storageKey"]),
            upload_url=str(raw["uploadUrl"]),
        )


@dataclass(frozen=True)
class IngestAttachmentRejection:
    index: int
    reason: str
    run_name: Optional[str]
    source_ref: str

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestAttachmentRejection":
        run_name = raw.get("runName")
        return cls(
            index=int(raw.get("index", -1)),
            reason=str(raw["reason"]),
            run_name=None if run_name is None else str(run_name),
            source_ref=str(raw.get("sourceRef", "")),
        )


@dataclass(frozen=True)
class IngestAttachmentPresignReceipt:
    expires_in_seconds: int
    rejected: List[IngestAttachmentRejection]
    storage_configured: bool
    uploads: List[IngestAttachmentUpload]

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestAttachmentPresignReceipt":
        return cls(
            expires_in_seconds=int(raw.get("expiresInSeconds", 0)),
            rejected=[
                IngestAttachmentRejection.from_wire(item)
                for item in raw.get("rejected") or []
            ],
            storage_configured=bool(raw.get("storageConfigured", False)),
            uploads=[
                IngestAttachmentUpload.from_wire(item)
                for item in raw.get("uploads") or []
            ],
        )


@dataclass(frozen=True)
class IngestAttachmentRegisterItemWire:
    file_name: str
    kind: AttachmentKind
    run_case_id: str
    run_id: str
    storage_key: str

    def to_wire(self) -> Dict[str, Any]:
        return {
            "fileName": self.file_name,
            "kind": self.kind,
            "runCaseId": self.run_case_id,
            "runId": self.run_id,
            "storageKey": self.storage_key,
        }


@dataclass(frozen=True)
class IngestAttachmentRegisterRejection:
    index: int
    reason: str
    run_case_id: str
    storage_key: str

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestAttachmentRegisterRejection":
        return cls(
            index=int(raw.get("index", -1)),
            reason=str(raw["reason"]),
            run_case_id=str(raw.get("runCaseId", "")),
            storage_key=str(raw.get("storageKey", "")),
        )


@dataclass(frozen=True)
class IngestAttachmentRegisterReceipt:
    registered_count: int
    rejected: List[IngestAttachmentRegisterRejection]
    storage_configured: bool

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestAttachmentRegisterReceipt":
        return cls(
            registered_count=len(raw.get("registered") or []),
            rejected=[
                IngestAttachmentRegisterRejection.from_wire(item)
                for item in raw.get("rejected") or []
            ],
            storage_configured=bool(raw.get("storageConfigured", False)),
        )
