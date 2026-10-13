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
import { useBlocker } from "@tanstack/react-router";
import { useCallback } from "react";

import { isChangePasswordPathname } from "@/utils/password-change";
import { isLoginPathname } from "@/utils/session-expiry";

// 会话过期和要求改密码时的强制跳转不能拦：会话已失效，留下来也保存不了
function shouldBlock({ next }: { next: { pathname: string } }): boolean {
	return !(
		isLoginPathname(next.pathname) || isChangePasswordPathname(next.pathname)
	);
}

/**
 * 表单有未保存的修改时，离开页面会提醒。
 * 站内跳转（包括切换会卸载表单的标签页）显示确认对话框；
 * 关闭或刷新标签页时由浏览器提醒。
 */
export function UnsavedChangesGuard({ dirty }: { dirty: boolean }) {
	const blocker = useBlocker({
		disabled: !dirty,
		enableBeforeUnload: dirty,
		shouldBlockFn: shouldBlock,
		withResolver: true,
	});
	const { reset } = blocker;
	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				reset?.();
			}
		},
		[reset]
	);

	return (
		<AlertDialog
			onOpenChange={handleOpenChange}
			open={blocker.status === "blocked"}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
					<AlertDialogDescription>
						有修改还没有保存。继续操作后，这些修改会丢失。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>继续编辑</AlertDialogCancel>
					<AlertDialogAction onClick={blocker.proceed} variant="destructive">
						放弃修改
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
