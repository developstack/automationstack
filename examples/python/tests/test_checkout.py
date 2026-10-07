"""一轮「自动化测试」，用的是 pytest + `pytest-automationstack`。

## 为什么这份示例用 pytest，而 Node 那份用内置 runner

Node 那边挑内置 runner，是为了证明「连测试框架都不用装」。Python 这边反过来：
`pytest-automationstack` 这个插件存在的全部意义就是**接管 pytest 的收集与收工**，
不用 pytest 演示它，等于什么都没演示。「不绑框架」这件事由
`src/report_empty_write.py` 单独扛——那个文件一行 pytest 都没有，照样能上报。

⚠️ `@pytest.mark.automationstack("...")` 里的字符串就是 `sourceRef`，它必须与平台上
用例的 sourceRef 逐字相同（种子数据在 `scripts/seed-automation-demo-cases.ts`）。
归属**只认**它（§3.7）：没有任何办法在代码里指定「写进哪个测试任务」。

这里没有真实的被测系统——断言跑的是一段假的下单流程。示例要演示的是**上报链路**，
不是怎么写测试。
"""

from __future__ import annotations

import pytest

def cart_total(unit_price: float, quantity: int) -> float:
    return unit_price * quantity


@pytest.mark.automationstack("AUTO-LOGIN-001")
def test_login_with_sms_code(trace) -> None:
    trace.log("输入手机号 138****0001，请求验证码")
    trace.log("输入验证码 000000，点击登录")
    assert "登录成功" == "登录成功"


@pytest.mark.automationstack("AUTO-CART-002")
def test_cart_total_refreshes_with_quantity(trace) -> None:
    trace.log("把商品数量从 1 改成 3（单价 19.9）")
    total = cart_total(19.9, 3)
    trace.log("读到合计 {0}".format(total))
    assert total == 59.7, "合计金额与预期不符（这条是示例故意造的失败）"


@pytest.mark.automationstack("AUTO-PAY-003")
@pytest.mark.skip(reason="支付沙箱今日停机")
def test_checkout_switches_payment_method() -> None:
    """跳过是一种**结论**，不是「没跑」。

    插件把 setup 阶段的 skip 报成 `skipped` 写进任务，而不是当作没发生过——
    平台上那条用例这一轮的状态是「跳过」，谁在看报表都能看见支付沙箱停机了。
    """
    pytest.fail("跳过的用例不会跑到这里")


@pytest.mark.automationstack("AUTO-REPORT-004")
def test_exports_order_report_as_xlsx(trace) -> None:
    """这条在《回归》里已经有人工结论了，自动化不覆盖它（D23）。

    同一条 sourceRef 会在《冒烟专项》里正常写入、在《回归》里进「跳过」——
    对账单的 `skippedManual` 带着 runName，就是为了这种情况不自相矛盾。
    """
    trace.log("点击导出，等待 xlsx 下载完成")
    assert "已下载" == "已下载"


@pytest.mark.automationstack("AUTO-SEARCH-005")
def test_search_keyword_highlight(trace) -> None:
    """这条用例在平台上**存在**，但没有被任何未提交的测试任务收着。

    于是它会出现在对账单的「越界」里，而不是「未匹配」。两者不能合并：
    这一条该去把用例勾进任务，那一条该去检查 AS_PROJECT 或补 sourceRef。
    """
    trace.log("搜索「耳机」，检查结果里的高亮标记")
    assert "耳机" == "耳机"


def test_health_check_endpoint_returns_ok() -> None:
    """**故意不标 marker**：演示插件对「没有 sourceRef 的用例」怎么处理。

    它不上报，也不静默——收工时插件会打一行说明有几条、都是谁。
    整批发过去只会让这些用例挤满对账单的「未匹配」，把真正该看的那几条淹掉；
    而完全不吭声又会让人以为它上报了。真实仓库里这种用例占大多数
    （单元测试、内部冒烟），它们本来就不该出现在测试任务里。
    """
    assert 200 == 200
