import type { ReactNode } from "react";

interface BigNumberProps {
	caption?: ReactNode;
	unit: string;
	value: string;
}

/** 大数字：一个大字号的数字，带单位和一行小字说明。 */
export function BigNumber({ caption, unit, value }: BigNumberProps) {
	return (
		<div className="flex flex-col gap-1">
			<p className="flex items-baseline gap-1.5">
				<span className="numeric font-medium text-4xl tracking-tight">
					{value}
				</span>
				<span className="text-muted-foreground text-sm">{unit}</span>
			</p>
			{caption === undefined ? null : (
				<div className="text-muted-foreground text-xs">{caption}</div>
			)}
		</div>
	);
}
