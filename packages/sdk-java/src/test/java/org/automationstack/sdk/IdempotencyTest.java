package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * ⚠️ **这个文件是三家 SDK 不漂的唯一保证。**
 *
 * <p>{@link #NODE_GOLDEN} 是从 {@code sdk-node} 跑出来的基准值，
 * {@code sdk-python/tests/test_idempotency.py} 里逐字抄了一份，这里是第三份。
 * 同一个 run key + 同一个批次号，三家必须算出同一个键——算不出同一个，
 * 同一轮重试就会被服务端当成两轮新上报，结论写重。
 *
 * <p>改动 {@link Idempotency} 而这里红了，**要改的是实现，不是这张表**。
 */
class IdempotencyTest {

    /** 从 Node 版跑出来的基准（run key = {@link TestFixtures#RUN_KEY}）。 */
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

    /** 另一个 run key 的基准值，同样来自 Node 版。 */
    @Test
    void matchesNodeGoldenForNonUuidRunKey() {
        assertEquals("b3e8f93a-73ce-5ee8-86f7-8589acb34f8b",
                Idempotency.deriveBatchIdempotencyKey("run-key-abc", 1));
    }

    @Test
    void batchZeroReusesRunKey() {
        // 最常见的执行只有一批：让它的键就是人在日志里看到的那个 run key。
        assertEquals(TestFixtures.RUN_KEY,
                Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 0));
    }

    @Test
    void derivedKeysAreValidUuidsWithV5Shape() {
        String key = Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 5);
        // 服务端是 z.uuid()：形状不合法的键会被一条 400 顶回来。
        assertEquals(key, UUID.fromString(key).toString());
        assertEquals('5', key.charAt(14), "版本位必须是 5");
        assertTrue("89ab".indexOf(key.charAt(19)) >= 0, "变体位必须落在 8/9/a/b");
    }

    @Test
    void derivationIsDeterministicAndDistinct() {
        // 确定性 = 重试第 N 批算出来的还是同一个键（§7.2 第 2 条）。
        assertEquals(Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 3),
                Idempotency.deriveBatchIdempotencyKey(TestFixtures.RUN_KEY, 3));
        // 各批不同 = 第二批不会命中第一批缓存的对账单。
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
