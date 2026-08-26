package org.automationstack.sdk;

import java.util.List;
import java.util.Map;

/**
 * {@link ReporterConfig#resolve} 的入参。全部可缺——缺的那些去环境变量里找。
 *
 * <p>Node 那边是一个可选字段的对象字面量，Python 那边是一堆关键字参数，Java 这边
 * 只能是个 builder。它是可变的、不做校验，校验全在 {@link ReporterConfig#resolve} 里
 * 一次做完：那样「缺了什么」只有一处答案。
 */
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

    /** 换掉环境变量的来源。测试里传一张假表，就不用去动真的 {@code System.getenv()}。 */
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

    /** 每次调用可以传的收窄白名单。null = 全部候选。 */
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
