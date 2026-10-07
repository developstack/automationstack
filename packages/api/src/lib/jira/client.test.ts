import { afterEach, expect, test, vi } from "vitest";

import { buildDefectDescription } from "./adf";
import { createJiraClient } from "./client";

const OPTIONS = {
	apiToken: "token-123",
	defaultIssueType: "Bug",
	email: "qa@example.com",
	projectKey: "PAY",
	siteUrl: "https://acme.atlassian.net/",
};

interface FetchCall {
	init: RequestInit;
	url: string;
}

function stubFetch(
	respond: (call: FetchCall) => Response | Promise<Response>
): FetchCall[] {
	const calls: FetchCall[] = [];
	vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
		calls.push({ init, url });
		return Promise.resolve(respond({ init, url }));
	});
	return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
		status,
	});
}

const DESCRIPTION = buildDefectDescription({
	attachmentCount: 0,
	caseName: "登录",
	comment: "报 500",
	preconditions: null,
	runName: "回归",
	runUrl: "https://app.example.com/x",
	steps: [],
});

afterEach(() => {
	vi.unstubAllGlobals();
});

test("createIssue 打 v3 接口、用 Basic 认证、描述是 ADF", async () => {
	const calls = stubFetch(() => jsonResponse({ id: "1", key: "PAY-7" }));
	const result = await createJiraClient(OPTIONS).createIssue({
		description: DESCRIPTION,
		issueType: "Bug",
		summary: "[回归] 登录",
	});
	expect(result).toEqual({
		ok: true,
		value: { key: "PAY-7", url: "https://acme.atlassian.net/browse/PAY-7" },
	});
	expect(calls[0]?.url).toBe("https://acme.atlassian.net/rest/api/3/issue");
	const headers = calls[0]?.init.headers as Record<string, string>;
	expect(headers.authorization).toBe(
		`Basic ${btoa("qa@example.com:token-123")}`
	);
	const body = JSON.parse(String(calls[0]?.init.body));
	expect(body.fields.project).toEqual({ key: "PAY" });
	expect(body.fields.issuetype).toEqual({ name: "Bug" });
	expect(body.fields.description.type).toBe("doc");
});

test("401 归类成 auth-failed，并带上 Jira 自己给的原因", async () => {
	stubFetch(() =>
		jsonResponse({ errorMessages: ["Client must be authenticated"] }, 401)
	);
	const result = await createJiraClient(OPTIONS).createIssue({
		description: DESCRIPTION,
		issueType: "Bug",
		summary: "x",
	});
	expect(result).toEqual({
		failure: {
			kind: "auth-failed",
			message: "Client must be authenticated",
		},
		ok: false,
	});
});

test("400 归类成 invalid-response，errors 里的字段级原因也能取到", async () => {
	stubFetch(() =>
		jsonResponse({ errors: { issuetype: "issue type 不存在" } }, 400)
	);
	const result = await createJiraClient(OPTIONS).createIssue({
		description: DESCRIPTION,
		issueType: "不存在的类型",
		summary: "x",
	});
	expect(result.ok).toBe(false);
	expect(result.ok === false && result.failure).toEqual({
		kind: "invalid-response",
		message: "issue type 不存在",
	});
});

test("getIssue 只取需要的字段并解析出状态", async () => {
	const calls = stubFetch(() =>
		jsonResponse({
			fields: { status: { name: "Done" }, summary: "登录报 500" },
			key: "PAY-7",
		})
	);
	const result = await createJiraClient(OPTIONS).getIssue("PAY-7");
	expect(calls[0]?.url).toBe(
		"https://acme.atlassian.net/rest/api/3/issue/PAY-7?fields=summary,status"
	);
	expect(result).toEqual({
		ok: true,
		value: {
			key: "PAY-7",
			status: "Done",
			summary: "登录报 500",
			url: "https://acme.atlassian.net/browse/PAY-7",
		},
	});
});

test("404 归类成 not-found", async () => {
	stubFetch(() =>
		jsonResponse({ errorMessages: ["Issue does not exist"] }, 404)
	);
	const result = await createJiraClient(OPTIONS).getIssue("PAY-999");
	expect(result.ok === false && result.failure.kind).toBe("not-found");
});

test("站点地址填错返回 HTML 时不炸，归类成 invalid-response", async () => {
	stubFetch(() => new Response("<html>login</html>", { status: 200 }));
	const result = await createJiraClient(OPTIONS).getIssue("PAY-7");
	expect(result.ok === false && result.failure.kind).toBe("invalid-response");
});

test("超时与网络不可达分开归类，都不抛异常", async () => {
	stubFetch(() => {
		const error = new Error("timed out");
		error.name = "TimeoutError";
		throw error;
	});
	const timedOut = await createJiraClient(OPTIONS).getIssue("PAY-7");
	expect(timedOut.ok === false && timedOut.failure.kind).toBe("timeout");

	stubFetch(() => {
		throw new TypeError("fetch failed");
	});
	const offline = await createJiraClient(OPTIONS).getIssue("PAY-7");
	expect(offline.ok === false && offline.failure.kind).toBe("network-error");
});

test("verifyConnection 先验凭据再验 project key，前一步失败就不发第二个请求", async () => {
	const calls = stubFetch(() => jsonResponse({ errorMessages: [] }, 401));
	const result = await createJiraClient(OPTIONS).verifyConnection();
	expect(calls).toHaveLength(1);
	expect(result.ok === false && result.failure.kind).toBe("auth-failed");
});

test("verifyConnection 两步都过时回带账号名与项目名", async () => {
	const calls = stubFetch((call) =>
		call.url.includes("/myself")
			? jsonResponse({ displayName: "QA 张三" })
			: jsonResponse({ name: "支付" })
	);
	const result = await createJiraClient(OPTIONS).verifyConnection();
	expect(calls).toHaveLength(2);
	expect(result).toEqual({
		ok: true,
		value: { accountDisplayName: "QA 张三", projectName: "支付" },
	});
});
