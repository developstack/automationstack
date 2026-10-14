import { Button } from "@automationstack/ui/components/button";
import { CircleAlertIcon } from "lucide-react";

interface MarkdownUploadFailureProps {
	fileName: string;
	onRemove: () => void;
	/** 不能重试时（例如附件存储未配置）不传，只显示「移除」。 */
	onRetry?: () => void;
	reason: string;
}

/** 一张图片上传失败：文件名、原因、「重试」和「移除」。 */
export function MarkdownUploadFailure({
	fileName,
	onRemove,
	onRetry,
	reason,
}: MarkdownUploadFailureProps) {
	return (
		<>
			<CircleAlertIcon
				aria-hidden="true"
				className="size-3.5 shrink-0 text-destructive"
			/>
			<span className="min-w-0 truncate">{fileName}</span>
			<span className="min-w-0 text-destructive">{reason}</span>
			<span className="ml-auto flex shrink-0 gap-1">
				{onRetry === undefined ? null : (
					<Button
						aria-label={`重试上传 ${fileName}`}
						onClick={onRetry}
						size="xs"
						type="button"
						variant="outline"
					>
						重试
					</Button>
				)}
				<Button
					aria-label={`移除 ${fileName}`}
					onClick={onRemove}
					size="xs"
					type="button"
					variant="ghost"
				>
					移除
				</Button>
			</span>
		</>
	);
}
