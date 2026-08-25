/**
 * 步骤行行尾的一列操作按钮：展开预览 / 上移 / 下移 / 删除。
 *
 * 从 steps-editor.tsx 拆出来，一是给那边留行数余量，二是「展开」这枚按钮是本次
 * 回归修复的核心：步骤格的实时预览从**由聚焦驱动**改成**由这枚按钮驱动**。
 * 只要没点它，点「步骤」「预期结果」都只换输入控件，不动任何元素的尺寸和位置。
 */
import { Button } from "@automationstack/ui/components/button";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	EyeIcon,
	EyeOffIcon,
	XIcon,
} from "lucide-react";

interface StepMoveButtonsProps {
	canMoveDown: boolean;
	canMoveUp: boolean;
	onMoveDown: () => void;
	onMoveUp: () => void;
	/** 1 基序号，已经由调用方算好；这里只往标签里填。 */
	position: number;
}

/**
 * 排序的一对。拆出来只是为了给 <StepRowActions> 留行数余量，两枚按钮必须
 * 一起改：尺寸/变体一旦不一致，同一列里的四枚按钮就会错开半格。
 *
 * 边界不在这里判——能不能上移/下移由拥有整份步骤清单的 steps-editor 说了算，
 * 这里只把它的结论渲染成 disabled。
 */
function StepMoveButtons({
	canMoveDown,
	canMoveUp,
	onMoveDown,
	onMoveUp,
	position,
}: StepMoveButtonsProps) {
	return (
		<>
			<Button
				aria-label={`第 ${position} 步上移`}
				disabled={!canMoveUp}
				onClick={onMoveUp}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<ArrowUpIcon />
			</Button>
			<Button
				aria-label={`第 ${position} 步下移`}
				disabled={!canMoveDown}
				onClick={onMoveDown}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<ArrowDownIcon />
			</Button>
		</>
	);
}

interface StepRowActionsProps {
	canMoveDown: boolean;
	canMoveUp: boolean;
	/** 0 基索引；标签里带上序号，读屏的按钮列表才不会是 N 组同名按钮。 */
	index: number;
	onMoveDown: () => void;
	onMoveUp: () => void;
	onRemove: () => void;
	onTogglePreview: () => void;
	/** 本行两格是否显示 markdown 预览。 */
	previewOpen: boolean;
}

export function StepRowActions(props: StepRowActionsProps) {
	const position = props.index + 1;
	const previewLabel = props.previewOpen
		? `收起第 ${position} 步预览`
		: `展开第 ${position} 步预览`;
	return (
		/*
		 * 宽屏是行尾竖排的一列（步骤行的 auto 轨）；窄屏整行堆叠后改成横排并靠
		 * 行尾对齐——竖排会在两个编辑器下面拖出 80px 高的一条空白，而横排一行
		 * 24px 就够，行操作也仍然待在「内容之后」的位置上。
		 */
		<div className="flex justify-end gap-1 sm:flex-col sm:justify-start">
			{/*
			 * 预览开关排在第一位：它是这一行里唯一会改变布局的控件，放在行首
			 * 才不至于被夹在「上移/下移」中间被当成又一个排序按钮。
			 * aria-expanded 让读屏知道它控制的是展开/收起，而不是一次性动作。
			 */}
			<Button
				aria-expanded={props.previewOpen}
				aria-label={previewLabel}
				onClick={props.onTogglePreview}
				size="icon-xs"
				title={previewLabel}
				type="button"
				variant="ghost"
			>
				{props.previewOpen ? <EyeOffIcon /> : <EyeIcon />}
			</Button>
			<StepMoveButtons
				canMoveDown={props.canMoveDown}
				canMoveUp={props.canMoveUp}
				onMoveDown={props.onMoveDown}
				onMoveUp={props.onMoveUp}
				position={position}
			/>
			<Button
				aria-label={`删除第 ${position} 步`}
				onClick={props.onRemove}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<XIcon />
			</Button>
		</div>
	);
}
