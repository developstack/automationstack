import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { type ChangeEvent, useCallback, useMemo } from "react";

import { parseMarkdownDoc } from "@/components/cases/markdown-doc";
import type { MarkdownInline } from "@/components/cases/markdown-inline";
import {
	InlineNodes,
	type MarkdownImageUrls,
} from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import { TEXT_FLOW_CLASS } from "@/components/cases/markdown-text-flow";
import { RunCaseResultBadge } from "@/components/test-runs/run-case-result-badge";
import { StepCardFooter } from "@/components/test-runs/step-card-footer";

function StepResultBadge({
	result,
}: {
	result: TestRunStepResult | undefined;
}) {
	if (result === undefined) {
		return (
			<span className="rounded-md bg-muted px-1.5 py-0.5 font-normal text-muted-foreground text-xs">
				未判定
			</span>
		);
	}
	return <RunCaseResultBadge result={result} size="sm" />;
}

function soleParagraphNodes(text: string): MarkdownInline[] | null {
	const blocks = parseMarkdownDoc(text);
	if (blocks.length > 1) {
		return null;
	}
	const [only] = blocks;
	if (only === undefined) {
		return [];
	}
	return only.kind === "paragraph" ? only.children : null;
}

function StepCardBody({
	imageUrls,
	step,
}: {
	imageUrls: MarkdownImageUrls;
	step: CaseStep;
}) {
	const inlineNodes = useMemo(
		() => soleParagraphNodes(step.expected),
		[step.expected]
	);
	return (
		<>
			<div className="text-foreground">
				<MarkdownRender imageUrls={imageUrls} text={step.step} />
			</div>
			{inlineNodes === null ? (
				<div className="mt-1 space-y-1 text-muted-foreground text-xs leading-relaxed">
					<p>预期：</p>
					<MarkdownRender
						imageUrls={imageUrls}
						text={step.expected}
						textSize="xs"
					/>
				</div>
			) : (
				<p
					className={`mt-1 text-muted-foreground text-xs leading-relaxed ${TEXT_FLOW_CLASS}`}
				>
					预期：
					<InlineNodes imageUrls={imageUrls} nodes={inlineNodes} />
				</p>
			)}
		</>
	);
}

export interface RunStepCardProps {
	comment: string;
	editing: boolean;
	imageUrls: MarkdownImageUrls;
	index: number;
	onCommentChange: (stepId: string, text: string) => void;
	onPick: (stepId: string, result: TestRunStepResult) => void;
	result: TestRunStepResult | undefined;
	step: CaseStep;
}

export function RunStepCard({
	comment,
	editing,
	imageUrls,
	index,
	onCommentChange,
	onPick,
	result,
	step,
}: RunStepCardProps) {
	const handleCommentChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
			onCommentChange(step.id, event.target.value),
		[onCommentChange, step.id]
	);

	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle className="flex items-center justify-between gap-2">
					<span className="text-muted-foreground tabular-nums">
						步骤 {index + 1}
					</span>
					<StepResultBadge result={result} />
				</CardTitle>
			</CardHeader>
			<CardContent>
				<StepCardBody imageUrls={imageUrls} step={step} />
				<StepCardFooter
					comment={comment}
					editing={editing}
					index={index}
					onCommentChange={handleCommentChange}
					onPick={onPick}
					result={result}
					stepId={step.id}
				/>
			</CardContent>
		</Card>
	);
}
