import { useCallback } from "react";

import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import { listCaseUploadingTokens } from "@/components/cases/case-upload-placeholder";
import { MarkdownUploadFailure } from "@/components/cases/markdown-upload-failure";
import { MarkdownUploadProgress } from "@/components/cases/markdown-upload-progress";
import type { CaseUploadJob } from "@/components/cases/use-case-upload-jobs";

const ROW_CLASS =
	"flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/30 px-2 py-1 text-xs";

/** 占位还在文字中，但没有上传任务：例如从草稿恢复，或者上传时页面关闭过。 */
const INTERRUPTED_FILE_NAME = "未完成的图片";
const INTERRUPTED_REASON = "上传已中断，请移除后重新粘贴";

interface FieldUploadActions {
	/** 从字段的文字中删掉一个没有上传任务的占位。 */
	onRemoveRef: (token: string) => void;
	/** 重试或移除时先把焦点放回编辑区：按钮随后会消失，焦点不会落到页面上，编辑区也不会关闭。 */
	onReturnFocus: () => void;
}

interface UploadRowProps extends FieldUploadActions {
	job: CaseUploadJob | undefined;
	token: string;
}

function UploadRow({ job, onReturnFocus, onRemoveRef, token }: UploadRowProps) {
	const { discardUpload, retryUpload } = useCaseAttachments();
	const handleRetry = useCallback(() => {
		onReturnFocus();
		retryUpload(token);
	}, [onReturnFocus, retryUpload, token]);
	const handleRemove = useCallback(() => {
		onReturnFocus();
		if (job === undefined) {
			onRemoveRef(token);
			return;
		}
		discardUpload(token);
	}, [discardUpload, job, onReturnFocus, onRemoveRef, token]);

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

interface MarkdownFieldUploadsProps extends FieldUploadActions {
	text: string;
}

/**
 * 编辑区下方的上传列表：只列出本字段文字中的图片。
 * 上传中显示条形码式进度条，失败时显示原因、「重试」和「移除」。
 */
export function MarkdownFieldUploads({
	onReturnFocus,
	onRemoveRef,
	text,
}: MarkdownFieldUploadsProps) {
	const { uploads } = useCaseAttachments();
	// 同一个占位被复制到多处时只列一次
	const tokens = [...new Set(listCaseUploadingTokens(text))];
	if (tokens.length === 0) {
		return null;
	}
	return (
		<ul aria-label="图片上传" className="flex flex-col gap-1">
			{tokens.map((token) => (
				<UploadRow
					job={uploads.get(token)}
					key={token}
					onRemoveRef={onRemoveRef}
					onReturnFocus={onReturnFocus}
					token={token}
				/>
			))}
		</ul>
	);
}
