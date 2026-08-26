package org.automationstack.sdk.junit5;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.automationstack.sdk.AutomationCaseResult;
import org.junit.jupiter.api.Test;

/** 薄壳里唯一有判断的那一处：JUnit 说的这件事对应哪个结论。 */
class ReportMappingTest {

    @Test
    void setupFailureIsBlockedNotFailed() {
        // 用例没跑起来，被测功能既没通过也没失败；报 failed 会让失败清单上多出
        // 一条查不动的假失败。
        assertEquals(AutomationCaseResult.BLOCKED, ReportMapping.failedResult(true));
        assertEquals(AutomationCaseResult.FAILED, ReportMapping.failedResult(false));
    }

    @Test
    void failureTextCarriesTheWholeStackTrace() {
        String text = ReportMapping.failureText(new IllegalStateException("boom"));
        assertTrue(text.contains("java.lang.IllegalStateException: boom"));
        assertTrue(text.contains("at "), "堆栈要带上，截断由核心包统一做");
    }

    @Test
    void failureTextIsNullWhenThereIsNoError() {
        assertNull(ReportMapping.failureText(null));
    }

    @Test
    void abortedTextKeepsOnlyTheAssumptionMessage() {
        // assumption 的堆栈永远只指向 assumeTrue 那一行 + 几十帧 JUnit 反射，
        // 被测代码一行都没跑过。人要的是「搜索索引未就绪」这句话本身。
        String text = ReportMapping.abortedText(
                new org.opentest4j.TestAbortedException("Assumption failed: 搜索索引未就绪"));
        assertEquals("Assumption failed: 搜索索引未就绪", text);
        assertTrue(!text.contains("at "), "跳过的说明里不该出现堆栈帧");
    }

    @Test
    void abortedTextStaysUnderTheCommentLimitSoNoLogAttachmentIsBurned() {
        // 这条是回归测试：改回 failureText 会让每一条 assumption skip 都多传一个 log 附件，
        // 而附件按任务计配额（500 条/任务）。断言的是「一句话」，不是「短一点」。
        String text = ReportMapping.abortedText(
                new org.opentest4j.TestAbortedException("搜索索引未就绪"));
        assertTrue(text.length() < org.automationstack.sdk.ContractLimits.MAX_INGEST_COMMENT_LENGTH,
                "assumption 的说明不该够得着 comment 上限");
    }

    @Test
    void abortedTextFallsBackWhenThereIsNoMessage() {
        // 没写理由的 assumeTrue(false)：宁可给一句类名，也不要一个空字符串——
        // 空字符串在对账单上和「没给理由」长得一样，但后者是 null，两件事要分得开。
        assertEquals("org.opentest4j.TestAbortedException",
                ReportMapping.abortedText(new org.opentest4j.TestAbortedException()));
        assertNull(ReportMapping.abortedText(null));
    }

    @Test
    void failureTextDoesNotTruncate() {
        // 截两次意味着上限有两处定义，而 MAX_INGEST_COMMENT_LENGTH 只该有一处。
        Throwable deep = new IllegalStateException("x".repeat(5000));
        assertTrue(ReportMapping.failureText(deep).length() > 5000);
    }
}
