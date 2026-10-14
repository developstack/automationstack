import { cn } from "@automationstack/ui/lib/utils";
import { ArrowRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { DiffMark } from "./diff-mark.tsx";

interface OldNewValueProps {
	/** 值本身是统一状态标签时为 true：不加底色，旧值变淡 */
	badge?: boolean;
	newValue: ReactNode;
	oldValue: ReactNode;
}

/**
 * 一个字段修改前后的值：旧值带删除线，新值带下划线，中间是箭头。
 * 用例状态和优先级的值是统一状态标签，标签内的文字不继承删除线，所以旧值变淡来区分。
 */
export function OldNewValue({
	badge = false,
	newValue,
	oldValue,
}: OldNewValueProps) {
	const markClass = badge ? "bg-transparent px-0" : "px-1";
	return (
		<span className="flex flex-wrap items-center gap-1.5 text-sm">
			<DiffMark className={cn(markClass, badge && "opacity-60")} kind="removed">
				{oldValue}
			</DiffMark>
			<ArrowRightIcon
				aria-hidden="true"
				className="icon-stroke-regular size-3.5 shrink-0 text-muted-foreground"
			/>
			<DiffMark className={markClass} kind="added">
				{newValue}
			</DiffMark>
		</span>
	);
}
