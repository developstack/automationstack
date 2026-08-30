/**
 * 「打回未测」这颗按钮，连同它**有条件**的二次确认。
 *
 * 按钮面上只写四个字，与旁边的「修改」同 size、同 variant——用户要的是视觉上
 * 成对的一组（原话：「按钮大小要控制一样大，视觉对齐」）。原先写在按钮上的那句
 * 「（清空全部分步判定）」因此不能留在面上：它一个人就比「修改」长六倍，
 * 两颗按钮当场不成对。
 *
 * 但那句警告**不能就这么丢掉**——分步形态下回退会把 `step_results` 一并清空，
 * 点下去丢的是一整屏逐步判定，不是一个结论。它现在只有一条抵达路径：点击后
 * 这个确认框的正文，**真会丢东西时必须读到**。
 *
 * 按钮本身原先还挂过一份 `title` 属性，值就是这句 warning，悬停时先冒一遍——
 * 已经删掉：那段文本跟确认框正文逐字相同，留着只是同一句话说两遍；而且
 * `title` 靠鼠标悬停触发，键盘用户和触屏用户根本碰不到它，等于专门为一部分
 * 用户多画一个没人看得见的重复气泡。
 *
 * ## 确认框为什么改成有条件的
 *
 * 原先无条件弹：判过「通过」、没写说明、没有分步记录的用例也照弹一次。那种回退
 * 什么都不会丢（再点一次「通过」就回来了），弹框只是在每条用例上收一次过路费，
 * 而且教会用户闭着眼睛点确认——真正该拦下的那一次也就跟着被点过去了。
 *
 * 现在「会不会丢东西」由 `resetWarning()` 回答，它同时给出正文：`null` 就直接
 * 执行，非 null 才弹，且正文点名丢的是说明还是分步判定。判据与文案是同一个函数
 * 的同一次调用，不可能出现「弹了框却说不清丢什么」。回退具体清哪些列、为什么
 * 附件与缺陷关联不在其中，全写在 `run-reset-impact.ts` 的文件注释里。
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

import { resetWarning } from "@/components/test-runs/run-reset-impact";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ResetConfirmDialogProps {
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	/**
	 * 正文 = 这次回退会丢掉的东西，由 `resetWarning()` 给出。
	 * 类型是 `string` 而不是 `string | null`：没有正文就没有这个框，
	 * 「弹了框却说不出丢什么」这种状态在类型上就不该表示得出来。
	 */
	warning: string;
}

/** 拆出来是为了把 `ResetVerdictButton` 压回 50 行以内，没有别的语义。 */
function ResetConfirmDialog({
	onConfirm,
	onOpenChange,
	open,
	warning,
}: ResetConfirmDialogProps) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>把这条用例打回未测？</AlertDialogTitle>
					<AlertDialogDescription>{warning}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						打回未测
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export interface ResetVerdictButtonProps {
	/** 能否打结论：`pending_review` 与 `submitted` 都不能。 */
	canConclude: boolean;
	/** 用例级说明。有字就意味着这次回退会清掉它，要拦一下。 */
	comment: string | null;
	onReset: () => void;
	/** 已保存的分步判定条数（`runCase.stepResults.length`）。 */
	stepResultCount: number;
}

export function ResetVerdictButton({
	canConclude,
	comment,
	onReset,
	stepResultCount,
}: ResetVerdictButtonProps) {
	const [open, setOpen] = useState(false);
	const close = useCallback(() => setOpen(false), []);
	const handleOpenChange = useCloseOnDismiss(close);
	const warning = resetWarning({ comment, stepResultCount });
	// 什么都不会丢就别拦：直接回退，用户想反悔再判一次即可。
	const handleClick = useCallback(() => {
		if (warning === null) {
			onReset();
			return;
		}
		setOpen(true);
	}, [onReset, warning]);
	// 确认框自己不会关：`AlertDialogAction` 是一颗普通 Button（见 alert-dialog.tsx），
	// 关闭得由这里做，先关再发请求，否则回退成功后框会挂在屏幕上。
	const handleConfirm = useCallback(() => {
		setOpen(false);
		onReset();
	}, [onReset]);

	return (
		<>
			<Button
				// aria-disabled 而不是 disabled：禁用的按钮仍然要能被 Tab 到，
				// 否则读屏用户根本发现不了「这里有个现在不能用的控件」。
				aria-disabled={canConclude ? undefined : true}
				onClick={canConclude ? handleClick : undefined}
				size="sm"
				type="button"
				variant="outline"
			>
				<RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
				打回未测
			</Button>
			{/* 不会丢东西时整个确认框不渲染：它此刻没有正文可写，留一具空壳在树上，
			    只会让下一个人以为这条路径还有二次确认。 */}
			{warning === null ? null : (
				<ResetConfirmDialog
					onConfirm={handleConfirm}
					onOpenChange={handleOpenChange}
					open={open}
					warning={warning}
				/>
			)}
		</>
	);
}
