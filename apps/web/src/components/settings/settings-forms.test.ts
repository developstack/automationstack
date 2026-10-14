import { describe, expect, it } from "vitest";

import {
	isAutoSubmitDaysDirty,
	MAX_AUTO_SUBMIT_DAYS,
	MIN_AUTO_SUBMIT_DAYS,
	validateAutoSubmitDays,
} from "@/components/settings/auto-submit-days";
import {
	buildJiraWebhookUrl,
	initialJiraFormValues,
	type JiraFormValues,
	toJiraSaveInput,
	toJiraTestCredentials,
	validateJiraForm,
} from "@/components/settings/jira-form-values";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function values(overrides: Partial<JiraFormValues> = {}): JiraFormValues {
	return {
		apiToken: "",
		clearWebhookSecret: false,
		defaultIssueType: "Bug",
		email: "qa@example.com",
		projectKey: "PAY",
		siteUrl: "https://team.atlassian.net",
		webhookSecret: "",
		...overrides,
	};
}

describe("isAutoSubmitDaysDirty：有没有未保存的修改", () => {
	it.each([
		["输入等于已保存的天数时没有修改", "7", false],
		["写法不同但天数相同时没有修改", " 07 ", false],
		["天数不同时有修改", "8", true],
		["清空时有修改", "", true],
		["输入无效的值时有修改", "abc", true],
	])("%s", (_name, input, dirty) => {
		expect(isAutoSubmitDaysDirty(input, 7)).toBe(dirty);
	});
});

describe("validateAutoSubmitDays", () => {
	it.each([
		["接受区间下端", String(MIN_AUTO_SUBMIT_DAYS), MIN_AUTO_SUBMIT_DAYS],
		["接受区间上端", String(MAX_AUTO_SUBMIT_DAYS), MAX_AUTO_SUBMIT_DAYS],
		["容忍首尾空格（粘贴常带）", " 7 ", 7],
	])("%s", (_name, input, days) => {
		expect(validateAutoSubmitDays(input)).toEqual({ days, kind: "ok" });
	});

	it.each(["0", "31", "", "3.5", "三", "-3", "+3", "3e0"])(
		"拒绝越界的天数、非整数与空值：%j",
		(input) => {
			expect(validateAutoSubmitDays(input).kind).toBe("invalid");
		}
	);
});

describe("initialJiraFormValues", () => {
	it("未配置时给出一张全空表单，而不是错误态", () => {
		expect(initialJiraFormValues(null)).toEqual({
			apiToken: "",
			clearWebhookSecret: false,
			defaultIssueType: "",
			email: "",
			projectKey: "",
			siteUrl: "",
			webhookSecret: "",
		});
	});
});

describe("validateJiraForm", () => {
	it("首次配置必须给 API Token，已配过则可留空", () => {
		expect(validateJiraForm(values(), false).apiToken).not.toBeNull();
		expect(validateJiraForm(values(), true).apiToken).toBeNull();
	});

	it("站点必须是 http(s) 绝对地址", () => {
		expect(
			validateJiraForm(values({ siteUrl: "team.atlassian.net" }), true).siteUrl
		).not.toBeNull();
		expect(
			validateJiraForm(values({ siteUrl: "ftp://team.example" }), true).siteUrl
		).not.toBeNull();
		expect(validateJiraForm(values(), true).siteUrl).toBeNull();
	});

	it("邮箱要能过基本格式", () => {
		expect(
			validateJiraForm(values({ email: "qa" }), true).email
		).not.toBeNull();
		expect(validateJiraForm(values({ email: "" }), true).email).not.toBeNull();
	});
});

describe("toJiraSaveInput", () => {
	it("Token 留空时整个键都不带（= 保持库里那份不变）", () => {
		const input = toJiraSaveInput(values(), PROJECT_ID);
		expect("apiToken" in input).toBe(false);
		expect("webhookSecret" in input).toBe(false);
	});

	it("填了就带上，并去掉粘贴带来的首尾空格", () => {
		const input = toJiraSaveInput(
			values({ apiToken: "  tok  ", webhookSecret: " s " }),
			PROJECT_ID
		);
		expect(input.apiToken).toBe("tok");
		expect(input.webhookSecret).toBe("s");
	});

	it("显式清空 webhook 密钥时给 null 而不是 undefined", () => {
		const input = toJiraSaveInput(
			values({ clearWebhookSecret: true, webhookSecret: "被忽略" }),
			PROJECT_ID
		);
		expect(input.webhookSecret).toBeNull();
	});
});

describe("toJiraTestCredentials", () => {
	it("Token 留空时不带该键，让服务端拿库里那份补上", () => {
		const credentials = toJiraTestCredentials(values());
		expect("apiToken" in credentials).toBe(false);
		expect(credentials.siteUrl).toBe("https://team.atlassian.net");
	});

	it("带上表单里还没保存的新 Token", () => {
		expect(toJiraTestCredentials(values({ apiToken: "new" })).apiToken).toBe(
			"new"
		);
	});
});

describe("buildJiraWebhookUrl", () => {
	it("拼接 origin 与服务端给的路径", () => {
		expect(
			buildJiraWebhookUrl(
				"https://api.example.com",
				`/api/jira/webhook/${PROJECT_ID}`
			)
		).toBe(`https://api.example.com/api/jira/webhook/${PROJECT_ID}`);
	});

	it("origin 末尾的斜杠不会拼出双斜杠", () => {
		expect(buildJiraWebhookUrl("https://api.example.com//", "/api/x")).toBe(
			"https://api.example.com/api/x"
		);
	});
});
