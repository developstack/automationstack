package org.automationstack.example;

import org.automationstack.sdk.Idempotency;

/**
 * 把 CI 的 job/attempt 标识**确定性**地折成一个合法 UUID，喂给 {@code AS_IDEMPOTENCY_KEY}。
 *
 * <pre>{@code
 * export AS_IDEMPOTENCY_KEY=$(mvn -q exec:java \
 *   -Dexec.mainClass=org.automationstack.example.CiIdempotencyKey \
 *   -Dexec.args="$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT")
 * }</pre>
 *
 * <h2>为什么不能直接把 {@code 12345-2} 塞进 AS_IDEMPOTENCY_KEY</h2>
 *
 * 服务端那个字段是 {@code z.uuid()}，不是 UUID 会当场 400。SDK 故意**不**在本地校验它
 * （服务端那条指着字段名的 400 比 SDK 自己编一句「格式不对」有用），
 * 所以这一步的转换得由调用方做。
 *
 * <h2>为什么整个类只有一次函数调用</h2>
 *
 * 「从一个名字确定性地算出一个 UUID」核心包里已经有了，就是
 * {@link Idempotency#deriveBatchIdempotencyKey}——它是公开的，分批派生用的就是它。
 * 示例再抄一遍 SHA-1 摆位那十几行，只会多出一处将来会和核心包漂移的实现。
 *
 * <p>⚠️ **batchIndex 传 1 而不是 0**：批 0 有个捷径，直接把 run key 原样返回，
 * 传 0 等于把 {@code 12345-2} 原封不动还给你，下一步照样 400。
 *
 * <h2>为什么要在名字前面加一个 {@code java:}</h2>
 *
 * 一条流水线里几种语言各跑一轮自己的测试，**两轮共用一个幂等键是灾难**：第二轮会命中
 * 第一轮的缓存对账单直接返回，结论一条都写不进去，而它看到的是一份「成功」的对账单——
 * 绿着，但什么都没写。而 CI 给三种语言的 {@code $GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT}
 * 是**同一个字符串**，不做任何区分就必然撞上。
 *
 * <p>⚠️ 这不是假想的风险，是实测撞上的：{@code examples/python} 那份同样调
 * {@code derive_batch_idempotency_key(name, 1)}，于是同一个输入 Python 和 Java
 * 算出的是**一模一样**的键（{@code "12345-2"} → {@code c2a9c07a-…}）。
 * Node 那份碰巧不同，只是因为它自己实现了一遍、摘的是 {@code name} 而不是
 * {@code name:1}——把「两轮不撞」这条安全性质寄托在「三份实现碰巧不一样」上，
 * 是一碰就碎的。所以这里显式加语言前缀，让它成为一条**被写下来的**性质。
 *
 * <p>（Node / Python 两份示例现在也各自加上了自己的前缀 {@code node:} / {@code python:}，
 * 三份都带前缀，同一个输入在三边算出的是三个互不相同的键，谁都不会撞上谁。）
 */
public final class CiIdempotencyKey {

    /** 见类注释：0 是「原样返回」的捷径，这里要的是真的摘一次。 */
    private static final int DERIVE_INDEX = 1;

    /**
     * 见类注释：CI 给三种语言的 job 标识是同一个字符串，不加区分 Python 与 Java 会算出
     * 同一个键，第二轮直接命中第一轮的缓存对账单、一条都写不进去还显示成功。
     */
    private static final String LANGUAGE_TAG = "java:";

    private static final int EXIT_USAGE = 1;

    private CiIdempotencyKey() {
    }

    /**
     * 要的性质只有一条：**同样的输入永远得到同样的 UUID**。
     *
     * <p>CI 的 retry 是新进程，「一次进程一个 UUID」在那里失效；算出来必须还是那一个，
     * 否则平台上会多出一份内容一模一样的执行记录。
     */
    public static String ciIdempotencyKey(String name) {
        return Idempotency.deriveBatchIdempotencyKey(LANGUAGE_TAG + name, DERIVE_INDEX);
    }

    public static void main(String[] args) {
        if (args.length != 1 || args[0].isBlank()) {
            System.err.println("用法：CiIdempotencyKey \"<CI 的 job-attempt 标识>\"");
            System.exit(EXIT_USAGE);
            return;
        }
        // 这个入口的全部输出就是那一行 key：它要能被 $(...) 直接吃掉，
        // 多打一个字（哪怕是「计算完成」）都会把它拼进环境变量里。
        System.out.println(ciIdempotencyKey(args[0].strip()));
    }
}
