import { getJiraConfig } from "@automationstack/db/repositories/jira-repository";
import { encryptSecret } from "@automationstack/db/secret-box";
import { env } from "@automationstack/env/server";

import { createJiraClient, type JiraClient } from "./client";
import {
	type JiraClientResolution,
	resolveJiraClientFromConfig,
} from "./resolve-client";

/**
 * **D9 的唯一入口。**
 *
 * 「未配置」= 该项目没有 `jira_configs` 行。绝大多数项目不会配 Jira，
 * 所以这条路径必须是**零成本、零异常**的：一次按唯一索引的单行查询，
 * 查不到就返回 null，调用方走降级分支（缺陷字段退化成纯文本 URL 输入）。
 *
 * ⚠️ **禁止把「未配置」做成异常当控制流。** 一旦这里抛异常，
 * 「没配 Jira 的项目打个失败结论」就会在某条调用链上炸出一个红色 toast，
 * 而那是本期的硬性验收点：未配置的项目全流程可用、无异常、无报错。
 */

/** 读配置并构造客户端，保留三态（配置页要区分「没配」和「解不开」）。 */
export async function resolveJiraClient(
	projectId: string
): Promise<JiraClientResolution> {
	const config = await getJiraConfig(projectId);
	return await resolveJiraClientFromConfig(config, env.SECRET_ENCRYPTION_KEY);
}

/**
 * 业务路径用的入口：**未配置返回 null，不抛异常**（D9）。
 *
 * 凭据解不开也一并返回 null——业务流程对这两者的处置完全一样（走降级分支，
 * 让人手填 URL），能修的只有管理员，而他会在配置页看到具体原因。
 */
export async function getJiraClient(
	projectId: string
): Promise<JiraClient | null> {
	const resolution = await resolveJiraClient(projectId);
	return resolution.kind === "ok" ? resolution.client : null;
}

/**
 * 表单里还没保存的值。`apiToken` 可空——用户改了 project key 想先测一下，
 * 不该被逼着把 Token 再打一遍（而且他多半也没留着那串东西）。
 */
export interface JiraFormCredentials {
	apiToken?: string;
	email: string;
	projectKey: string;
	siteUrl: string;
}

/**
 * 用「表单值优先、库里值兜底」的凭据构造客户端，供连通性自检用。
 *
 * 自检必须能测**还没保存的值**：填错了想先测再存是常态，让人「先存错的再测」
 * 等于逼他把一份坏配置写进库里。Token 留空时不去解密后再交给调用方，
 * 而是把表单里的其余字段覆盖到库里那行上再整体解析——明文 Token 因此
 * 始终不离开 `resolve-client.ts`。
 */
export async function resolveJiraClientForForm(
	projectId: string,
	form?: JiraFormCredentials
): Promise<JiraClientResolution> {
	if (form === undefined) {
		return await resolveJiraClient(projectId);
	}
	if (form.apiToken !== undefined && form.apiToken !== "") {
		return {
			client: createJiraClient({
				apiToken: form.apiToken,
				email: form.email,
				projectKey: form.projectKey,
				siteUrl: form.siteUrl,
			}),
			kind: "ok",
		};
	}
	const config = await getJiraConfig(projectId);
	if (config === null) {
		return { kind: "unconfigured" };
	}
	return await resolveJiraClientFromConfig(
		{
			...config,
			email: form.email,
			projectKey: form.projectKey,
			siteUrl: form.siteUrl,
		},
		env.SECRET_ENCRYPTION_KEY
	);
}

export type EncryptApiTokenResult =
	| { kind: "master-key-missing" }
	| { kind: "ok"; cipher: string };

/**
 * 明文 API Token 在整个代码库里只经过两个地方：这个函数（进库前加密）
 * 和 `resolve-client.ts` 的解密（出库后构造客户端）。写路径的调用方拿到的
 * 只有密文，因此不存在「明文顺着某个返回值漏出去」的路径。
 */
export async function encryptJiraApiToken(
	apiToken: string
): Promise<EncryptApiTokenResult> {
	const masterKey = env.SECRET_ENCRYPTION_KEY;
	if (!masterKey) {
		return { kind: "master-key-missing" };
	}
	const encrypted = await encryptSecret(apiToken, masterKey);
	if (encrypted.kind !== "ok") {
		return { kind: "master-key-missing" };
	}
	return { cipher: encrypted.box, kind: "ok" };
}

/** 主密钥是否就绪；配置页据此提示「未配主密钥，无法保存 API Token」。 */
export function isSecretStorageAvailable(): boolean {
	return env.SECRET_ENCRYPTION_KEY !== undefined;
}
