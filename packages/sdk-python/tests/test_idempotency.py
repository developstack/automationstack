"""幂等键（§7.2 第 2 条）。"""

from __future__ import annotations

import re

from automationstack_sdk import derive_batch_idempotency_key, resolve_run_idempotency_key

from conftest import RUN_KEY

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)

#: ⚠️ 这几行是**在 Node 版上跑出来的**基准值（`packages/sdk-node/src/idempotency.ts`
#: 的 `deriveBatchIdempotencyKey`）。两个 SDK 在同一条流水线上先后跑同一轮时
#: （迁移期常见），算出不同的键就等于各写一次、重试语义作废。
#: 改派生算法必须两边一起改，改完这几个值会对不上。
NODE_GOLDEN = {
    1: "26e62c10-ef31-5aec-85cf-bd37f388346a",
    2: "983d4cd9-1a42-50d1-8753-07cab3a4b6f7",
    3: "2f7b7606-dd51-5fb7-8b3d-db8f4ffb624a",
    7: "f0e227ec-752a-5993-855b-6003c159233d",
    42: "ac37475a-7768-5be4-8039-701b9539f81e",
}


def test_generates_one_key_per_process_when_unset() -> None:
    """没配环境变量时一次进程生成一个 UUID。"""
    first = resolve_run_idempotency_key({})
    second = resolve_run_idempotency_key({})
    assert UUID_PATTERN.match(first)
    # 两次「进程启动」当然不同——同一次进程内复用的是 config 里存下来的那一个，
    # 由 test_reporter_client.py 守着。
    assert first != second


def test_env_key_survives_ci_retry() -> None:
    """AS_IDEMPOTENCY_KEY 让 CI 重试（新进程）也能复用同一个键。"""
    env = {"AS_IDEMPOTENCY_KEY": RUN_KEY}
    assert resolve_run_idempotency_key(env) == RUN_KEY
    assert resolve_run_idempotency_key(env) == RUN_KEY


def test_batch_zero_is_the_run_key_itself() -> None:
    """第 0 批直接用 run key，人在日志里看到的就是它。"""
    assert derive_batch_idempotency_key(RUN_KEY, 0) == RUN_KEY


def test_derivation_is_deterministic() -> None:
    """重试第 N 批算出来的还是同一个键。"""
    assert derive_batch_idempotency_key(RUN_KEY, 3) == derive_batch_idempotency_key(
        RUN_KEY, 3
    )


def test_batches_get_distinct_keys() -> None:
    """不同批派生出不同的键，否则第二批会命中第一批的缓存对账单。"""
    keys = [derive_batch_idempotency_key(RUN_KEY, i) for i in range(4)]
    assert len(set(keys)) == len(keys)


def test_derived_keys_are_valid_uuids() -> None:
    """服务端的 z.uuid() 只认合法 UUID。"""
    for index in (1, 2, 7, 99):
        assert UUID_PATTERN.match(derive_batch_idempotency_key(RUN_KEY, index))


def test_matches_node_byte_for_byte() -> None:
    """与 Node 版逐字节一致——这是跨 SDK 的硬约束，不是巧合。"""
    for index, expected in NODE_GOLDEN.items():
        assert derive_batch_idempotency_key(RUN_KEY, index) == expected
    assert derive_batch_idempotency_key("run-key-abc", 1) == (
        "b3e8f93a-73ce-5ee8-86f7-8589acb34f8b"
    )
