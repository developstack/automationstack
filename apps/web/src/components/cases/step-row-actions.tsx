import { Button } from "@automationstack/ui/components/button";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	EyeIcon,
	EyeOffIcon,
	XIcon,
} from "lucide-react";
import { HintTooltip } from "@/components/interaction/hint-tooltip";

interface StepMoveButtonsProps {
	canMoveDown: boolean;
	canMoveUp: boolean;
	onMoveDown: () => void;
	onMoveUp: () => void;
	position: number;
}

function StepMoveButtons({
	canMoveDown,
	canMoveUp,
	onMoveDown,
	onMoveUp,
	position,
}: StepMoveButtonsProps) {
	return (
		<>
			<Button
				aria-label={`第 ${position} 步上移`}
				disabled={!canMoveUp}
				onClick={onMoveUp}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<ArrowUpIcon />
			</Button>
			<Button
				aria-label={`第 ${position} 步下移`}
				disabled={!canMoveDown}
				onClick={onMoveDown}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<ArrowDownIcon />
			</Button>
		</>
	);
}

interface StepRowActionsProps {
	canMoveDown: boolean;
	canMoveUp: boolean;
	index: number;
	onMoveDown: () => void;
	onMoveUp: () => void;
	onRemove: () => void;
	onTogglePreview: () => void;
	previewOpen: boolean;
}

export function StepRowActions(props: StepRowActionsProps) {
	const position = props.index + 1;
	const previewLabel = props.previewOpen
		? `收起第 ${position} 步预览`
		: `展开第 ${position} 步预览`;
	return (
		<div className="flex justify-end gap-1 sm:flex-col sm:justify-start sm:pt-1">
			<HintTooltip label={previewLabel}>
				<Button
					aria-expanded={props.previewOpen}
					aria-label={previewLabel}
					onClick={props.onTogglePreview}
					size="icon-xs"
					type="button"
					variant="ghost"
				>
					{props.previewOpen ? <EyeOffIcon /> : <EyeIcon />}
				</Button>
			</HintTooltip>
			<StepMoveButtons
				canMoveDown={props.canMoveDown}
				canMoveUp={props.canMoveUp}
				onMoveDown={props.onMoveDown}
				onMoveUp={props.onMoveUp}
				position={position}
			/>
			<HintTooltip label={`删除第 ${position} 步`}>
				<Button
					aria-label={`删除第 ${position} 步`}
					className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20"
					onClick={props.onRemove}
					size="icon-xs"
					type="button"
					variant="ghost"
				>
					<XIcon />
				</Button>
			</HintTooltip>
		</div>
	);
}
