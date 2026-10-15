import { Button } from "@automationstack/ui/components/button";
import { CircleAlertIcon } from "lucide-react";
import { useCallback } from "react";

import type { ScreenshotView } from "@/components/cases/step-screenshot-thumb";

interface StepScreenshotFailureProps {
	onRemove: (id: string) => void;
	onRetry: (id: string) => void;
	shot: ScreenshotView;
}

/** 上传失败的步骤截图：错误标记、「重试」和「移除」。 */
export function StepScreenshotFailure({
	shot,
	onRemove,
	onRetry,
}: StepScreenshotFailureProps) {
	const retry = useCallback(() => onRetry(shot.id), [onRetry, shot.id]);
	const remove = useCallback(() => onRemove(shot.id), [onRemove, shot.id]);
	return (
		<div className="absolute inset-x-0 bottom-0 flex items-center gap-1 rounded-b-md bg-background/90 p-1">
			<CircleAlertIcon
				aria-label={`上传失败：${shot.error ?? "未知原因"}`}
				className="size-3.5 shrink-0 text-destructive"
				role="img"
			/>
			<Button
				aria-label={`重试上传 ${shot.fileName}`}
				onClick={retry}
				size="xs"
				type="button"
				variant="outline"
			>
				重试
			</Button>
			<Button
				aria-label={`移除 ${shot.fileName}`}
				onClick={remove}
				size="xs"
				type="button"
				variant="ghost"
			>
				移除
			</Button>
		</div>
	);
}
