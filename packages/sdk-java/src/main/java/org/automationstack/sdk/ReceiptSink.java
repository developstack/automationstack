package org.automationstack.sdk;

/** 对账单的输出去处。默认写 stdout，测试里换成收集器。 */
@FunctionalInterface
public interface ReceiptSink {

    void accept(String line);
}
