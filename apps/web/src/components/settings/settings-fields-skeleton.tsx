/**
 * 设置页分区的字段骨架与它那两份形状描述，自 settings-section.tsx 拆出。
 * 分区各自取数、各自失败那一段仍在 settings-section.tsx 顶部。
 */
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";

/** 骨架里一格字段的形状。逐项对着真身填，别给默认值——默认值正是分叉的起点。 */
export interface SettingsSkeletonField {
	/**
	 * 真身这一格底下有没有那行 `text-muted-foreground text-xs` 的说明。
	 * 没有的填 false：凭空多画一行，数据到达那一帧这一格会矮 24px
	 * （16px 说明行 + 8px 的 gap-2），它下面的所有字段跟着往上收。
	 */
	hint: boolean;
	/** React key，取真身那一格的字段名，两边好逐条对读。 */
	id: string;
	/** 输入框宽度类，与真身 `<Input className>` 逐字同源；满宽的填 w-full。 */
	width: string;
}

/** 提交行上的一颗按钮。宽度按真身的文字量折算，见各调用方的注释。 */
export interface SettingsSkeletonAction {
	id: string;
	width: string;
}

/**
 * 骨架的尺寸按真实控件折算，数据到达时不该有位移。逐档的来源：
 * - 标签 = Label 的 `text-sm leading-none` → 14px → h-3.5（**不是** h-4：
 *   leading-none 把行高压到了 1，按 text-sm 的默认 20px 或 text-xs 的 16px
 *   折算都会每格多占 2px）；
 * - 说明 = `text-xs` 的 16px 行高 → h-4，宽度只是视觉近似（真身是一句长短
 *   不一的话），这一行**只有高度是承重的**；
 * - 输入框与按钮 = 32px（Input 与 Button default 档都是 h-8）→ h-8；
 * - 格内 gap-2、格间 gap-4，与真身 `<form className="flex flex-col gap-4">`
 *   和各字段块的 `flex flex-col gap-2` 同档。
 *
 * 字段与按钮都由调用方逐个描述，而不是给一个数字：这一页两个分区的字段宽度、
 * 有没有说明行、提交行有几颗按钮全都不一样，一个 `fields: number` 只能画出
 * 「满宽、无说明、一颗按钮」这一种形状，另一种就必然对不上。
 */
export function SettingsFieldsSkeleton({
	actions,
	fields,
}: {
	actions: readonly SettingsSkeletonAction[];
	fields: readonly SettingsSkeletonField[];
}) {
	return (
		<output aria-busy="true" className="flex flex-col gap-4">
			{fields.map((field) => (
				<div className="flex flex-col gap-2" key={field.id}>
					<Skeleton className="h-3.5 w-24" />
					<Skeleton className={cn("h-8", field.width)} />
					{field.hint ? <Skeleton className="h-4 w-2/3" /> : null}
				</div>
			))}
			<div className="flex justify-end gap-2">
				{actions.map((action) => (
					<Skeleton className={cn("h-8", action.width)} key={action.id} />
				))}
			</div>
		</output>
	);
}
