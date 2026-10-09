import { type ChangeEvent, useCallback } from "react";

import type { AuthSettingsFieldGroupProps } from "@/components/auth-settings/auth-settings-field-group";
import type { AuthProviderValue } from "@/components/auth-settings/auth-settings-form-values";
import { SettingsSection } from "@/components/settings/settings-section";

interface ProviderOption {
	description: string;
	label: string;
	value: AuthProviderValue;
}

const OPTIONS: readonly ProviderOption[] = [
	{
		description: "用户用本系统的用户名和密码登录。",
		label: "本地",
		value: "local",
	},
	{
		description: "用户在 Casdoor 中登录。尚未实现，现在不能选择。",
		label: "Casdoor（尚未实现）",
		value: "casdoor",
	},
];

const RADIO_NAME = "auth-settings-provider";

export function AuthProviderField(props: AuthSettingsFieldGroupProps) {
	const { provider: onProviderChange } = props.handlers;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			onProviderChange(event.target.value === "casdoor" ? "casdoor" : "local"),
		[onProviderChange]
	);
	const isDisabled = (value: AuthProviderValue) =>
		props.pending || (value === "casdoor" && !props.view.casdoorSelectable);

	return (
		<SettingsSection
			description="选择用户的登录方式。保存后立即生效，不需要重启服务。"
			headingId="auth-settings-provider-heading"
			title="认证方式"
		>
			<fieldset className="flex flex-col gap-3">
				<legend className="sr-only">认证方式</legend>
				{OPTIONS.map((option) => (
					<label
						className="flex items-start gap-2 text-sm has-disabled:opacity-50"
						key={option.value}
					>
						<input
							aria-describedby={`${RADIO_NAME}-${option.value}-hint`}
							checked={props.values.provider === option.value}
							className="mt-1"
							disabled={isDisabled(option.value)}
							name={RADIO_NAME}
							onChange={handleChange}
							type="radio"
							value={option.value}
						/>
						<span className="flex flex-col gap-1">
							<span>{option.label}</span>
							<span
								className="text-muted-foreground text-xs"
								id={`${RADIO_NAME}-${option.value}-hint`}
							>
								{option.description}
							</span>
						</span>
					</label>
				))}
			</fieldset>
		</SettingsSection>
	);
}
