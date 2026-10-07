package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class IdempotencyTest {

    private static final Map<Integer, String> NODE_GOLDEN = goldenTable();

    private static Map<Integer, String> goldenTable() {
        Map<Integer, String> golden = new LinkedHashMap<>();
        golden.put(1, "26e62c10-ef31-5aec-85cf-bd37f388346a");
        golden.put(2, "983d4cd9-1a42-50d1-8753-07cab3a4b6f7");
        golden.put(3, "2f7b7606-dd51-5fb7-8b3d-db8f4ffb624a");
        golden.put(7, "f0e227ec-752a-5993-855b-6003c159233d");
        golden.put(42, "ac37475a-7768-5be4-8039-701b9539f81e");
        return golden;
    }

    @Test
    void matchesNodeGolden() {
        for (Map.Entry<Integer, String> entry : NODE_GOLDEN.entrySet()) {
            assertEquals(entry.getValue(),
                    Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, entry.getKey()),
                    "批 " + entry.getKey() + " 与 Node 版对不上");
        }
    }

    @Test
    void matchesNodeGoldenForNonUuidRunKey() {
        assertEquals("b3e8f93a-73ce-5ee8-86f7-8589acb34f8b",
                Idempotency.deriveBatchIdempotencyKey("run-key-abc", 1));
    }

    @Test
    void batchZeroReusesRunKey() {
        assertEquals(TestFixtures.RUN_KEY,
                Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 0));
    }

    @Test
    void derivedKeysAreValidUuidsWithV5Shape() {
        String key = Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 5);
        assertEquals(key, UUID.fromString(key).toString());
        assertEquals('5', key.charAt(14), "版本位必须是 5");
        assertTrue("89ab".indexOf(key.charAt(19)) >= 0, "变体位必须落在 8/9/a/b");
    }

    @Test
    void derivationIsDeterministicAndDistinct() {
        assertEquals(Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 3),
                Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 3));
        assertNotEquals(Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 1),
                Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 2));
    }

    @Test
    void readsRunKeyFromEnvForCiRetry() {
        assertEquals("ci-job-77-attempt-2",
                Idempotency.resolveRunIdempotencyKey(Map.of("AS_IDEMPOTENCY_KEY", " ci-job-77-attempt-2 ")));
    }

    @Test
    void generatesOneKeyPerProcessWhenEnvIsAbsent() {
        String first = Idempotency.resolveRunIdempotencyKey(Map.of());
        assertEquals(first, UUID.fromString(first).toString());
        assertNotEquals(first, Idempotency.resolveRunIdempotencyKey(Map.of("AS_IDEMPOTENCY_KEY", "  ")));
    }
}
