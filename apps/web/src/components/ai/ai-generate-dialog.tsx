/**
 * AI 生成用例对话框：输入 → 流式 → 评审 三阶段容器。
 *
 * 对话框关闭时整个 body 卸载，进行中的生成会被 abort；已产出的提案在
 * 后端已落库，重新打开时经 sessionStorage 里的 sessionId 恢复到评审阶段。
 */
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { useCallback, useEffect, useState } from "react";

import { AiGenerateForm } from "@/components/ai/ai-generate-form";
import { AiProposalList } from "@/components/ai/ai-proposal-list";
import { AiStreamView } from "@/components/ai/ai-stream-view";
import {
	type AiGeneration,
	useAiGeneration,
} from "@/components/ai/use-ai-generation";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface StreamingActionsProps {
	isRunning: boolean;
	onBack: () => void;
	onStop: () => void;
}

function StreamingActions({
	isRunning,
	onBack,
	onStop,
}: StreamingActionsProps) {
	return (
		<div className="flex justify-end gap-2">
			{isRunning ? (
				<Button onClick={onStop} type="button" variant="outline">
					停止生成
				</Button>
			) : (
				<Button onClick={onBack} type="button" variant="outline">
					返回修改需求
				</Button>
			)}
		</div>
	);
}

interface AiGenerateBodyProps {
	defaultModuleId: string | undefined;
	projectId: string;
}

function AiGenerateBody({ defaultModuleId, projectId }: AiGenerateBodyProps) {
	const generation = useAiGeneration(projectId);
	const [moduleId, setModuleId] = useState(defaultModuleId);
	const [requirement, setRequirement] = useState("");
	const { restore, sessionModuleId, start } = generation;

	useEffect(() => {
		restore();
	}, [restore]);

	useEffect(() => {
		if (sessionModuleId !== null) {
			setModuleId(sessionModuleId);
		}
	}, [sessionModuleId]);

	const handleSubmit = useCallback(
		() => start({ moduleId, requirement }),
		[moduleId, requirement, start]
	);

	if (generation.phase === "input") {
		return (
			<AiGenerateForm
				moduleId={moduleId}
				onModuleChange={setModuleId}
				onRequirementChange={setRequirement}
				onSubmit={handleSubmit}
				pending={generation.isRunning}
				projectId={projectId}
				requirement={requirement}
				unavailable={generation.unavailable}
			/>
		);
	}

	return (
		<AiGenerateProgress
			generation={generation}
			moduleId={moduleId}
			onModuleChange={setModuleId}
			projectId={projectId}
		/>
	);
}

interface AiGenerateProgressProps {
	generation: AiGeneration;
	moduleId: string | undefined;
	onModuleChange: (moduleId: string | undefined) => void;
	projectId: string;
}

/** 流式阶段与评审阶段共用的进度区（评审时保留本轮的思考记录）。 */
function AiGenerateProgress(props: AiGenerateProgressProps) {
	const { generation } = props;

	return (
		<div className="flex flex-col gap-4">
			<AiStreamView
				error={generation.error}
				isRunning={generation.isRunning}
				status={generation.status}
				textStore={generation.textStore}
				toolCalls={generation.toolCalls}
			/>
			{generation.phase === "streaming" ? (
				<StreamingActions
					isRunning={generation.isRunning}
					onBack={generation.reset}
					onStop={generation.stop}
				/>
			) : (
				<AiProposalList
					moduleId={props.moduleId}
					onModuleChange={props.onModuleChange}
					onRestart={generation.reset}
					onStatusChange={generation.markProposals}
					projectId={props.projectId}
					proposals={generation.proposals}
				/>
			)}
		</div>
	);
}

export interface AiGenerateDialogProps {
	/** 默认目标模块，取自 URL 里当前选中的模块。 */
	moduleId: string | undefined;
	onClose: () => void;
	open: boolean;
	projectId: string;
}

export function AiGenerateDialog(props: AiGenerateDialogProps) {
	const handleOpenChange = useCloseOnDismiss(props.onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={props.open}>
			<DialogContent className="max-h-svh overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>AI 生成用例</DialogTitle>
					<DialogDescription>
						描述需求后由 AI
						读取模块与已有用例，产出用例提案；勾选采纳后以草稿状态入库。
					</DialogDescription>
				</DialogHeader>
				{props.open ? (
					<AiGenerateBody
						defaultModuleId={props.moduleId}
						projectId={props.projectId}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
