import type { StorageSettingsView } from "@automationstack/api/storage/settings-view";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import {
	hasStorageSettingsError,
	initialStorageSettingsValues,
	type StorageSettingsFieldErrors,
	type StorageSettingsFormValues,
	toStorageSettingsSaveInput,
	validateStorageSettingsForm,
} from "@/components/storage-settings/storage-settings-form-values";
import { orpc } from "@/utils/orpc";

const NO_ERRORS: StorageSettingsFieldErrors = {
	publicBaseUrl: null,
	r2AccessKeyId: null,
	r2Bucket: null,
	r2Endpoint: null,
	r2SecretAccessKey: null,
};

const FALLBACK_SAVE_ERROR = "保存失败，请稍后重试";

function messageOf(error: unknown): string {
	return error instanceof Error && error.message !== ""
		? error.message
		: FALLBACK_SAVE_ERROR;
}

function useSaveStorageSettings(callbacks: {
	onFailed: (message: string) => void;
	onSaved: (view: StorageSettingsView) => void;
}) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.storageSettings.save.mutationOptions({
			// 错误显示在保存按钮上方，不用 toast。
			meta: { suppressErrorToast: true },
			onError: (error) => callbacks.onFailed(messageOf(error)),
			onSuccess: (next: StorageSettingsView) => {
				queryClient.setQueryData(orpc.storageSettings.get.queryKey(), next);
				toast.success("已保存存储设置");
				callbacks.onSaved(next);
			},
		})
	);
}

export function useStorageSettingsForm(view: StorageSettingsView) {
	const [values, setValues] = useState<StorageSettingsFormValues>(() =>
		initialStorageSettingsValues(view)
	);
	const [submitted, setSubmitted] = useState(false);
	const [problem, setProblem] = useState<string | null>(null);
	const errors = validateStorageSettingsForm(values, view);
	const save = useSaveStorageSettings({
		onFailed: setProblem,
		onSaved: (next) => {
			setSubmitted(false);
			setValues(initialStorageSettingsValues(next));
		},
	});
	const { mutate } = save;

	const patch = useCallback(
		(next: Partial<StorageSettingsFormValues>) =>
			setValues((current) => ({ ...current, ...next })),
		[]
	);
	const toggleClearSecretAccessKey = useCallback(
		() =>
			setValues((current) => ({
				...current,
				clearSecretAccessKey: !current.clearSecretAccessKey,
				r2SecretAccessKey: "",
			})),
		[]
	);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			setProblem(null);
			if (!hasStorageSettingsError(errors)) {
				mutate(toStorageSettingsSaveInput(values));
			}
		},
		[errors, mutate, values]
	);

	return {
		errors: submitted ? errors : NO_ERRORS,
		handleSubmit,
		patch,
		pending: save.isPending,
		problem,
		toggleClearSecretAccessKey,
		values,
	};
}

export type StorageSettingsForm = ReturnType<typeof useStorageSettingsForm>;
