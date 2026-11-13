import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import type { ReactElement, ReactNode } from "react";

interface HintTooltipProps {
	/** 触发提示的元素，例如图标按钮。Tooltip 把自己的属性合并到这个元素上。 */
	children: ReactElement;
	label: ReactNode;
}

/** 悬停或聚焦时用 Tooltip 显示说明。不要用原生 title 属性。 */
export function HintTooltip({ children, label }: HintTooltipProps) {
	return (
		<Tooltip>
			<TooltipTrigger render={children} />
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
