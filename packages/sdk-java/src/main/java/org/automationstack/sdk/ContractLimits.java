package org.automationstack.sdk;

public final class ContractLimits {

    public static final int MAX_INGEST_RESULTS_PER_REQUEST = 2000;

    public static final int MAX_INGEST_ATTACHMENTS_PER_REQUEST = 2000;

    public static final int MAX_INGEST_MESSAGE_LENGTH = 20_000;

    public static final int MAX_INGEST_COMMENT_LENGTH = 2000;

    public static final int MAX_INGEST_SOURCE_REF_LENGTH = 512;

    public static final int RESULTS_PER_BATCH = 200;

    public static final int ATTACHMENTS_PER_BATCH = 500;

    private ContractLimits() {
    }
}
