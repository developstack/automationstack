import { z } from "zod";

export const MAX_API_TOKEN_LENGTH = 512;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_ISSUE_TYPE_LENGTH = 64;
export const MAX_PROJECT_KEY_LENGTH = 32;
export const MAX_SITE_URL_LENGTH = 256;
export const MAX_WEBHOOK_SECRET_LENGTH = 256;
export const MAX_DEFECT_REFERENCE_LENGTH = 2048;

export const apiTokenSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_API_TOKEN_LENGTH);

export const jiraEmailSchema = z.email().max(MAX_EMAIL_LENGTH);
export const jiraProjectKeySchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_PROJECT_KEY_LENGTH);
export const jiraSiteUrlSchema = z.url().max(MAX_SITE_URL_LENGTH);
export const jiraIssueTypeSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_ISSUE_TYPE_LENGTH);

export const defectReferenceSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_DEFECT_REFERENCE_LENGTH);

export const formCredentialsSchema = z.object({
	apiToken: apiTokenSchema.optional(),
	email: jiraEmailSchema,
	projectKey: jiraProjectKeySchema,
	siteUrl: jiraSiteUrlSchema,
});

export const upsertConfigSchema = z.object({
	apiToken: apiTokenSchema.optional(),
	defaultIssueType: jiraIssueTypeSchema,
	email: jiraEmailSchema,
	projectId: z.uuid(),
	projectKey: jiraProjectKeySchema,
	siteUrl: jiraSiteUrlSchema,
	webhookSecret: z
		.string()
		.trim()
		.min(1)
		.max(MAX_WEBHOOK_SECRET_LENGTH)
		.nullable()
		.optional(),
});
