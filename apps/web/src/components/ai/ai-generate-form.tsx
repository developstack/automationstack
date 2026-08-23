/**
 * 输入阶段：目标模块 + 需求描述（≤4000 字，带计数）。
 * AI 未配置时这里给引导文案，而不是抛红色报错。
 *
 * 这段引导刻意不再点名 AI_BASE_URL 那几个环境变量：配置的真相已经搬到数据库，
 * 环境变量只剩兜底，且服务端的 SERVICE_UNAVAILABLE 里已经带着确切原因
 * （没配 / 主密钥缺失 / 主密钥被换过）。这里只有一个 unavailable 布尔量，
 * 拿不到那句原文——要把它显示出来得让 ai-generation-state 把 message 留住，
 * 那是这次改动范围之外的事。
 */
import { Button } from "@automationstack/ui/components/button";
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import { SparklesIcon } from "lucide-react";
import { type ChangeEvent, useCallback } from "react";

import { AiModuleSelect } from "@/components/ai/ai-module-select";

/** 与 packages/api routers/ai.ts 的 REQUIREMENT_MAX_LENGTH 保持一致。 */
const MAX_REQUIREMENT_LENGTH = 4000;
const REQUIREMENT_ROWS = 6;

function AiUnavailableNotice() {
	return (
		<div className="flex flex-col gap-1 rounded-lg border border-dashed p-3 text-xs">
			<p className="font-medium">AI 未配置</p>
			<p className="text-muted-foreground">
				平台的 AI provider / model / base URL / API Key 还没配好。管理员可在
				「AI 配置」页填写，保存后立即生效，不需要重启服务。
			</p>
		</div>
	);
}

export interface AiGenerateFormProps {
	moduleId: string | undefined;
	onModuleChange: (moduleId: string | undefined) => void;
	onRequirementChange: (requirement: string) => void;
	onSubmit: () => void;
	pending: boolean;
	projectId: string;
	requirement: string;
	unavailable: boolean;
}

export function AiGenerateForm(props: AiGenerateFormProps) {
	const { onRequirementChange } = props;
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
			onRequirementChange(event.target.value),
		[onRequirementChange]
	);
	const canSubmit = props.requirement.trim() !== "" && !props.pending;

	return (
		<div className="flex flex-col gap-4">
			{props.unavailable ? <AiUnavailableNotice /> : null}
			<AiModuleSelect
				disabled={props.pending}
				id="ai-target-module"
				label="目标模块"
				moduleId={props.moduleId}
				onChange={props.onModuleChange}
				projectId={props.projectId}
			/>
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="ai-requirement">需求描述</Label>
					<span className="text-muted-foreground text-xs">
						{props.requirement.length} / {MAX_REQUIREMENT_LENGTH}
					</span>
				</div>
				<Textarea
					className="min-h-32"
					id="ai-requirement"
					maxLength={MAX_REQUIREMENT_LENGTH}
					onChange={handleChange}
					placeholder="例如：为登录功能生成用例，覆盖正常流、密码错误、连续失败锁定等场景"
					rows={REQUIREMENT_ROWS}
					value={props.requirement}
				/>
			</div>
			<div className="flex justify-end">
				<Button disabled={!canSubmit} onClick={props.onSubmit} type="button">
					<SparklesIcon data-icon="inline-start" />
					{props.pending ? "生成中…" : "开始生成"}
				</Button>
			</div>
		</div>
	);
}
