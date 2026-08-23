/**
 * 全平台唯一那份 AI provider 配置的编辑表单。
 *
 * 四格字段是一条链：provider 决定 model 的候选、也决定 base URL 的默认值，
 * 而 API Key 单独有一套「留空 = 不动」的语义（见 api-key-field.tsx）。
 */
import type { AiProviderConfigState } from "@automationstack/api/routers/ai-provider-config";
import { Button } from "@automationstack/ui/components/button";
import { useCallback } from "react";

import { ApiKeyField } from "@/components/provider/api-key-field";
import { BaseUrlField } from "@/components/provider/base-url-field";
import {
	CATALOG_HEADING_ID,
	CatalogFields,
} from "@/components/provider/catalog-fields";
import {
	type ProviderFormValues,
	validateBaseUrl,
} from "@/components/provider/provider-form-values";
import { useProviderConfigForm } from "@/components/provider/use-provider-config-form";

function useSecretHandlers(
	patch: (next: Partial<ProviderFormValues>) => void,
	clearApiKey: boolean
) {
	return {
		handleApiKey: useCallback((apiKey: string) => patch({ apiKey }), [patch]),
		handleBaseUrl: useCallback(
			(baseUrl: string) => patch({ baseUrl }),
			[patch]
		),
		// 按下「清除」的同时把已输入的内容也丢掉：两者同时提交服务端会判 400
		toggleClear: useCallback(
			() => patch({ apiKey: "", clearApiKey: !clearApiKey }),
			[clearApiKey, patch]
		),
	};
}

export function ProviderConfigForm({
	state,
}: {
	state: AiProviderConfigState;
}) {
	const form = useProviderConfigForm(state);
	const { handleSubmit, patch, pending, submitted, values } = form;
	const handlers = useSecretHandlers(patch, values.clearApiKey);

	return (
		// noValidate：原生校验气泡是英文的，跟这里的中文内联提示对不上
		<form
			className="flex flex-col gap-8"
			noValidate={true}
			onSubmit={handleSubmit}
		>
			<section
				aria-labelledby={CATALOG_HEADING_ID}
				className="flex flex-col gap-4"
			>
				<CatalogFields form={form} />
				<BaseUrlField
					error={submitted ? validateBaseUrl(values.baseUrl) : null}
					onValueChange={handlers.handleBaseUrl}
					pending={pending}
					value={values.baseUrl}
				/>
				<ApiKeyField
					clearRequested={values.clearApiKey}
					hasStoredKey={state.config?.hasApiKey ?? false}
					onToggleClear={handlers.toggleClear}
					onValueChange={handlers.handleApiKey}
					pending={pending}
					secretStorageAvailable={state.secretStorageAvailable}
					value={values.apiKey}
				/>
			</section>
			<div className="flex justify-end">
				<Button disabled={pending} type="submit">
					{pending ? "保存中…" : "保存配置"}
				</Button>
			</div>
		</form>
	);
}
