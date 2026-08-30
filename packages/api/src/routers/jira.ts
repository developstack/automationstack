import {
	getJiraConfig,
	removeJiraConfig,
	upsertJiraConfig,
} from "@automationstack/db/repositories/jira-repository";
import { getUserById } from "@automationstack/db/repositories/users-repository";
import type { JiraConfig } from "@automationstack/db/schema/integrations";
import { env } from "@automationstack/env/server";
import { z } from "zod";

import { protectedProcedure, requireProjectMember } from "../index";
import { describeJiraFailure } from "../lib/jira/failure";
import {
	encryptJiraApiToken,
	isSecretStorageAvailable,
	resolveJiraClientForForm,
} from "../lib/jira/get-client";
import {
	type JiraClientResolution,
	type JiraCredentialProblem,
	resolveJiraClientFromConfig,
} from "../lib/jira/resolve-client";
import { jiraWebhookPath } from "../lib/jira/webhook";
import { canAdministerProject } from "../lib/project-access";
import { formCredentialsSchema, upsertConfigSchema } from "../schemas/jira";
import { jiraDefectProcedures } from "./jira-defects";

/**
 * Jira 集成的配置管理接口（D7 / D9），以及 `jiraRouter` 的组装点。
 *
 * 缺陷联动那四个接口在 `./jira-defects.ts`，在下面被展开进同一个 router：
 * 拆分只发生在源码层面，`client.jira.*` 的调用路径一个都没变。
 *
 * 安全底线：**API Token 无论明文还是密文都不
 * 出现在任何返回值里**。为此 `JiraConfigView` 是独立声明的接口、逐字段手工
 * 构造——刻意不用 `Omit<JiraConfig, "apiTokenCipher">` 再 spread：后者在给表加
 * 新的敏感列时会静默地把它带出去，独立接口则会在编译期少一个字段就报错。
 *
 * 项目级授权分两档：`getConfig` 是**成员**可读（执行台的缺陷面板要靠它判断
 * 「这个项目能不能建 Jira Issue」，见 `run-defect-panel.tsx`；它本来也只下发
 * 站点地址、项目 key 这类非机密字段）。其余三个动的是项目配置本身，与
 * `projects.update` 同档，额外要求 owner——凭据一旦被改，整个项目的 Jira 写入
 * 都跟着换了身份，这不是「项目内的日常读写」。
 */

const projectIdSchema = z.object({ projectId: z.uuid() });

/** 改配置那三个过程共用的错误档：`requireProjectMember` 之后还要再判一次 owner。 */
const ownerOnlyErrors = { FORBIDDEN: {} } as const;

const NOT_PROJECT_OWNER_MESSAGE = "只有项目 owner 能改 Jira 配置";

/** 可以安全下发到前端的配置字段：**没有任何 Token / 密钥内容**。 */
export interface JiraConfigView {
	defaultIssueType: string;
	email: string;
	/**
	 * 是否已存有 API Token。只有布尔，绝不下发内容、也不下发长度。
	 * 列是 notNull，所以有行必为 true——保留这个字段是为了前端不必知道这个内幕，
	 * 将来 Token 若能被清空，前端不用改。
	 */
	hasApiToken: boolean;
	/** 是否配了 webhook 密钥（= 状态同步是否开着）。同样不下发内容。 */
	hasWebhookSecret: boolean;
	projectKey: string;
	siteUrl: string;
	updatedAt: Date;
	updatedByUsername: string | null;
	/**
	 * 该项目的 webhook 路径，管理员要把它拼上本服务的公网地址填进 Jira。
	 * 这里只给路径不给完整 URL：服务端只知道 `CORS_ORIGIN`（前端地址），
	 * 不知道自己被反代到了哪个域名，拼出来的完整 URL 多半是错的。
	 */
	webhookPath: string;
}

export interface JiraConfigState {
	config: JiraConfigView | null;
	/**
	 * 配了但现在解不开的原因；null = 没问题（含「压根没配」）。
	 * 与 `config === null` 分开，是因为「没配」是绝大多数项目的正常状态，
	 * 而「解不开」要管理员去重填 Token——静默混为一谈会让人以为配置丢了。
	 */
	credentialProblem: JiraCredentialProblem | null;
	/** 主密钥是否就绪；false 时保存 API Token 会被拒。 */
	secretStorageAvailable: boolean;
}

export type JiraConnectionTestResult =
	| { kind: "credentials-unavailable"; reason: JiraCredentialProblem }
	| {
			kind: "failed";
			message: string;
	  }
	| {
			kind: "ok";
			accountDisplayName: string | null;
			projectName: string | null;
	  }
	| { kind: "unconfigured" };

async function resolveUpdatedByUsername(
	updatedBy: string | null
): Promise<string | null> {
	if (updatedBy === null) {
		return null;
	}
	const user = await getUserById(updatedBy);
	return user?.username ?? null;
}

async function toView(row: JiraConfig): Promise<JiraConfigView> {
	return {
		defaultIssueType: row.defaultIssueType,
		email: row.email,
		// 空串当「从未设置」的哨兵——这个约定成立的前提在**写入口**：
		// `../schemas/jira.ts` 的 `apiTokenSchema` 是 `.min(1)`，空 token 进不来，库里的密文
		// 要么是真 token 的密文，要么就是空串。注意 `encryptSecret("")` 本身
		// 会产出**非空**密文（secret-box.test.ts 有该用例），一旦哪天放宽了
		// zod 校验允许空 token，这里就会把「设了个空 token」误判成 true。
		// 要放宽校验的人：先改这里的判定，或者干脆在 schema 层继续挡住。
		hasApiToken: row.apiTokenCipher !== "",
		hasWebhookSecret: row.webhookSecret !== null,
		projectKey: row.projectKey,
		siteUrl: row.siteUrl,
		updatedAt: row.updatedAt,
		updatedByUsername: await resolveUpdatedByUsername(row.updatedBy),
		webhookPath: jiraWebhookPath(row.projectId),
	};
}

function testResultFromResolution(
	resolution: JiraClientResolution
): Exclude<JiraConnectionTestResult, { kind: "failed" | "ok" }> | null {
	if (resolution.kind === "unconfigured") {
		return { kind: "unconfigured" };
	}
	if (resolution.kind === "credentials-unavailable") {
		return { kind: "credentials-unavailable", reason: resolution.reason };
	}
	return null;
}

export const jiraRouter = {
	...jiraDefectProcedures,

	/** 读取项目的 Jira 配置状态。未配置时 `config` 为 null，这是正常状态。 */
	getConfig: protectedProcedure
		.input(projectIdSchema)
		.use(requireProjectMember)
		.handler(async ({ input }): Promise<JiraConfigState> => {
			const row = await getJiraConfig(input.projectId);
			// 顺手解一次密：配置页正是该发现「主密钥被换过、Token 已解不开」的地方，
			// 否则这个故障要等到某人点「创建 Jira Issue」才暴露。
			const resolution = await resolveJiraClientFromConfig(
				row,
				env.SECRET_ENCRYPTION_KEY
			);
			return {
				config: row === null ? null : await toView(row),
				credentialProblem:
					resolution.kind === "credentials-unavailable"
						? resolution.reason
						: null,
				secretStorageAvailable: isSecretStorageAvailable(),
			};
		}),

	/** 断开接入 = 删掉那一行；之后所有 Jira 能力自动降级（D9）。 */
	removeConfig: protectedProcedure
		.errors(ownerOnlyErrors)
		.input(projectIdSchema)
		.use(requireProjectMember)
		.handler(async ({ context, errors, input }) => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: NOT_PROJECT_OWNER_MESSAGE });
			}
			return { removed: await removeJiraConfig(input.projectId) };
		}),

	/**
	 * 连通性自检。**返回类型化结果而不是抛异常**——「测不通」正是这个接口
	 * 的预期输出之一，用异常表达会让前端拿不到分类。
	 *
	 * `credentials` 省略时用库里存的配置测；传入时用表单里还没保存的值测
	 * （其中 `apiToken` 仍可省略，表示沿用库里那份）。
	 */
	testConnection: protectedProcedure
		.errors(ownerOnlyErrors)
		.input(
			z.object({
				credentials: formCredentialsSchema.optional(),
				projectId: z.uuid(),
			})
		)
		.use(requireProjectMember)
		.handler(
			async ({ context, errors, input }): Promise<JiraConnectionTestResult> => {
				// 它收的是**表单里还没保存的凭据**，等于一个拿本项目当跳板的探测器：
				// 谁能测，就该是谁能改。所以和 upsertConfig 同档，不是成员可用。
				if (!canAdministerProject(context.projectAccess)) {
					throw errors.FORBIDDEN({ message: NOT_PROJECT_OWNER_MESSAGE });
				}
				const resolution = await resolveJiraClientForForm(
					input.projectId,
					input.credentials
				);
				const unavailable = testResultFromResolution(resolution);
				if (unavailable !== null) {
					return unavailable;
				}
				if (resolution.kind !== "ok") {
					return { kind: "unconfigured" };
				}
				const verified = await resolution.client.verifyConnection();
				if (!verified.ok) {
					return {
						kind: "failed",
						message: describeJiraFailure(verified.failure),
					};
				}
				return {
					accountDisplayName: verified.value.accountDisplayName,
					kind: "ok",
					projectName: verified.value.projectName,
				};
			}
		),

	/** 保存配置。`apiToken` 留空 = 保持库里那份不动。 */
	upsertConfig: protectedProcedure
		.errors({ BAD_REQUEST: {}, FORBIDDEN: {}, PRECONDITION_FAILED: {} })
		.input(upsertConfigSchema)
		.use(requireProjectMember)
		.handler(async ({ context, errors, input }): Promise<JiraConfigView> => {
			if (!canAdministerProject(context.projectAccess)) {
				throw errors.FORBIDDEN({ message: NOT_PROJECT_OWNER_MESSAGE });
			}
			let apiTokenCipher: string | undefined;
			if (input.apiToken !== undefined) {
				const encrypted = await encryptJiraApiToken(input.apiToken);
				if (encrypted.kind !== "ok") {
					throw errors.PRECONDITION_FAILED({
						message:
							"未配置 SECRET_ENCRYPTION_KEY，无法加密保存 API Token（openssl rand -base64 32）",
					});
				}
				apiTokenCipher = encrypted.cipher;
			}
			const result = await upsertJiraConfig({
				apiTokenCipher,
				defaultIssueType: input.defaultIssueType,
				email: input.email,
				projectId: input.projectId,
				projectKey: input.projectKey,
				siteUrl: input.siteUrl,
				updatedBy: context.user.id,
				webhookSecret: input.webhookSecret,
			});
			if (result.kind !== "ok") {
				throw errors.BAD_REQUEST({
					message: "首次配置 Jira 必须填写 API Token",
				});
			}
			return await toView(result.row);
		}),
};
