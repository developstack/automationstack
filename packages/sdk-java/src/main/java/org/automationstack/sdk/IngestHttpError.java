package org.automationstack.sdk;

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

    public String serverMessage() {
        return serverMessage;
    }

    public int status() {
        return status;
    }
}
