import type { ConnectionTestResult } from "@automationstack/api/auth/casdoor/test-connection";
import type { AuthSettingsView } from "@automationstack/api/auth/settings-view";
import { env } from "@automationstack/env/web";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import {
	type AuthSettingsSaveProblem,
	authSettingsSaveProblemOf,
} from "@/components/auth-settings/auth-connection-checks-meta";
import {
	type AuthSettingsFieldErrors,
	type AuthSettingsFormValues,
	generateWebhookSecret,
	hasAuthSettingsError,
	initialAuthSettingsValues,
	toAuthSettingsSaveInput,
	validateAuthSettingsForm,
} from "@/components/auth-settings/auth-settings-form-values";
import { useAuthConnectionTest } from "@/components/auth-settings/use-auth-connection-test";
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

interface SaveCallbacks {
	onFailed: (problem: AuthSettingsSaveProblem) => void;
	onSaved: (view: AuthSettingsView) => void;
}

function useSaveAuthSettings({ onFailed, onSaved }: SaveCallbacks) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.authSettings.save.mutationOptions({
			// 错误显示在页面上（保存按钮上方和「测试连接」中），不用 toast。
			meta: { suppressErrorToast: true },
			onError: (error) => onFailed(authSettingsSaveProblemOf(error)),
			onSuccess: (next: AuthSettingsView) => {
				queryClient.setQueryData(orpc.authSettings.get.queryKey(), next);
				queryClient.invalidateQueries({ queryKey: orpc.auth.config.key() });
				toast.success("已保存认证设置");
				onSaved(next);
			},
		})
	);
}

type FormValuesState = ReturnType<typeof useFormValues>;

interface SaveFlowCallbacks {
	onSaved: () => void;
	onTestFailed: (result: ConnectionTestResult) => void;
}

/** 保存、确认对话框和保存失败的提示。 */
function useSaveFlow(form: FormValuesState, callbacks: SaveFlowCallbacks) {
	const [confirming, setConfirming] = useState(false);
	const [problem, setProblem] = useState<AuthSettingsSaveProblem | null>(null);
	const { setValues, values } = form;
	const save = useSaveAuthSettings({
		onFailed: (next) => {
			setConfirming(false);
			setProblem(next);
			if (next.kind === "test-failed") {
				callbacks.onTestFailed(next.result);
			}
		},
		onSaved: (next) => {
			setConfirming(false);
			callbacks.onSaved();
			setValues(initialAuthSettingsValues(next, env.VITE_SERVER_URL));
		},
	});
	const { mutate } = save;

	return {
		cancelConfirm: useCallback(() => setConfirming(false), []),
		clearProblem: useCallback(() => setProblem(null), []),
		confirming,
		pending: save.isPending,
		problem,
		requestConfirm: useCallback(() => setConfirming(true), []),
		submit: useCallback(() => {
			setProblem(null);
			mutate(toAuthSettingsSaveInput(values));
		}, [mutate, values]),
	};
}

/** 测试连接只需要公网地址和组织的格式正确。 */
function canTestConnection(errors: AuthSettingsFieldErrors): boolean {
	return errors.issuer === null && errors.organization === null;
}

export function useAuthSettingsForm(view: AuthSettingsView) {
	const form = useFormValues(view);
	const [submitted, setSubmitted] = useState(false);
	const connection = useAuthConnectionTest();
	const flow = useSaveFlow(form, {
		onSaved: () => setSubmitted(false),
		onTestFailed: connection.showSaveResult,
	});
	const errors = validateAuthSettingsForm(form.values, view.callbackPath);
	const { run } = connection;
	const { clearProblem, requestConfirm, submit } = flow;

	const testConnection = useCallback(() => {
		setSubmitted(true);
		if (canTestConnection(errors)) {
			run(form.values);
		}
	}, [errors, form.values, run]);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			clearProblem();
			if (hasAuthSettingsError(errors)) {
				return;
			}
			if (form.values.provider === view.provider) {
				submit();
				return;
			}
			requestConfirm();
		},
		[clearProblem, errors, form.values.provider, requestConfirm, submit, view]
	);

	return {
		...form,
		...flow,
		checks: connection.checks,
		errors: submitted ? errors : NO_ERRORS,
		handleSubmit,
		testConnection,
		testError: connection.error,
		testing: connection.testing,
	};
}

export type AuthSettingsForm = ReturnType<typeof useAuthSettingsForm>;
