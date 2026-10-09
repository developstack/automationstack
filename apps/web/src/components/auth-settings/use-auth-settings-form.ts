import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";
import { env } from "@automationstack/env/web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import {
	type AuthSettingsFieldErrors,
	type AuthSettingsFormValues,
	generateWebhookSecret,
	hasAuthSettingsError,
	initialAuthSettingsValues,
	toAuthSettingsSaveInput,
	validateAuthSettingsForm,
} from "@/components/auth-settings/auth-settings-form-values";
import { orpc } from "@/utils/orpc";

const NO_ERRORS: AuthSettingsFieldErrors = {
	issuer: null,
	organization: null,
	redirectUrl: null,
	webhookSecret: null,
};

function useFormValues(view: AuthSettingsView) {
	const [values, setValues] = useState<AuthSettingsFormValues>(() =>
		initialAuthSettingsValues(view, env.VITE_SERVER_URL)
	);
	const patch = useCallback(
		(next: Partial<AuthSettingsFormValues>) =>
			setValues((current) => ({ ...current, ...next })),
		[]
	);
	const toggleClearClientSecret = useCallback(
		() =>
			setValues((current) => ({
				...current,
				clearClientSecret: !current.clearClientSecret,
				clientSecret: "",
			})),
		[]
	);
	const toggleClearWebhookSecret = useCallback(
		() =>
			setValues((current) => ({
				...current,
				clearWebhookSecret: !current.clearWebhookSecret,
				webhookSecret: "",
			})),
		[]
	);
	const generate = useCallback(() => {
		patch({
			clearWebhookSecret: false,
			webhookSecret: generateWebhookSecret(),
		});
		toast.success("已生成 Webhook 密钥。请先复制，再保存。");
	}, [patch]);
	return {
		generate,
		patch,
		setValues,
		toggleClearClientSecret,
		toggleClearWebhookSecret,
		values,
	};
}

function useSaveAuthSettings(onSaved: (view: AuthSettingsView) => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.authSettings.save.mutationOptions({
			onSuccess: (next: AuthSettingsView) => {
				queryClient.setQueryData(orpc.authSettings.get.queryKey(), next);
				queryClient.invalidateQueries({ queryKey: orpc.auth.config.key() });
				toast.success("已保存认证设置");
				onSaved(next);
			},
		})
	);
}

export function useAuthSettingsForm(view: AuthSettingsView) {
	const form = useFormValues(view);
	const [submitted, setSubmitted] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const { setValues } = form;
	const save = useSaveAuthSettings((next) => {
		setConfirming(false);
		setSubmitted(false);
		setValues(initialAuthSettingsValues(next, env.VITE_SERVER_URL));
	});
	const errors = validateAuthSettingsForm(form.values, view.callbackPath);

	const submit = useCallback(
		() => save.mutate(toAuthSettingsSaveInput(form.values)),
		[form.values, save]
	);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			if (hasAuthSettingsError(errors)) {
				return;
			}
			if (form.values.provider !== view.provider) {
				setConfirming(true);
				return;
			}
			submit();
		},
		[errors, form.values.provider, submit, view.provider]
	);

	return {
		...form,
		cancelConfirm: useCallback(() => setConfirming(false), []),
		confirming,
		errors: submitted ? errors : NO_ERRORS,
		handleSubmit,
		pending: save.isPending,
		submit,
	};
}

export type AuthSettingsForm = ReturnType<typeof useAuthSettingsForm>;
