package org.automationstack.example;

import org.automationstack.sdk.Idempotency;

public final class CiIdempotencyKey {

    private static final int DERIVE_INDEX = 1;

    private static final String LANGUAGE_TAG = "java:";

    private static final int EXIT_USAGE = 1;

    private CiIdempotencyKey() {
    }

    public static String ciIdempotencyKey(String name) {
        return Idempotency.deriveBatchIdempotencyKey(LANGUAGE_TAG + name, DERIVE_INDEX);
    }

    public static void main(String[] args) {
        if (args.length != 1 || args[0].isBlank()) {
            System.err.println("用法：CiIdempotencyKey \"<CI 的 job-attempt 标识>\"");
            System.exit(EXIT_USAGE);
            return;
        }
        System.out.println(ciIdempotencyKey(args[0].strip()));
    }
}
