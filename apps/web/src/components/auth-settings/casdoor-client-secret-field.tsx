import type { AuthSettingsFieldGroupProps } from "@/components/auth-settings/auth-settings-field-group";
import {
	MASKED_SECRET_PLACEHOLDER,
	SettingsSecretField,
} from "@/components/settings/settings-secret-field";

const CLIENT_SECRET_ID = "auth-settings-client-secret";

function clientSecretHint(props: AuthSettingsFieldGroupProps): string {
	if (!props.view.secretStorageAvailable) {
		return "服务端没有配置 SECRET_ENCRYPTION_KEY，不能加密保存密钥，所以现在不能填写。请先在服务端配置这个密钥（openssl rand -base64 32），然后刷新本页。";
	}
	if (props.values.clearClientSecret) {
		return "保存后清空 Client Secret。";
	}
	if (props.view.hasClientSecret) {
		return "已保存 Client Secret，内容不会显示。不填写就保留原值。";
	}
	return "Casdoor 应用的 Client Secret。保存时加密。";
}

export function CasdoorClientSecretField(
	props: AuthSettingsFieldGroupProps & { onToggleClear: () => void }
) {
	// 只有本地模式下可以清空 Client Secret（plan 021 §10.3）。
	const canClear =
		props.view.hasClientSecret && props.values.provider === "local";

	return (
		<SettingsSecretField
			clearRequested={props.values.clearClientSecret}
			error={null}
			hint={clientSecretHint(props)}
			id={CLIENT_SECRET_ID}
			label="Client Secret"
			onToggleClear={canClear ? props.onToggleClear : undefined}
			onValueChange={props.handlers.clientSecret}
			pending={props.pending}
			placeholder={
				props.view.hasClientSecret
					? MASKED_SECRET_PLACEHOLDER
					: "粘贴 Casdoor 应用的 Client Secret"
			}
			storageBlocked={!props.view.secretStorageAvailable}
			value={props.values.clientSecret}
		/>
	);
}
