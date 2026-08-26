package org.automationstack.sdk.junit5;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 这条用例（或这个类里所有用例）对应平台上的哪个 {@code sourceRef}。
 *
 * <p>对应 pytest 那边的 {@code @pytest.mark.automationstack("PAY-CART-031")}。
 * 方法上的优先于类上的：一个类里大多数用例属于同一条时，类上标一次、个别方法上覆盖。
 *
 * <p>**没标的用例不上报**，也不静默——收工时会统一说一句有几条没标。整批发过去
 * 只会让它们挤满对账单的「未匹配」，把真正该看的那几条淹掉。
 */
@Documented
@Inherited
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.METHOD, ElementType.TYPE})
public @interface AutomationStack {

    /** 用例上的 sourceRef，归属**唯一**的输入（§3.7）。 */
    String value();
}
