package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class AttachmentUpload {

    private AttachmentUpload() {
    }

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
            outcome.rejections().add(rejection.sourceRef() + target + "：" + rejection.reason());
        }
        List<IngestAttachmentRegisterItemWire> registerItems = new ArrayList<>();
        for (IngestAttachmentUpload upload : presigned.uploads()) {
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
        body.put("runIds", config.runIds());
        return body;
    }
}
