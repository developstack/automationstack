package org.automationstack.sdk;

/**
 * 一次 HTTP 调用没成功。{@link #serverMessage()} 是服务端 {@code message} 字段的**原文**。
 *
 * <p>⚠️ 名字里的 {@code Error} 是照着 Node / Python 两家的类名来的（三家的排查文档
 * 里出现的是同一个词），它继承的是 {@link RuntimeException}，**不是 {@link Error}**。
 * 受检异常在这里没有意义：调用方几乎总是「让它冒上去把这一轮判失败」，
 * 逼所有人写 try/catch 只会催生一堆空 catch 块，那才是真正会吞掉失败的东西。
 */
public final class IngestHttpError extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final transient String serverMessage;
    private final int status;

    public IngestHttpError(int status, String serverMessage, String url) {
        super(url + " 返回 " + status + (serverMessage == null || serverMessage.isEmpty()
                ? ""
                : "：" + serverMessage));
        this.serverMessage = serverMessage;
        this.status = status;
    }

    /** 服务端 {@code message} 的原文；取不出来时为 null（SDK 绝不自己编一句）。 */
    public String serverMessage() {
        return serverMessage;
    }

    public int status() {
        return status;
    }
}
