import {
	Toolbar,
	ToolbarButton,
	ToolbarSeparator,
} from "@automationstack/ui/components/toolbar";
import {
	LocateFixedIcon,
	MaximizeIcon,
	MinimizeIcon,
	MinusIcon,
	PlusIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { HintTooltip } from "@/components/interaction/hint-tooltip";
import type { MindmapFullscreen } from "./mindmap-fullscreen.ts";

type ScaleListener = (scale: number) => void;

/** 工具栏用到的 mind-elixir 实例的部分。测试用同样形状的假对象。 */
export interface MindmapToolbarViewport {
	bus: {
		addListener: (event: "scale", listener: ScaleListener) => void;
		removeListener: (event: "scale", listener: ScaleListener) => void;
	};
	scale: (next: number) => void;
	scaleMax: number;
	scaleMin: number;
	scaleSensitivity: number;
	scaleVal: number;
	toCenter: () => void;
}

interface MindmapToolbarProps {
	fullscreen: MindmapFullscreen;
	viewport: MindmapToolbarViewport;
}

const PERCENT = 100;

/** 按步长缩放后的比例。取两位小数，避免 1.3 + 0.1 超过最大比例 1.4。 */
function stepScale(viewport: MindmapToolbarViewport, direction: 1 | -1) {
	const next = viewport.scaleVal + direction * viewport.scaleSensitivity;
	return Math.round(next * PERCENT) / PERCENT;
}

function canStep(viewport: MindmapToolbarViewport, direction: 1 | -1) {
	const next = stepScale(viewport, direction);
	return direction === 1
		? next <= viewport.scaleMax
		: next >= viewport.scaleMin;
}

function useViewportScale(viewport: MindmapToolbarViewport): number {
	const [scale, setScale] = useState(viewport.scaleVal);
	useEffect(() => {
		setScale(viewport.scaleVal);
		viewport.bus.addListener("scale", setScale);
		return () => viewport.bus.removeListener("scale", setScale);
	}, [viewport]);
	return scale;
}

interface CommandButtonProps {
	children: ReactNode;
	disabled?: boolean;
	label: string;
	onClick: () => void;
}

function CommandButton({
	children,
	disabled = false,
	label,
	onClick,
}: CommandButtonProps) {
	return (
		<HintTooltip label={label}>
			<ToolbarButton aria-label={label} disabled={disabled} onClick={onClick}>
				{children}
			</ToolbarButton>
		</HintTooltip>
	);
}

/** 画布右下角的浮动工具栏：缩放一组（缩小、比例、放大），视图一组（回到中心、全屏）。 */
export function MindmapToolbar({ fullscreen, viewport }: MindmapToolbarProps) {
	const scale = useViewportScale(viewport);
	const zoomOut = useCallback(
		() => viewport.scale(stepScale(viewport, -1)),
		[viewport]
	);
	const zoomIn = useCallback(
		() => viewport.scale(stepScale(viewport, 1)),
		[viewport]
	);
	const center = useCallback(() => viewport.toCenter(), [viewport]);

	return (
		<Toolbar
			aria-label="脑图视图"
			className="absolute right-3 bottom-3 z-20 rounded-lg border bg-popover p-1 text-popover-foreground shadow-popover"
			data-testid="mindmap-toolbar"
		>
			<CommandButton
				disabled={!canStep(viewport, -1)}
				label="缩小"
				onClick={zoomOut}
			>
				<MinusIcon />
			</CommandButton>
			<span className="numeric w-11 select-none text-center text-muted-foreground text-xs">
				{Math.round(scale * PERCENT)}%
			</span>
			<CommandButton
				disabled={!canStep(viewport, 1)}
				label="放大"
				onClick={zoomIn}
			>
				<PlusIcon />
			</CommandButton>
			<ToolbarSeparator />
			<CommandButton label="回到中心" onClick={center}>
				<LocateFixedIcon />
			</CommandButton>
			<CommandButton
				label={fullscreen.active ? "退出全屏" : "全屏"}
				onClick={fullscreen.toggle}
			>
				{fullscreen.active ? <MinimizeIcon /> : <MaximizeIcon />}
			</CommandButton>
		</Toolbar>
	);
}
