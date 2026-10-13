import { useCallback } from "react";

import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import {
	buildCaseUploadingRef,
	listCaseUploadingTokens,
	replaceCaseImageRef,
} from "@/components/cases/case-upload-placeholder";
import { MarkdownUploadFailure } from "@/components/cases/markdown-upload-failure";
import { MarkdownUploadProgress } from "@/components/cases/markdown-upload-progress";
import type { CaseUploadJob } from "@/components/cases/use-case-upload-jobs";

const ROW_CLASS =
	"flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/30 px-2 py-1 text-xs";

/** 占位还在文字中，但没有上传任务：例如从草稿恢复，或者上传时页面关闭过。 */
const INTERRUPTED_FILE_NAME = "未完成的图片";
const INTERRUPTED_REASON = "上传已中断，请移除后重新粘贴";

interface UploadRowProps {
	job: CaseUploadJob | undefined;
	onRemoveRef: (token: string) => void;
	token: string;
}

function UploadRow({ job, onRemoveRef, token }: UploadRowProps) {
	const { discardUpload, retryUpload } = useCaseAttachments();
	const handleRetry = useCallback(
		() => retryUpload(token),
		[retryUpload, token]
	);
	const handleRemove = useCallback(() => {
		if (job === undefined) {
			onRemoveRef(token);
			return;
		}
		discardUpload(token);
	}, [discardUpload, job, onRemoveRef, token]);

	if (job === undefined || job.status === "failed") {
		return (
			<li className={ROW_CLASS}>
				<MarkdownUploadFailure
					fileName={job?.fileName ?? INTERRUPTED_FILE_NAME}
					onRemove={handleRemove}
					onRetry={job?.retryable ? handleRetry : undefined}
					reason={job?.reason ?? INTERRUPTED_REASON}
				/>
			</li>
		);
	}
	return (
		<li className={ROW_CLASS}>
			<MarkdownUploadProgress
				fileName={job.fileName}
				progress={job.progress}
				queued={job.status === "queued"}
			/>
		</li>
	);
}

interface MarkdownFieldUploadsProps {
	onChange: (value: string) => void;
	text: string;
}

/**
 * 编辑区下方的上传列表：只列出本字段文字中的图片。
 * 上传中显示条形码式进度条，失败时显示原因、「重试」和「移除」。
 */
export function MarkdownFieldUploads({
	onChange,
	text,
}: MarkdownFieldUploadsProps) {
	const { uploads } = useCaseAttachments();
	const removeRef = useCallback(
		(token: string) =>
			onChange(replaceCaseImageRef(text, buildCaseUploadingRef(token), "")),
		[onChange, text]
	);
	const tokens = listCaseUploadingTokens(text);
	if (tokens.length === 0) {
		return null;
	}
	return (
		<ul aria-label="图片上传" className="flex flex-col gap-1">
			{tokens.map((token) => (
				<UploadRow
					job={uploads.get(token)}
					key={token}
					onRemoveRef={removeRef}
					token={token}
				/>
			))}
		</ul>
	);
}
