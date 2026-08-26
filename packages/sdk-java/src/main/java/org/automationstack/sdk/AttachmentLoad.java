package org.automationstack.sdk;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 把用户给的附件描述读成字节。**唯一碰文件系统的地方**——上传那一层只认
 * {@link LoadedAttachment}，这样它可以被完全不落盘地测试。
 */
public final class AttachmentLoad {

    private static final Map<AttachmentKind, String> KIND_FALLBACK_CONTENT_TYPE = Map.of(
            AttachmentKind.LOG, "text/plain",
            AttachmentKind.OTHER, "application/octet-stream",
            AttachmentKind.SCREENSHOT, "image/png",
            AttachmentKind.VIDEO, "video/mp4");

    /**
     * 只列真的会从测试框架里出来的那几种。猜不出来时**不猜**，回落到按 {@code kind}
     * 给的默认值——猜错的 contentType 会让附件在报告页上以「下载」而不是「预览」的
     * 方式出现，比 {@code application/octet-stream} 更迷惑人。
     */
    private static final Map<String, String> EXTENSION_CONTENT_TYPE = Map.ofEntries(
            Map.entry(".gif", "image/gif"),
            Map.entry(".jpeg", "image/jpeg"),
            Map.entry(".jpg", "image/jpeg"),
            Map.entry(".json", "application/json"),
            Map.entry(".log", "text/plain"),
            Map.entry(".mp4", "video/mp4"),
            Map.entry(".png", "image/png"),
            Map.entry(".txt", "text/plain"),
            Map.entry(".webm", "video/webm"),
            Map.entry(".zip", "application/zip"));

    private AttachmentLoad() {
    }

    /**
     * 入队时的同步校验。**只查「本地编程错误」这一种**：既没有 {@code body} 也没有
     * {@code filePath}，这在 presign 之后才发现就等于白跑半程。真正的读盘留到
     * {@code finish()}——附件在磁盘上待到最后一刻，一轮几百张截图不必整轮驻留内存。
     */
    public static void assertAttachmentInput(AttachmentInput input) {
        if (input.body() == null && (input.filePath() == null || input.filePath().isEmpty())) {
            throw new AttachmentInputError(
                    "附件 " + input.sourceRef() + "/" + input.kind().wire() + " 既没有 body 也没有 filePath");
        }
    }

    /**
     * {@code body} 优先于 {@code filePath}：截图和 trace 常常本来就在内存里，先落盘
     * 再读回来只是白做一次 IO。两个都没给是**编程错误**，在入队那一刻就抛。
     */
    public static LoadedAttachment loadAttachment(AttachmentInput input) throws IOException {
        assertAttachmentInput(input);
        byte[] body = input.body() != null ? input.body() : Files.readAllBytes(Path.of(input.filePath()));
        return new LoadedAttachment(
                body,
                resolveContentType(input),
                resolveFileName(input),
                input.kind(),
                body.length,
                input.sourceRef());
    }

    /** 读盘失败的那些，逐条留一句话——静默丢附件与静默丢结论一样糟。 */
    public record LoadedAttachments(List<String> failures, List<LoadedAttachment> loaded) {
    }

    /** 一个读不出来的文件不该让其余几百个附件跟着丢，所以逐个兜。 */
    public static LoadedAttachments loadAttachments(List<AttachmentInput> inputs) {
        List<String> failures = new ArrayList<>();
        List<LoadedAttachment> loaded = new ArrayList<>();
        for (AttachmentInput input : inputs) {
            try {
                loaded.add(loadAttachment(input));
            } catch (IOException | RuntimeException error) {
                failures.add(input.sourceRef() + "/" + input.kind().wire()
                        + "：（本地）读取失败 " + error);
            }
        }
        return new LoadedAttachments(failures, loaded);
    }

    private static String resolveContentType(AttachmentInput input) {
        if (input.contentType() != null && !input.contentType().isEmpty()) {
            return input.contentType();
        }
        String source = input.filePath() != null ? input.filePath() : input.fileName();
        if (source != null) {
            int dot = source.lastIndexOf('.');
            if (dot >= 0) {
                String byExtension = EXTENSION_CONTENT_TYPE.get(
                        source.substring(dot).toLowerCase(Locale.ROOT));
                if (byExtension != null) {
                    return byExtension;
                }
            }
        }
        return KIND_FALLBACK_CONTENT_TYPE.get(input.kind());
    }

    private static String resolveFileName(AttachmentInput input) {
        if (input.fileName() != null && !input.fileName().isEmpty()) {
            return input.fileName();
        }
        if (input.filePath() != null && !input.filePath().isEmpty()) {
            Path fileName = Path.of(input.filePath()).getFileName();
            return fileName == null ? input.kind().wire() : fileName.toString();
        }
        return input.kind().wire();
    }
}
