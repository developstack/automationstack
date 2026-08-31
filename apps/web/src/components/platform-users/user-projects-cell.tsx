import type { UserProjectMembership } from "@automationstack/db/repositories/users-with-projects-core";

/**
 * 不换行空格 + 中圆点 + 普通空格。用转义而不是把这两个字符直接敲进字符串：
 * U+00A0 与普通空格在编辑器里长得一模一样，谁也看不出这里有一个特殊字符，
 * 下一次「顺手清理空格」就会把它换掉，而换掉之后没有任何东西会变红。
 */
const PROJECT_SEPARATOR = "\u00a0\u00b7 ";

/**
 * 「所属项目」列的单元格。
 *
 * ── 分隔符 ──
 * 多个项目用「·」连接。分隔符与**前一个**项目名之间是不换行空格 U+00A0，
 * 后面才是普通空格：这样唯一的断行点落在「·」之后，中圆点永远不会独自跑到下一
 * 行行首去（那看起来像是行首多了个没来由的符号）。
 *
 * ── 溢出怎么办：限宽 + 换行，不截断 ──
 * 三条路都试过，选了「限宽 + 换行」：
 *
 * - 不管：项目名可以很长，一个人也可能在十几个项目里，这一列会把整张表撑到需要
 *   横向滚动。表格一旦横滚，用户名那一列就会滚出视野，剩下的格子全变成无主数据，
 *   这是最坏的一种。所以宽度必须封顶（max-w-xs）。
 * - 截断 + title：一行内 truncate，完整名单挂 title。省地方，但这一列存在的全部
 *   理由就是「让人一眼扫出谁在哪些项目里」，把它截掉等于把这一列的价值截掉；
 *   而 title 只有鼠标够得着，键盘和触屏都读不到它，等于把信息藏进一个不是所有人
 *   都有的通道。行操作里的「管理项目归属」确实能看到全名单，但那要一行行点开，
 *   替代不了扫。
 * - line-clamp + title：同上，而且更坏一点——被夹掉的部分没有任何视觉提示，看到
 *   两行的人不知道后面还有没有第三行。
 *
 * 于是：宽度封顶，内容照常换行，行高随项目数量长。代价是行高不齐（在十几个项目
 * 的那一行上尤其明显），这笔账认了：横向滚动伤的是整张表，纵向长一点只伤这一行。
 * wrap-break-word 兜住「一个没有断点的超长项目名」这种情况，不让它顶破宽度上限；
 * text-pretty 管末行孤字。
 */
export function UserProjectsCell({
	projects,
}: {
	projects: readonly UserProjectMembership[];
}) {
	if (projects.length === 0) {
		return (
			<>
				{/*
				 * 空态是一个 em dash。读屏念一个破折号等于什么也没说（有些读屏干脆
				 * 跳过标点），所以符号只给眼睛看，另配一句给耳朵听的。
				 */}
				<span aria-hidden="true" className="text-muted-foreground">
					—
				</span>
				<span className="sr-only">不属于任何项目</span>
			</>
		);
	}

	return (
		<div className="wrap-break-word max-w-xs text-pretty">
			{projects.map((project) => project.name).join(PROJECT_SEPARATOR)}
		</div>
	);
}
