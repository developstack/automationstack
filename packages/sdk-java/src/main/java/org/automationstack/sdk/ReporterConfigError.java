package org.automationstack.sdk;

/** 配置缺项。构造 reporter 的那一刻就抛，绝不拖到跑完测试。 */
public final class ReporterConfigError extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ReporterConfigError(String message) {
        super(message);
    }
}
