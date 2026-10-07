package org.automationstack.sdk;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class AttachmentLoad {

    private static final Map<AttachmentKind, String> KIND_FALLBACK_CONTENT_TYPE = Map.of(
            AttachmentKind.LOG, "text/plain",
            AttachmentKind.OTHER, "application/octet-stream",
            AttachmentKind.SCREENSHOT, "image/png",
            AttachmentKind.VIDEO, "video/mp4");

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

    public static void assertAttachmentInput(AttachmentInput input) {
        if (input.body() == null && (input.filePath() == null || input.filePath().isEmpty())) {
            throw new AttachmentInputError(
                    "附件 " + input.sourceRef() + "/" + input.kind().wire() + " 既没有 body 也没有 filePath");
        }
    }

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

    public record LoadedAttachments(List<String> failures, List<LoadedAttachment> loaded) {
    }

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
