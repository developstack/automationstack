import type { AuthSettingsFieldGroupProps } from "@/components/auth-settings/auth-settings-field-group";
import { JiraTextField } from "@/components/settings/jira-text-field";
import { SettingsSection } from "@/components/settings/settings-section";

export function CasdoorRoleFields(props: AuthSettingsFieldGroupProps) {
	return (
		<SettingsSection
			description="Casdoor 中有这个角色的用户是平台管理员，其他用户是普通成员。请使用本系统专用的角色名。"
			headingId="auth-settings-role-heading"
			title="角色映射"
		>
			<JiraTextField
				error={null}
				id="auth-settings-admin-role"
				label="管理员角色名"
				onValueChange={props.handlers.adminRole}
				pending={props.pending}
				placeholder="例如 automationstack-admin"
				type="text"
				value={props.values.adminRole}
			/>
		</SettingsSection>
	);
}
