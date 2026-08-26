package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 附件三步：presign → 直传 → register（§5.6 / D28）。
 *
 * <p>**只用 HTTP 客户端，没有 S3 SDK**：预签名 URL 就是一次普通的 PUT，引一个 AWS SDK
 * 只会给用户的构建加几十兆并撞版本（§7.3 里 Java 那条理由说的就是这里）。
 *
 * <p>⚠️ **同一个本地文件会被传多次，这是有意的，不要去做去重**：object key 规则含
 * {@code {runId}/{runCaseId}}，一条 sourceRef 可能落在多个未提交任务里（D33），
 * presign 就会按解析出的 run_case 逐个返回 URL。省下这几份 object 的代价是给附件删除
 * 引入引用计数，那是一条以后一定会踩的坑（§5.6 那段）。所以这里严格按 {@code uploads}
 * 的条数上传——{@code index} 指回请求里的第几个附件。
 */
public final class AttachmentUpload {

    private AttachmentUpload() {
    }

    /**
     * ⚠️ **附件传不上去不能拖垮整次上报**（§5.6，与第二期 D9 同构）。
     * 所以这里对每一批各自兜住异常：结论那一轮早就写进去了，让一个连不上的 R2 把一次
     * 成功的上报判成失败是最没道理的失败方式。
     */
    public static AttachmentOutcome uploadAttachments(
            List<LoadedAttachment> attachments, IngestHttpClient client, ReporterConfig config) {
        AttachmentOutcome outcome = new AttachmentOutcome();
        for (List<LoadedAttachment> chunk : chunkAttachments(attachments)) {
            try {
                uploadChunk(chunk, client, config, outcome);
            } catch (RuntimeException error) {
                outcome.rejections().add("（本地）附件这一批整批失败：" + error);
            }
        }
        return outcome;
    }

    private static List<List<LoadedAttachment>> chunkAttachments(List<LoadedAttachment> items) {
        List<List<LoadedAttachment>> chunks = new ArrayList<>();
        for (int start = 0; start < items.size(); start += ContractLimits.ATTACHMENTS_PER_BATCH) {
            chunks.add(items.subList(
                    start, Math.min(start + ContractLimits.ATTACHMENTS_PER_BATCH, items.size())));
        }
        return chunks;
    }

    private static void uploadChunk(
            List<LoadedAttachment> chunk, IngestHttpClient client,
            ReporterConfig config, AttachmentOutcome outcome) {
        IngestAttachmentPresignReceipt presigned = IngestAttachmentPresignReceipt.fromWire(
                client.postJson(RoutePaths.INGEST_ATTACHMENTS_PRESIGN_ROUTE,
                        buildPresignBody(chunk, config)));
        outcome.degradeStorage(presigned.storageConfigured());
        for (IngestAttachmentRejection rejection : presigned.rejected()) {
            String target = rejection.runName() == null || rejection.runName().isEmpty()
                    ? ""
                    : " @《" + rejection.runName() + "》";
            // reason 原样，一个字不改（§7.2 第 4 条）。
            outcome.rejections().add(rejection.sourceRef() + target + "：" + rejection.reason());
        }
        List<IngestAttachmentRegisterItemWire> registerItems = new ArrayList<>();
        for (IngestAttachmentUpload upload : presigned.uploads()) {
            // 串行直传：几百个附件并发会把 QA 本机的上行打满，把本来省下的时间又赔进去。
            putOne(chunk, client, upload, registerItems, outcome);
        }
        outcome.addUploaded(registerItems.size());
        if (registerItems.isEmpty()) {
            return;
        }
        Map<String, Object> registerBody = new LinkedHashMap<>();
        registerBody.put("attachments",
                registerItems.stream().map(IngestAttachmentRegisterItemWire::toWire).toList());
        IngestAttachmentRegisterReceipt registered = IngestAttachmentRegisterReceipt.fromWire(
                client.postJson(RoutePaths.INGEST_ATTACHMENTS_REGISTER_ROUTE, registerBody));
        outcome.addRegistered(registered.registeredCount());
        for (IngestAttachmentRegisterRejection rejection : registered.rejected()) {
            outcome.rejections().add(rejection.storageKey() + "：" + rejection.reason());
        }
    }

    private static void putOne(
            List<LoadedAttachment> chunk, IngestHttpClient client, IngestAttachmentUpload upload,
            List<IngestAttachmentRegisterItemWire> registerItems, AttachmentOutcome outcome) {
        if (upload.index() < 0 || upload.index() >= chunk.size()) {
            // 服务端给回了一个不存在的下标。只可能是契约漂移，逐条记下来而不是抛——
            // 一个坏下标不该让其余几百个附件全丢。
            outcome.rejections().add(
                    upload.sourceRef() + "：presign 返回了越界的 index " + upload.index());
            return;
        }
        LoadedAttachment source = chunk.get(upload.index());
        try {
            client.putBinary(upload.uploadUrl(), upload.contentType(), source.body());
            registerItems.add(new IngestAttachmentRegisterItemWire(
                    source.fileName(), source.kind(), upload.runCaseId(),
                    upload.runId(), upload.storageKey()));
        } catch (RuntimeException error) {
            // 这一条是**本地**的失败，措辞上明确标出来：与服务端原样透传的拒绝理由
            // 混在一起时，人得能一眼分清该去查网络还是去查平台。
            outcome.rejections().add(upload.sourceRef() + " @《" + upload.runName()
                    + "》：（本地）直传失败 " + error);
        }
    }

    private static Map<String, Object> buildPresignBody(
            List<LoadedAttachment> chunk, ReporterConfig config) {
        List<Object> attachments = new ArrayList<>(chunk.size());
        for (LoadedAttachment item : chunk) {
            Map<String, Object> wire = new LinkedHashMap<>();
            wire.put("contentType", item.contentType());
            wire.put("kind", item.kind().wire());
            wire.put("sizeBytes", item.sizeBytes());
            wire.put("sourceRef", item.sourceRef());
            attachments.add(wire);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("attachments", attachments);
        body.put("projectId", config.projectId());
        // 与结论那一轮**必须传同一份**：少传一次，附件会挂到本轮结论压根没写过的任务上。
        body.put("runIds", config.runIds());
        return body;
    }
}
