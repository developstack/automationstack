package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class SourceScanTest {

    @Test
    void stripsLineAndBlockComments() {
        assertEquals("int a = 1; \n", SourceScan.stripComments("int a = 1; // 说明\n"));
        assertEquals("int a = 1;", SourceScan.stripComments("int /* 说明 */a = 1;"));
    }

    @Test
    void keepsStringLiteralsIntact() {
        assertEquals("String u = \"https://qa.example.com/x\";",
                SourceScan.stripComments("String u = \"https://qa.example.com/x\";"));
        assertEquals("String q = \"a\\\"//b\"; ",
                SourceScan.stripComments("String q = \"a\\\"//b\"; // 尾注释"));
    }

    @Test
    void stripsJavadocIncludingTheWordsThisSuiteSearchesFor() {
        String stripped = SourceScan.stripComments("/** 这里说 System.exit() 为什么不能调 */\nint a;");
        assertTrue(!stripped.contains("System.exit("));
        assertTrue(stripped.contains("int a;"));
    }
}
