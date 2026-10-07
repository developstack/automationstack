import assert from "node:assert/strict";
import test from "node:test";

import {
	ReporterConfigError,
	resolveReporterConfig,
} from "@automationstack/sdk";

const BASE_ENV = {
	AS_BASE_URL: "https://qa.example.com",
	AS_PROJECT: "11111111-1111-1111-1111-111111111111",
	AS_TOKEN: "as_placeholder_not_a_real_token",
};

test("[AUTO-LOGIN-001] baseUrl 末尾的斜杠必须在配置解析时就削掉", () => {
	const config = resolveReporterConfig({
		env: { ...BASE_ENV, AS_BASE_URL: "https://qa.example.com///" },
	});
	assert.equal(config.baseUrl, "https://qa.example.com");

	const explicit = resolveReporterConfig({
		baseUrl: "https://other.example.com",
		env: BASE_ENV,
	});
	assert.equal(explicit.baseUrl, "https://other.example.com");

	assert.throws(
		() => resolveReporterConfig({ env: { ...BASE_ENV, AS_TOKEN: "   " } }),
		ReporterConfigError
	);
});

test("[AUTO-PAY-003] AS_IDEMPOTENCY_KEY 在 CI 重试时被复用", {
	skip: "「重试」按定义是**另一个进程**，同一个进程里断言不出这条性质；要证明它得起两次进程比对 execution id，那是 CI 的活",
}, () => {
	assert.fail("跳过的用例不会跑到这里");
});
