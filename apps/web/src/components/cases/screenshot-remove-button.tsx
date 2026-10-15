import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { XIcon } from "lucide-react";

/** 悬停或聚焦缩略图时才显示的控件，例如删除按钮。外层元素需要 group 类。 */
const HOVER_REVEAL_CLASS =
	"opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100";

interface ScreenshotRemoveButtonProps {
	disabled?: boolean;
	onClick: () => void;
}

/** 缩略图右上角的删除按钮，悬停或聚焦缩略图时显示。 */
export function ScreenshotRemoveButton({
	disabled = false,
	onClick,
}: ScreenshotRemoveButtonProps) {
	return (
		<Button
			aria-label="删除截图"
			className={cn("absolute top-1 right-1", HOVER_REVEAL_CLASS)}
			disabled={disabled}
			onClick={onClick}
			size="icon-xs"
			type="button"
			variant="secondary"
		>
			<XIcon />
		</Button>
	);
}
