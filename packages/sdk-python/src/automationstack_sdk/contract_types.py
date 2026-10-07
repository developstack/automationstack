"""ingest 线上契约的**类型副本**（plan §5.1.1 / §5.6）。

## 为什么自带一份

唯一规范是 `apps/server` 上那份 zod schema 产出的 OpenAPI（D27）。Python 这边
既不能 import TypeScript，也不该为了对齐而在安装时拉一个代码生成器——
那会给「零运行时依赖」这个卖点开第一个口子，也会让「读 SDK 源码就能看懂发的是
什么」失效。Node 版的 `contract-types.ts` 顶部已经把这条路论证过一遍，
结论是**三个 SDK 一律自带一份契约副本，一律用一致性测试兜底漂移**。

## 为什么用 dataclass 而不是裸 dict

裸 dict 在 Node 那边是够用的（TS 的结构化类型让 `response.json()` 直接当契约用），
Python 没有这回事：一个拼错的键名要等到运行时 `KeyError` 才炸，而它炸的时机
恰好是**测试全跑完之后**——最不该出错的那一刻。所以响应侧一律走
`from_wire`，缺字段在解析这一步就露出来；请求侧走 `to_wire`，键名只写一次。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

AutomationCaseResult = str
AUTOMATION_CASE_RESULTS = ("blocked", "failed", "passed", "skipped")

AttachmentKind = str
ATTACHMENT_KINDS = ("log", "other", "screenshot", "video")


@dataclass(frozen=True)
class IngestExecutionResultWire:
    """⚠️ `duration_ms` 服务端收下但**本期不落库**（`test_run_cases` 没有这一列）。

    照发不误：字段在契约里，少发一个字段只会让以后加列时三家 SDK 各改一遍。
    """

    result: AutomationCaseResult
    source_ref: str
    duration_ms: Optional[int] = None
    message: Optional[str] = None

    def to_wire(self) -> Dict[str, Any]:
        return {
            "durationMs": self.duration_ms,
            "message": self.message,
            "result": self.result,
            "sourceRef": self.source_ref,
        }


@dataclass(frozen=True)
class IngestExecutionRequestWire:
    """`POST /ingest/executions` 的请求体。

    **没有单数的 `runId`**——服务端把那个键声明成了 `z.never()`，
    发过去是一条 400，而不是被静默 strip（D31）。所以这里连字段都不留。
    """

    idempotency_key: str
    project_id: str
    results: List[IngestExecutionResultWire]
    branch: Optional[str] = None
    ci_url: Optional[str] = None
    commit_sha: Optional[str] = None
    finished_at: Optional[str] = None
    overwrite_manual: bool = False
    run_ids: Optional[List[str]] = None
    started_at: Optional[str] = None

    def to_wire(self) -> Dict[str, Any]:
        return {
            "branch": self.branch,
            "ciUrl": self.ci_url,
            "commitSha": self.commit_sha,
            "finishedAt": self.finished_at,
            "idempotencyKey": self.idempotency_key,
            "overwriteManual": self.overwrite_manual,
            "projectId": self.project_id,
            "results": [item.to_wire() for item in self.results],
            "runIds": self.run_ids,
            "startedAt": self.started_at,
        }


@dataclass(frozen=True)
class IngestWrittenToEntry:
    run_id: str
    run_name: str
    updated: int

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestWrittenToEntry":
        return cls(
            run_id=str(raw["runId"]),
            run_name=str(raw["runName"]),
            updated=int(raw["updated"]),
        )


@dataclass(frozen=True)
class IngestSkippedManualEntry:
    reason: str
    run_name: str
    source_ref: str

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestSkippedManualEntry":
        return cls(
            reason=str(raw["reason"]),
            run_name=str(raw["runName"]),
            source_ref=str(raw["sourceRef"]),
        )


@dataclass(frozen=True)
class IngestUnmatchedCaseEntry:
    reason: str
    source_ref: str

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestUnmatchedCaseEntry":
        return cls(reason=str(raw["reason"]), source_ref=str(raw["sourceRef"]))


@dataclass(frozen=True)
class IngestOutOfScopeEntry:
    case_id: str
    reason: str
    run_name: Optional[str]
    source_ref: str

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestOutOfScopeEntry":
        run_name = raw.get("runName")
        return cls(
            case_id=str(raw.get("caseId", "")),
            reason=str(raw["reason"]),
            run_name=None if run_name is None else str(run_name),
            source_ref=str(raw["sourceRef"]),
        )


@dataclass(frozen=True)
class IngestExecutionReceipt:
    """对账单。四个数组各说一件事，**任何两个都不能合并**（§5.1.1）。"""

    execution_id: str
    out_of_scope: List[IngestOutOfScopeEntry]
    skipped_manual: List[IngestSkippedManualEntry]
    unmatched_cases: List[IngestUnmatchedCaseEntry]
    written_to: List[IngestWrittenToEntry]

    @classmethod
    def from_wire(cls, raw: Dict[str, Any]) -> "IngestExecutionReceipt":
        return cls(
            execution_id=str(raw.get("executionId", "")),
            out_of_scope=[
                IngestOutOfScopeEntry.from_wire(item)
                for item in raw.get("outOfScope") or []
            ],
            skipped_manual=[
                IngestSkippedManualEntry.from_wire(item)
                for item in raw.get("skippedManual") or []
            ],
            unmatched_cases=[
                IngestUnmatchedCaseEntry.from_wire(item)
                for item in raw.get("unmatchedCases") or []
            ],
            written_to=[
                IngestWrittenToEntry.from_wire(item)
                for item in raw.get("writtenTo") or []
            ],
        )
