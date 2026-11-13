import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { RUN_SECTION_TEXT } from "@/components/test-runs/run-panel-typography";
import {
	commentFieldText,
	needsVerdictDetails,
} from "@/components/test-runs/test-run-meta";

export interface CommentDraftOptions {
	comment: string | null;
	onCommentSave: (comment: string | null) => void;
}

export function useCommentDraft({
	comment,
	onCommentSave,
}: CommentDraftOptions) {
	const [draft, setDraft] = useState(comment ?? "");

	useEffect(() => {
		setDraft(comment ?? "");
	}, [comment]);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => setDraft(event.target.value),
		[]
	);

	const handleBlur = useCallback(() => {
		const next = draft.trim() === "" ? null : draft;
		if (next !== (comment ?? null)) {
			onCommentSave(next);
		}
	}, [comment, draft, onCommentSave]);

	return { draft, handleBlur, handleChange };
}

export interface VerdictCommentFieldProps {
	draft: string;
	onBlur: () => void;
	onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	result: TestRunCaseResult;
	runCaseId: string;
}

function VerdictCommentField({
	draft,
	onBlur,
	onChange,
	result,
	runCaseId,
}: VerdictCommentFieldProps) {
	const commentText = commentFieldText(result);

	return (
		<div className="flex flex-col gap-1.5">
			<Label
				className={`${RUN_SECTION_TEXT} font-normal`}
				htmlFor="run-comment"
			>
				{commentText.label}
			</Label>
			<Textarea
				id="run-comment"
				key={runCaseId}
				onBlur={onBlur}
				onChange={onChange}
				placeholder={commentText.placeholder}
				rows={3}
				value={draft}
			/>
		</div>
	);
}

function VerdictCommentText({
	comment,
	result,
}: {
	comment: string | null;
	result: TestRunCaseResult;
}) {
	if (comment === null || comment.trim() === "") {
		return null;
	}
	return (
		<div className="flex flex-col gap-1">
			<p className={RUN_SECTION_TEXT}>{commentFieldText(result).label}</p>
			<p className="whitespace-pre-wrap text-sm">{comment}</p>
		</div>
	);
}

export interface VerdictCommentProps {
	comment: string | null;
	editable: boolean;
	onCommentSave: (comment: string | null) => void;
	result: TestRunCaseResult;
	runCaseId: string;
}

export function VerdictComment({
	comment,
	editable,
	onCommentSave,
	result,
	runCaseId,
}: VerdictCommentProps) {
	const { draft, handleBlur, handleChange } = useCommentDraft({
		comment,
		onCommentSave,
	});

	if (!editable) {
		return <VerdictCommentText comment={comment} result={result} />;
	}

	const showComment =
		needsVerdictDetails(result) || (comment ?? "") !== "" || draft !== "";
	if (!showComment) {
		return null;
	}

	return (
		<VerdictCommentField
			draft={draft}
			onBlur={handleBlur}
			onChange={handleChange}
			result={result}
			runCaseId={runCaseId}
		/>
	);
}
