import { Skeleton } from "@automationstack/ui/components/skeleton";

const SKELETON_ROW_KEYS = ["r1", "r2", "r3", "r4", "r5"] as const;

/**
 * 列表首屏骨架，高度按真实表格逐行折算（折算依据同
 * `cases/case-table-states.tsx`：表头 TableHead h-10 + TableHeader 的 1px
 * 下边框；数据行 TableCell p-2 16px + Badge h-5 20px = h-9，再加 1px 边框）。
 * 对不齐的话，数据到达那一帧下方的内容会上下跳一下。
 */
export function TestRunListSkeleton() {
	return (
		<output
			aria-busy="true"
			aria-label="测试任务列表加载中"
			className="flex flex-col"
		>
			<Skeleton className="mb-px h-10 w-full rounded-none" />
			{SKELETON_ROW_KEYS.map((key) => (
				<Skeleton className="mt-px h-9 w-full rounded-none" key={key} />
			))}
		</output>
	);
}
