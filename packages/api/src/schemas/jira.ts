import { z } from "zod";

/**
 * Jira 配置表单的字段长度上限与校验 schema。
 *
 * 这些值原本是 `../routers/jira.ts` 的模块私有常量，于是前端想在输入框上做
 * `maxLength` 或提交前提示，只能照着源码复刻一份 512 / 254 / 64 / 32 / 256——
 * 两份数字各活各的，改了服务端这边前端不会有任何编译错误，只会在用户提交时
 * 突然多出一条 zod 校验失败。
 *
 * **单独成文件而不是从 router 上导出**：`../routers/jira.ts` 顶上 import 的是
 * `@automationstack/db/repositories/*`，那条链一路通到 drizzle 与 pg。前端
 * `import type` 它没事（类型会被擦掉），value-import 一个常量就会把整个数据库
 * 依赖图拖进浏览器产物。本文件只依赖 zod，前端可以放心 value-import。
 * 同类先例：`./test-run.ts`（`apps/web` 的 `test-runs-search.ts` 已在 value-import 它）。
 */

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

/** issue 链接、看板深链、或形如 `PAY-123` 的编号；未配置 Jira 时收任意 URL。 */
export const defectReferenceSchema = z
	.string()
	.trim()
	.min(1)
	.max(MAX_DEFECT_REFERENCE_LENGTH);

export const formCredentialsSchema = z.object({
	/** 留空 = 用库里已存的 Token 测（改了 project key 想先测一下的常见场景）。 */
	apiToken: apiTokenSchema.optional(),
	email: jiraEmailSchema,
	projectKey: jiraProjectKeySchema,
	siteUrl: jiraSiteUrlSchema,
});

export const upsertConfigSchema = z.object({
	/**
	 * **留空 = 不修改**（编辑已配置的项目时前端显示掩码占位，用户不重填就不该
	 * 被清空）。前端**不要**把掩码串回写到这里——那会把一串星号存成真 Token。
	 * 想撤销接入就调 `remove`：没有 Token 的 Jira 配置连自检都调不通。
	 */
	apiToken: apiTokenSchema.optional(),
	defaultIssueType: jiraIssueTypeSchema,
	email: jiraEmailSchema,
	projectId: z.uuid(),
	projectKey: jiraProjectKeySchema,
	siteUrl: jiraSiteUrlSchema,
	/**
	 * 三态：省略 = 不修改；`null` = 清空（关掉状态同步）；字符串 = 覆盖。
	 * 与 Token 一样不回读——密钥只在写入时经过服务端。
	 */
	webhookSecret: z
		.string()
		.trim()
		.min(1)
		.max(MAX_WEBHOOK_SECRET_LENGTH)
		.nullable()
		.optional(),
});
