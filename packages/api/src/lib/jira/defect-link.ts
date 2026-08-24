/**
 * 缺陷关联视图 `DefectLinkView` 及其字段的三个取值来源。
 *
 * 放在 `lib/jira/` 而不是 router 里：它们都是纯粹的取值 / 归一化，
 * 没有一个认识 oRPC 的 context 或 errors。router 那边只剩下编排。
 */

import { env } from "@automationstack/env/server";

import type { JiraClient } from "./client";

/** 前端渲染成可点击链接的值只放行这两种协议，挡掉 `javascript:` 之类。 */
const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

const TRAILING_SLASHES_PATTERN = /\/+$/;

/**
 * 回写到 `test_run_cases` 的缺陷字段，同时也是返回给前端的视图。
 * 四个字段一起给：`setRunCaseDefect` 只写显式给了值的键，一起写才能保证
 * 「换一个 issue」不会留下上一个 issue 的标题或状态。
 */
export interface DefectLinkView {
	defectKey: string | null;
	defectStatus: string | null;
	defectTitle: string | null;
	defectUrl: string | null;
}

/**
 * 未配置 Jira 时用户手填的缺陷链接（D9 的降级落点）。
 * 必须是 http/https 的合法 URL——这个值会被前端渲染成可点击链接。
 */
export function normalizeExternalUrl(value: string): string | null {
	try {
		const url = new URL(value.trim());
		return ALLOWED_URL_PROTOCOLS.has(url.protocol) ? url.toString() : null;
	} catch {
		return null;
	}
}

/**
 * 平台上这个测试任务的地址，写进 issue 描述当回链。
 * `CORS_ORIGIN` 是服务端唯一知道的前端公网地址。
 */
export function buildRunUrl(projectId: string, runId: string): string {
	const origin = env.CORS_ORIGIN.replace(TRAILING_SLASHES_PATTERN, "");
	return `${origin}/projects/${projectId}/test-runs/${runId}`;
}

/**
 * 建完 issue 后顺手把状态读回来。读失败**不影响建单结果**——issue 已经建成了，
 * 为了一个展示用的状态字段把整个操作报成失败，只会让用户重复点按钮、
 * 在 Jira 里堆出一串重复 issue。
 */
export async function readFreshStatus(
	client: JiraClient,
	issueKey: string
): Promise<string | null> {
	const issue = await client.getIssue(issueKey);
	return issue.ok ? issue.value.status : null;
}
