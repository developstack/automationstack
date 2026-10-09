import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";

import { formatDateTime } from "@/components/cases/case-meta";

export const PROVIDER_LABELS: Record<AuthSettingsView["provider"], string> = {
	casdoor: "Casdoor",
	local: "本地",
};

export const SOURCE_LABELS: Record<AuthSettingsView["source"], string> = {
	database: "页面配置",
	env: "环境变量",
};

export const SOURCE_NOTES: Record<AuthSettingsView["source"], string> = {
	database: "认证设置已在本页面保存过。之后修改环境变量不再生效。",
	env: "现在使用环境变量中的值。在本页面保存一次后，服务改用页面配置，之后修改环境变量不再生效。",
};

const NO_RECORD = "没有记录";

export function lastChangeLabel(view: AuthSettingsView): string {
	if (view.source === "env" || view.updatedAt === null) {
		return NO_RECORD;
	}
	const at = formatDateTime(view.updatedAt);
	return view.updatedByUsername === null
		? at
		: `${view.updatedByUsername} · ${at}`;
}

export function lastTestLabel(view: AuthSettingsView): string {
	return view.lastTestOkAt === null
		? NO_RECORD
		: formatDateTime(view.lastTestOkAt);
}

export function emergencyLoginLabel(view: AuthSettingsView): string {
	return view.allowLocalLogin
		? "开启（AUTH_ALLOW_LOCAL_LOGIN，只能在环境变量中修改）"
		: "关闭（AUTH_ALLOW_LOCAL_LOGIN，只能在环境变量中修改）";
}

/** 切换认证方式前，确认对话框中列出的后果（plan 021 §10.5 第 4 项）。 */
export function providerChangeConsequences(
	target: AuthSettingsView["provider"]
): string[] {
	if (target === "casdoor") {
		return [
			"Casdoor 用户没有本地密码，只能在 Casdoor 中登录。",
			"本地普通用户的现有会话会失效，只有本地管理员可以用本地密码登录。",
		];
	}
	return [
		"所有本地账号都可以用本地密码登录。",
		"Casdoor 用户没有本地密码。管理员必须为他们重置密码，他们才能登录。",
	];
}
