/**
 * 登记表单（新建/编辑共用）的状态与保存动作。
 *
 * 初值只在挂载那一次取：编辑时来自那一行视图，新建时全空。挂载之后不再跟着
 * 服务端回填：保存后重新拉到的列表若倒灌进输入框，管理员正在改的半截内容就
 * 会被冲掉。抽屉按目标 key 重新挂载本表单，换一行编辑自然换一份初值。
 */
import type { AiProviderConfigView } from "@automationstack/api/routers/ai-provider-config";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";
import { toast } from "sonner";

import type { ProviderOption } from "@/components/provider/provider-catalog-queries";
import {
	initialFormValues,
	isFormValid,
	type ProviderFormValues,
	type ProviderSaveInput,
	toSaveInput,
} from "@/components/provider/provider-form-values";
import { orpc } from "@/utils/orpc";

export interface ProviderConfigForm {
	handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
	patch: (next: Partial<ProviderFormValues>) => void;
	pending: boolean;
	selectProvider: (option: ProviderOption | undefined, value: string) => void;
	/** 提交过一次之后才对空字段报错：一进表单就标红等于劈头指责。 */
	submitted: boolean;
	values: ProviderFormValues;
}

function useFormValues(config: AiProviderConfigView | null) {
	const [values, setValues] = useState<ProviderFormValues>(() =>
		initialFormValues(config)
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
	 * 保存成功后抽屉即关、本组件卸载，内存里的明文随 useState 一起消失——
	 * 不需要旧页面那套「保存后手动抹 Key」：那套是为了表单常驻页面时
	 * 防止「顺手改个 model」把同一段明文重新发一遍，抽屉结构天然避免了它。
	 */
	return { patch, selectProvider, values };
}

/**
 * 新建与更新是两个过程（输入只差一个 id），但成功后的动作完全一样：
 * 失效列表查询、报一句 toast、关抽屉（表单随卸载销毁，内存里的明文一并消失）。
 * 两个 useMutation 都无条件调用（hooks 规则），按 config 挑一个用。
 */
function useSaveConfig(
	config: AiProviderConfigView | null,
	onSaved: () => void
) {
	const queryClient = useQueryClient();
	const onSuccess = useCallback(
		(view: AiProviderConfigView) => {
			queryClient.invalidateQueries({
				queryKey: orpc.aiProviderConfig.list.key(),
			});
			toast.success(
				`${config === null ? "已登记" : "已保存"}：${view.providerId} / ${view.modelId}`
			);
			onSaved();
		},
		[config, onSaved, queryClient]
	);
	const create = useMutation(
		orpc.aiProviderConfig.create.mutationOptions({ onSuccess })
	);
	const update = useMutation(
		orpc.aiProviderConfig.update.mutationOptions({ onSuccess })
	);
	return config === null
		? {
				mutate: (input: ProviderSaveInput) => create.mutate(input),
				pending: create.isPending,
			}
		: {
				mutate: (input: ProviderSaveInput) =>
					update.mutate({ ...input, id: config.id }),
				pending: update.isPending,
			};
}

export function useProviderConfigForm(
	config: AiProviderConfigView | null,
	onSaved: () => void
): ProviderConfigForm {
	const { patch, selectProvider, values } = useFormValues(config);
	const [submitted, setSubmitted] = useState(false);
	const save = useSaveConfig(config, onSaved);

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
		pending: save.pending,
		selectProvider,
		submitted,
		values,
	};
}
