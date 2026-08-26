import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

import { StaggerItem } from "@/components/layout/page-stagger";
import { SettingsFieldsSkeleton } from "@/components/settings/settings-section";

/**
 * /settings 路由级骨架（routes/settings.tsx 的 pendingComponent）。
 *
 * 它等的只有 loader 里那一条 `projects.list`。loader 一回，就绪态渲染出来的**不是**
 * 填好的表单，而是「项目选择器 + 两个分区各自的标题 + 两份 SettingsFieldsSkeleton」
 * ——两个分区的配置刻意没进 loader，各自取数、各自失败（settings-section.tsx 顶部）。
 * 所以本骨架照着的是**那一帧**，不是最终填满的样子；照最终态画反而会在 loader 回来
 * 的瞬间先跳一次，等分区数据到了再跳第二次。
 *
 * 字段那两块直接复用真身的 `SettingsFieldsSkeleton`，不在这里重画一份灰条：那正是
 * 下一帧要出现的同一个组件，复用等于「高度对不上」这件事从根上不可能发生。
 *
 * ## 换算表（真实类名 → 骨架高度）
 *
 * ⚠️ 本仓库把 shadcn registry 的整条尺寸台阶下调了一档（理由见
 * packages/ui/src/components/button.tsx 文件头）：Button / Input / SelectTrigger 的
 * `size="default"` 都是 **h-8 = 32px**，不是 registry 的 36px。按 registry 折算会
 * 让每一格都高出 4px。
 *
 *   分区标题 h2   font-medium text-sm，行高 20px（Tailwind 默认，本仓库没覆盖）→ h-5
 *   分区描述 p    text-xs，行高 16px                                        → h-4
 *   字段标签      text-xs                                                    → h-4
 *   输入框        Input 的 h-8                                    = 32px     → h-8
 *   按钮          Button size="default" 的 h-8                    = 32px     → h-8
 *   项目下拉      SelectTrigger 的 data-[size=default]:h-8        = 32px     → h-8
 *   分隔线        Separator 的 data-horizontal:h-px               = 1px      → h-px
 *
 * 「项目」那个 Label 是 text-sm **leading-none** = 14px，比这里的 h-4 矮 2px——不要紧：
 * 它与 h-8 的下拉同在一行 `items-center` 里，行高由 32px 那个决定，标签条自己多高都
 * 落不到布局上。
 *
 * ## 整页高度逐段折算
 *
 *   外壳（mx-auto w-full max-w-3xl px-4 py-6）由 routes/settings.tsx 给，不在本文件
 *   本文件 = 就绪态那份 flex flex-col gap-6（24px）：
 *
 *     项目选择器一行（flex items-center gap-3，高度取 h-8 的下拉）        32
 *     gap-6                                                              24
 *     「测试评审和执行」分区（flex flex-col gap-4）                       160
 *         标题块 flex flex-col gap-1：20 + 4 + 16                        = 40
 *         gap-4                                                         = 16
 *         SettingsFieldsSkeleton fields=1                               = 104
 *             字段 (16 + gap-2 8 + 32) 56 + gap-4 16 + 按钮行 32
 *     gap-6                                                              24
 *     分隔线                                                              1
 *     gap-6                                                              24
 *     「Jira 集成」分区                                                   448
 *         标题块 40 + gap-4 16 + SettingsFieldsSkeleton fields=5 392
 *             392 = 5×56（五格字段）+ 5×16（六个子项之间五道 gap-4）+ 32（按钮行）
 *     ------------------------------------------------------------------
 *     合计                                                               713
 *
 * ## 已知的一处对不齐
 *
 * Jira 那句描述约 679px 宽（46 个全角 × 12px + 17 个拉丁字符 ≈ 114px + 空格），而内容列
 * 可用宽 = max-w-3xl 768 − px-4 两侧 32 = 736px，桌面下是一行。视口窄到约 711px 以下时
 * 真身会折成两行、比骨架高 16px。骨架没法既是定高又跟着换行走，这里取常见的那一档。
 *
 * ## 逐项错开：序号与就绪态是同一张排位表
 *
 * 下面四格各包一层 StaggerItem，序号与 settings-page.tsx 里 SettingsPageBody 那一列
 * 逐个对齐：
 *
 *   0  项目选择器一行
 *   1  「测试评审和执行」分区
 *   2  分隔线
 *   3  「Jira 集成」分区
 *
 * 就绪态的 1 号位还兼着 MissingProjectNotice，那与分区互斥（判定见 SettingsPageBody
 * 顶部），本骨架够不着那一态——loader 还没回来时连项目列表都没有，谈不上「URL 指的
 * 项目查不到」——所以这边 1 号只画分区，两处并不冲突。
 *
 * 骨架这边非包不可，理由与 report-skeleton.tsx 顶部那段逐字同源：不包的话慢加载这条
 * 路**一次错开都不会发生**。骨架挂载时 pathname 与上一页不同，PageTransition 判定要播
 * 进场，于是骨架整块淡入一次；等 loader 回来，pending 那格里存的已经是本页 pathname，
 * 就绪态被判成 followsSamePath，skipEnter 为真——settings-page.tsx 那几个 StaggerItem
 * 一个都不动，直接落在终态。结果就是 loader 快（<200ms，router.tsx 的 defaultPendingMs，
 * 骨架压根不上场）时逐项落位、慢时整块淡入，同一页两种观感。
 *
 * ## 包这一层不动上面那张折算表
 *
 * StaggerItem 渲染的是 `<motion.div className="grid">`（成因见 page-stagger.tsx 顶部）。
 * 它在 `flex flex-col gap-6` 里只是接替原节点当那一格 flex item：格数没变，gap 的道数
 * 也没变，24px 那几行照旧。而 grid 那层的行高取唯一子节点的内容高度，四格里唯一写死
 * 高度的分隔线（h-px）不会被 grid 的 align stretch 拉高——stretch 只作用在高度为 auto
 * 的项上，有明确 height 的项按自己的高度走。合计 713 仍然成立。
 */

/**
 * 两个分区各占几格字段。
 *
 * ⚠️ 真相在各自文件里的 `FIELD_COUNT`（test-run-settings-section.tsx:36 = 1，
 * jira-settings-section.tsx:39 = 5，都是模块私有常量，导不过来）。那边加减一格字段，
 * 这里要跟着改，否则数据到达那一帧整页会跳 56px 的倍数。
 */
const TEST_RUN_FIELD_COUNT = 1;
const JIRA_FIELD_COUNT = 5;

interface SectionSkeletonProps {
	/** 描述灰条的宽度类，按该分区描述文案的实际字数取。 */
	descriptionWidth: string;
	fields: number;
	titleWidth: string;
}

/**
 * 一个分区：标题块 + 字段块，间距逐条抄 SettingsSection（gap-4 / 标题块内 gap-1）。
 *
 * 用 <div> 而不是真身的 <section aria-labelledby>：整块骨架挂在 aria-hidden 底下，
 * 地标与可访问名在这里没有意义，而一个没有可访问名的 <section> 反倒是个空壳地标。
 * 高度只由类名决定，换标签不影响任何一段折算。
 */
function SectionSkeleton({
	descriptionWidth,
	fields,
	titleWidth,
}: SectionSkeletonProps) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<Skeleton className={cn("h-5", titleWidth)} />
				<Skeleton className={cn("h-4", descriptionWidth)} />
			</div>
			<SettingsFieldsSkeleton fields={fields} />
		</div>
	);
}

/**
 * 灰条宽度按各处文案的实际排版宽度取（全角 = 字号，拉丁 ≈ 0.55 字号）：
 *
 *   「项目」        2 全角 × 14px = 28px           → w-7
 *   「测试评审和执行」7 全角 × 14px = 98px          → w-24（96px）
 *   该分区描述       27 全角 × 12px = 324px         → w-80（320px）
 *   「Jira 集成」   Jira ≈ 32px + 空格 + 2 全角 28px ≈ 64px → w-16
 *   Jira 描述        ≈ 679px，桌面下占满一行        → w-full
 *
 * 下拉那条取 w-56 = SelectTrigger 的 min-w-56 下限。真身是 w-fit，宽度随项目名变长，
 * 但那只是横向差异，纵向一格不动。
 */
export function SettingsSkeleton() {
	return (
		<>
			{/*
			 * 播报只留这一条。两份 SettingsFieldsSkeleton 各自带着 aria-busy 的
			 * <output>，同一次加载播三遍读屏只会更吵——它们整个落在下面那层
			 * aria-hidden 里，连同子树一起从可访问性树上摘掉，只剩这一句。
			 * sr-only 是 position:absolute，不占 flex 的一格，也不吃 gap。
			 */}
			<output aria-busy="true" className="sr-only">
				设置加载中
			</output>
			<div aria-hidden="true" className="flex flex-col gap-6">
				{/* 项目选择器：横排一行，与 settings-project-picker.tsx 同为 gap-3 */}
				<StaggerItem index={0}>
					<div className="flex flex-wrap items-center gap-3">
						<Skeleton className="h-4 w-7" />
						<Skeleton className="h-8 w-56" />
					</div>
				</StaggerItem>
				<StaggerItem index={1}>
					<SectionSkeleton
						descriptionWidth="w-80"
						fields={TEST_RUN_FIELD_COUNT}
						titleWidth="w-24"
					/>
				</StaggerItem>
				{/* 对齐两分区之间的 <Separator />：h-px 是它 data-horizontal 下的实际高度 */}
				<StaggerItem index={2}>
					<Skeleton className="h-px w-full" />
				</StaggerItem>
				<StaggerItem index={3}>
					<SectionSkeleton
						descriptionWidth="w-full"
						fields={JIRA_FIELD_COUNT}
						titleWidth="w-16"
					/>
				</StaggerItem>
			</div>
		</>
	);
}
