import { markAuthSettingsTestOk } from "@automationstack/db/repositories/auth-settings-repository";
import { parseOriginUrl } from "@automationstack/env/casdoor-rules";
import { env } from "@automationstack/env/server";
import { z } from "zod";

import {
	type CasdoorConnectionDraft,
	draftFromSettings,
} from "../auth/casdoor/connection";
import {
	CONNECTION_TEST_FAILED_MESSAGE,
	checkCasdoorSave,
	draftFromForm,
} from "../auth/casdoor/save-gate";
import {
	type ConnectionTestResult,
	testCasdoorConnection,
} from "../auth/casdoor/test-connection";
import {
	checkAuthSettingsInput,
	saveAuthSettingsSchema,
} from "../auth/settings-input";
import type { EffectiveAuthSettings } from "../auth/settings-model";
import { saveEffectiveAuthSettings } from "../auth/settings-save";
import {
	getEffectiveAuthSettings,
	invalidateAuthSettingsCache,
} from "../auth/settings-store";
import {
	type AuthSettingsView,
	toAuthSettingsView,
} from "../auth/settings-view";
import { adminProcedure } from "../index";

const MASTER_KEY_MISSING_MESSAGE =
	"不能加密保存密钥：服务端没有配置 SECRET_ENCRYPTION_KEY（openssl rand -base64 32）。第一次保存时，环境变量中的 Casdoor 密钥也要加密保存。";

const INVALID_ISSUER_MESSAGE =
	"公网地址只能包含协议、主机和端口，例如 https://casdoor.example.com";

const connectionStepSchema = z.object({
	detail: z.string().nullable(),
	id: z.enum(["adminRole", "discovery", "organization", "token"]),
	label: z.string(),
	status: z.enum(["failed", "passed", "skipped"]),
});

/** 测试连接的结果。保存失败时，CONNECTION_TEST_FAILED 错误的 data 也是这个形状。 */
const connectionTestResultSchema = z.object({
	ok: z.boolean(),
	steps: z.array(connectionStepSchema),
});

/** 测试连接只使用表单中与连接有关的字段。其他字段（例如 provider）被忽略。 */
const testConnectionSchema = saveAuthSettingsSchema.pick({
	adminRole: true,
	clientId: true,
	clientSecret: true,
	issuer: true,
	organization: true,
});

export interface ConnectionTestView extends ConnectionTestResult {
	testedAt: Date;
}

function sameAsStored(
	draft: CasdoorConnectionDraft,
	current: EffectiveAuthSettings
): boolean {
	const stored = draftFromSettings(current);
	const fields = Object.keys(stored) as (keyof CasdoorConnectionDraft)[];
	return (
		current.source === "database" &&
		fields
			.filter((field) => field !== "redirectUrl")
			.every((field) => stored[field] === draft[field])
	);
}

/** 认证设置（plan 021 §10）。只有平台管理员可以读取、测试和保存。 */
export const authSettingsRouter = {
	get: adminProcedure.handler(
		async (): Promise<AuthSettingsView> =>
			await toAuthSettingsView(await getEffectiveAuthSettings())
	),
	save: adminProcedure
		.errors({
			BAD_REQUEST: {},
			CONNECTION_TEST_FAILED: {
				data: connectionTestResultSchema,
				message: CONNECTION_TEST_FAILED_MESSAGE,
				status: 400,
			},
			PRECONDITION_FAILED: {},
		})
		.input(saveAuthSettingsSchema)
		.handler(async ({ context, errors, input }): Promise<AuthSettingsView> => {
			const checked = checkAuthSettingsInput(input, {
				production: env.NODE_ENV === "production",
			});
			if (checked.kind === "invalid") {
				throw errors.BAD_REQUEST({ message: checked.message });
			}
			invalidateAuthSettingsCache();
			const gate = await checkCasdoorSave(
				checked.input,
				await getEffectiveAuthSettings()
			);
			if (gate.kind === "invalid") {
				throw errors.BAD_REQUEST({ message: gate.message });
			}
			if (gate.kind === "precondition") {
				throw errors.PRECONDITION_FAILED({ message: gate.message });
			}
			if (gate.kind === "test-failed") {
				throw errors.CONNECTION_TEST_FAILED({ data: gate.result });
			}
			const outcome = await saveEffectiveAuthSettings(
				checked.input,
				{ id: context.user.id, username: context.user.username },
				{ testedOkAt: gate.testedOkAt }
			);
			if (outcome.kind === "master-key-missing") {
				throw errors.PRECONDITION_FAILED({
					message: MASTER_KEY_MISSING_MESSAGE,
				});
			}
			return await toAuthSettingsView(await getEffectiveAuthSettings());
		}),
	testConnection: adminProcedure
		.errors({ BAD_REQUEST: {} })
		.input(testConnectionSchema)
		.handler(async ({ errors, input }): Promise<ConnectionTestView> => {
			const issuer =
				input.issuer === null ? null : parseOriginUrl(input.issuer);
			if (input.issuer !== null && issuer === null) {
				throw errors.BAD_REQUEST({ message: INVALID_ISSUER_MESSAGE });
			}
			const current = await getEffectiveAuthSettings();
			const draft = draftFromForm({ ...input, issuer }, current);
			const result = await testCasdoorConnection(draft);
			const testedAt = new Date();
			// 只有测试的值就是已保存的值时，才更新「最后一次测试成功的时间」。
			if (result.ok && sameAsStored(draft, current)) {
				await markAuthSettingsTestOk(testedAt);
				invalidateAuthSettingsCache();
			}
			return { ...result, testedAt };
		}),
};
