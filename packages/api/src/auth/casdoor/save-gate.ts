import { countLocalLoginAdmins } from "@automationstack/db/repositories/users-repository";

import type { SaveAuthSettingsInput, SecretUpdate } from "../settings-input";
import type { EffectiveAuthSettings } from "../settings-model";
import {
	type CasdoorConnectionDraft,
	completeConnection,
	describeMissingFields,
} from "./connection";
import {
	type ConnectionTestResult,
	testCasdoorConnection,
} from "./test-connection";

export const LOCAL_LOGIN_REQUIRED_MESSAGE =
	"环境变量 AUTH_ALLOW_LOCAL_LOGIN 为 false，不能使用 Casdoor 模式：Casdoor 不可用时没有人能登录。请先打开应急登录。";

export const LOCAL_ADMIN_REQUIRED_MESSAGE =
	"没有可以本地登录的管理员，不能使用 Casdoor 模式。请先准备一个本地管理员（有密码、未停用）。";

export const CONNECTION_TEST_FAILED_MESSAGE =
	"测试连接没有全部通过，没有保存。请查看失败的步骤。";

/** 页面表单中与连接有关的字段。密钥用「保留 / 设置 / 清空」表示。 */
export type ConnectionForm = Pick<
	SaveAuthSettingsInput,
	"adminRole" | "clientId" | "clientSecret" | "issuer" | "organization"
> & { redirectUrl?: string | null };

function secretValue(
	update: SecretUpdate,
	current: EffectiveAuthSettings
): string | null {
	if (update.kind === "set") {
		return update.value;
	}
	return update.kind === "keep" ? current.clientSecret.value : null;
}

/**
 * 用表单中的值组成连接参数。Client Secret 选择「保留」时使用已保存的值；
 * 集群内地址只来自环境变量。
 */
export function draftFromForm(
	form: ConnectionForm,
	current: EffectiveAuthSettings
): CasdoorConnectionDraft {
	return {
		adminRole: form.adminRole,
		clientId: form.clientId,
		clientSecret: secretValue(form.clientSecret, current),
		internalUrl: current.internalUrl,
		issuer: form.issuer,
		organization: form.organization,
		redirectUrl: form.redirectUrl ?? null,
	};
}

export type CasdoorSaveGate =
	| { kind: "invalid"; message: string }
	| { kind: "ok"; testedOkAt: Date | undefined }
	| { kind: "precondition"; message: string }
	| { kind: "test-failed"; result: ConnectionTestResult };

export interface SaveGateDeps {
	countLocalLoginAdmins: () => Promise<number>;
	now: () => Date;
	test: (draft: CasdoorConnectionDraft) => Promise<ConnectionTestResult>;
}

const defaultDeps: SaveGateDeps = {
	countLocalLoginAdmins,
	now: () => new Date(),
	test: (draft) => testCasdoorConnection(draft),
};

/**
 * 保存为 Casdoor 模式前的检查（plan 021 §10.5 第 1、2 项）：
 * 应急登录必须打开，必须有可以本地登录的管理员，连接参数必须完整，
 * 并且用提交的值测试连接，每一步都通过。local 模式不检查。
 */
export async function checkCasdoorSave(
	input: SaveAuthSettingsInput,
	current: EffectiveAuthSettings,
	deps: SaveGateDeps = defaultDeps
): Promise<CasdoorSaveGate> {
	if (input.provider !== "casdoor") {
		return { kind: "ok", testedOkAt: undefined };
	}
	if (!current.allowLocalLogin) {
		return { kind: "precondition", message: LOCAL_LOGIN_REQUIRED_MESSAGE };
	}
	if ((await deps.countLocalLoginAdmins()) === 0) {
		return { kind: "precondition", message: LOCAL_ADMIN_REQUIRED_MESSAGE };
	}
	const draft = draftFromForm(input, current);
	const complete = completeConnection(draft);
	if (complete.kind === "incomplete") {
		return {
			kind: "invalid",
			message: `Casdoor 模式需要完整的连接参数。${describeMissingFields(complete.missing)}`,
		};
	}
	const result = await deps.test(draft);
	if (!result.ok) {
		return { kind: "test-failed", result };
	}
	return { kind: "ok", testedOkAt: deps.now() };
}
