import { describe, expect, it } from "vitest";

import { ReporterConfigError, resolveReporterConfig } from "./config.js";

const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const MISSING_PROJECT_PATTERN = /AS_PROJECT/;
const MISSING_BASE_URL_PATTERN = /AS_BASE_URL/;
const MISSING_TOKEN_PATTERN = /AS_TOKEN/;
const BASE_ENV = {
	AS_BASE_URL: "https://qa.example.com",
	AS_PROJECT: PROJECT_ID,
	AS_TOKEN: "as_secret",
};

describe("SDK 配置（§5.1 / D31）", () => {
	it("只从 token + projectId + baseUrl 三样起步", () => {
		const config = resolveReporterConfig({ env: BASE_ENV });
		expect(config.token).toBe("as_secret");
		expect(config.projectId).toBe(PROJECT_ID);
		expect(config.baseUrl).toBe("https://qa.example.com");
		expect(config.runIds).toBeNull();
	});

	it("配置类型上压根没有单数 runId 这个口子", () => {
		const config = resolveReporterConfig({ env: BASE_ENV });
		expect(Object.keys(config)).not.toContain("runId");
	});

	it("削掉 baseUrl 末尾斜杠，避免 // 被反代 301 掉 Authorization", () => {
		const config = resolveReporterConfig({
			env: { ...BASE_ENV, AS_BASE_URL: "https://qa.example.com///" },
		});
		expect(config.baseUrl).toBe("https://qa.example.com");
	});

	it("显式参数压过环境变量，本机与 CI 才不会表现不同", () => {
		const config = resolveReporterConfig({
			env: BASE_ENV,
			token: "explicit",
		});
		expect(config.token).toBe("explicit");
	});

	it("缺 token / projectId / baseUrl 时在跑测试之前就炸", () => {
		expect(() => resolveReporterConfig({ env: {} })).toThrow(
			ReporterConfigError
		);
		const { AS_PROJECT: _project, ...withoutProject } = BASE_ENV;
		expect(() => resolveReporterConfig({ env: withoutProject })).toThrow(
			MISSING_PROJECT_PATTERN
		);
		const { AS_BASE_URL: _baseUrl, ...withoutBaseUrl } = BASE_ENV;
		expect(() => resolveReporterConfig({ env: withoutBaseUrl })).toThrow(
			MISSING_BASE_URL_PATTERN
		);
		const { AS_TOKEN: _token, ...withoutToken } = BASE_ENV;
		expect(() => resolveReporterConfig({ env: withoutToken })).toThrow(
			MISSING_TOKEN_PATTERN
		);
	});

	it("空白字符串等同于没配", () => {
		expect(() =>
			resolveReporterConfig({ env: { ...BASE_ENV, AS_TOKEN: "   " } })
		).toThrow(MISSING_TOKEN_PATTERN);
	});
});
