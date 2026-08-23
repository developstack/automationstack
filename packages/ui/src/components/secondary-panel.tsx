"use client";

import { Button } from "@automationstack/ui/components/button";
import {
	SECONDARY_PANEL_WIDTH_MOBILE,
	useSecondaryPanel,
} from "@automationstack/ui/components/secondary-panel-context";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { cn } from "@automationstack/ui/lib/utils";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useCallback } from "react";

/** 抽屉没给标题时的兜底可访问名：Dialog 缺名字读屏只会念「对话框」，比念个泛称还糟。 */
const FALLBACK_DRAWER_TITLE = "面板";

export interface SecondaryPanelProps extends ComponentProps<"div"> {
	/**
	 * 标题行里可见的自定义头，给了就顶掉 `title` 那段纯文本（典型用法是项目切换器：
	 * 这块头本身要能点开菜单，不只是一行字）。它是任意节点，这个原语不解释里面装的是什么。
	 * 给了 header 也别省 `title`：可访问名只能是字符串，那一份仍旧从 title 来。
	 */
	header?: ReactNode;
	/**
	 * 面板的可访问名，通常是当前项目名；没给 header 时它也是标题行里可见的那段文字。
	 * 给了 title 或 header 才渲染标题行；窄屏下 title 同时是抽屉（Dialog）的可访问名，
	 * 这个名字非有不可，所以它不随 header 一起变成节点。
	 * 可选是因为有些二级面板顶部自带筛选器之类的自定义头，不需要再压一行标题。
	 */
	title?: string;
}

/**
 * 二级面板外壳。宽屏是主内容区里**在流内**的一列，窄屏（< lg）改由抽屉承载——
 * 断点与 hooks/use-compact-viewport.ts 里的 1024px 是同一条线。
 *
 * 刻意不复用 Sidebar：一级侧边栏宽屏形态是 `fixed inset-y-0 left-0` 的固定面，
 * 再来一块同样定位的面只会和它重叠在屏幕左缘。二级面板必须参与正常流，
 * 才能排在一级侧边栏右边、并把剩下的宽度让给主内容。
 */
export function SecondaryPanel({
	children,
	className,
	header,
	title,
}: SecondaryPanelProps) {
	const { isCompact } = useSecondaryPanel();
	if (isCompact) {
		return (
			<SecondaryPanelDrawer className={className} header={header} title={title}>
				{children}
			</SecondaryPanelDrawer>
		);
	}
	return (
		<SecondaryPanelColumn className={className} header={header} title={title}>
			{children}
		</SecondaryPanelColumn>
	);
}

function SecondaryPanelDrawer({
	children,
	className,
	header,
	title,
}: SecondaryPanelProps) {
	const { openMobile, setOpenMobile } = useSecondaryPanel();
	return (
		<Sheet onOpenChange={setOpenMobile} open={openMobile}>
			<SheetContent
				className={cn(
					"w-(--secondary-panel-width-mobile) bg-sidebar text-sidebar-foreground",
					className
				)}
				showCloseButton={false}
				side="left"
				/*
				 * 宽度变量在这里重新声明一遍：Sheet 走 portal 渲染到 body 下，
				 * 已经不在 SecondaryPanelProvider 的 wrapper 里，继承不到那份变量。
				 */
				style={
					{
						"--secondary-panel-width-mobile": SECONDARY_PANEL_WIDTH_MOBILE,
					} as CSSProperties
				}
			>
				{/*
				 * 与一级侧边栏的 sr-only 标题不同，这里的头要看得见：二级面板的标题
				 * 就是当前项目名，属于用户需要的信息，不只是给读屏补一个可访问名。
				 * 什么都没给时才整块退回 sr-only 的兜底名。
				 */}
				<SheetHeader
					className={
						title || header
							? "min-h-12 shrink-0 justify-center py-0"
							: "sr-only"
					}
				>
					{/*
					 * SheetTitle 是 Dialog 的可访问名，任何情况下都得在——header 顶掉的
					 * 只是它可见的那一面，于是这里改走 sr-only 而不是不渲染：
					 * 删了它读屏就只剩「对话框」，而 header 里装的是什么这一层并不知道，
					 * 指望它自带一个名字是赌运气。
					 */}
					<SheetTitle className={header ? "sr-only" : "truncate"}>
						{title ?? FALLBACK_DRAWER_TITLE}
					</SheetTitle>
					{header}
				</SheetHeader>
				<div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
					{children}
				</div>
			</SheetContent>
		</Sheet>
	);
}

/**
 * 宽屏的流内列。
 *
 * 两层结构：外层负责收放（宽度补间到 0 并裁掉溢出），内层是定宽的实体面。
 */
function SecondaryPanelColumn({
	children,
	className,
	header,
	title,
}: SecondaryPanelProps) {
	const { state } = useSecondaryPanel();
	return (
		<div
			className="hidden w-(--secondary-panel-width) shrink-0 overflow-hidden transition-secondary-panel data-[state=collapsed]:w-0 lg:flex"
			data-slot="secondary-panel"
			data-state={state}
		>
			{/*
			 * 内层定宽（且 shrink-0）是为了收放动画期间文字不回流：外层宽度一路补间到 0，
			 * 如果内容跟着被挤，标题和列表会在这 200ms 里不停换行、抖成一团；
			 * 定宽后内容始终保持展开态的排版，只是被外层的 overflow-hidden 逐渐裁掉。
			 *
			 * 右边框画在内层同理：它随内层一起被裁走，收起时不必去过渡 border-width，
			 * 也不会在外层已经 w-0 时还剩下一条 1px 的发丝线挂在那儿。
			 *
			 * 导航区有两条结构线，各划各的界，别把这条当成多余的那一条：一级侧栏那条
			 * 右边框划的是「一级侧栏 | 二级面板」（两块同为 bg-sidebar，色阶差是 0，
			 * 理由见 sidebar.tsx），这条 border-r 划的是「二级面板 | 主内容」。
			 * 画成二级面板的 border-r 而不是给主内容补 border-l：二级面板会收起、窄屏
			 * 还整块换成抽屉，线跟着面走才会一起消失；挂在主内容上，面收完了线还杵着。
			 */}
			<div
				className={cn(
					"flex w-(--secondary-panel-width) shrink-0 flex-col border-sidebar-border border-r bg-sidebar",
					className
				)}
				data-slot="secondary-panel-surface"
			>
				{title || header ? (
					<div
						/* min-h-12 是为了与主内容区顶栏（apps/web 的 header 也是 min-h-12）齐平：
						   两条底边不在同一条线上时，二级面板看着像整体错位了半格。
						   不画下边框：紧接着的是 aside p-2 的模块树，8px 组间距已经把标题行
						   和列表分开了，再补一条线是同一个分组信号编码两遍。 */
						className="flex min-h-12 shrink-0 items-center gap-2 px-4"
						data-slot="secondary-panel-header"
					>
						{/* header 在时它就是这一行的全部内容：标题行只负责高度与 gutter，
						    里面摆什么由调用方定，纯文本只是没给 header 时的兜底。 */}
						{header ?? (
							<span className="truncate font-medium text-sm">{title}</span>
						)}
					</div>
				) : null}
				<div
					className="flex min-h-0 flex-1 flex-col overflow-y-auto"
					data-slot="secondary-panel-content"
				>
					{children}
				</div>
			</div>
		</div>
	);
}

/** Button 的 onClick 参数是 Base UI 包装过的事件，不是原生 MouseEvent。 */
type TriggerClickEvent = Parameters<
	NonNullable<ComponentProps<typeof Button>["onClick"]>
>[0];

export interface SecondaryPanelTriggerProps
	extends ComponentProps<typeof Button> {
	/**
	 * 必填的可访问名，作为 `aria-label` 落到按钮上。按钮里只有一个调用方传进来的图标，
	 * 没有它读屏念不出这是什么按钮；也正因为图标由调用方给（这个原语不该假定图标语义），
	 * 名字没法在这里写死。不另外再补一个 sr-only 文本：aria-label 存在时它压根不参与
	 * 可访问名的计算，两份同源的名字里只有一份是活的。
	 */
	label: string;
}

/** 展开 / 收起按钮。窄屏开抽屉，宽屏折叠流内列。 */
export function SecondaryPanelTrigger({
	children,
	className,
	label,
	onClick,
	...props
}: SecondaryPanelTriggerProps) {
	const { isCompact, open, openMobile, toggle } = useSecondaryPanel();
	// 调用方传的 onClick 先走，再切换：外部可能要在同一次点击里记埋点或关别的浮层
	const handleClick = useCallback(
		(event: TriggerClickEvent) => {
			onClick?.(event);
			toggle();
		},
		[onClick, toggle]
	);
	/*
	 * 抽屉和流内列的展开状态是两个互不相干的 state，按钮同一时刻只控制其中一个，
	 * 所以对外只能报当前形态的那一个。只看 open 的话，窄屏抽屉关着时仍会因为
	 * 宽屏那份状态是展开而报 aria-expanded="true"，读屏会念出一个不存在的展开态。
	 */
	const expanded = isCompact ? openMobile : open;
	return (
		<Button
			aria-expanded={expanded}
			aria-label={label}
			className={className}
			data-slot="secondary-panel-trigger"
			onClick={handleClick}
			size="icon"
			variant="ghost"
			{...props}
		>
			{children}
		</Button>
	);
}
