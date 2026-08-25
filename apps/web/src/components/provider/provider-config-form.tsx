/**
 * 登记表单本体：provider / model / base URL / API Key 四格是一条链——
 * provider 决定 model 的候选、也决定 base URL 的默认值，而 API Key 单独有
 * 一套「留空 = 不动」的语义（见 api-key-field.tsx）。新建与编辑共用这一份，
 * 差别只在初值（一行视图 vs 全空）和提交走哪个过程。
 *
 * 这一层自带滚动字段区 + 底部按钮区，但不含抽屉外壳（见
 * provider-config-drawer.tsx）。提交按钮在表单外、通过 form 属性挂进表单：
 * 按钮留在底部语义层，字段区才能独自滚动。
 */
import type { AiProviderConfigView } from "@automationstack/api/routers/ai-provider-config";
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

const FORM_ID = "ai-provider-config-form";

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

export interface ProviderConfigFormProps {
	/** 编辑目标的那一行视图；null = 新建。 */
	config: AiProviderConfigView | null;
	onCancel: () => void;
	onSaved: () => void;
	/** 主密钥是否就绪；false 时保存 API Key 会被拒，输入框先禁掉。 */
	secretStorageAvailable: boolean;
}

/** 抽屉底部的按钮区：取消关抽屉，保存通过 form 属性提交上面的表单。 */
function ProviderConfigFormFooter({
	onCancel,
	pending,
}: {
	onCancel: () => void;
	pending: boolean;
}) {
	return (
		<div className="border-t p-4">
			<div className="flex justify-end gap-2">
				<Button
					disabled={pending}
					onClick={onCancel}
					type="button"
					variant="outline"
				>
					取消
				</Button>
				<Button disabled={pending} form={FORM_ID} type="submit">
					{pending ? "保存中…" : "保存"}
				</Button>
			</div>
		</div>
	);
}

export function ProviderConfigForm({
	config,
	onCancel,
	onSaved,
	secretStorageAvailable,
}: ProviderConfigFormProps) {
	const form = useProviderConfigForm(config, onSaved);
	const { handleSubmit, patch, pending, submitted, values } = form;
	const handlers = useSecretHandlers(patch, values.clearApiKey);

	return (
		<>
			{/*
			 * noValidate：原生校验气泡是英文的，跟这里的中文内联提示对不上。
			 * flex-1 + overflow-y-auto：字段区独自滚动，底部按钮钉在抽屉底。
			 */}
			<form
				className="flex flex-1 flex-col overflow-y-auto px-4 pb-4"
				id={FORM_ID}
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
						hasStoredKey={config?.hasApiKey ?? false}
						onToggleClear={handlers.toggleClear}
						onValueChange={handlers.handleApiKey}
						pending={pending}
						secretStorageAvailable={secretStorageAvailable}
						value={values.apiKey}
					/>
				</section>
			</form>
			<ProviderConfigFormFooter onCancel={onCancel} pending={pending} />
		</>
	);
}
