/**
 * 模块树骨架的唯一实现。
 *
 * 合并前有三份：项目外壳的 pending 态（project-shell-skeleton.tsx）、
 * 二级面板的 Suspense fallback（layout/module-panel.tsx）、用例挑选器左栏
 * （test-runs/case-picker-modules.tsx）。三份的容器类与行类逐字相同，
 * 差别只有条数、要不要那条小标题、以及播报还是 aria-hidden。
 *
 * ⚠️ 高度值一个都不许动：容器沿用真实树的 `p-2` + `gap-1`，标题行 24px
 * （ModuleTree 那颗 icon-xs 按钮），模块行 28px（px-2 py-0.5 + icon-xs）。
 * 行宽保持满宽也是刻意的——模块行本来就是一条从行首铺到行尾的可点区域，
 * 这一档不属于本次「按列分布」的改动范围（那一条只针对表格）。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";

function skeletonRowKeys(rows: number): string[] {
	return Array.from({ length: rows }, (_, index) => `module-row-${index}`);
}

export interface ModuleTreeSkeletonProps {
	/**
	 * 读屏播报名。外层已经有别的播报区时给 undefined，整块转成 aria-hidden。
	 */
	label?: string;
	/**
	 * 模块行条数。只能猜——真实条数正是还没拿到的那份数据。猜多猜少都只影响
	 * 这一列自己的尾部：面板独立滚动，长短几像素不会把顶栏和内容区顶得上下跳。
	 */
	rows: number;
	/**
	 * 真身那行「模块 + 两颗图标按钮」的小标题在不在这份骨架里。
	 * 整行大半是空的，所以标题条不拉满宽。
	 */
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
