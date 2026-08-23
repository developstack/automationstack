/**
 * Confirmation dialog for `cases.rollback`. Rollback never rewrites
 * history: it re-applies an old snapshot as a brand-new version, so the
 * copy has to say so before the user confirms.
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

interface RollbackConfirmBodyProps {
	isPending: boolean;
	onConfirm: () => void;
	targetVersion: number | null;
}

function RollbackConfirmBody({
	isPending,
	onConfirm,
	targetVersion,
}: RollbackConfirmBodyProps) {
	return (
		<AlertDialogContent>
			<AlertDialogHeader>
				<AlertDialogTitle>回滚到 v{targetVersion}？</AlertDialogTitle>
				<AlertDialogDescription>
					回滚将以该版本内容创建一个新版本，历史不可变——现有版本不会被删除或覆盖。
				</AlertDialogDescription>
			</AlertDialogHeader>
			<AlertDialogFooter>
				<AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
				<AlertDialogAction disabled={isPending} onClick={onConfirm}>
					确认回滚
				</AlertDialogAction>
			</AlertDialogFooter>
		</AlertDialogContent>
	);
}

interface VersionRollbackDialogProps {
	caseId: string;
	onClose: () => void;
	/** Version to restore; `null` keeps the dialog closed. */
	targetVersion: number | null;
}

/** Second-step confirmation before rolling a case back to a version. */
export function VersionRollbackDialog({
	caseId,
	onClose,
	targetVersion,
}: VersionRollbackDialogProps) {
	const queryClient = useQueryClient();
	const rollback = useMutation(
		orpc.cases.rollback.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({
					queryKey: orpc.cases.get.key({ input: { id: caseId } }),
				});
				queryClient.invalidateQueries({
					queryKey: orpc.cases.listVersions.key({ input: { caseId } }),
				});
				queryClient.invalidateQueries({ queryKey: orpc.cases.list.key() });
				// 回滚到与当前内容一致的版本不会建新版本（version === null）。
				if (result.version === null) {
					toast.info("该版本与当前内容一致，未生成新版本");
				} else {
					toast.success(`已回滚，生成新版本 v${result.version.version}`);
				}
				onClose();
			},
		})
	);

	const handleConfirm = useCallback(() => {
		if (targetVersion !== null) {
			rollback.mutate({ caseId, version: targetVersion });
		}
	}, [caseId, rollback, targetVersion]);

	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) {
				onClose();
			}
		},
		[onClose]
	);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={targetVersion !== null}>
			<RollbackConfirmBody
				isPending={rollback.isPending}
				onConfirm={handleConfirm}
				targetVersion={targetVersion}
			/>
		</AlertDialog>
	);
}
