import { env } from "@automationstack/env/server";

import {
	checkAuthSettingsInput,
	saveAuthSettingsSchema,
} from "../auth/settings-input";
import { saveEffectiveAuthSettings } from "../auth/settings-save";
import { getEffectiveAuthSettings } from "../auth/settings-store";
import {
	type AuthSettingsView,
	toAuthSettingsView,
} from "../auth/settings-view";
import { adminProcedure } from "../index";

const CASDOOR_NOT_IMPLEMENTED_MESSAGE =
	"Casdoor 模式尚未实现。现在只能保存本地模式，Casdoor 参数可以先填写保存。";

const MASTER_KEY_MISSING_MESSAGE =
	"不能加密保存密钥：服务端没有配置 SECRET_ENCRYPTION_KEY（openssl rand -base64 32）。第一次保存时，环境变量中的 Casdoor 密钥也要加密保存。";

/** 认证设置（plan 021 §10）。只有平台管理员可以读取和保存。 */
export const authSettingsRouter = {
	get: adminProcedure.handler(
		async (): Promise<AuthSettingsView> =>
			await toAuthSettingsView(await getEffectiveAuthSettings())
	),
	save: adminProcedure
		.errors({ BAD_REQUEST: {}, PRECONDITION_FAILED: {} })
		.input(saveAuthSettingsSchema)
		.handler(async ({ context, errors, input }): Promise<AuthSettingsView> => {
			// 阶段 3 实现 Casdoor 登录和测试连接后，删除这项检查。
			if (input.provider === "casdoor") {
				throw errors.BAD_REQUEST({ message: CASDOOR_NOT_IMPLEMENTED_MESSAGE });
			}
			const checked = checkAuthSettingsInput(input, {
				production: env.NODE_ENV === "production",
			});
			if (checked.kind === "invalid") {
				throw errors.BAD_REQUEST({ message: checked.message });
			}
			const outcome = await saveEffectiveAuthSettings(checked.input, {
				id: context.user.id,
				username: context.user.username,
			});
			if (outcome.kind === "master-key-missing") {
				throw errors.PRECONDITION_FAILED({
					message: MASTER_KEY_MISSING_MESSAGE,
				});
			}
			return await toAuthSettingsView(await getEffectiveAuthSettings());
		}),
};
