/**
 * 轮换 token：先确认，再把新明文摆出来（同样只显示这一次）。
 *
 * 用 Dialog 而不是 AlertDialog，虽然第一步确实是一次破坏性确认：AlertDialog 的
 * 页脚钉死是「取消 + 动作」一对，而这张框的**第二步**没有取消可言——token 已经
 * 发出去了，旧的已经作废，那一步只剩一颗「我已存好」。两步塞进 AlertDialog 就要
 * 在它的 Cancel/Action 里塞一颗名不副实的按钮，读屏念出来的角色是错的。
 *
 * 明文只活在下面那个 `useState` 里，随组件卸载一起没；卸载由外层的
 * `{open ? … : null}` 保证（同 create-farm-node-dialog.tsx 那段注释）。
 */
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { useCallback, useState } from "react";

import { FarmFormError } from "@/components/farm/farm-form-error";
import type { FarmNodeRow } from "@/components/farm-nodes/farm-node-meta";
import { FarmNodeTokenPlaintext } from "@/components/farm-nodes/farm-node-token-plaintext";
import { useRotateFarmNodeToken } from "@/components/farm-nodes/use-farm-node-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（「立刻失效； 那台机器」）。
 */
const CONFIRM_DESCRIPTION =
	"旧 token 立刻失效。那台机器上的 agent 会开始报鉴权失败、掉出在线列表，要把新 token 填进它的 NODE_AGENT_TOKEN 再重启一次才能回来。正在跑的会话不受影响。";

/**
 * 第一步：破坏性确认。单独拆一个组件只为把下面那个 body 压回 50 行以内
 * （eslint 的 max-lines-per-function），它自己不持有任何状态。
 */
function RotateConfirmStep({
	error,
	name,
	onClose,
	onConfirm,
	pending,
}: {
	error: string | undefined;
	name: string;
	onClose: () => void;
	onConfirm: () => void;
	pending: boolean;
}) {
	return (
		<>
			<DialogHeader>
				<DialogTitle>给「{name}」换一枚 token？</DialogTitle>
				<DialogDescription>{CONFIRM_DESCRIPTION}</DialogDescription>
			</DialogHeader>
			{/* NOT_FOUND（多半是别人刚把这台机器删了）就地说，框还开着，人正盯着它 */}
			<FarmFormError message={error} />
			<DialogFooter>
				<Button
					disabled={pending}
					onClick={onClose}
					type="button"
					variant="outline"
				>
					取消
				</Button>
				<Button
					disabled={pending}
					onClick={onConfirm}
					type="button"
					variant="destructive"
				>
					{pending ? "轮换中…" : "轮换"}
				</Button>
			</DialogFooter>
		</>
	);
}

function RotateFarmNodeTokenBody({
	onClose,
	row,
}: {
	onClose: () => void;
	row: FarmNodeRow;
}) {
	const [token, setToken] = useState<string | null>(null);
	const rotate = useRotateFarmNodeToken(setToken);
	const { mutate } = rotate;
	const handleConfirm = useCallback(
		() => mutate({ id: row.id }),
		[mutate, row.id]
	);

	if (token === null) {
		return (
			<RotateConfirmStep
				error={rotate.error?.message}
				name={row.name}
				onClose={onClose}
				onConfirm={handleConfirm}
				pending={rotate.isPending}
			/>
		);
	}

	return (
		<>
			<DialogHeader>
				<DialogTitle>新 token 已生效</DialogTitle>
				<DialogDescription>
					旧的已经作废。复制下面这串，填进那台机器上 agent 的 NODE_AGENT_TOKEN
					再重启。
				</DialogDescription>
			</DialogHeader>
			<FarmNodeTokenPlaintext token={token} />
			<DialogFooter>
				<Button onClick={onClose} type="button">
					我已存好
				</Button>
			</DialogFooter>
		</>
	);
}

export function RotateFarmNodeTokenDialog({
	onClose,
	open,
	row,
}: {
	onClose: () => void;
	open: boolean;
	row: FarmNodeRow;
}) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				{/* `open ? … : null` 删不得：它是明文「关掉就没了」的唯一保证 */}
				{open ? <RotateFarmNodeTokenBody onClose={onClose} row={row} /> : null}
			</DialogContent>
		</Dialog>
	);
}
