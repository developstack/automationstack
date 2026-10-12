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

const projectIdSchema = z.object({ projectId: z.uuid() });

const ownerOnlyErrors = { FORBIDDEN: {} } as const;

const NOT_PROJECT_OWNER_MESSAGE =
	"只有平台管理员和身为项目 owner 的项目管理员能改 Jira 配置";

export interface JiraConfigView {
	defaultIssueType: string;
	email: string;
	hasApiToken: boolean;
	hasWebhookSecret: boolean;
	projectKey: string;
	siteUrl: string;
	updatedAt: Date;
	updatedByUsername: string | null;
	webhookPath: string;
}

export interface JiraConfigState {
	config: JiraConfigView | null;
	credentialProblem: JiraCredentialProblem | null;
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

	getConfig: protectedProcedure
		.input(projectIdSchema)
		.use(requireProjectMember)
		.handler(async ({ input }): Promise<JiraConfigState> => {
			const row = await getJiraConfig(input.projectId);
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
