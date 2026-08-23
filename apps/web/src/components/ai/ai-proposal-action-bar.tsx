/**
 * 评审底部操作条：采纳目标模块 + 「采纳所选 / 拒绝所选 / 重新生成」。
 * 未选目标模块时禁用采纳（acceptProposals 的 moduleId 是必填）。
 */
import { Button } from "@automationstack/ui/components/button";

import { AiModuleSelect } from "@/components/ai/ai-module-select";

export interface AiProposalActionBarProps {
	acceptPending: boolean;
	moduleId: string | undefined;
	onAccept: () => void;
	onModuleChange: (moduleId: string | undefined) => void;
	onReject: () => void;
	onRestart: () => void;
	projectId: string;
	rejectPending: boolean;
	selectedCount: number;
}

export function AiProposalActionBar(props: AiProposalActionBarProps) {
	const busy = props.acceptPending || props.rejectPending;
	const nothingSelected = props.selectedCount === 0;
	const noModule = props.moduleId === undefined;

	return (
		<div className="flex flex-wrap items-end justify-between gap-3">
			<AiModuleSelect
				disabled={busy}
				id="ai-accept-module"
				label="采纳到模块"
				moduleId={props.moduleId}
				onChange={props.onModuleChange}
				projectId={props.projectId}
			/>
			<div className="flex flex-wrap items-center gap-2">
				<Button
					disabled={busy}
					onClick={props.onRestart}
					type="button"
					variant="ghost"
				>
					重新生成
				</Button>
				<Button
					disabled={busy || nothingSelected}
					onClick={props.onReject}
					type="button"
					variant="outline"
				>
					{props.rejectPending ? "拒绝中…" : "拒绝所选"}
				</Button>
				<Button
					disabled={busy || nothingSelected || noModule}
					onClick={props.onAccept}
					title={noModule ? "请先选择采纳到的目标模块" : undefined}
					type="button"
				>
					{props.acceptPending
						? "采纳中…"
						: `采纳所选 (${props.selectedCount})`}
				</Button>
			</div>
		</div>
	);
}
