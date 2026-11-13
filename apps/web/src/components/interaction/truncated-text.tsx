import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { cn } from "@automationstack/ui/lib/utils";
import { type ComponentProps, useCallback, useRef, useState } from "react";

type TooltipOpenChange = NonNullable<
	ComponentProps<typeof Tooltip>["onOpenChange"]
>;

interface TruncatedTextProps {
	className?: string;
	text: string;
}

function isTruncated(element: HTMLElement | null): boolean {
	return element !== null && element.scrollWidth > element.clientWidth;
}

/**
 * 单行文字，放不下时截断。鼠标悬停时，只有文字被截断才用 Tooltip 显示全文。
 * 文字完整显示时没有提示。聚焦和点击不打开提示（#58）。
 */
export function TruncatedText({ className, text }: TruncatedTextProps) {
	const textRef = useRef<HTMLSpanElement>(null);
	const [open, setOpen] = useState(false);
	const handleOpenChange = useCallback<TooltipOpenChange>((next, details) => {
		setOpen(
			next && details.reason === "trigger-hover" && isTruncated(textRef.current)
		);
	}, []);

	return (
		<Tooltip onOpenChange={handleOpenChange} open={open}>
			<TooltipTrigger
				render={
					<span className={cn("min-w-0 truncate", className)} ref={textRef} />
				}
			>
				{text}
			</TooltipTrigger>
			<TooltipContent className="break-all">{text}</TooltipContent>
		</Tooltip>
	);
}
