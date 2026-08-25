import type { ApiTokenView } from "@automationstack/db/schema/api-tokens";
import { Button } from "@automationstack/ui/components/button";

import { RevokeApiTokenDialog } from "@/components/api-tokens/revoke-api-token-dialog";
import { useApiTokenActions } from "@/components/api-tokens/use-api-token-actions";

/**
 * 行尾的操作入口。
 *
 * 不套下拉菜单（成员那边套了）：这一行只有「吊销」一个动作，菜单等于在
 * 唯一一个目标前面再加一次点击。已吊销的行由 ApiTokensTable 拦在外面，
 * 压根不会渲染到这里——没有第二次可吊销。
 */
export function ApiTokenRowActions({ token }: { token: ApiTokenView }) {
	const actions = useApiTokenActions(token);

	return (
		<>
			{/* 带上备注名：读屏的按钮列表里，一排「吊销」互相分辨不出来 */}
			<Button
				aria-label={`吊销 token「${token.name}」`}
				onClick={actions.openConfirm}
				size="sm"
				variant="ghost"
			>
				吊销
			</Button>
			<RevokeApiTokenDialog actions={actions} token={token} />
		</>
	);
}
