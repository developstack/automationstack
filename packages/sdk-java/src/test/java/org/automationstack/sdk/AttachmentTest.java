package org.automationstack.sdk;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 附件三步：presign → 直传 → register（§5.6 / D28）。传不上去不能拖垮整次上报。 */
class AttachmentTest {

    private static IngestHttpClient client(TestFixtures.RecordingTransport transport) {
        return new IngestHttpClient(TestFixtures.BASE_URL, TestFixtures.TOKEN, transport,
                1, Duration.ofSeconds(1), millis -> { });
    }

    private static String presignJson(int uploads, boolean storageConfigured, List<Object> rejected) {
        List<Object> items = new java.util.ArrayList<>();
        for (int index = 0; index < uploads; index++) {
            Map<String, Object> upload = new LinkedHashMap<>();
            upload.put("contentType", "image/png");
            upload.put("index", index);
            upload.put("runCaseId", "rc-" + index);
            upload.put("runId", "r1");
            upload.put("runName", "冒烟");
            upload.put("sourceRef", "PAY-" + index);
            upload.put("storageKey", "proj/r1/rc-" + index + "/shot.png");
            upload.put("uploadUrl", "https://r2.example.com/put/" + index);
            items.add(upload);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("expiresInSeconds", 900);
        body.put("rejected", rejected);
        body.put("storageConfigured", storageConfigured);
        body.put("uploads", items);
        return Json.encode(body);
    }

    private static String registerJson(int registered, List<Object> rejected) {
        List<Object> ok = new java.util.ArrayList<>();
        for (int index = 0; index < registered; index++) {
            ok.add(Map.of("storageKey", "k" + index));
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("registered", ok);
        body.put("rejected", rejected);
        body.put("storageConfigured", true);
        return Json.encode(body);
    }

    private static LoadedAttachment loaded(String sourceRef) {
        return new LoadedAttachment(
                new byte[] {1, 2, 3}, "image/png", "shot.png", AttachmentKind.SCREENSHOT, 3, sourceRef);
    }

    @Test
    void rejectsAttachmentWithNeitherBodyNorFile() {
        // 本地编程错误，在入队那一刻就抛——presign 之后才发现等于白跑半程。
        AttachmentInput input = AttachmentInput.builder("PAY-1", AttachmentKind.LOG).build();
        AttachmentInputError error =
                assertThrows(AttachmentInputError.class, () -> AttachmentLoad.assertAttachmentInput(input));
        assertTrue(error.getMessage().contains("PAY-1"));
    }

    @Test
    void inferesContentTypeFromExtensionThenFallsBackToKind() throws IOException {
        LoadedAttachment fromPath = AttachmentLoad.loadAttachment(
                AttachmentInput.builder("PAY-1", AttachmentKind.OTHER)
                        .body(new byte[] {1}).fileName("trace.zip").build());
        assertEquals("application/zip", fromPath.contentType());
        // 猜不出来时不猜，按 kind 回落。
        assertEquals("text/plain", AttachmentLoad.loadAttachment(
                AttachmentInput.ofBytes("PAY-1", AttachmentKind.LOG, new byte[] {1})).contentType());
        assertEquals("log", AttachmentLoad.loadAttachment(
                AttachmentInput.ofBytes("PAY-1", AttachmentKind.LOG, new byte[] {1})).fileName());
    }

    @Test
    void readsFromDiskAndKeepsOneBadFileFromLosingTheRest(@TempDir Path dir) throws IOException {
        Path real = dir.resolve("shot.png");
        Files.write(real, new byte[] {9, 9});
        AttachmentLoad.LoadedAttachments outcome = AttachmentLoad.loadAttachments(List.of(
                AttachmentInput.ofFile("PAY-1", AttachmentKind.SCREENSHOT, real.toString()),
                AttachmentInput.ofFile("PAY-2", AttachmentKind.SCREENSHOT,
                        dir.resolve("missing.png").toString())));
        assertEquals(1, outcome.loaded().size());
        assertEquals(2, outcome.loaded().get(0).sizeBytes());
        assertEquals("shot.png", outcome.loaded().get(0).fileName());
        assertEquals(1, outcome.failures().size());
        assertTrue(outcome.failures().get(0).contains("（本地）读取失败"));
    }

    @Test
    void runsThePresignUploadRegisterSequence() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(presignJson(2, true, List.of()))
                .queue(TestFixtures.json(200, ""))
                .queue(TestFixtures.json(200, ""))
                .queueJson(registerJson(2, List.of()));
        AttachmentOutcome outcome = AttachmentUpload.uploadAttachments(
                List.of(loaded("PAY-0"), loaded("PAY-1")), client(transport), TestFixtures.baseConfig());
        assertEquals(4, transport.requests.size());
        assertEquals("https://qa.example.com/ingest/attachments/presign", transport.requests.get(0).url());
        assertEquals("https://r2.example.com/put/0", transport.requests.get(1).url());
        assertEquals("https://qa.example.com/ingest/attachments/register", transport.requests.get(3).url());
        assertEquals(2, outcome.uploaded());
        assertEquals(2, outcome.registered());
        assertTrue(outcome.rejections().isEmpty());
    }

    @Test
    void presignBodyCarriesTheSameRunIdsAsTheResultsRound() {
        // 少传一次，附件会挂到本轮结论压根没写过的任务上。
        ReporterConfig config = new ReporterConfig(TestFixtures.BASE_URL, null, null, null,
                TestFixtures.RUN_KEY, false, TestFixtures.PROJECT_ID, List.of("run-1"), TestFixtures.TOKEN);
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(presignJson(0, true, List.of()));
        AttachmentUpload.uploadAttachments(List.of(loaded("PAY-0")), client(transport), config);
        String body = transport.bodyOf(0);
        assertTrue(body.contains("\"runIds\":[\"run-1\"]"), body);
        assertTrue(body.contains("\"projectId\":\"" + TestFixtures.PROJECT_ID + "\""), body);
        assertTrue(body.contains("\"sizeBytes\":3"), body);
    }

    @Test
    void uploadsTheSameFileOncePerResolvedRunCase() {
        // ⚠️ 有意不去重：一条 sourceRef 可能落在多个未提交任务里（D33），
        // 省下这几份 object 的代价是给附件删除引入引用计数。
        String presign = presignJson(2, true, List.of()).replace("\"PAY-1\"", "\"PAY-0\"");
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(presign)
                .queue(TestFixtures.json(200, ""))
                .queue(TestFixtures.json(200, ""))
                .queueJson(registerJson(2, List.of()));
        AttachmentOutcome outcome = AttachmentUpload.uploadAttachments(
                List.of(loaded("PAY-0"), loaded("PAY-0")), client(transport), TestFixtures.baseConfig());
        assertEquals(2, outcome.uploaded());
    }

    @Test
    void passesPresignRejectionsThroughVerbatim() {
        Map<String, Object> rejection = new LinkedHashMap<>();
        rejection.put("index", 0);
        rejection.put("reason", "本任务附件配额已用完");
        rejection.put("runName", "冒烟");
        rejection.put("sourceRef", "PAY-0");
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(presignJson(0, true, List.of(rejection)));
        AttachmentOutcome outcome = AttachmentUpload.uploadAttachments(
                List.of(loaded("PAY-0")), client(transport), TestFixtures.baseConfig());
        assertEquals(List.of("PAY-0 @《冒烟》：本任务附件配额已用完"), outcome.rejections());
        assertEquals(0, outcome.uploaded());
    }

    @Test
    void degradesWhenStorageIsNotConfigured() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(presignJson(0, false, List.of()));
        AttachmentOutcome outcome = AttachmentUpload.uploadAttachments(
                List.of(loaded("PAY-0")), client(transport), TestFixtures.baseConfig());
        assertFalse(outcome.storageConfigured());
    }

    @Test
    void oneFailedPutDoesNotLoseTheOthers() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(presignJson(2, true, List.of()))
                .queueFailure(new IOException("connection reset"))
                .queue(TestFixtures.json(200, ""))
                .queueJson(registerJson(1, List.of()));
        AttachmentOutcome outcome = AttachmentUpload.uploadAttachments(
                List.of(loaded("PAY-0"), loaded("PAY-1")), client(transport), TestFixtures.baseConfig());
        assertEquals(1, outcome.uploaded());
        assertEquals(1, outcome.registered());
        // 措辞上标出这是本地失败：人得能一眼分清该去查网络还是去查平台。
        assertTrue(outcome.rejections().get(0).contains("（本地）直传失败"));
    }

    @Test
    void wholeBatchFailureIsContainedAndNeverThrows() {
        // 结论那一轮早就写进去了；让一个连不上的 R2 把一次成功的上报判成失败
        // 是最没道理的失败方式（§5.6，同第二期 D9）。
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queue(TestFixtures.json(500, "storage down"));
        AttachmentOutcome outcome = AttachmentUpload.uploadAttachments(
                List.of(loaded("PAY-0")), client(transport), TestFixtures.baseConfig());
        assertEquals(1, outcome.rejections().size());
        assertTrue(outcome.rejections().get(0).contains("整批失败"));
    }

    @Test
    void skipsRegisterWhenNothingWasUploaded() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(presignJson(0, true, List.of()));
        AttachmentUpload.uploadAttachments(
                List.of(loaded("PAY-0")), client(transport), TestFixtures.baseConfig());
        assertEquals(1, transport.requests.size(), "没有东西要登记时不该多发一次请求");
    }

    @Test
    void putBodyIsTheAttachmentBytes() {
        TestFixtures.RecordingTransport transport = new TestFixtures.RecordingTransport()
                .queueJson(presignJson(1, true, List.of()))
                .queue(TestFixtures.json(200, ""))
                .queueJson(registerJson(1, List.of()));
        AttachmentUpload.uploadAttachments(
                List.of(new LoadedAttachment("日志".getBytes(StandardCharsets.UTF_8),
                        "text/plain", "run.log", AttachmentKind.LOG, 6, "PAY-0")),
                client(transport), TestFixtures.baseConfig());
        assertEquals("日志", new String(transport.requests.get(1).body(), StandardCharsets.UTF_8));
    }
}
