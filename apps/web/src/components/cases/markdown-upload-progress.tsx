import { ImageIcon } from "lucide-react";

import { BarcodeProgress } from "@/components/barcode/barcode-progress";

const PERCENT = 100;

/** 一行上传进度用 20 条竖线，每条表示 5%。 */
const PROGRESS_MARKS = 20;

/** 一张图片的上传进度：文件名、条形码式进度条和百分比。等待上传时百分比为 0。 */
export function MarkdownUploadProgress({
	fileName,
	progress,
	queued,
}: {
	fileName: string;
	progress: number;
	queued: boolean;
}) {
	const percent = Math.round(progress * PERCENT);
	return (
		<div
			aria-label={`${fileName} 上传进度`}
			aria-valuemax={PERCENT}
			aria-valuemin={0}
			aria-valuenow={percent}
			className="flex min-w-0 flex-1 items-center gap-2"
			role="progressbar"
		>
			<ImageIcon
				aria-hidden="true"
				className="size-3.5 shrink-0 text-muted-foreground"
			/>
			<span className="min-w-0 truncate">{fileName}</span>
			<BarcodeProgress
				className="ml-auto w-20 shrink-0"
				maxMarks={PROGRESS_MARKS}
				segments={[
					{ fillClassName: "bg-foreground", key: "sent", value: percent },
					{
						fillClassName: "bg-muted-foreground/25",
						key: "rest",
						value: PERCENT - percent,
					},
				]}
				size="sm"
			/>
			<span className="numeric shrink-0 text-right text-muted-foreground">
				{queued ? "等待上传" : `上传中 ${percent}%`}
			</span>
		</div>
	);
}
