import { Button } from "@automationstack/ui/components/button";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

interface LightboxArrowProps {
	direction: "next" | "previous";
	disabled: boolean;
	onClick: () => void;
}

/**
 * 图片两边的切换按钮。在第一个和最后一个时不能使用，但仍可聚焦：
 * 按钮失去焦点时焦点会离开弹窗，← 和 → 就不再起作用。
 */
function LightboxArrow({ direction, disabled, onClick }: LightboxArrowProps) {
	const isNext = direction === "next";
	return (
		<Button
			aria-label={isNext ? "下一个" : "上一个"}
			disabled={disabled}
			focusableWhenDisabled={true}
			onClick={onClick}
			size="icon"
			type="button"
			variant="outline"
		>
			{isNext ? <ChevronRightIcon /> : <ChevronLeftIcon />}
		</Button>
	);
}

interface MediaLightboxStageProps {
	children: ReactNode;
	count: number;
	index: number;
	onNext: () => void;
	onPrevious: () => void;
}

/** 当前文件和两边的切换按钮。只有一个文件时不显示切换按钮。 */
export function MediaLightboxStage({
	children,
	count,
	index,
	onNext,
	onPrevious,
}: MediaLightboxStageProps) {
	const hasSeveral = count > 1;
	return (
		<div className="flex items-center gap-2">
			{hasSeveral ? (
				<LightboxArrow
					direction="previous"
					disabled={index === 0}
					onClick={onPrevious}
				/>
			) : null}
			<div className="min-w-0 flex-1">{children}</div>
			{hasSeveral ? (
				<LightboxArrow
					direction="next"
					disabled={index >= count - 1}
					onClick={onNext}
				/>
			) : null}
		</div>
	);
}
