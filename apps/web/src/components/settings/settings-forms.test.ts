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
	it("输入等于已保存的天数时没有修改", () => {
		expect(isAutoSubmitDaysDirty("7", 7)).toBe(false);
	});

	it("写法不同但天数相同时没有修改", () => {
		expect(isAutoSubmitDaysDirty(" 07 ", 7)).toBe(false);
	});

	it("天数不同时有修改", () => {
		expect(isAutoSubmitDaysDirty("8", 7)).toBe(true);
	});

	it("清空或输入无效的值时有修改", () => {
		expect(isAutoSubmitDaysDirty("", 7)).toBe(true);
		expect(isAutoSubmitDaysDirty("abc", 7)).toBe(true);
	});
});

describe("validateAutoSubmitDays", () => {
	it("接受区间两端", () => {
		expect(validateAutoSubmitDays(String(MIN_AUTO_SUBMIT_DAYS))).toEqual({
			days: MIN_AUTO_SUBMIT_DAYS,
			kind: "ok",
		});
		expect(validateAutoSubmitDays(String(MAX_AUTO_SUBMIT_DAYS))).toEqual({
			days: MAX_AUTO_SUBMIT_DAYS,
			kind: "ok",
		});
	});

	it("拒绝越界的天数", () => {
		expect(validateAutoSubmitDays("0").kind).toBe("invalid");
		expect(validateAutoSubmitDays("31").kind).toBe("invalid");
	});

	it("拒绝非整数与空值", () => {
		expect(validateAutoSubmitDays("").kind).toBe("invalid");
		expect(validateAutoSubmitDays("3.5").kind).toBe("invalid");
		expect(validateAutoSubmitDays("三").kind).toBe("invalid");
		expect(validateAutoSubmitDays("-3").kind).toBe("invalid");
		expect(validateAutoSubmitDays("+3").kind).toBe("invalid");
		expect(validateAutoSubmitDays("3e0").kind).toBe("invalid");
	});

	it("容忍首尾空格（粘贴常带）", () => {
		expect(validateAutoSubmitDays(" 7 ")).toEqual({ days: 7, kind: "ok" });
	});
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
