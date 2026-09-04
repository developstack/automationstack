"""`pytest-automationstack`：把 pytest 的结果交给 `automationstack-sdk` 上报。

这个包**没有任何业务逻辑**——分批、幂等、重试、对账单、退出码判定全在核心包
`automationstack_sdk` 里。这里只有一层壳，见 `plugin.py` 顶部。

插件通过 entry point 自动注册，装上之后加 `--automationstack` 才会真的上报。

公开面只有 `add_attachment`：把一个附件挂到本轮上报的某条用例上。结论的收集不需要
用户写任何代码，附件不同——截图与日志长什么样只有用户的仓库知道，插件不认识任何一个
driver。没加 `--automationstack` 时它是安静的空操作，返回 `False`。
"""

from __future__ import annotations

from .plugin import add_attachment

__version__ = "1.0.0"

__all__ = ["__version__", "add_attachment"]
