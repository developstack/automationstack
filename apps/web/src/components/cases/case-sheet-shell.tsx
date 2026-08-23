/**
 * 新建与编辑用例共用的抽屉外壳。
 *
 * 「新建」原先是 384px 的 Dialog（sm:max-w-sm）、「编辑」是 768px 的 Sheet，
 * 同一件事两套宽度两种手感。现在两边都用这里的 CASE_SHEET_CONTENT_CLASS，
 * 共享同一个宽度、同一套字号，装的也是同一个 <CaseForm>。
 *
 * 宽度：w-11/12 上限 max-w-7xl(1280px)。刻意不做成整页——背后的用例列表
 * 始终留一条可见，用户知道自己没离开列表，点外面也能关。
 * 字号：抽屉内容层覆盖成 text-sm(14px)，不去改 packages/ui 里 Sheet / Dialog
 * 基类上的 text-xs/relaxed（那两条是全站每一个弹层的默认字号）。
 */
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@automationstack/ui/components/alert-dialog";
import { useCallback, useState } from "react";

import type { CaseFormValues } from "@/components/cases/case-meta";

export const CASE_SHEET_CONTENT_CLASS =
	"w-full! gap-0 p-0 text-sm sm:w-11/12! sm:max-w-7xl!";

/**
 * 字段级指纹，用来判断「有没有未保存的改动」。
 * 不直接 JSON.stringify 整个对象：那样结果依赖键的插入顺序，
 * 而表单值一路是 `{...values, name}` 这样展开出来的。
 */
function caseFormFingerprint(values: CaseFormValues): string {
	return JSON.stringify([
		values.caseType,
		values.maintainer,
		values.name,
		values.preconditions,
		values.priority,
		values.status,
		values.tagsText,
		values.steps.map((step) => [step.id, step.step, step.expected]),
	]);
}

/** 当前表单值与基线（新建为空表单 / 编辑为服务端最新值）是否已经不同。 */
export function isCaseFormDirty(
	values: CaseFormValues | null,
	baseline: CaseFormValues
): boolean {
	if (values === null) {
		return false;
	}
	return caseFormFingerprint(values) !== caseFormFingerprint(baseline);
}

/**
 * 点抽屉外面、按 Esc、点关闭按钮都会走 Base UI 的 onOpenChange(false)。
 * 有未保存改动时先弹二次确认，并且**不**改 open —— open 是受控的，
 * 不动它抽屉就留在原地，用户输入的内容一个字都不会丢。
 */
export function useUnsavedCloseGuard(
	hasUnsavedChanges: boolean,
	onClose: () => void
) {
	const [confirming, setConfirming] = useState(false);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				return;
			}
			if (hasUnsavedChanges) {
				setConfirming(true);
				return;
			}
			onClose();
		},
		[hasUnsavedChanges, onClose]
	);

	const cancelClose = useCallback(() => setConfirming(false), []);
	const confirmClose = useCallback(() => {
		setConfirming(false);
		onClose();
	}, [onClose]);

	return { cancelClose, confirmClose, confirming, handleOpenChange };
}

/**
 * 默认文案说的是「关掉抽屉」这一种后果。别的破坏性动作（比如取消编辑、
 * 抽屉留在原地）必须自己传准确的措辞进来，否则提示会与实际发生的事不符。
 */
const DEFAULT_CONFIRM_LABEL = "放弃并关闭";
const DEFAULT_DESCRIPTION = "这个抽屉里还有没保存的内容，关掉就找不回来了。";
const DEFAULT_TITLE = "放弃未保存的修改？";

interface UnsavedChangesDialogProps {
	/** 确认（破坏性）按钮文案，默认「放弃并关闭」。 */
	confirmLabel?: string;
	/** 正文，默认描述「关闭抽屉」的后果。 */
	description?: string;
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
	/** 标题，默认「放弃未保存的修改？」。 */
	title?: string;
}

/** 丢弃未保存内容前的挽回提示。默认文案针对「误关抽屉」。 */
export function UnsavedChangesDialog({
	confirmLabel = DEFAULT_CONFIRM_LABEL,
	description = DEFAULT_DESCRIPTION,
	onCancel,
	onConfirm,
	open,
	title = DEFAULT_TITLE,
}: UnsavedChangesDialogProps) {
	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				onCancel();
			}
		},
		[onCancel]
	);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>继续编辑</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
