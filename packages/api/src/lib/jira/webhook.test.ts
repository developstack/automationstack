import { expect, test } from "vitest";

import {
	jiraWebhookPath,
	parseJiraWebhookPayload,
	signWebhookBody,
	verifyJiraWebhook,
} from "./webhook";

const SECRET = "s3cr3t";
const BODY = '{"webhookEvent":"jira:issue_updated"}';

function statusPayload(key: string, status: string) {
	return {
		issue: { fields: { status: { name: status }, summary: "登录失败" }, key },
		webhookEvent: "jira:issue_updated",
	};
}

test.each([
	["签名正确时放行", {}, SECRET, true],
	["请求体被改过：签名对不上，拒绝", { rawBody: `${BODY} ` }, SECRET, false],
	["签名用了别的密钥：拒绝", {}, "wrong", false],
	[
		"带了签名头但前缀不对：拒绝，不回落到共享密钥比对",
		{ secretHeader: SECRET, signatureHeader: "md5=deadbeef" },
		null,
		false,
	],
	["共享密钥头精确匹配才放行", { secretHeader: SECRET }, null, true],
	["共享密钥头差一个字符：拒绝", { secretHeader: "s3cr3" }, null, false],
	[
		"项目没配 webhook 密钥（null）时一律拒绝，不做「宽容处理」",
		{ secret: null, secretHeader: "anything" },
		null,
		false,
	],
	[
		"项目没配 webhook 密钥（空串）时一律拒绝",
		{ secret: "", secretHeader: "anything" },
		null,
		false,
	],
	["什么校验材料都没带：拒绝", {}, null, false],
])("%s", async (_name, overrides, signWith, expected) => {
	const signatureHeader =
		signWith === null
			? null
			: `sha256=${await signWebhookBody(BODY, signWith)}`;
	await expect(
		verifyJiraWebhook({
			rawBody: BODY,
			secret: SECRET,
			secretHeader: null,
			signatureHeader,
			...overrides,
		})
	).resolves.toBe(expected);
});

test("解析出 issue key 与当前状态", () => {
	expect(parseJiraWebhookPayload(statusPayload("PAY-123", "Done"))).toEqual({
		issueKey: "PAY-123",
		kind: "status",
		status: "Done",
	});
});

test.each([
	[
		"不关心的事件回 ignored（必须让 HTTP 层回 2xx，否则 Jira 会停用 webhook）",
		{ webhookEvent: "comment_created" },
		"ignored",
	],
	[
		"删除事件也回 ignored",
		{ issue: { fields: {}, key: "PAY-1" }, webhookEvent: "jira:issue_deleted" },
		"ignored",
	],
	["压根不是 Jira 的形状（null）：invalid", null, "invalid"],
	["压根不是 Jira 的形状（字符串）：invalid", "hello", "invalid"],
	["压根不是 Jira 的形状（空对象）：invalid", {}, "invalid"],
	[
		"issue 缺字段：invalid",
		{ issue: {}, webhookEvent: "jira:issue_updated" },
		"invalid",
	],
])("%s", (_name, payload, kind) => {
	expect(parseJiraWebhookPayload(payload).kind).toBe(kind);
});

test("webhook 路径按项目区分", () => {
	expect(jiraWebhookPath("abc")).toBe("/api/jira/webhook/abc");
});
