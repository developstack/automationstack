import { ArrowRightIcon } from "lucide-react";

import { ADDED_TEXT_CLASS, REMOVED_TEXT_CLASS } from "./text-diff.tsx";

interface OldNewValueProps {
	newText: string;
	oldText: string;
}

export function OldNewValue({ newText, oldText }: OldNewValueProps) {
	return (
		<span className="flex flex-wrap items-center gap-1.5 text-xs">
			<del className={REMOVED_TEXT_CLASS}>{oldText}</del>
			<ArrowRightIcon
				aria-hidden="true"
				className="icon-stroke-regular size-3 shrink-0 text-muted-foreground"
			/>
			<ins className={ADDED_TEXT_CLASS}>{newText}</ins>
		</span>
	);
}
