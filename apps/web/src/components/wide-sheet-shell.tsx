/**
 * 大抽屉的共用外壳约定：一个宽度、一套字号、一套「有未保存改动就先问一句」。
 *
 * 这套东西原先长在 cases/case-sheet-shell.tsx 里，因为最早只有用例需要它
 * （「新建」是 384px 的 Dialog、「编辑」是 768px 的 Sheet，同一件事两套宽度
 * 两种手感）。后来测试任务那边又各自长出了 max-w-5xl 的 Dialog，同样的毛病
 * 复发了一遍。所以常量挪到这个中立的位置：用例抽屉与测试任务抽屉引用的是
 * **同一个字符串**，谁都没法单独把自己调宽一点，两边不会各自漂移。
 *
 * 宽度：w-11/12 上限 max-w-7xl(1280px)。刻意不做成整页——背后的列表始终留一条
 * 可见，用户知道自己没离开列表，点外面也能关。
 * 字号：抽屉内容层覆盖成 text-sm(14px)，不去改 packages/ui 里 Sheet / Dialog
 * 基类上的 text-xs/relaxed（那两条是全站每一个弹层的默认字号）。
 * 高度不写：SheetContent 在 side="right" 下自带 inset-y-0 + h-full，本来就是
 * 满高的，不需要 Dialog 那边为了撑开高度而加的 h-4/5。
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

export const WIDE_SHEET_CONTENT_CLASS =
	"w-full! gap-0 p-0 text-sm sm:w-11/12! sm:max-w-7xl!";

/**
 * 点抽屉外面、按 Esc、点关闭按钮都会走 Base UI 的 onOpenChange(false)。
 * 有未保存改动时先弹二次确认，并且**不**改 open —— open 是受控的，
 * 不动它抽屉就留在原地，用户输入的内容一个字都不会丢。
 *
 * 「有没有改动」由调用方自己算：每张表单的字段不一样，塞一个通用的
 * deep-equal 进来只会让各处的判定口径变得看不见。
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
