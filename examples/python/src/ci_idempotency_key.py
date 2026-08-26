"""把 CI 的 job/attempt 标识**确定性**地折成一个合法 UUID，喂给 `AS_IDEMPOTENCY_KEY`。

    export AS_IDEMPOTENCY_KEY=$(./.venv/bin/python -m src.ci_idempotency_key \
      "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT")

## 为什么不能直接把 `12345-2` 塞进 AS_IDEMPOTENCY_KEY

服务端那个字段是 `z.uuid()`，不是 UUID 会当场 400。SDK 故意**不**在本地校验它
（见 `automationstack_sdk/idempotency.py` 的注释：服务端那条指着字段名的 400，
比 SDK 自己编一句「格式不对」有用），所以这一步的转换得由调用方做。

## 为什么整个文件只有一次函数调用

「从一个名字确定性地算出一个 UUID」这件事核心包里**已经有**了，就是
`derive_batch_idempotency_key`——它是公开导出的（`__init__.py` 的 `__all__` 里），
分批派生用的就是它，形状是 UUIDv5。示例再抄一遍 SHA-1 摆位那十几行，
只会多出一处将来会和核心包漂移的实现。

⚠️ **`batch_index` 传 1 而不是 0**：批 0 有个捷径，直接把 run key 原样返回
（见核心包那个函数的 docstring），传 0 等于把 `12345-2` 原封不动还给你，
下一步照样 400。传 1 走的才是「摘要 → UUID」那条路。

## 为什么要在名字前面加一个 `python:`

CI 发给三种语言的 `$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT` 是**同一个字符串**。
一条流水线里 Node / Python / Java 各跑一轮自己的测试，两轮共用一个幂等键
就是灾难——第二轮会命中第一轮的缓存对账单直接返回，结论一条都写不进去，
而它看到的是一份「成功」的对账单：绿着，但什么都没发生。

而 `examples/jdk` 那份调的是**同一个** `deriveBatchIdempotencyKey(name, 1)`：
不加区分的话，同一个输入 Python 和 Java 算出来是一模一样的键——这不是假想，
是实测撞上过的。Node 那份当时没撞，只因为它自己实现了一遍、摘的是 `name`
而不是 `name:1`；把「两轮不撞」寄托在「三份实现碰巧不一样」上，一碰就碎。
所以三份示例各自显式加一个语言前缀，让「不撞」成为一条**写下来的**性质，
而不是公式没对齐的副产品。
"""

from __future__ import annotations

import sys

from automationstack_sdk import derive_batch_idempotency_key

#: 见模块顶部：0 是「原样返回」的捷径，这里要的是真的摘一次。
_DERIVE_INDEX = 1

#: 见模块顶部：CI 给三种语言的 job 标识是同一个字符串，不加区分 Python 与 Java 会
#: 算出同一个键，第二轮直接命中第一轮的缓存对账单、一条都写不进去还显示成功。
_LANGUAGE_TAG = "python:"

_EXIT_USAGE = 1


def ci_idempotency_key(name: str) -> str:
    """要的性质只有一条：**同样的输入永远得到同样的 UUID**。

    CI 的 retry 是新进程，「一次进程一个 UUID」在那里失效；算出来必须还是那一个，
    否则平台上会多出一份内容一模一样的执行记录。
    """
    return derive_batch_idempotency_key(_LANGUAGE_TAG + name, _DERIVE_INDEX)


def main(argv: list) -> int:
    if len(argv) != 2 or not argv[1].strip():
        print(
            '用法：python -m src.ci_idempotency_key "<CI 的 job-attempt 标识>"',
            file=sys.stderr,
        )
        return _EXIT_USAGE
    # 这个入口的全部输出就是那一行 key：它要能被 $(...) 直接吃掉，
    # 多打一个字（哪怕是「计算完成」）都会把它拼进环境变量里。
    print(ci_idempotency_key(argv[1].strip()))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
