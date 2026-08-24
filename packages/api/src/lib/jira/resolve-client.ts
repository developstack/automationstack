import type { JiraConfig } from "@automationstack/db/schema/integrations";
import { decryptSecret } from "@automationstack/db/secret-box";

import { createJiraClient, type JiraClient } from "./client";

/**
 * 「一行配置 → 一个客户端」的纯函数部分。
 *
 * 与 `get-client.ts` 分开是为了让它**不 import 数据库客户端也不 import env**：
 * `@automationstack/db` 的入口在模块加载时就会 `createDb()`，`env/server` 在
 * 加载时就会校验全套环境变量。任何一个被 import 进来，本文件的单测就得先
 * 拉起一整套环境——而这里要覆盖的恰恰是「未配置 / 主密钥缺失 / 密文解不开」
 * 这三条最不容易手动复现、又最不能出错的降级路径（D9）。
 */

/**
 * 解析结果。`unconfigured` 与 `credentials-unavailable` 必须分开：
 * 前者是绝大多数项目的**正常状态**，界面上什么都不该提示；
 * 后者是「配过但现在解不开」，要让管理员去重填 Token——
 * 静默当成未配置会让人以为自己的配置丢了。
 */
export type JiraClientResolution =
	| { kind: "credentials-unavailable"; reason: JiraCredentialProblem }
	| { kind: "ok"; client: JiraClient }
	| { kind: "unconfigured" };

/**
 * - `master-key-missing`：`SECRET_ENCRYPTION_KEY` 没配或不是 32 字节 —— 运维补
 *   环境变量即可，数据没坏；
 * - `undecryptable`：密钥在，但 AES-GCM 认证失败 —— **主密钥被换过了**，
 *   旧密文找不回来，只能让管理员重填一次 API Token。
 */
export type JiraCredentialProblem = "master-key-missing" | "undecryptable";

export async function resolveJiraClientFromConfig(
	config: JiraConfig | null,
	masterKey: string | undefined
): Promise<JiraClientResolution> {
	if (config === null) {
		return { kind: "unconfigured" };
	}
	if (!masterKey) {
		return { kind: "credentials-unavailable", reason: "master-key-missing" };
	}
	const decrypted = await decryptSecret(config.apiTokenCipher, masterKey);
	if (decrypted.kind === "invalid-key") {
		return { kind: "credentials-unavailable", reason: "master-key-missing" };
	}
	if (decrypted.kind !== "ok") {
		return { kind: "credentials-unavailable", reason: "undecryptable" };
	}
	return {
		client: createJiraClient({
			apiToken: decrypted.value,
			defaultIssueType: config.defaultIssueType,
			email: config.email,
			projectKey: config.projectKey,
			siteUrl: config.siteUrl,
		}),
		kind: "ok",
	};
}
