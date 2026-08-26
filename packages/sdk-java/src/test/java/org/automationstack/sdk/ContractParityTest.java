package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/**
 * ⚠️ **契约副本的防漂测试。**
 *
 * <p>三家 SDK 各自带着一份 ingest 契约的副本（Java 没法 import 一个 TypeScript 的
 * zod schema，Python 也不行）。副本一定会漂，问题只是「漂了之后多久有人发现」——
 * 这个测试把「发现」提前到 {@code mvn test}：直接把 {@code sdk-node} 的
 * {@code .ts} 当文本读，逐个常量比。
 *
 * <p>它红了说明 Node 那边改了契约。**要改的是这个包的常量，不是这个测试。**
 */
class ContractParityTest {

    private static final Path NODE_SRC = Path.of("..", "sdk-node", "src");

    private static final Pattern CONSTANT =
            Pattern.compile("export const (\\w+) = ([^;]+);");

    private static Map<String, String> readConstants(String fileName) throws Exception {
        Path file = NODE_SRC.resolve(fileName);
        assertTrue(Files.exists(file),
                "读不到 " + file.toAbsolutePath() + "——这个包只在 monorepo 里构建，"
                        + "它的契约副本靠着比对 sdk-node 才不会漂");
        Map<String, String> constants = new LinkedHashMap<>();
        Matcher matcher = CONSTANT.matcher(Files.readString(file));
        while (matcher.find()) {
            constants.put(matcher.group(1), matcher.group(2).trim());
        }
        return constants;
    }

    private static int number(Map<String, String> constants, String name) {
        String raw = constants.get(name);
        assertTrue(raw != null, "sdk-node 里没有 " + name + " 了");
        // Node 那边写的是 20_000 这种带下划线的字面量。
        return Integer.parseInt(raw.replace("_", ""));
    }

    private static String text(Map<String, String> constants, String name) {
        String raw = constants.get(name);
        assertTrue(raw != null, "sdk-node 里没有 " + name + " 了");
        return raw.replace("\"", "").replace("'", "");
    }

    @Test
    void limitsMatchSdkNode() throws Exception {
        Map<String, String> node = readConstants("contract-limits.ts");
        assertEquals(number(node, "MAX_INGEST_RESULTS_PER_REQUEST"),
                ContractLimits.MAX_INGEST_RESULTS_PER_REQUEST);
        assertEquals(number(node, "MAX_INGEST_ATTACHMENTS_PER_REQUEST"),
                ContractLimits.MAX_INGEST_ATTACHMENTS_PER_REQUEST);
        assertEquals(number(node, "MAX_INGEST_MESSAGE_LENGTH"),
                ContractLimits.MAX_INGEST_MESSAGE_LENGTH);
        assertEquals(number(node, "MAX_INGEST_COMMENT_LENGTH"),
                ContractLimits.MAX_INGEST_COMMENT_LENGTH);
        assertEquals(number(node, "MAX_INGEST_SOURCE_REF_LENGTH"),
                ContractLimits.MAX_INGEST_SOURCE_REF_LENGTH);
        assertEquals(number(node, "RESULTS_PER_BATCH"), ContractLimits.RESULTS_PER_BATCH);
        assertEquals(number(node, "ATTACHMENTS_PER_BATCH"), ContractLimits.ATTACHMENTS_PER_BATCH);
    }

    @Test
    void routesMatchSdkNode() throws Exception {
        Map<String, String> node = readConstants("route-paths.ts");
        assertEquals(text(node, "INGEST_EXECUTIONS_ROUTE"), RoutePaths.INGEST_EXECUTIONS_ROUTE);
        assertEquals(text(node, "INGEST_ATTACHMENTS_PRESIGN_ROUTE"),
                RoutePaths.INGEST_ATTACHMENTS_PRESIGN_ROUTE);
        assertEquals(text(node, "INGEST_ATTACHMENTS_REGISTER_ROUTE"),
                RoutePaths.INGEST_ATTACHMENTS_REGISTER_ROUTE);
        assertEquals(text(node, "INGEST_RUNS_ROUTE"), RoutePaths.INGEST_RUNS_ROUTE);
    }

    @Test
    void batchSizesStayUnderTheServerCaps() {
        // 这几条不是抄来的，是必须自洽的：批大小超过单请求上限，第一批就是一条 400。
        assertTrue(ContractLimits.RESULTS_PER_BATCH <= ContractLimits.MAX_INGEST_RESULTS_PER_REQUEST);
        assertTrue(ContractLimits.ATTACHMENTS_PER_BATCH <= ContractLimits.MAX_INGEST_ATTACHMENTS_PER_REQUEST);
        assertTrue(ContractLimits.MAX_INGEST_COMMENT_LENGTH <= ContractLimits.MAX_INGEST_MESSAGE_LENGTH);
    }

    @Test
    void resultWireValuesMatchTheServerEnum() {
        // 服务端的 z.enum 认的是小写。Java 的枚举名是大写，转换只有一处。
        assertEquals("passed", AutomationCaseResult.PASSED.wire());
        assertEquals("failed", AutomationCaseResult.FAILED.wire());
        assertEquals("blocked", AutomationCaseResult.BLOCKED.wire());
        assertEquals("skipped", AutomationCaseResult.SKIPPED.wire());
        assertEquals("screenshot", AttachmentKind.SCREENSHOT.wire());
        assertEquals("video", AttachmentKind.VIDEO.wire());
        assertEquals("log", AttachmentKind.LOG.wire());
        assertEquals("other", AttachmentKind.OTHER.wire());
    }
}
