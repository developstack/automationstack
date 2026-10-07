package org.automationstack.sdk;

@FunctionalInterface
public interface ReceiptSink {

    void accept(String line);
}
