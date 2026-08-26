"""示例自己的搬运代码：环境变量、失败现场、CI 幂等键、裸核心包入口。

**这是个真包（有 `__init__.py`），不是散文件。** 理由只有一个：入口一律用
`python -m src.xxx` 跑，`-m` 会把**当前目录**放进 sys.path，于是 `conftest.py`
里的 `from src.artifacts import ...` 和命令行里的 `-m src.report_empty_write`
看到的是同一个包。写成散文件时 `python src/report_empty_write.py` 的 sys.path[0]
是 `src/` 而不是示例根目录，两种跑法会 import 到两份不同的模块对象——
那种问题查起来很贵，而躲开它只要一个空文件。
"""

from __future__ import annotations
