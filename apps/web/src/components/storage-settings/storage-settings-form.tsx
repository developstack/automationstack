import type { StorageSettingsView } from "@automationstack/api/storage/settings-view";
import { Button } from "@automationstack/ui/components/button";
import { useCallback } from "react";

import { StorageBackendField } from "@/components/storage-settings/storage-backend-field";
import { StorageR2Fields } from "@/components/storage-settings/storage-r2-fields";
import type { StorageBackendValue } from "@/components/storage-settings/storage-settings-form-values";
import { StorageSettingsNotice } from "@/components/storage-settings/storage-settings-notice";
import { StorageSettingsStatus } from "@/components/storage-settings/storage-settings-status";
import { useStorageSettingsForm } from "@/components/storage-settings/use-storage-settings-form";

const CREDENTIAL_PROBLEMS: Record<
	NonNullable<StorageSettingsView["credentialProblem"]>,
	string
> = {
	"master-key-missing":
		"服务端没有配置 SECRET_ENCRYPTION_KEY，已保存的 Secret Access Key 不能解密。配置这个环境变量后即可恢复。",
	undecryptable:
		"主密钥已更换，已保存的 Secret Access Key 不能解密。请重新填写它并保存。",
};

export function StorageSettingsForm({ view }: { view: StorageSettingsView }) {
	const form = useStorageSettingsForm(view);
	const { patch } = form;
	const changeBackend = useCallback(
		(backend: StorageBackendValue) => patch({ backend }),
		[patch]
	);

	return (
		<form
			className="flex flex-col gap-8"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<StorageSettingsStatus view={view} />
			{view.credentialProblem === null ? null : (
				<StorageSettingsNotice role="status" title="已保存的 R2 密钥不可用">
					{CREDENTIAL_PROBLEMS[view.credentialProblem]}
				</StorageSettingsNotice>
			)}
			<StorageBackendField
				onChange={changeBackend}
				pending={form.pending}
				value={form.values.backend}
			/>
			{form.values.backend === "r2" ? (
				<StorageR2Fields
					errors={form.errors}
					onChange={patch}
					onToggleClearSecret={form.toggleClearSecretAccessKey}
					pending={form.pending}
					values={form.values}
					view={view}
				/>
			) : null}
			{form.problem === null ? null : (
				<StorageSettingsNotice role="alert" title="没有保存">
					{form.problem}
				</StorageSettingsNotice>
			)}
			<div className="flex justify-end">
				<Button disabled={form.pending} type="submit">
					{form.pending ? "保存中…" : "保存"}
				</Button>
			</div>
		</form>
	);
}
