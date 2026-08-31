/**
 * 覆盖缺口卡里的「点名清单」。原是 overview-coverage-card.tsx 里的私有辅助，
 * 按「同文件最多 2 个私有辅助组件」拆出来；清单里那一行链接只服务于它，
 * 跟着一起搬。缺口取值的类型与文案也随之落在这里，卡片那边按需要引回去。
 */
import { Link } from "@tanstack/react-router";

/**
 * 后端 gap 的两种取值。这里就地写出联合类型而不是从 packages/db 引：web 只该
 * 依赖 API 的输出形状，把 repository 的类型拉进浏览器包会把数据层的实现细节
 * 变成前端的编译依赖。
 */
export type ModuleGap = "empty" | "no-active";

const GAP_LABELS: Record<ModuleGap, string> = {
	empty: "零用例",
	"no-active": "无生效用例",
};

export interface GapSample {
	gap: ModuleGap;
	moduleId: string;
	name: string;
}

interface GapModuleLinkProps extends GapSample {
	projectId: string;
}

function GapModuleLink({ gap, moduleId, name, projectId }: GapModuleLinkProps) {
	return (
		<li className="flex items-center justify-between gap-2 text-sm">
			{/*
			 * 点名之后要能直接去处理：链接落到该模块的用例列表，正是补用例的地方。
			 * search 只写 moduleId，其余筛选留空——带着上一页的关键词过去会让人以为
			 * 这个模块「连一条都搜不到」。
			 */}
			<Link
				className="truncate hover:underline"
				params={{ projectId }}
				search={{ moduleId }}
				to="/projects/$projectId"
			>
				{name}
			</Link>
			<span className="shrink-0 text-muted-foreground text-xs">
				{GAP_LABELS[gap]}
			</span>
		</li>
	);
}

interface CoverageGapListProps {
	gapCount: number;
	projectId: string;
	samples: GapSample[];
	totalModuleCount: number;
}

/**
 * 缺口名单。没有缺口时不留一个空的 <ul>，改成一句写明「查过了」的结论——
 * 空列表和「还没查」在页面上长得一模一样。
 */
export function CoverageGapList({
	gapCount,
	projectId,
	samples,
	totalModuleCount,
}: CoverageGapListProps) {
	if (gapCount === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				查过了：{totalModuleCount} 个模块都有生效用例，没有缺口。
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-1.5 border-t pt-3">
			{samples.map((sample) => (
				<GapModuleLink
					gap={sample.gap}
					key={sample.moduleId}
					moduleId={sample.moduleId}
					name={sample.name}
					projectId={projectId}
				/>
			))}
		</ul>
	);
}
