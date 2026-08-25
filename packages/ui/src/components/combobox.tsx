/* Base UI Combobox（1.7.0 内置原语，非 experimental）的薄封装，对齐 select.tsx
   的封装惯例：data-slot 命名、cn 合并、弹层视觉复用 SelectContent 那套
   （rounded-md / shadow-md / ring-foreground/10 / popup-transition /
   max-h-(--available-height) 滚动 / 宽度贴锚点）。

   封装前按 019 计划的强制纪律读过安装版源码
   （node_modules/.pnpm 里的 @base-ui+react@1.7.0，combobox 子目录），核实到的
   关键事实，与计划阶段记忆有出入的三处：

   1. 单输入框形态下选中值的展示不靠 Combobox.Value——Value 是给
      「Trigger + 输入框」双控件形态用的。Input 的文字由 Root 的内部
      inputValue 驱动：单选 + 输入框在弹层外时，选中一项会自动把 label 填进
      输入框（AriaCombobox.js 的 shouldFillInput 分支），关弹层时也会回同步
      （handleUnmount），清空输入框则连带清空选中值并触发 onValueChange(null)。
      所以本文件不封 Value，picker 也不需要。
   2. 选中值 → 显示文本的换算走 itemToStringLabel（值是原始 id 时必须给，
      否则输入框里显示的是裸 id）。items 传 { label, value } 形状时 Empty
      的判空和 label 解析都能自动工作。
   3. Item 的高亮态是 data-highlighted（aria-activedescendant 虚拟焦点，
      项本身永远拿不到 DOM 焦点），所以高亮样式不能照抄 select.tsx 的
      focus:bg-accent，得用 data-highlighted:bg-accent。

   本仓库的搜索类下拉过滤全在服务端做（见 catalog-picker），调用方应给
   Root 传 filter={null} 关掉内置的客户端 collator 过滤——这个约定写在
   catalog-picker 的头注释里，不在这里强制。 */

import { cn } from "@automationstack/ui/lib/utils";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon } from "lucide-react";

const Combobox = ComboboxPrimitive.Root;

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
	return (
		<ComboboxPrimitive.Input
			/* 视觉照搬 input.tsx：这颗输入框在表单里就该长得跟普通输入框一样，
			   站位、聚焦环、aria-invalid 配色全复用同一套。 */
			className={cn(
				"h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className
			)}
			data-slot="combobox-input"
			{...props}
		/>
	);
}

function ComboboxContent({
	className,
	children,
	side = "bottom",
	sideOffset = 4,
	align = "start",
	alignOffset = 0,
	...props
}: ComboboxPrimitive.Popup.Props &
	Pick<
		ComboboxPrimitive.Positioner.Props,
		"align" | "alignOffset" | "side" | "sideOffset"
	>) {
	return (
		<ComboboxPrimitive.Portal>
			<ComboboxPrimitive.Positioner
				align={align}
				alignOffset={alignOffset}
				className="isolate z-50"
				side={side}
				sideOffset={sideOffset}
			>
				<ComboboxPrimitive.Popup
					/* 弹层视觉与 SelectContent 同一套（含 popup-transition，理由见
					   select.tsx 头注释）；select 特有的 alignItemWithTrigger 在
					   combobox 的 Positioner 上不存在，没得传。默认 align="start"：
					   搜索框的候选列表左对齐贴输入框，不像 select 触发器要居中。 */
					className={cn(
						"popup-transition relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-md bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10",
						className
					)}
					data-slot="combobox-content"
					{...props}
				>
					<ComboboxPrimitive.List className="p-1" data-slot="combobox-list">
						{children}
					</ComboboxPrimitive.List>
				</ComboboxPrimitive.Popup>
			</ComboboxPrimitive.Positioner>
		</ComboboxPrimitive.Portal>
	);
}

function ComboboxItem({
	className,
	children,
	...props
}: ComboboxPrimitive.Item.Props) {
	return (
		<ComboboxPrimitive.Item
			/* 高亮用 data-highlighted 而非 select.tsx 的 focus:，见文件头注释第 3 条。
			   内距用逻辑属性（ps/pe），新文件直接落在 better-layout 基线上；
			   select.tsx 里的物理属性是历史遗留，见其 trigger 上的同名注释。 */
			className={cn(
				"relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-1.5 ps-2 pe-8 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50",
				className
			)}
			data-slot="combobox-item"
			{...props}
		>
			<span className="flex flex-1 shrink-0 gap-2 whitespace-nowrap">
				{children}
			</span>
			<ComboboxPrimitive.ItemIndicator
				render={
					<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
				}
			>
				<CheckIcon className="pointer-events-none" />
			</ComboboxPrimitive.ItemIndicator>
		</ComboboxPrimitive.Item>
	);
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
	return (
		<ComboboxPrimitive.Empty
			className={cn("px-2 py-1.5 text-muted-foreground text-xs", className)}
			data-slot="combobox-empty"
			{...props}
		/>
	);
}

/* 事件详情里的 reason 是区分「用户击键」与「组件自动回填」的唯一依据
   （input-change / input-clear vs item-press / none），服务端过滤的调用方
   要用它筛 onInputValueChange，从这儿导出避免 web 直接依赖 @base-ui/react。 */
type ComboboxChangeEventDetails = ComboboxPrimitive.Root.ChangeEventDetails;

export {
	Combobox,
	type ComboboxChangeEventDetails,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
};
