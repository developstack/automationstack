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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { useLastNonNull } from "@/components/interaction/use-last-non-null";
import { orpc } from "@/utils/orpc";

interface VersionRollbackDialogProps {
	caseId: string;
	/** 最新的版本号。回滚产生的新版本是它的下一个版本 */
	latestVersion: number;
	onClose: () => void;
	targetVersion: number | null;
}

function useRollback(caseId: string, onClose: () => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.cases.rollback.mutationOptions({
			meta: { failureAction: "回滚" },
			onSuccess: (result) => {
				queryClient.invalidateQueries({
					queryKey: orpc.cases.get.key({ input: { id: caseId } }),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.cases.listVersions.key({ input: { caseId } }),
				});
				queryClient.invalidateQueries({ queryKey: orpc.cases.list.key() });
				if (result.version === null) {
					toast.info("这个版本与当前内容相同，没有产生新版本");
				} else {
					toast.success(`已回滚，产生了新版本 v${result.version.version}`);
				}
				onClose();
			},
		})
	);
}

/**
 * 回滚确认。说明回滚会产生一个新版本，现有的版本都保留。
 * 回滚中不能关闭对话框，也不能再次确认。失败时对话框保持打开，可以再次确认。
 */
export function VersionRollbackDialog({
	caseId,
	latestVersion,
	onClose,
	targetVersion,
}: VersionRollbackDialogProps) {
	const rollback = useRollback(caseId, onClose);
	// 关闭动画中 targetVersion 已经是 null，继续显示上一次的版本号
	const shownVersion = useLastNonNull(targetVersion);

	const handleConfirm = useCallback(() => {
		if (targetVersion !== null) {
			rollback.mutate({ caseId, version: targetVersion });
		}
	}, [caseId, rollback, targetVersion]);

	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!(open || rollback.isPending)) {
				onClose();
			}
		},
		[onClose, rollback.isPending]
	);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={targetVersion !== null}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						回滚到 <span className="numeric">{`v${shownVersion}`}</span>？
					</AlertDialogTitle>
					<AlertDialogDescription>
						{`回滚会用 v${shownVersion} 的内容产生一个新版本 v${latestVersion + 1}。现有的版本都会保留，不会被修改或删除。如果 v${shownVersion} 与当前内容相同，不会产生新版本。`}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={rollback.isPending}>
						取消
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={handleConfirm}
						pending={rollback.isPending}
					>
						确认回滚
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
