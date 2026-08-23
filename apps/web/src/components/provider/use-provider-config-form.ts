/**
 * 配置表单的状态与保存动作。
 *
 * 初值只在挂载那一次从服务端状态取（组件由 suspense 查询喂进来，数据一定已就绪），
 * 之后不再跟着服务端回填：保存后重新拉到的配置若倒灌进输入框，管理员正在改的
 * 半截内容就会被冲掉。
 */
import type {
	AiProviderConfigState,
	AiProviderConfigView,
} from "@automationstack/api/routers/ai-provider-config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import type { ProviderOption } from "@/components/provider/provider-catalog-queries";
import {
	initialFormValues,
	isFormValid,
	type ProviderFormValues,
	toSaveInput,
} from "@/components/provider/provider-form-values";
import { orpc } from "@/utils/orpc";

export interface ProviderConfigForm {
	handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
	patch: (next: Partial<ProviderFormValues>) => void;
	pending: boolean;
	selectProvider: (option: ProviderOption | undefined, value: string) => void;
	/** 提交过一次之后才对空字段报错：一进页面就标红等于劈头指责。 */
	submitted: boolean;
	values: ProviderFormValues;
}

function useFormValues(state: AiProviderConfigState) {
	const [values, setValues] = useState<ProviderFormValues>(() =>
		initialFormValues(state)
	);

	const patch = useCallback(
		(next: Partial<ProviderFormValues>) =>
			setValues((current) => ({ ...current, ...next })),
		[]
	);

	/*
	 * 换 provider 时 base URL 跟着换成新 provider 的默认端点，没有默认值的就清空。
	 * 不能留着上一个 provider 的地址——那等于把新填的 API Key 发去一个不相干的域名。
	 * model 同理必须清掉：model id 只在自己那个 provider 下有意义。
	 */
	const selectProvider = useCallback(
		(option: ProviderOption | undefined, value: string) =>
			setValues((current) => ({
				...current,
				baseUrl: option?.defaultBaseUrl ?? "",
				modelId: "",
				modelKeyword: "",
				providerId: value,
			})),
		[]
	);

	/*
	 * 保存成功后立刻把 Key 从内存里抹掉：它已经进了数据库，输入框再留着它
	 * 只会让下一次「顺手改个 model」把同一段明文重新发一遍。
	 */
	const forgetSecret = useCallback(
		() =>
			setValues((current) => ({ ...current, apiKey: "", clearApiKey: false })),
		[]
	);

	return { forgetSecret, patch, selectProvider, values };
}

function useSaveConfig(onSaved: () => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.aiProviderConfig.save.mutationOptions({
			// 失败不抑制全局 toast：那条 toast 就是 sonner，且 PRECONDITION_FAILED
			// 的原文（缺 SECRET_ENCRYPTION_KEY）本身就是管理员要看的话
			onSuccess: (config: AiProviderConfigView) => {
				queryClient.invalidateQueries({
					queryKey: orpc.aiProviderConfig.get.key(),
				});
				toast.success(`已保存：${config.providerId} / ${config.modelId}`);
				onSaved();
			},
		})
	);
}

export function useProviderConfigForm(
	state: AiProviderConfigState
): ProviderConfigForm {
	const { forgetSecret, patch, selectProvider, values } = useFormValues(state);
	const [submitted, setSubmitted] = useState(false);
	const save = useSaveConfig(forgetSecret);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			if (!isFormValid(values)) {
				return;
			}
			save.mutate(toSaveInput(values));
		},
		[save, values]
	);

	return {
		handleSubmit,
		patch,
		pending: save.isPending,
		selectProvider,
		submitted,
		values,
	};
}
