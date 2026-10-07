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

test("签名正确时放行", async () => {
	const signature = `sha256=${await signWebhookBody(BODY, SECRET)}`;
	await expect(
		verifyJiraWebhook({
			rawBody: BODY,
			secret: SECRET,
			secretHeader: null,
			signatureHeader: signature,
		})
	).resolves.toBe(true);
});

test("请求体被改过：签名对不上，拒绝", async () => {
	const signature = `sha256=${await signWebhookBody(BODY, SECRET)}`;
	await expect(
		verifyJiraWebhook({
			rawBody: `${BODY} `,
			secret: SECRET,
			secretHeader: null,
			signatureHeader: signature,
		})
	).resolves.toBe(false);
});

test("签名用了别的密钥：拒绝", async () => {
	const signature = `sha256=${await signWebhookBody(BODY, "wrong")}`;
	await expect(
		verifyJiraWebhook({
			rawBody: BODY,
			secret: SECRET,
			secretHeader: null,
			signatureHeader: signature,
		})
	).resolves.toBe(false);
});

test("带了签名头但前缀不对：拒绝，不回落到共享密钥比对", async () => {
	await expect(
		verifyJiraWebhook({
			rawBody: BODY,
			secret: SECRET,
			secretHeader: SECRET,
			signatureHeader: "md5=deadbeef",
		})
	).resolves.toBe(false);
});

test("共享密钥头精确匹配才放行", async () => {
	await expect(
		verifyJiraWebhook({
			rawBody: BODY,
			secret: SECRET,
			secretHeader: SECRET,
			signatureHeader: null,
		})
	).resolves.toBe(true);
	await expect(
		verifyJiraWebhook({
			rawBody: BODY,
			secret: SECRET,
			secretHeader: "s3cr3",
			signatureHeader: null,
		})
	).resolves.toBe(false);
});

test("项目没配 webhook 密钥时一律拒绝，不做「宽容处理」", async () => {
	const verdicts = await Promise.all(
		[null, ""].map((secret) =>
			verifyJiraWebhook({
				rawBody: BODY,
				secret,
				secretHeader: "anything",
				signatureHeader: null,
			})
		)
	);
	expect(verdicts).toEqual([false, false]);
});

test("什么校验材料都没带：拒绝", async () => {
	await expect(
		verifyJiraWebhook({
			rawBody: BODY,
			secret: SECRET,
			secretHeader: null,
			signatureHeader: null,
		})
	).resolves.toBe(false);
});

test("解析出 issue key 与当前状态", () => {
	expect(parseJiraWebhookPayload(statusPayload("PAY-123", "Done"))).toEqual({
		issueKey: "PAY-123",
		kind: "status",
		status: "Done",
	});
});

test("不关心的事件回 ignored（必须让 HTTP 层回 2xx，否则 Jira 会停用 webhook）", () => {
	expect(
		parseJiraWebhookPayload({ webhookEvent: "comment_created" }).kind
	).toBe("ignored");
	expect(
		parseJiraWebhookPayload({
			issue: { fields: {}, key: "PAY-1" },
			webhookEvent: "jira:issue_deleted",
		}).kind
	).toBe("ignored");
});

test("压根不是 Jira 的形状：invalid", () => {
	expect(parseJiraWebhookPayload(null).kind).toBe("invalid");
	expect(parseJiraWebhookPayload("hello").kind).toBe("invalid");
	expect(parseJiraWebhookPayload({}).kind).toBe("invalid");
	expect(
		parseJiraWebhookPayload({ issue: {}, webhookEvent: "jira:issue_updated" })
			.kind
	).toBe("invalid");
});

test("webhook 路径按项目区分", () => {
	expect(jiraWebhookPath("abc")).toBe("/api/jira/webhook/abc");
});
