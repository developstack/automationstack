package org.automationstack.sdk.junit5;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.automationstack.sdk.AutomationCaseResult;
import org.junit.jupiter.api.Test;

class ReportMappingTest {

    @Test
    void setupFailureIsBlockedNotFailed() {
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
        String text = ReportMapping.abortedText(
                new org.opentest4j.TestAbortedException("Assumption failed: 搜索索引未就绪"));
        assertEquals("Assumption failed: 搜索索引未就绪", text);
        assertTrue(!text.contains("at "), "跳过的说明里不该出现堆栈帧");
    }

    @Test
    void abortedTextStaysUnderTheCommentLimitSoNoLogAttachmentIsBurned() {
        String text = ReportMapping.abortedText(
                new org.opentest4j.TestAbortedException("搜索索引未就绪"));
        assertTrue(text.length() < org.automationstack.sdk.ContractLimits.MAX_INGEST_COMMENT_LENGTH,
                "assumption 的说明不该够得着 comment 上限");
    }

    @Test
    void abortedTextFallsBackWhenThereIsNoMessage() {
        assertEquals("org.opentest4j.TestAbortedException",
                ReportMapping.abortedText(new org.opentest4j.TestAbortedException()));
        assertNull(ReportMapping.abortedText(null));
    }

    @Test
    void failureTextDoesNotTruncate() {
        Throwable deep = new IllegalStateException("x".repeat(5000));
        assertTrue(ReportMapping.failureText(deep).length() > 5000);
    }
}
