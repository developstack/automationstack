package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

public class ReporterConfigInput {

    private String baseUrl;
    private String branch;
    private String ciUrl;
    private String commitSha;
    private Map<String, String> env;
    private String idempotencyKey;
    private boolean overwriteManual;
    private String projectId;
    private List<String> runIds;
    private String token;

    public ReporterConfigInput baseUrl(String value) {
        this.baseUrl = value;
        return this;
    }

    public ReporterConfigInput branch(String value) {
        this.branch = value;
        return this;
    }

    public ReporterConfigInput ciUrl(String value) {
        this.ciUrl = value;
        return this;
    }

    public ReporterConfigInput commitSha(String value) {
        this.commitSha = value;
        return this;
    }

    public ReporterConfigInput env(Map<String, String> value) {
        this.env = value;
        return this;
    }

    public ReporterConfigInput idempotencyKey(String value) {
        this.idempotencyKey = value;
        return this;
    }

    public ReporterConfigInput overwriteManual(boolean value) {
        this.overwriteManual = value;
        return this;
    }

    public ReporterConfigInput projectId(String value) {
        this.projectId = value;
        return this;
    }

    public ReporterConfigInput runIds(List<String> value) {
        this.runIds = value;
        return this;
    }

    public ReporterConfigInput token(String value) {
        this.token = value;
        return this;
    }

    public String baseUrl() {
        return baseUrl;
    }

    public String branch() {
        return branch;
    }

    public String ciUrl() {
        return ciUrl;
    }

    public String commitSha() {
        return commitSha;
    }

    public Map<String, String> env() {
        return env;
    }

    public String idempotencyKey() {
        return idempotencyKey;
    }

    public boolean overwriteManual() {
        return overwriteManual;
    }

    public String projectId() {
        return projectId;
    }

    public List<String> runIds() {
        return runIds;
    }

    public String token() {
        return token;
    }
}
