/**
 * 被测对象：`@automationstack/sdk` 的**配置解析**与**幂等键来源**。
 *
 * 这里没有假的被测系统，也没有 `assert.equal("耳机", "耳机")` 那种重言式：
 * 每条断言都指着 `packages/sdk-node/src/` 里一段真代码，改坏它这里就红。
 *
 * ⚠️ 标题里方括号包着的是 `sourceRef`，它必须与平台上用例的 sourceRef 逐字相同
 * （种子数据在 `scripts/seed-automation-demo-cases.ts`）。归属只认它（§3.7）：
 * 没有任何办法在代码里指定「写进哪个测试任务」。
 * 方括号**外面**那半句只是给人看的，与平台上的用例名不必一致。
 *
 * ⚠️ **这个文件里没有一行提到上报。** 没有 reporter、没有 finish()、没有 hook。
 * 结果是怎么到平台上的，见 `adapters/node-test-reporter.ts`——那是 node:test
 * 自己的 `--test-reporter` 扩展位，与这个文件互不知道对方存在。
 */

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
	// 不削的话拼出来是 `https://qa.example.com//ingest/executions`，
	// 有的反代会把它 301 到别处，而 301 之后 Authorization 头按规范可以被丢掉——
	// 表现就是一个莫名其妙的 401。这条断言守的是那个 401 不会再出现。
	assert.equal(config.baseUrl, "https://qa.example.com");

	// 显式参数压过环境变量：两者都在时以代码里写的为准，
	// 否则同一份配置在本机和 CI 上表现不同，那是最难查的一类问题。
	const explicit = resolveReporterConfig({
		baseUrl: "https://other.example.com",
		env: BASE_ENV,
	});
	assert.equal(explicit.baseUrl, "https://other.example.com");

	// 缺 token 必须在**跑测试之前**炸，而不是跑完二十分钟才发现结果无处可去。
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
