"""契约副本的一致性兜底。

本包**自带一份契约副本**（理由见 `route_paths.py` / `contract_types.py` 顶部）。
副本的唯一风险是分叉，这个文件就是那道闸：它把 `packages/sdk-node/src` 下那两份
`.ts` 当**文本**读进来，正则抽出常量值，与 Python 侧逐个断言相等。
改了一边而没改另一边，测试立刻红。

⚠️ 为什么比的是 Node 版而不是 `apps/server`：Node 版自己有一道
`contract-parity.test.ts`，它直接 import 服务端那份 zod schema 去 parse
真实请求体——那是比文本比对强一档的闸。链成 服务端 → Node → Python 之后，
Python 这边只需要守住「与参考实现逐字相等」，不必再复刻一遍 zod。
断链的两种可能（Node 改了没跟 / 服务端改了 Node 没跟）各自有一道闸接着。
"""

from __future__ import annotations

import pathlib
import re

import pytest

import automationstack_sdk as sdk

_SDK_NODE_SRC = pathlib.Path(__file__).resolve().parents[2] / "sdk-node" / "src"
_NUMERIC = re.compile(r"export const (\w+) = ([\d_]+);")
_STRING = re.compile(r'export const (\w+) = "([^"]+)";')


def _read(name: str) -> str:
    path = _SDK_NODE_SRC / name
    if not path.is_file():
        pytest.fail("找不到参考实现 {0}——契约比对没法进行".format(path))
    return path.read_text(encoding="utf-8")


def test_numeric_limits_match_node() -> None:
    """七个数值上限与 Node 版逐个相等。"""
    declared = {
        name: int(value.replace("_", ""))
        for name, value in _NUMERIC.findall(_read("contract-limits.ts"))
    }
    assert declared, "contract-limits.ts 里一个常量都没抽出来，正则该跟着改了"
    assert declared == {
        "ATTACHMENTS_PER_BATCH": sdk.ATTACHMENTS_PER_BATCH,
        "MAX_INGEST_ATTACHMENTS_PER_REQUEST": sdk.MAX_INGEST_ATTACHMENTS_PER_REQUEST,
        "MAX_INGEST_COMMENT_LENGTH": sdk.MAX_INGEST_COMMENT_LENGTH,
        "MAX_INGEST_MESSAGE_LENGTH": sdk.MAX_INGEST_MESSAGE_LENGTH,
        "MAX_INGEST_RESULTS_PER_REQUEST": sdk.MAX_INGEST_RESULTS_PER_REQUEST,
        "MAX_INGEST_SOURCE_REF_LENGTH": sdk.MAX_INGEST_SOURCE_REF_LENGTH,
        "RESULTS_PER_BATCH": sdk.RESULTS_PER_BATCH,
    }


def test_route_paths_match_node() -> None:
    """四条路由与 Node 版逐字一致。"""
    declared = dict(_STRING.findall(_read("route-paths.ts")))
    assert declared == {
        "INGEST_ATTACHMENTS_PRESIGN_ROUTE": sdk.INGEST_ATTACHMENTS_PRESIGN_ROUTE,
        "INGEST_ATTACHMENTS_REGISTER_ROUTE": sdk.INGEST_ATTACHMENTS_REGISTER_ROUTE,
        "INGEST_EXECUTIONS_ROUTE": sdk.INGEST_EXECUTIONS_ROUTE,
        "INGEST_RUNS_ROUTE": sdk.INGEST_RUNS_ROUTE,
    }


def test_batch_sizes_fit_server_hard_limits() -> None:
    """分批上限必须落在服务端硬闸以内。"""
    assert sdk.RESULTS_PER_BATCH <= sdk.MAX_INGEST_RESULTS_PER_REQUEST
    assert sdk.ATTACHMENTS_PER_BATCH <= sdk.MAX_INGEST_ATTACHMENTS_PER_REQUEST
    assert sdk.MAX_INGEST_COMMENT_LENGTH <= sdk.MAX_INGEST_MESSAGE_LENGTH
