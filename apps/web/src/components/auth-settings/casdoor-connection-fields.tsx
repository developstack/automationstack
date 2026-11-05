import type { AuthSettingsFieldGroupProps } from "@/components/auth-settings/auth-settings-field-group";
import { AuthUrlField } from "@/components/auth-settings/auth-url-field";
import { CasdoorClientSecretField } from "@/components/auth-settings/casdoor-client-secret-field";
import { SettingsSection } from "@/components/settings/settings-section";
import { SettingsTextField } from "@/components/settings/settings-text-field";

type ConnectionProps = AuthSettingsFieldGroupProps & {
	onToggleClearClientSecret: () => void;
};

function CasdoorAddressFields(props: AuthSettingsFieldGroupProps) {
	return (
		<>
			<SettingsTextField
				error={props.errors.issuer}
				id="auth-settings-issuer"
				label="公网地址"
				onValueChange={props.handlers.issuer}
				pending={props.pending}
				placeholder="https://casdoor.example.com"
				type="url"
				value={props.values.issuer}
			/>
			<AuthUrlField
				copyLabel="集群内地址"
				hint="只能在环境变量 CASDOOR_INTERNAL_URL 中设置。服务端用它读取 Casdoor 的发现文档和换取 token。"
				id="auth-settings-internal-url"
				label="集群内地址（只读）"
				placeholder="没有配置"
				value={props.view.internalUrl ?? ""}
			/>
		</>
	);
}

function CasdoorClientFields(props: ConnectionProps) {
	return (
		<>
			<SettingsTextField
				error={props.errors.organization}
				id="auth-settings-organization"
				label="组织"
				onValueChange={props.handlers.organization}
				pending={props.pending}
				placeholder="例如 automationstack，不能是 built-in"
				type="text"
				value={props.values.organization}
			/>
			<SettingsTextField
				error={null}
				id="auth-settings-client-id"
				label="Client ID"
				onValueChange={props.handlers.clientId}
				pending={props.pending}
				placeholder="Casdoor 应用的 Client ID"
				type="text"
				value={props.values.clientId}
			/>
			<CasdoorClientSecretField
				{...props}
				onToggleClear={props.onToggleClearClientSecret}
			/>
		</>
	);
}

export function CasdoorConnectionFields(props: ConnectionProps) {
	return (
		<SettingsSection
			description="Casdoor 应用的连接参数。现在可以先填写保存，Casdoor 模式实现后使用。"
			headingId="auth-settings-casdoor-heading"
			title="Casdoor 连接"
		>
			<CasdoorAddressFields {...props} />
			<CasdoorClientFields {...props} />
			<AuthUrlField
				copyLabel="回调地址"
				error={props.errors.redirectUrl}
				hint={`在 Casdoor 应用的回调地址中填写同一个地址，两边必须完全相同。地址必须以 ${props.view.callbackPath} 结尾。`}
				id="auth-settings-redirect-url"
				label="回调地址"
				onValueChange={props.handlers.redirectUrl}
				pending={props.pending}
				value={props.values.redirectUrl}
			/>
		</SettingsSection>
	);
}
