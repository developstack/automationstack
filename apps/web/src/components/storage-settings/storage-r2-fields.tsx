import type { StorageSettingsView } from "@automationstack/api/storage/settings-view";
import { useCallback } from "react";

import {
	MASKED_SECRET_PLACEHOLDER,
	SettingsSecretField,
} from "@/components/settings/settings-secret-field";
import { SettingsSection } from "@/components/settings/settings-section";
import { SettingsTextField } from "@/components/settings/settings-text-field";
import type {
	StorageSettingsFieldErrors,
	StorageSettingsFormValues,
} from "@/components/storage-settings/storage-settings-form-values";

type TextFieldName = Exclude<
	keyof StorageSettingsFormValues,
	"backend" | "clearSecretAccessKey"
>;

export interface StorageR2FieldsProps {
	errors: StorageSettingsFieldErrors;
	onChange: (next: Partial<StorageSettingsFormValues>) => void;
	onToggleClearSecret: () => void;
	pending: boolean;
	values: StorageSettingsFormValues;
	view: StorageSettingsView;
}

interface TextFieldSpec {
	label: string;
	name: Exclude<TextFieldName, "r2SecretAccessKey">;
	placeholder: string;
	type: "text" | "url";
}

const CONNECTION_FIELDS: readonly TextFieldSpec[] = [
	{
		label: "Endpoint",
		name: "r2Endpoint",
		placeholder: "https://<account id>.r2.cloudflarestorage.com",
		type: "url",
	},
	{
		label: "Bucket",
		name: "r2Bucket",
		placeholder: "automationstack",
		type: "text",
	},
	{
		label: "Access Key ID",
		name: "r2AccessKeyId",
		placeholder: "",
		type: "text",
	},
];

const PUBLIC_BASE_URL_FIELD: TextFieldSpec = {
	label: "用例图片的公开基础地址（可选）",
	name: "publicBaseUrl",
	placeholder: "https://img.example.com",
	type: "url",
};

function useFieldChange(
	onChange: StorageR2FieldsProps["onChange"],
	name: TextFieldName
): (value: string) => void {
	return useCallback(
		(value: string) => onChange({ [name]: value }),
		[name, onChange]
	);
}

function R2TextField({
	props,
	spec,
}: {
	props: StorageR2FieldsProps;
	spec: TextFieldSpec;
}) {
	const handleChange = useFieldChange(props.onChange, spec.name);
	return (
		<SettingsTextField
			error={props.errors[spec.name]}
			id={`storage-${spec.name}`}
			label={spec.label}
			onValueChange={handleChange}
			pending={props.pending}
			placeholder={spec.placeholder}
			type={spec.type}
			value={props.values[spec.name]}
		/>
	);
}

function secretHint(view: StorageSettingsView): string {
	if (!view.secretStorageAvailable) {
		return "服务端没有配置 SECRET_ENCRYPTION_KEY，不能保存密钥。";
	}
	return view.hasSecretAccessKey
		? "已保存。留空表示不修改。"
		: "在 Cloudflare 的 R2 API Token 中取得。";
}

function R2SecretField({ props }: { props: StorageR2FieldsProps }) {
	const handleChange = useFieldChange(props.onChange, "r2SecretAccessKey");
	const stored = props.view.hasSecretAccessKey;
	return (
		<SettingsSecretField
			clearRequested={props.values.clearSecretAccessKey}
			error={props.errors.r2SecretAccessKey}
			hint={secretHint(props.view)}
			id="storage-r2SecretAccessKey"
			label="Secret Access Key"
			onToggleClear={stored ? props.onToggleClearSecret : undefined}
			onValueChange={handleChange}
			pending={props.pending}
			placeholder={stored ? MASKED_SECRET_PLACEHOLDER : ""}
			storageBlocked={!props.view.secretStorageAvailable}
			value={props.values.r2SecretAccessKey}
		/>
	);
}

export function StorageR2Fields(props: StorageR2FieldsProps) {
	return (
		<SettingsSection
			description="切换到服务器本地后，这些值仍然保留，用于查看以前上传到 R2 的文件。"
			headingId="storage-settings-r2-heading"
			title="Cloudflare R2"
		>
			{CONNECTION_FIELDS.map((spec) => (
				<R2TextField key={spec.name} props={props} spec={spec} />
			))}
			<R2SecretField props={props} />
			<div className="flex flex-col gap-2">
				<R2TextField props={props} spec={PUBLIC_BASE_URL_FIELD} />
				<p className="text-muted-foreground text-xs">
					bucket 的自定义域名。设置后，用例图片使用不过期的公开链接，Cloudflare
					可以缓存它；任何人拿到链接都可以看到图片。留空时使用 15
					分钟的签名链接。
				</p>
			</div>
		</SettingsSection>
	);
}
