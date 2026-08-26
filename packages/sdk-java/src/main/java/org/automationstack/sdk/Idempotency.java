package org.automationstack.sdk;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Map;
import java.util.UUID;

/**
 * 幂等键（§5.2 / §7.2 第 2 条）。
 *
 * <p>铁律是「一次进程启动生成一个 UUID，重试时**复用**」——重新生成就等于没有幂等。
 * 这里把它拆成两层，因为一次执行可能分成多批发（§5.5 超过 200 条分批），
 * 而 {@code UNIQUE (projectId, idempotencyKey)} 是**按请求**判的：几批共用一个键的话，
 * 第二批会命中第一批的缓存对账单直接返回，后面的结论一条都写不进去，
 * 而 SDK 看到的是两份「成功」的对账单——正是 §7.2 第 4 条说的那种静默成功。
 *
 * <p>所以：**一次进程一个 run key，每批的键从 run key 确定性派生**。
 * 确定性是关键——重试第 3 批时重新算一遍，拿到的还是同一个键。
 *
 * <p>⚠️ 派生算法与 {@code packages/sdk-node/src/idempotency.ts} 和
 * {@code packages/sdk-python/.../idempotency.py} 是**逐字节**对齐的：同一个 run key
 * 加同一个批号，三个 SDK 必须算出同一个 UUID。不这么要求也能跑，但一旦 Java 与 Node
 * 在同一条流水线上先后跑同一轮（迁移期常见），两边算出不同的键就会各写一次，
 * 重试的语义直接失效。{@code IdempotencyTest} 里钉了一张从 Node 侧跑出来的基准表。
 */
public final class Idempotency {

    /** UUID 的四个分段边界，用来把 16 字节的摘要摆成 8-4-4-4-12。 */
    private static final int[] UUID_SEGMENT_ENDS = {8, 12, 16, 20, 32};
    private static final int UUID_HEX_LENGTH = 32;
    private static final int VERSION_NIBBLE_INDEX = 12;
    private static final int VARIANT_NIBBLE_INDEX = 16;

    private Idempotency() {
    }

    /**
     * 读环境变量拿一个跨进程稳定的幂等键；没有就现生成一个。
     *
     * <p>⚠️ {@code AS_IDEMPOTENCY_KEY} 是**给 CI 重试用的**，不是日常配置（所以它不违反
     * D31：它不是「往哪写」的输入，只是「这是不是同一轮」的标识）。CI 的 retry 是**新进程**，
     * 「一次进程一个 UUID」在那里失效——同一轮被重跑时会当成两轮全新的上报。
     * 把 CI 的 job/attempt id 喂进来，重试才真的复用得上。
     */
    public static String resolveRunIdempotencyKey(Map<String, String> env) {
        String configured = env.get("AS_IDEMPOTENCY_KEY");
        if (configured != null && !configured.trim().isEmpty()) {
            // 不校验它是不是 uuid：真不是的话，服务端那条指着字段名的 400 比
            // SDK 自己编的一句「格式不对」更有用（同 §7.2 第 4 条「原样透传」）。
            return configured.trim();
        }
        return UUID.randomUUID().toString();
    }

    /**
     * 从 run key 确定性派生第 {@code batchIndex} 批的幂等键。
     *
     * <p>形状是 UUIDv5（name-based，SHA-1）：服务端 {@code z.uuid()} 只认合法 UUID，
     * 而 v5 恰好就是「从一个名字算出一个 UUID」这件事的标准做法，不用另发明一套编码。
     * 批 0 直接用 run key 本身——最常见的那种执行只有一批，让它的键就是人在日志里
     * 看到的那个 run key，排查时少一层换算。
     *
     * <p>⚠️ **不是标准的 UUIDv5**：标准做法要把 namespace 的 16 字节拼在 name 前面再摘，
     * 而 Node 版摘的是 {@code runKey + ":" + batchIndex} 这个字符串本身。想走标准那条路
     * 就得先跟另外两家商量出一个 namespace UUID，收益是零、分叉风险实打实——
     * 这里照着 Node 的字节序复刻。
     */
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
            // SHA-1 是 JDK 规范要求每个实现都必须提供的，走到这里说明 JRE 被裁过了。
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
        // 版本位固定成 5、变体位固定成 8：不改这两位算出来的不是合法 UUID，
        // 服务端的 z.uuid() 会直接拒。
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
