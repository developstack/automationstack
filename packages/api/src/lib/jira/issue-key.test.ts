import { expect, test } from "vitest";

import { buildIssueUrl, normalizeSiteUrl, parseIssueKey } from "./issue-key";

const SITE = "https://acme.atlassian.net";

test("parseIssueKey 认裸编号并统一成大写", () => {
	expect(parseIssueKey("PAY-123")).toBe("PAY-123");
	expect(parseIssueKey("  pay-123  ")).toBe("PAY-123");
	expect(parseIssueKey("AB1-7")).toBe("AB1-7");
});

test("parseIssueKey 认 browse 链接（含查询串与锚点）", () => {
	expect(parseIssueKey(`${SITE}/browse/PAY-123`)).toBe("PAY-123");
	expect(parseIssueKey(`${SITE}/browse/PAY-123?filter=-1#comment-42`)).toBe(
		"PAY-123"
	);
});

test("parseIssueKey 认新版 issue 详情页与看板深链", () => {
	expect(
		parseIssueKey(`${SITE}/jira/software/c/projects/PAY/issues/PAY-9`)
	).toBe("PAY-9");
	expect(
		parseIssueKey(
			`${SITE}/jira/software/projects/PAY/boards/1?selectedIssue=PAY-42`
		)
	).toBe("PAY-42");
});

test("parseIssueKey 拒绝认不出来的输入而不是硬猜", () => {
	expect(parseIssueKey("PAY-123 登录失败")).toBeNull();
	expect(parseIssueKey("")).toBeNull();
	expect(parseIssueKey("   ")).toBeNull();
	expect(parseIssueKey("123-PAY")).toBeNull();
	expect(parseIssueKey("PAY-")).toBeNull();
	expect(parseIssueKey("PAY-0")).toBeNull();
	expect(parseIssueKey("P-1")).toBeNull();
	expect(
		parseIssueKey("https://acme.atlassian.net/jira/dashboards")
	).toBeNull();
	expect(parseIssueKey("not a url ://")).toBeNull();
});

test("normalizeSiteUrl 削掉末尾斜杠，buildIssueUrl 不拼出双斜杠", () => {
	expect(normalizeSiteUrl(`${SITE}///`)).toBe(SITE);
	expect(buildIssueUrl(`${SITE}/`, "PAY-1")).toBe(`${SITE}/browse/PAY-1`);
});
