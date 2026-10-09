import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";
import { Button } from "@automationstack/ui/components/button";

import { AuthCredentialNotice } from "@/components/auth-settings/auth-credential-notice";
import { AuthProviderField } from "@/components/auth-settings/auth-provider-field";
import { useAuthFieldHandlers } from "@/components/auth-settings/auth-settings-field-group";
import { AuthSettingsStatus } from "@/components/auth-settings/auth-settings-status";
import { CasdoorConnectionFields } from "@/components/auth-settings/casdoor-connection-fields";
import { CasdoorRoleFields } from "@/components/auth-settings/casdoor-role-fields";
import { CasdoorWebhookFields } from "@/components/auth-settings/casdoor-webhook-fields";
import { ProviderChangeDialog } from "@/components/auth-settings/provider-change-dialog";
import { useAuthSettingsForm } from "@/components/auth-settings/use-auth-settings-form";

// 「测试连接」在阶段 3 实现（plan 021 §10.6 第 6 项），这里还没有这个按钮。

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
		</form>
	);
}
