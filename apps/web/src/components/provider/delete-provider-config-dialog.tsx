/**
 * 删除一条登记的二次确认（样式与文案口径照 revoke-api-token-dialog）。
 *
 * 值得拦一下的理由不是「点错了很麻烦」，而是它没有撤销入口：登记连同密文
 * 一起消失，重填一遍 API Key 才能恢复。同时把「这是登记处，不是生效开关」
 * 说在框里——不然管理员会以为删一行就能停掉生成。
 */
import type { AiProviderConfigView } from "@automationstack/api/routers/ai-provider-config";
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

/** 删除成功后失效列表并报一句 toast；幂等结果（deleted=false）也要说清楚。 */
function useDeleteProviderConfig(config: AiProviderConfigView) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.aiProviderConfig.delete.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({
					queryKey: orpc.aiProviderConfig.list.key(),
				});
				toast.success(
					result.deleted
						? `已删除登记：${config.providerId} / ${config.modelId}`
						: "该条登记已不存在（可能已被其他人删除）"
				);
			},
		})
	);
}

export interface DeleteProviderConfigDialogProps {
	config: AiProviderConfigView;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

export function DeleteProviderConfigDialog({
	config,
	onOpenChange,
	open,
}: DeleteProviderConfigDialogProps) {
	const remove = useDeleteProviderConfig(config);
	const confirm = useCallback(
		() => remove.mutate({ id: config.id }),
		[config.id, remove]
	);

	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						删除「{config.providerId} / {config.modelId}」？
					</AlertDialogTitle>
					<AlertDialogDescription>
						删除后这行登记连同已存的 API Key 一起消失，无法恢复，需要时只能重新
						登记。这一页是登记处：AI 生成读的是服务端环境变量，删除登记不会
						影响现有生成。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={remove.isPending}>
						取消
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={remove.isPending}
						onClick={confirm}
						variant="destructive"
					>
						删除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
