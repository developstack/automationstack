import { type ChangeEvent, useCallback } from "react";

import { SettingsSection } from "@/components/settings/settings-section";
import {
	BACKEND_LABELS,
	type StorageBackendValue,
} from "@/components/storage-settings/storage-settings-form-values";

const DESCRIPTIONS: Record<StorageBackendValue, string> = {
	local:
		"文件写在 server 的本地目录中，不需要其他服务。只能运行一个 server 实例，目录必须在持久卷上，并且要定期备份。",
	r2: "文件写在 Cloudflare R2 中。保存前，服务端测试能否访问 bucket。",
};

const OPTIONS: readonly StorageBackendValue[] = ["local", "r2"];

const RADIO_NAME = "storage-settings-backend";

function BackendOption({
	checked,
	onChange,
	option,
	pending,
}: {
	checked: boolean;
	onChange: (event: ChangeEvent<HTMLInputElement>) => void;
	option: StorageBackendValue;
	pending: boolean;
}) {
	const hintId = `${RADIO_NAME}-${option}-hint`;
	return (
		<label className="flex items-start gap-2 text-sm has-disabled:opacity-50">
			<input
				aria-describedby={hintId}
				checked={checked}
				className="mt-1"
				disabled={pending}
				name={RADIO_NAME}
				onChange={onChange}
				type="radio"
				value={option}
			/>
			<span className="flex flex-col gap-1">
				<span>{BACKEND_LABELS[option]}</span>
				<span className="text-muted-foreground text-xs" id={hintId}>
					{DESCRIPTIONS[option]}
				</span>
			</span>
		</label>
	);
}

export function StorageBackendField({
	onChange,
	pending,
	value,
}: {
	onChange: (value: StorageBackendValue) => void;
	pending: boolean;
	value: StorageBackendValue;
}) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			onChange(event.target.value === "r2" ? "r2" : "local"),
		[onChange]
	);

	return (
		<SettingsSection
			description="新上传的图片和附件写到这里。以前上传的文件留在原来的位置，仍然可以查看。保存后立即生效，不需要重启服务。"
			headingId="storage-settings-backend-heading"
			title="存储方式"
		>
			<fieldset className="flex flex-col gap-3">
				<legend className="sr-only">存储方式</legend>
				{OPTIONS.map((option) => (
					<BackendOption
						checked={value === option}
						key={option}
						onChange={handleChange}
						option={option}
						pending={pending}
					/>
				))}
			</fieldset>
		</SettingsSection>
	);
}
