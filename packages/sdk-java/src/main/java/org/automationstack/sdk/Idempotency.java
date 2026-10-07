package org.automationstack.sdk;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Map;
import java.util.UUID;

public final class Idempotency {

    private static final int[] UUID_SEGMENT_ENDS = {8, 12, 16, 20, 32};
    private static final int UUID_HEX_LENGTH = 32;
    private static final int VERSION_NIBBLE_INDEX = 12;
    private static final int VARIANT_NIBBLE_INDEX = 16;

    private Idempotency() {
    }

    public static String resolveRunIdempotencyKey(Map<String, String> env) {
        String configured = env.get("AS_IDEMPOTENCY_KEY");
        if (configured != null && !configured.trim().isEmpty()) {
            return configured.trim();
        }
        return UUID.randomUUID().toString();
    }

    public static String deriveBatchIdempotencyKey(String runKey, int batchIndex) {
        if (batchIndex == 0) {
            return runKey;
        }
        String payload = runKey + ":" + batchIndex;
        String digest = toHex(sha1(payload.getBytes(StandardCharsets.UTF_8)));
        return formatAsUuidV5(digest.substring(0, UUID_HEX_LENGTH));
    }

    private static byte[] sha1(byte[] payload) {
        try {
            return MessageDigest.getInstance("SHA-1").digest(payload);
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("这个 JRE 上没有 SHA-1，幂等键没法派生", error);
        }
    }

    private static String toHex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte current : bytes) {
            out.append(Character.forDigit((current >> 4) & 0xF, 16));
            out.append(Character.forDigit(current & 0xF, 16));
        }
        return out.toString();
    }

    private static String formatAsUuidV5(String hex) {
        char[] nibbles = hex.toCharArray();
        nibbles[VERSION_NIBBLE_INDEX] = '5';
        nibbles[VARIANT_NIBBLE_INDEX] = '8';
        String normalized = new String(nibbles);
        StringBuilder out = new StringBuilder(36);
        int cursor = 0;
        for (int end : UUID_SEGMENT_ENDS) {
            if (cursor > 0) {
                out.append('-');
            }
            out.append(normalized, cursor, end);
            cursor = end;
        }
        return out.toString();
    }
}
