import { Skeleton } from "@automationstack/ui/components/skeleton";

function skeletonRowKeys(rows: number): string[] {
	return Array.from({ length: rows }, (_, index) => `module-row-${index}`);
}

export interface ModuleTreeSkeletonProps {
	label?: string;
	rows: number;
	title: boolean;
}

export function ModuleTreeSkeleton({
	label,
	rows,
	title,
}: ModuleTreeSkeletonProps) {
	const body = (
		<>
			{title ? <Skeleton className="h-6 w-16" /> : null}
			{skeletonRowKeys(rows).map((key) => (
				<Skeleton className="h-7 w-full" key={key} />
			))}
		</>
	);
	if (label === undefined) {
		return (
			<div aria-hidden="true" className="flex flex-col gap-1 p-2">
				{body}
			</div>
		);
	}
	return (
		<output
			aria-busy="true"
			aria-label={label}
			className="flex flex-col gap-1 p-2"
		>
			{body}
		</output>
	);
}
