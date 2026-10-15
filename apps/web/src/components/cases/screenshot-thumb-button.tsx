import { cn } from "@automationstack/ui/lib/utils";
import { type MouseEvent, useCallback } from "react";

function ThumbImage({ url }: { url: string | null }) {
	if (url === null) {
		return null;
	}
	return (
		<img
			alt=""
			className="size-full object-cover"
			height={90}
			src={url}
			width={120}
		/>
	);
}

interface ScreenshotThumbButtonProps {
	className?: string;
	fileName: string;
	index: number;
	onOpen: (index: number, origin: HTMLElement) => void;
	url: string | null;
}

/** 步骤截图的缩略图：固定 120×90，点击或按 Enter 放大查看。编辑区和只读视图共用。 */
export function ScreenshotThumbButton({
	className,
	fileName,
	index,
	onOpen,
	url,
}: ScreenshotThumbButtonProps) {
	const open = useCallback(
		(event: MouseEvent<HTMLButtonElement>) =>
			onOpen(index, event.currentTarget),
		[index, onOpen]
	);
	return (
		<button
			aria-label={`放大查看 ${fileName}`}
			className={cn(
				"block h-22.5 w-30 overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className
			)}
			onClick={open}
			type="button"
		>
			<ThumbImage url={url} />
		</button>
	);
}
