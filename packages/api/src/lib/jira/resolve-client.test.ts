import type { JiraConfig } from "@automationstack/db/schema/integrations";
import { encryptSecret } from "@automationstack/db/secret-box";
import { expect, test } from "vitest";

import { resolveJiraClientFromConfig } from "./resolve-client";

/** 32 字节，`decodeSecretKey` 的长度要求。 */
const MASTER_KEY = btoa("0123456789abcdef0123456789abcdef");
const OTHER_KEY = btoa("fedcba9876543210fedcba9876543210");

async function makeConfig(): Promise<JiraConfig> {
	const encrypted = await encryptSecret("super-secret-token", MASTER_KEY);
	if (encrypted.kind !== "ok") {
		throw new Error("测试前置条件失败：加密没成功");
	}
	return {
		apiTokenCipher: encrypted.box,
		createdAt: new Date(0),
		defaultIssueType: "缺陷",
		email: "qa@example.com",
		id: "11111111-1111-4111-8111-111111111111",
		projectId: "22222222-2222-4222-8222-222222222222",
		projectKey: "PAY",
		siteUrl: "https://acme.atlassian.net",
		updatedAt: new Date(0),
		updatedBy: null,
		webhookSecret: null,
	};
}

/**
 * D9 的硬性验收点：**未配置 = 没有 `jira_configs` 行**，此时必须安安静静地
 * 返回「未配置」，不抛异常、不发请求。绝大多数项目走的就是这条路径。
 */
test("没有配置行时返回 unconfigured，不抛异常", async () => {
	await expect(resolveJiraClientFromConfig(null, MASTER_KEY)).resolves.toEqual({
		kind: "unconfigured",
	});
});

test("没有配置行时，主密钥缺失也照样是 unconfigured", async () => {
	// 顺序很重要：先判「有没有配」再判「解不解得开」。反过来会让所有没配
	// Jira 的项目在没配主密钥的环境里被报成「凭据不可用」。
	await expect(resolveJiraClientFromConfig(null, undefined)).resolves.toEqual({
		kind: "unconfigured",
	});
});

test("配过但主密钥没配：credentials-unavailable，且与未配置区分得开", async () => {
	const resolution = await resolveJiraClientFromConfig(
		await makeConfig(),
		undefined
	);
	expect(resolution).toEqual({
		kind: "credentials-unavailable",
		reason: "master-key-missing",
	});
});

test("主密钥被换过：undecryptable，提示管理员重填而不是当成没配", async () => {
	const resolution = await resolveJiraClientFromConfig(
		await makeConfig(),
		OTHER_KEY
	);
	expect(resolution).toEqual({
		kind: "credentials-unavailable",
		reason: "undecryptable",
	});
});

test("密钥对得上时构造出客户端，并带上配置里的 project key 与 issue type", async () => {
	const resolution = await resolveJiraClientFromConfig(
		await makeConfig(),
		MASTER_KEY
	);
	if (resolution.kind !== "ok") {
		throw new Error(`期望 ok，实际 ${resolution.kind}`);
	}
	expect(resolution.client.projectKey).toBe("PAY");
	expect(resolution.client.defaultIssueType).toBe("缺陷");
	expect(resolution.client.issueUrl("PAY-1")).toBe(
		"https://acme.atlassian.net/browse/PAY-1"
	);
});
