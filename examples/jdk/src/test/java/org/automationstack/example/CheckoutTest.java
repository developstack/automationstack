package org.automationstack.example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import org.automationstack.sdk.junit5.AutomationStack;
import org.automationstack.sdk.junit5.AutomationStackExtension;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

/**
 * 一轮「自动化测试」，走 JUnit 5 薄壳。
 *
 * <p>接线只有一行：{@code @ExtendWith(AutomationStackExtension.class)}。
 * 它可以标在这里，也可以标在你自己的测试基类上标一次。JUnit 没有自动注册这回事，
 * 不写这行就完全不会有任何上报行为——这也是薄壳能和核心包同处一个 artifact 的原因。
 *
 * <p>⚠️ {@code @AutomationStack("...")} 里的字符串就是 {@code sourceRef}，
 * 它必须与平台上那条用例的 sourceRef 逐字一致。**没标的用例不上报**（见下面最后一条）。
 *
 * <p>⚠️ 跑之前要把 {@code .env} 导进环境：
 * <pre>{@code set -a && . ./.env && set +a && mvn test}</pre>
 * Java 改不了自己进程的环境变量，所以这一步只能在进程之外做（README 里有解释）。
 * 没导也不会红——薄壳会打一行「未上报」的说明然后什么都不做。
 */
@ExtendWith(AutomationStackExtension.class)
class CheckoutTest {

    @Test
    @AutomationStack("AUTO-LOGIN-001")
    void loginWithSmsCode() {
        assertEquals(200, fakeStatusOfLogin());
    }

    @Test
    @AutomationStack("AUTO-CART-002")
    void cartTotalRefreshesWithQuantity() {
        assertEquals(256.0, 128.0 * 2);
    }

    /** 故意失败的那一条：对账单和报告页上都该看得见它。 */
    @Test
    @AutomationStack("AUTO-PAY-003")
    void checkoutSwitchesPaymentMethod() {
        assertEquals(128.00, 118.00, "期望订单总额 ¥128.00，实际 ¥118.00");
    }

    /** {@code @Disabled} 上报成 skipped，不是 failed。 */
    @Test
    @Disabled("依赖的导出服务未部署，本轮跳过")
    @AutomationStack("AUTO-REPORT-004")
    void exportsOrderReportAsXlsx() {
        assertTrue(false);
    }

    /** 前置条件不成立时用 assumption，同样上报成 skipped。 */
    @Test
    @AutomationStack("AUTO-SEARCH-005")
    void searchKeywordHighlight() {
        assumeTrue(System.getenv("AS_SEARCH_INDEX_READY") != null, "搜索索引未就绪");
        assertTrue(true);
    }

    /**
     * **没标注解**：这一条不会被上报，收工时只会有一句「有 1 条用例没标」。
     *
     * <p>不是所有测试都对应平台上的一条用例——健康检查、契约自检这类东西整批发过去，
     * 只会让它们挤满对账单的「未匹配」，把真正该看的那几条淹掉。
     */
    @Test
    void healthCheckEndpointReturnsOk() {
        assertEquals(200, fakeStatusOfLogin());
    }

    private static int fakeStatusOfLogin() {
        return 200;
    }
}
