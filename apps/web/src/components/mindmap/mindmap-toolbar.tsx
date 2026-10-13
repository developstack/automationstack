import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	LocateFixedIcon,
	MaximizeIcon,
	MinimizeIcon,
	MinusIcon,
	PlusIcon,
} from "lucide-react";
import {
	Fragment,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useState,
} from "react";

import { useRovingIndex } from "@/components/use-roving-index";

type ScaleListener = (scale: number) => void;

/** 工具栏用到的 mind-elixir 实例的部分。 */
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

export interface MindmapFullscreen {
	active: boolean;
	supported: boolean;
	toggle: () => void;
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

interface ToolbarCommand {
	disabled: boolean;
	icon: ReactNode;
	label: string;
	run: () => void;
}

interface ToolbarButtonProps {
	command: ToolbarCommand;
	index: number;
	isActive: boolean;
	onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
	onRegister: (index: number, node: HTMLButtonElement | null) => void;
}

function ToolbarButton({
	command,
	index,
	isActive,
	onKeyDown,
	onRegister,
}: ToolbarButtonProps) {
	const handleRef = useCallback(
		(node: HTMLButtonElement | null) => onRegister(index, node),
		[index, onRegister]
	);
	return (
		<Button
			aria-label={command.label}
			disabled={command.disabled}
			focusableWhenDisabled
			onClick={command.run}
			onKeyDown={onKeyDown}
			ref={handleRef}
			size="icon-sm"
			tabIndex={isActive ? 0 : -1}
			title={command.label}
			type="button"
			variant="ghost"
		>
			{command.icon}
		</Button>
	);
}

function buildCommands(
	viewport: MindmapToolbarViewport,
	fullscreen: MindmapFullscreen
): ToolbarCommand[] {
	const commands: ToolbarCommand[] = [
		{
			disabled: !canStep(viewport, -1),
			icon: <MinusIcon />,
			label: "缩小",
			run: () => viewport.scale(stepScale(viewport, -1)),
		},
		{
			disabled: !canStep(viewport, 1),
			icon: <PlusIcon />,
			label: "放大",
			run: () => viewport.scale(stepScale(viewport, 1)),
		},
		{
			disabled: false,
			icon: <LocateFixedIcon />,
			label: "回到中心",
			run: () => viewport.toCenter(),
		},
	];
	if (fullscreen.supported) {
		commands.push({
			disabled: false,
			icon: fullscreen.active ? <MinimizeIcon /> : <MaximizeIcon />,
			label: fullscreen.active ? "退出全屏" : "全屏",
			run: fullscreen.toggle,
		});
	}
	return commands;
}

/** 缩放按钮之后显示比例，回到中心之前有分隔线。 */
const SCALE_LABEL_AFTER = 0;
const SEPARATOR_BEFORE = 2;

/** 画布右下角的浮动工具栏：缩小、放大、回到中心和全屏。 */
export function MindmapToolbar({ fullscreen, viewport }: MindmapToolbarProps) {
	const scale = useViewportScale(viewport);
	const commands = buildCommands(viewport, fullscreen);
	const { activeIndex, handleKeyDown, register } = useRovingIndex(
		commands.length
	);

	return (
		<div
			aria-label="脑图视图"
			className="absolute right-3 bottom-3 z-20 flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-popover"
			data-testid="mindmap-toolbar"
			role="toolbar"
		>
			{commands.map((command, index) => (
				<Fragment key={command.label}>
					{index === SEPARATOR_BEFORE ? (
						<Separator
							className="mx-1 h-4 data-vertical:self-center"
							orientation="vertical"
						/>
					) : null}
					<ToolbarButton
						command={command}
						index={index}
						isActive={index === activeIndex}
						onKeyDown={handleKeyDown}
						onRegister={register}
					/>
					{index === SCALE_LABEL_AFTER ? (
						<span className="numeric w-11 select-none text-center text-muted-foreground text-xs">
							{Math.round(scale * PERCENT)}%
						</span>
					) : null}
				</Fragment>
			))}
		</div>
	);
}
