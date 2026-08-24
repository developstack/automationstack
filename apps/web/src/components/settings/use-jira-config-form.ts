/**
 * Jira 配置表单的状态、保存与连通性自检。
 *
 * 初值只在挂载那一次从服务端状态取（换项目时调用方给了 key，整块重挂），
 * 之后不再跟着服务端回填：保存后重新拉到的配置若倒灌进输入框，正在改的半截
 * 内容就被冲掉。与 `use-provider-config-form.ts` 同一条约定。
 */
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
	/** 保存进行中。 */
	pending: boolean;
	/** 提交过一次之后才对空字段报错：一进页面就标红等于劈头指责。 */
	submitted: boolean;
	testPending: boolean;
	/** 最近一次自检的结果；改动任何字段都会把它清掉。 */
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

	/*
	 * 任何字段一改就把上一次的自检结果丢掉：一条「连接成功」挂在已经被改过的
	 * 站点地址旁边，说的是一件不再为真的事，比没有结果更容易误导。
	 */
	const patch = useCallback((next: Partial<JiraFormValues>) => {
		setValues((current) => ({ ...current, ...next }));
		setTestResult(null);
	}, []);

	/*
	 * 保存成功后立刻把两个密文从内存里抹掉：它们已经进库了，输入框再留着
	 * 只会让下一次「顺手改个 project key」把同一段明文重新发一遍。
	 */
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
			// 按下「清空」的同时丢掉已输入的内容：两者是互斥的三态，同时给没有意义
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
			// 失败不抑制全局 toast：PRECONDITION_FAILED（缺 SECRET_ENCRYPTION_KEY）
			// 与 BAD_REQUEST（首次配置没给 Token）的原文本身就是管理员要看的话
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
		// 带上表单里还没保存的值：填错了想先测再存是常态，让人「先存错的再测」
		// 等于逼他把一份坏配置写进库里
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
