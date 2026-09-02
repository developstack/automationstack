/**
 * 节点表最左边那颗展开箭头。
 *
 * 单独一个文件而不是写在 farm-nodes-table.tsx 里：那张表已经有两个私有组件
 * （行、空态），再加一个会撞上同文件私有组件上限（eslint
 * local/one-component-per-file），而把它塞回行里则会让那个函数越过 50 行的上限。
 * 它本来也够独立——一颗只知道「现在展开没有」和「点了怎么办」的按钮。
 */
import { Button } from "@automationstack/ui/components/button";
import { ChevronRightIcon } from "lucide-react";

export function FarmNodeExpandToggle({
	expanded,
	nodeName,
	onToggle,
}: {
	expanded: boolean;
	nodeName: string;
	onToggle: () => void;
}) {
	return (
		/*
		 * aria-expanded 是这颗按钮的全部语义：读屏据此念「已折叠 / 已展开」，
		 * 名字带上机器名，否则一排「能力清单」在按钮列表里分不出是谁的。
		 * 图标只是同一件事的视觉版本，一律 aria-hidden。
		 */
		<Button
			aria-expanded={expanded}
			aria-label={`「${nodeName}」的能力清单`}
			onClick={onToggle}
			size="icon-sm"
			type="button"
			variant="ghost"
		>
			{/*
			 * 箭头转 90°而不是换一个向下的图标：同一个形状转过去，眼睛跟得住这是
			 * 「刚才那颗按钮变了状态」，换图标则像是换了一颗按钮。
			 */}
			<ChevronRightIcon
				aria-hidden="true"
				className={
					expanded ? "rotate-90 transition-transform" : "transition-transform"
				}
			/>
		</Button>
	);
}
