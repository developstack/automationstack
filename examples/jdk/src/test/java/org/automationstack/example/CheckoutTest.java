package org.automationstack.example;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import org.automationstack.sdk.junit5.AutomationStack;
import org.automationstack.sdk.junit5.AutomationStackExtension;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

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

    @Test
    @AutomationStack("AUTO-PAY-003")
    void checkoutSwitchesPaymentMethod() {
        assertEquals(128.00, 118.00, "期望订单总额 ¥128.00，实际 ¥118.00");
    }

    @Test
    @Disabled("依赖的导出服务未部署，本轮跳过")
    @AutomationStack("AUTO-REPORT-004")
    void exportsOrderReportAsXlsx() {
        assertTrue(false);
    }

    @Test
    @AutomationStack("AUTO-SEARCH-005")
    void searchKeywordHighlight() {
        assumeTrue(System.getenv("AS_SEARCH_INDEX_READY") != null, "搜索索引未就绪");
        assertTrue(true);
    }

    @Test
    void healthCheckEndpointReturnsOk() {
        assertEquals(200, fakeStatusOfLogin());
    }

    private static int fakeStatusOfLogin() {
        return 200;
    }
}
