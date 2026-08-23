import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import { MarkdownField } from "@/components/cases/markdown-field";

interface StepRowActionsProps {
	canMoveDown: boolean;
	canMoveUp: boolean;
	/** 0 基索引；标签里带上序号，读屏的按钮列表才不会是 N 组同名按钮。 */
	index: number;
	onMoveDown: () => void;
	onMoveUp: () => void;
	onRemove: () => void;
}

function StepRowActions(props: StepRowActionsProps) {
	const position = props.index + 1;
	return (
		/*
		 * 宽屏是行尾竖排的一列（步骤行的 auto 轨）；窄屏整行堆叠后改成横排并靠
		 * 行尾对齐——竖排会在两个编辑器下面拖出 80px 高的一条空白，而横排一行
		 * 24px 就够，行操作也仍然待在「内容之后」的位置上。
		 */
		<div className="flex justify-end gap-1 sm:flex-col sm:justify-start">
			<Button
				aria-label={`第 ${position} 步上移`}
				disabled={!props.canMoveUp}
				onClick={props.onMoveUp}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<ArrowUpIcon />
			</Button>
			<Button
				aria-label={`第 ${position} 步下移`}
				disabled={!props.canMoveDown}
				onClick={props.onMoveDown}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<ArrowDownIcon />
			</Button>
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

interface StepRowProps {
	canMoveDown: boolean;
	canMoveUp: boolean;
	index: number;
	onChange: (id: string, patch: Partial<CaseStep>) => void;
	onMove: (id: string, delta: number) => void;
	onRemove: (id: string) => void;
	step: CaseStep;
}

/** 把行内的五个回调收在一起，StepRow 只负责渲染。 */
function useStepRowHandlers(props: StepRowProps) {
	const { onChange, onMove, onRemove, step } = props;

	const handleStepChange = useCallback(
		(value: string) => onChange(step.id, { step: value }),
		[onChange, step.id]
	);
	const handleExpectedChange = useCallback(
		(value: string) => onChange(step.id, { expected: value }),
		[onChange, step.id]
	);
	const handleMoveUp = useCallback(
		() => onMove(step.id, -1),
		[onMove, step.id]
	);
	const handleMoveDown = useCallback(
		() => onMove(step.id, 1),
		[onMove, step.id]
	);
	const handleRemove = useCallback(
		() => onRemove(step.id),
		[onRemove, step.id]
	);

	return {
		handleExpectedChange,
		handleMoveDown,
		handleMoveUp,
		handleRemove,
		handleStepChange,
	};
}

/** One editable step: description + expected result + row actions. */
function StepRow(props: StepRowProps) {
	const { step } = props;
	const {
		handleExpectedChange,
		handleMoveDown,
		handleMoveUp,
		handleRemove,
		handleStepChange,
	} = useStepRowHandlers(props);

	return (
		/*
		 * 窄屏（<640px）单栏堆叠，理由与短字段栅格同源：内容区只剩 288px 时
		 * 切两栏每个编辑器只有 124px，markdown 一行放不下几个字。
		 * 列间距 gap-3(12px) 与短字段栅格的 gap-x-3 同档，整个表单只有一种
		 * 横向水槽；行与行之间的 16px 比它大，一行才读得出是一行。
		 */
		<li className="grid grid-cols-1 items-start gap-3 sm:grid-cols-case-step">
			<MarkdownField
				ariaLabel={`第 ${props.index + 1} 步操作`}
				onChange={handleStepChange}
				placeholder="操作步骤，支持 markdown"
				value={step.step}
			/>
			<MarkdownField
				ariaLabel={`第 ${props.index + 1} 步预期结果`}
				onChange={handleExpectedChange}
				placeholder="预期结果，支持 markdown"
				value={step.expected}
			/>
			<StepRowActions
				canMoveDown={props.canMoveDown}
				canMoveUp={props.canMoveUp}
				index={props.index}
				onMoveDown={handleMoveDown}
				onMoveUp={handleMoveUp}
				onRemove={handleRemove}
			/>
		</li>
	);
}

function moveStep(steps: CaseStep[], id: string, delta: number): CaseStep[] {
	const from = steps.findIndex((step) => step.id === id);
	const to = from + delta;
	if (from === -1 || to < 0 || to >= steps.length) {
		return steps;
	}
	const next = [...steps];
	const [moved] = next.splice(from, 1);
	if (moved) {
		next.splice(to, 0, moved);
	}
	return next;
}

/** Stable row callbacks derived from the current step list. */
function useStepActions(
	steps: CaseStep[],
	onChange: (steps: CaseStep[]) => void
) {
	return useMemo(
		() => ({
			add: () =>
				onChange([
					...steps,
					{ expected: "", id: crypto.randomUUID(), step: "" },
				]),
			change: (id: string, patch: Partial<CaseStep>) =>
				onChange(
					steps.map((step) => (step.id === id ? { ...step, ...patch } : step))
				),
			move: (id: string, delta: number) => onChange(moveStep(steps, id, delta)),
			remove: (id: string) => onChange(steps.filter((step) => step.id !== id)),
		}),
		[onChange, steps]
	);
}

interface StepsEditorProps {
	onChange: (steps: CaseStep[]) => void;
	steps: CaseStep[];
}

/** Ordered step list with in-place editing and up/down/remove (no drag). */
export function StepsEditor({ onChange, steps }: StepsEditorProps) {
	const actions = useStepActions(steps, onChange);

	return (
		<div className="flex flex-col gap-2">
			{/*
			 * 这一行和「前置条件」「用例名称」一样是字段标签，但它不是 <Label>
			 * （后面没有单一控件可关联），只能手写。因此得手工抄齐 Label 基类的
			 * 排版：font-medium + text-sm(14px) + leading-none。原先只对齐了字号，
			 * 少了 leading-none 这一条，行高就是 20px 而别的标签是 14px。
			 * 「新增步骤」按钮原先并排挂在这一行的行尾，把整行撑到按钮的 28px，
			 * 现在移到列表末尾——标签行回到 14px，与其余字段标签完全同高。
			 */}
			<span className="select-none font-medium text-sm leading-none">
				测试步骤
			</span>
			{/* 列表与「新增步骤」是同一组：组内行距 16px，与步骤行之间的行距同档 */}
			<div className="flex flex-col gap-4">
				{steps.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						还没有步骤，点击下面的按钮新增。
					</p>
				) : (
					<ol className="flex flex-col gap-4">
						{steps.map((step, index) => (
							<StepRow
								canMoveDown={index < steps.length - 1}
								canMoveUp={index > 0}
								index={index}
								key={step.id}
								onChange={actions.change}
								onMove={actions.move}
								onRemove={actions.remove}
								step={step}
							/>
						))}
					</ol>
				)}
				{/*
				 * self-start：按钮贴表单的起始边，与所有标签、输入框左边缘同线；
				 * 放在列表之后也正好是「填完最后一步」之后 Tab 的下一站。
				 */}
				<Button
					className="self-start"
					onClick={actions.add}
					size="sm"
					type="button"
					variant="outline"
				>
					<PlusIcon data-icon="inline-start" />
					新增步骤
				</Button>
			</div>
		</div>
	);
}
