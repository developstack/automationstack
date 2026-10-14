import type { ReactNode } from "react";

interface SnapshotFieldProps {
	children: ReactNode;
	label: string;
}

/** 快照查看和版本对比中的一个字段：左侧是小标签，右侧是值。 */
export function SnapshotField({ children, label }: SnapshotFieldProps) {
	return (
		<div className="flex min-h-10 items-center gap-3 py-2">
			<dt className="eyebrow w-16 shrink-0">{label}</dt>
			<dd className="min-w-0 flex-1 break-words text-sm">{children}</dd>
		</div>
	);
}
