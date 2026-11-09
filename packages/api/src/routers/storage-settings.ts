import { env } from "@automationstack/env/server";

import { adminProcedure } from "../index";
import { checkR2Bucket, createR2Client } from "../lib/r2-operations";
import {
	checkStorageSettingsInput,
	saveStorageSettingsSchema,
} from "../storage/settings-input";
import type { R2Connection } from "../storage/settings-model";
import { saveEffectiveStorageSettings } from "../storage/settings-save";
import { getEffectiveStorageSettings } from "../storage/settings-store";
import {
	type StorageSettingsView,
	toStorageSettingsView,
} from "../storage/settings-view";

const MASTER_KEY_MISSING_MESSAGE =
	"不能加密保存 Secret Access Key：服务端没有配置 SECRET_ENCRYPTION_KEY（openssl rand -base64 32）。第一次保存时，环境变量中的 R2 密钥也要加密保存。";

function checkConnection(connection: R2Connection): Promise<string | null> {
	return checkR2Bucket(createR2Client(connection), connection.bucket);
}

/** 存储设置：上传的图片和附件存在哪里。只有管理员可以读取和保存。 */
export const storageSettingsRouter = {
	get: adminProcedure.handler(
		async (): Promise<StorageSettingsView> =>
			await toStorageSettingsView(await getEffectiveStorageSettings())
	),
	save: adminProcedure
		.errors({ BAD_REQUEST: {}, PRECONDITION_FAILED: {} })
		.input(saveStorageSettingsSchema)
		.handler(
			async ({ context, errors, input }): Promise<StorageSettingsView> => {
				const current = await getEffectiveStorageSettings();
				const checked = checkStorageSettingsInput(input, {
					hasStoredSecret: current.r2.secretAccessKey.present,
					production: env.NODE_ENV === "production",
				});
				if (checked.kind === "invalid") {
					throw errors.BAD_REQUEST({ message: checked.message });
				}
				const outcome = await saveEffectiveStorageSettings(
					checked.input,
					{ id: context.user.id, username: context.user.username },
					checkConnection
				);
				if (outcome.kind === "connection-failed") {
					throw errors.BAD_REQUEST({ message: outcome.message });
				}
				if (outcome.kind === "master-key-missing") {
					throw errors.PRECONDITION_FAILED({
						message: MASTER_KEY_MISSING_MESSAGE,
					});
				}
				return await toStorageSettingsView(await getEffectiveStorageSettings());
			}
		),
};
