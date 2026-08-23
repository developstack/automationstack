/**
 * 「现在到底是什么状态」这一屏。
 *
 * `problem` 由服务端算出，能区分「没配」「主密钥缺失」「主密钥被换过」三种，
 * 比前端自己猜准得多，所以原文照登；管理员据此才知道该去填 Key 还是去配环境变量。
 */
import type {
	AiProviderConfigState,
	AiProviderConfigView,
} from "@automationstack/api/routers/ai-provider-config";
import { TriangleAlertIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";

const HEADING_ID = "ai-provider-status-heading";

function ProblemNotice({ problem }: { problem: string }) {
	return (
		// role="status" 而不是 alert：它一进页面就在那儿，不是刚刚发生的事
		<div
			className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-xs"
			role="status"
		>
			<TriangleAlertIcon
				aria-hidden="true"
				className="mt-0.5 size-4 shrink-0"
			/>
			<div className="flex flex-col gap-1">
				<p className="font-medium">当前 AI 配置不可用</p>
				<p>{problem}</p>
			</div>
		</div>
	);
}

function MetaRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			{/* base URL 可以很长，窄屏必须允许在任意字符处断行，否则会把整页撑宽 */}
			<dd className="break-all text-xs">{value}</dd>
		</div>
	);
}

function ConfigMeta({ config }: { config: AiProviderConfigView }) {
	return (
		<dl className="grid gap-4 sm:grid-cols-2">
			<MetaRow label="Provider" value={config.providerId} />
			<MetaRow label="Model" value={config.modelId} />
			<MetaRow label="Base URL" value={config.baseUrl} />
			{/* 只说有没有：Key 的内容和长度都不会从服务端下来，这里也不该有 */}
			<MetaRow
				label="API Key"
				value={config.hasApiKey ? "已保存（不可查看）" : "未保存"}
			/>
			<MetaRow label="更新时间" value={formatDateTime(config.updatedAt)} />
			<MetaRow
				label="更新人"
				value={config.updatedByUsername ?? "未知（账号已删除）"}
			/>
		</dl>
	);
}

export function ProviderConfigStatus({
	state,
}: {
	state: AiProviderConfigState;
}) {
	return (
		<section aria-labelledby={HEADING_ID} className="flex flex-col gap-4">
			<h2 className="font-medium text-sm" id={HEADING_ID}>
				当前配置
			</h2>
			{state.problem === null ? null : (
				<ProblemNotice problem={state.problem} />
			)}
			{state.config === null ? (
				<p className="text-muted-foreground text-xs">
					还没有保存过配置。填写下面的表单后，全平台的 AI 生成都会走这一份。
				</p>
			) : (
				<ConfigMeta config={state.config} />
			)}
		</section>
	);
}
