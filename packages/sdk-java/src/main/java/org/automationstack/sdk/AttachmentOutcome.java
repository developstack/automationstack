package org.automationstack.sdk;

import java.util.ArrayList;
import java.util.List;

public final class AttachmentOutcome {

    private int registered;
    private int uploaded;
    private boolean storageConfigured = true;
    private final List<String> rejections = new ArrayList<>();

    public int registered() {
        return registered;
    }

    public int uploaded() {
        return uploaded;
    }

    public boolean storageConfigured() {
        return storageConfigured;
    }

    public List<String> rejections() {
        return rejections;
    }

    void addRegistered(int count) {
        registered += count;
    }

    void addUploaded(int count) {
        uploaded += count;
    }

    void degradeStorage(boolean configured) {
        storageConfigured = storageConfigured && configured;
    }

    void prependRejections(List<String> lines) {
        rejections.addAll(0, lines);
    }
}
