import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";
import { Button } from "@automationstack/ui/components/button";

import { AuthConnectionChecks } from "@/components/auth-settings/auth-connection-checks";
import { AuthCredentialNotice } from "@/components/auth-settings/auth-credential-notice";
import { AuthProviderField } from "@/components/auth-settings/auth-provider-field";
import { AuthSaveProblemNotice } from "@/components/auth-settings/auth-save-problem-notice";
import { useAuthFieldHandlers } from "@/components/auth-settings/auth-settings-field-group";
import { AuthSettingsStatus } from "@/components/auth-settings/auth-settings-status";
import { CasdoorConnectionFields } from "@/components/auth-settings/casdoor-connection-fields";
import { CasdoorRoleFields } from "@/components/auth-settings/casdoor-role-fields";
import { CasdoorWebhookFields } from "@/components/auth-settings/casdoor-webhook-fields";
import { ProviderChangeDialog } from "@/components/auth-settings/provider-change-dialog";
import {
	type AuthSettingsForm as AuthSettingsFormState,
	useAuthSettingsForm,
} from "@/components/auth-settings/use-auth-settings-form";

/** 测试连接、保存失败的提示、保存按钮和切换认证方式的确认对话框。 */
function AuthSettingsSaveArea({ form }: { form: AuthSettingsFormState }) {
	return (
		<>
			<AuthConnectionChecks
				checks={form.checks}
				error={form.testError}
				onTest={form.testConnection}
				pending={form.pending}
				testing={form.testing}
			/>
			{form.problem === null ? null : (
				<AuthSaveProblemNotice problem={form.problem} />
			)}
			<div className="flex justify-end">
				<Button disabled={form.pending} type="submit">
					{form.pending ? "保存中…" : "保存"}
				</Button>
			</div>
			<ProviderChangeDialog
				onCancel={form.cancelConfirm}
				onConfirm={form.submit}
				open={form.confirming}
				pending={form.pending}
				target={form.values.provider}
			/>
		</>
	);
}

export function AuthSettingsForm({ view }: { view: AuthSettingsView }) {
	const form = useAuthSettingsForm(view);
	const handlers = useAuthFieldHandlers(form.patch);
	const fieldProps = {
		errors: form.errors,
		handlers,
		pending: form.pending,
		values: form.values,
		view,
	};

	return (
		<form
			className="flex flex-col gap-8"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<AuthSettingsStatus view={view} />
			{view.credentialProblem === null ? null : (
				<AuthCredentialNotice reason={view.credentialProblem} />
			)}
			<AuthProviderField {...fieldProps} />
			<CasdoorConnectionFields
				{...fieldProps}
				onToggleClearClientSecret={form.toggleClearClientSecret}
			/>
			<CasdoorRoleFields {...fieldProps} />
			<CasdoorWebhookFields
				{...fieldProps}
				onGenerate={form.generate}
				onToggleClear={form.toggleClearWebhookSecret}
			/>
			<AuthSettingsSaveArea form={form} />
		</form>
	);
}
