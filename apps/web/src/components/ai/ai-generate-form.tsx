/**
 * 输入阶段：目标模块 + 需求描述（≤4000 字，带计数）。
 * AI 未配置时这里给引导文案，而不是抛红色报错。
 *
 * 生效口径（见 packages/ai/src/config-store.ts）：生成入口只读
 * AI_BASE_URL / AI_API_KEY / AI_MODEL 环境变量；/ai-provider 那张登记表
 * 是给 agent 侧配置预备的，登记了也不会立刻改变生成行为。所以这段引导
 * 同时指两条路：现在就要用 → 配环境变量；提前备案 → 去登记页登记。
 */
import { Button } from "@automationstack/ui/components/button";
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import { Link } from "@tanstack/react-router";
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
				生成入口目前只读取服务端环境变量（AI_BASE_URL / AI_API_KEY /
				AI_MODEL）。管理员可以先在
				{/* 正文里的链接必须自带下划线：只靠颜色区分不够 */}
				<Link className="underline underline-offset-4" to="/ai-provider">
					AI 配置登记页
				</Link>
				登记 Provider，待 agent
				侧配置上线后即可选用；在此之前请配置上述环境变量。
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
