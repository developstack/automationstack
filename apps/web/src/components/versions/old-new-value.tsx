import { ArrowRightIcon } from "lucide-react";

import { DiffMark } from "./diff-mark.tsx";

interface OldNewValueProps {
	newText: string;
	oldText: string;
}

/** 一个字段修改前后的值：旧值带删除线，新值带下划线。 */
export function OldNewValue({ newText, oldText }: OldNewValueProps) {
	return (
		<span className="flex flex-wrap items-center gap-1.5 text-sm">
			<DiffMark className="px-1" kind="removed">
				{oldText}
			</DiffMark>
			<ArrowRightIcon
				aria-hidden="true"
				className="icon-stroke-regular size-3.5 shrink-0 text-muted-foreground"
			/>
			<DiffMark className="px-1" kind="added">
				{newText}
			</DiffMark>
		</span>
	);
}
