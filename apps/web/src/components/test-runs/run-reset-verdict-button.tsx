/**
 * 「打回未测」这颗按钮，连同它的二次确认。
 *
 * 按钮面上只写四个字，与旁边的「修改」同 size、同 variant——用户要的是视觉上
 * 成对的一组（原话：「按钮大小要控制一样大，视觉对齐」）。原先写在按钮上的那句
 * 「（清空全部分步判定）」因此不能留在面上：它一个人就比「修改」长六倍，
 * 两颗按钮当场不成对。
 *
 * 但那句警告**不能就这么丢掉**——分步形态下回退会把 `step_results` 一并清空，
 * 点下去丢的是一整屏逐步判定，不是一个结论。它现在只有一条抵达路径：点击后
 * 这个确认框的正文，**每次都必须读到**。
 *
 * 按钮本身原先还挂过一份 `title` 属性，值就是这句 warning，悬停时先冒一遍——
 * 已经删掉：那段文本跟确认框正文逐字相同，留着只是同一句话说两遍；而且
 * `title` 靠鼠标悬停触发，键盘用户和触屏用户根本碰不到它，等于专门为一部分
 * 用户多画一个没人看得见的重复气泡。
 *
 * 非分步形态同样确认：后端回退成未测时会把 `comment` 与 `executedAt` 一起清掉
 * （见 `buildResultPatch`），那也是有人写过的字，同样不该一点就没。
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
import { Button } from "@automationstack/ui/components/button";
import { RotateCcwIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/** 两种形态回退掉的东西不是一回事，这句话必须分开写。 */
function resetWarning(hasSteps: boolean): string {
	if (hasSteps) {
		return "这条用例的全部分步判定会被一并清空，回到一步都没判的状态；要恢复只能逐步重新判一遍。";
	}
	return "这条用例的结论与说明会被清空，回到未测状态。";
}

export interface ResetVerdictButtonProps {
	/** 能否打结论：`pending_review` 与 `submitted` 都不能。 */
	canConclude: boolean;
	/** 有步骤的用例走分步判定，回退掉的东西多得多。 */
	hasSteps: boolean;
	onReset: () => void;
}

export function ResetVerdictButton({
	canConclude,
	hasSteps,
	onReset,
}: ResetVerdictButtonProps) {
	const [open, setOpen] = useState(false);
	const close = useCallback(() => setOpen(false), []);
	const handleOpenChange = useCloseOnDismiss(close);
	const askConfirm = useCallback(() => setOpen(true), []);
	// 确认框自己不会关：`AlertDialogAction` 是一颗普通 Button（见 alert-dialog.tsx），
	// 关闭得由这里做，先关再发请求，否则回退成功后框会挂在屏幕上。
	const handleConfirm = useCallback(() => {
		setOpen(false);
		onReset();
	}, [onReset]);
	const warning = resetWarning(hasSteps);

	return (
		<>
			<Button
				// aria-disabled 而不是 disabled：禁用的按钮仍然要能被 Tab 到，
				// 否则读屏用户根本发现不了「这里有个现在不能用的控件」。
				aria-disabled={canConclude ? undefined : true}
				onClick={canConclude ? askConfirm : undefined}
				size="sm"
				type="button"
				variant="outline"
			>
				<RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
				打回未测
			</Button>
			<AlertDialog onOpenChange={handleOpenChange} open={open}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>把这条用例打回未测？</AlertDialogTitle>
						<AlertDialogDescription>{warning}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirm} variant="destructive">
							打回未测
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
