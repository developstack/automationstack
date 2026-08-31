import type { ApiTokenView } from "@automationstack/db/schema/api-tokens";
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

import { ApiTokenFormError } from "@/components/api-tokens/api-token-form-error";
import type { ApiTokenActions } from "@/components/api-tokens/use-api-token-actions";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface RevokeApiTokenDialogProps {
	actions: ApiTokenActions;
	token: ApiTokenView;
}

/**
 * 吊销的二次确认；服务端拒绝时错误就显示在框里，框不关闭。
 *
 * 这一步值得拦一下的理由不是「点错了很麻烦」，是它没有下一步：库里只有
 * 哈希，吊销之后既恢复不了、也重新看不到明文，正在用它的脚本下一次请求
 * 就开始 401。这两句必须写在框里，不能只靠按钮的红色暗示。
 */
export function RevokeApiTokenDialog({
	actions,
	token,
}: RevokeApiTokenDialogProps) {
	const handleOpenChange = useCloseOnDismiss(actions.closeConfirm);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={actions.confirming}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>吊销「{token.name}」？</AlertDialogTitle>
					<AlertDialogDescription>
						吊销不可撤销，也无法恢复。正在用这枚 token 的脚本会立刻开始收到
						401，需要新建一枚再改配置。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<ApiTokenFormError message={actions.error} />
				<AlertDialogFooter>
					<AlertDialogCancel disabled={actions.isPending}>
						取消
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={actions.isPending}
						onClick={actions.confirm}
						variant="destructive"
					>
						吊销
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
