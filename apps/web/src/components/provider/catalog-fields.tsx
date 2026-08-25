/**
 * provider 与 model 两格：候选来自服务端目录，取不到时整组退化成手工填写。
 *
 * 这两格必须放在一起，因为它们是一条链：换 provider 会连带清掉 model 和
 * base URL（见 use-provider-config-form.ts 的 selectProvider）。
 */
import { Button } from "@automationstack/ui/components/button";
import { useCallback } from "react";

import { CatalogPicker } from "@/components/provider/catalog-picker";
import {
	type ProviderOption,
	useModelOptions,
	useProviderOptions,
} from "@/components/provider/provider-catalog-queries";
import { validateIdentifier } from "@/components/provider/provider-form-values";
import type { ProviderConfigForm } from "@/components/provider/use-provider-config-form";

export const CATALOG_HEADING_ID = "ai-provider-form-heading";

function providerEmptyHint(unavailable: boolean): string {
	return unavailable
		? "候选目录暂时取不到，请改用手工填写。"
		: "没有匹配的 provider，换个关键词试试。";
}

/** 只在提交过一次之后报错：一进页面就把两格标红等于劈头指责。 */
function errorOf(
	submitted: boolean,
	value: string,
	label: string
): string | null {
	return submitted ? validateIdentifier(value, label) : null;
}

function modelEmptyHint(providerId: string, unavailable: boolean): string {
	if (providerId === "") {
		return "请先选定 provider。";
	}
	return unavailable
		? "候选目录暂时取不到，请改用手工填写。"
		: "没有匹配的 model，换个关键词试试。";
}

/** 目录不可用时强制手工填写，此时切换按钮换成一句解释——它已经无处可切。 */
function CatalogHeader({
	forced,
	manual,
	onToggle,
}: {
	forced: boolean;
	manual: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			{/* 新建与编辑共用这一份表单，标题说字段本身而不是说动作 */}
			<h2 className="font-medium text-sm" id={CATALOG_HEADING_ID}>
				Provider / Model
			</h2>
			{forced ? (
				<p className="text-muted-foreground text-xs">
					候选目录暂不可用，已切换为手工填写。
				</p>
			) : (
				<Button onClick={onToggle} size="sm" type="button" variant="ghost">
					{manual ? "从目录选择" : "手工填写"}
				</Button>
			)}
		</div>
	);
}

function useCatalogHandlers(
	form: ProviderConfigForm,
	manual: boolean,
	providerOptions: ProviderOption[]
) {
	const { patch, selectProvider, values } = form;
	const handleProvider = useCallback(
		(value: string) => {
			// 手工模式是逐字符输入，拿它去查候选只会把刚填好的 base URL 反复清空
			if (manual) {
				patch({ providerId: value });
				return;
			}
			selectProvider(
				providerOptions.find((item) => item.value === value),
				value
			);
		},
		[manual, patch, providerOptions, selectProvider]
	);

	return {
		handleModel: useCallback((modelId: string) => patch({ modelId }), [patch]),
		handleModelKeyword: useCallback(
			(modelKeyword: string) => patch({ modelKeyword }),
			[patch]
		),
		handleProvider,
		handleProviderKeyword: useCallback(
			(providerKeyword: string) => patch({ providerKeyword }),
			[patch]
		),
		toggleManual: useCallback(
			() => patch({ manual: !values.manual }),
			[patch, values.manual]
		),
	};
}

export function CatalogFields({ form }: { form: ProviderConfigForm }) {
	const { pending, values } = form;
	const providers = useProviderOptions(values.providerKeyword);
	const models = useModelOptions(values.providerId, values.modelKeyword);
	const manual = values.manual || providers.unavailable;
	const handlers = useCatalogHandlers(form, manual, providers.options);

	return (
		<>
			<CatalogHeader
				forced={providers.unavailable}
				manual={manual}
				onToggle={handlers.toggleManual}
			/>
			<CatalogPicker
				disabled={pending}
				emptyHint={providerEmptyHint(providers.unavailable)}
				error={errorOf(form.submitted, values.providerId, "provider")}
				id="ai-provider-provider"
				keyword={values.providerKeyword}
				label="Provider"
				manual={manual}
				manualHint="直接填写 provider id，例如 openai、anthropic。"
				onKeywordChange={handlers.handleProviderKeyword}
				onValueChange={handlers.handleProvider}
				query={providers}
				searchLabel="搜索 provider 名称或 id"
				value={values.providerId}
			/>
			<CatalogPicker
				disabled={pending}
				emptyHint={modelEmptyHint(values.providerId, models.unavailable)}
				error={errorOf(form.submitted, values.modelId, "model")}
				id="ai-provider-model"
				keyword={values.modelKeyword}
				label="Model"
				manual={manual}
				manualHint="直接填写 model id，例如 gpt-4o-mini。"
				onKeywordChange={handlers.handleModelKeyword}
				onValueChange={handlers.handleModel}
				query={models}
				searchLabel="搜索 model 名称或 id"
				value={values.modelId}
			/>
		</>
	);
}
