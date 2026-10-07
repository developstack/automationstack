import type {
	JiraConfigState,
	JiraConnectionTestResult,
} from "@automationstack/api/routers/jira";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import {
	hasJiraCredentialError,
	hasJiraFieldError,
	initialJiraFormValues,
	type JiraFieldErrors,
	type JiraFormValues,
	toJiraSaveInput,
	toJiraTestCredentials,
	validateJiraForm,
} from "@/components/settings/jira-form-values";
import { orpc } from "@/utils/orpc";

export interface JiraConfigForm {
	errors: JiraFieldErrors;
	handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
	handleTest: () => void;
	patch: (next: Partial<JiraFormValues>) => void;
	pending: boolean;
	submitted: boolean;
	testPending: boolean;
	testResult: JiraConnectionTestResult | null;
	toggleClearWebhookSecret: () => void;
	values: JiraFormValues;
}

function useFormValues(state: JiraConfigState) {
	const [values, setValues] = useState<JiraFormValues>(() =>
		initialJiraFormValues(state.config)
	);
	const [testResult, setTestResult] = useState<JiraConnectionTestResult | null>(
		null
	);

	const patch = useCallback((next: Partial<JiraFormValues>) => {
		setValues((current) => ({ ...current, ...next }));
		setTestResult(null);
	}, []);

	const forgetSecrets = useCallback(
		() =>
			setValues((current) => ({
				...current,
				apiToken: "",
				clearWebhookSecret: false,
				webhookSecret: "",
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

	return {
		forgetSecrets,
		patch,
		setTestResult,
		testResult,
		toggleClearWebhookSecret,
		values,
	};
}

function useSaveConfig(projectId: string, onSaved: () => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.jira.upsertConfig.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: orpc.jira.getConfig.key({ input: { projectId } }),
				});
				toast.success("已保存 Jira 配置");
				onSaved();
			},
		})
	);
}

export function useJiraConfigForm(
	projectId: string,
	state: JiraConfigState
): JiraConfigForm {
	const form = useFormValues(state);
	const [submitted, setSubmitted] = useState(false);
	const save = useSaveConfig(projectId, form.forgetSecrets);
	const hasStoredApiToken = state.config?.hasApiToken ?? false;
	const errors = validateJiraForm(form.values, hasStoredApiToken);

	const { setTestResult } = form;
	const test = useMutation(
		orpc.jira.testConnection.mutationOptions({
			onSuccess: (result: JiraConnectionTestResult) => setTestResult(result),
		})
	);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			if (hasJiraFieldError(validateJiraForm(form.values, hasStoredApiToken))) {
				return;
			}
			save.mutate(toJiraSaveInput(form.values, projectId));
		},
		[form.values, hasStoredApiToken, projectId, save]
	);

	const handleTest = useCallback(() => {
		setSubmitted(true);
		const current = validateJiraForm(form.values, hasStoredApiToken);
		if (hasJiraCredentialError(current)) {
			return;
		}
		test.mutate({
			credentials: toJiraTestCredentials(form.values),
			projectId,
		});
	}, [form.values, hasStoredApiToken, projectId, test]);

	return {
		errors,
		handleSubmit,
		handleTest,
		patch: form.patch,
		pending: save.isPending,
		submitted,
		testPending: test.isPending,
		testResult: form.testResult,
		toggleClearWebhookSecret: form.toggleClearWebhookSecret,
		values: form.values,
	};
}
