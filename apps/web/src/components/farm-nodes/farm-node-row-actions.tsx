/**
 * 节点行尾的三个动作：编辑、轮换 token、删除。
 *
 * 不套 DropdownMenu（平台用户那一行套了）：那一行有五个动作，摊开会占满半张表；
 * 这里只有三个，藏进菜单等于给每次编辑多加一次点击。中间那颗（轮换）是**破坏性
 * 的**，却夹在两颗常用按钮中间——所以它自己带确认框，而不是靠位置来防手滑。
 */
import { Button } from "@automationstack/ui/components/button";
import { KeyRoundIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

import { EditFarmNodeDialog } from "@/components/farm-nodes/edit-farm-node-dialog";
import type { FarmNodeRow } from "@/components/farm-nodes/farm-node-meta";
import { RemoveFarmNodeDialog } from "@/components/farm-nodes/remove-farm-node-dialog";
import { RotateFarmNodeTokenDialog } from "@/components/farm-nodes/rotate-farm-node-token-dialog";
import { useRemoveFarmNode } from "@/components/farm-nodes/use-farm-node-mutations";

/** 三个开关态 + 删除过程。拆成 hook 只为把下面那个组件压回 50 行以内。 */
function useRowActions(row: FarmNodeRow) {
	const [editing, setEditing] = useState(false);
	const [removing, setRemoving] = useState(false);
	const [rotating, setRotating] = useState(false);
	const closeRemove = useCallback(() => setRemoving(false), []);
	const remove = useRemoveFarmNode(row.name, closeRemove);
	const { reset } = remove;

	return {
		closeEdit: useCallback(() => setEditing(false), []),
		closeRemove,
		closeRotate: useCallback(() => setRotating(false), []),
		confirmRemove: useCallback(
			() => remove.mutate({ id: row.id }),
			[remove, row.id]
		),
		editing,
		openEdit: useCallback(() => setEditing(true), []),
		openRemove: useCallback(() => {
			// 打开前清掉上一次的错误，否则会看到一条与这次删除无关的报错
			reset();
			setRemoving(true);
		}, [reset]),
		openRotate: useCallback(() => setRotating(true), []),
		removeError: remove.error?.message,
		removePending: remove.isPending,
		removing,
		rotating,
	};
}

/**
 * 一颗行尾图标按钮。抽出来是因为三颗按钮除了图标和文案之外逐字相同，
 * 而复制三遍 variant/size/type 的后果是将来改样式时漏掉其中一颗。
 * 图标一律 `aria-hidden`，可读的名字全部交给 sr-only 那段。
 */
function RowActionButton({
	icon,
	label,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<Button onClick={onClick} size="icon-sm" type="button" variant="ghost">
			{icon}
			<span className="sr-only">{label}</span>
		</Button>
	);
}

export function FarmNodeRowActions({ row }: { row: FarmNodeRow }) {
	const actions = useRowActions(row);

	return (
		<div className="flex justify-end gap-1">
			{/*
			 * 图标 + sr-only 文案：读屏的按钮列表里，一排「编辑」互相分辨不出来，
			 * 而这张表里两台机器常常只差一个尾号——所以每个标签都带上节点名。
			 */}
			<RowActionButton
				icon={<PencilIcon />}
				label={`编辑「${row.name}」`}
				onClick={actions.openEdit}
			/>
			<RowActionButton
				icon={<KeyRoundIcon />}
				label={`轮换「${row.name}」的 token`}
				onClick={actions.openRotate}
			/>
			<RowActionButton
				icon={<Trash2Icon />}
				label={`删除「${row.name}」`}
				onClick={actions.openRemove}
			/>
			<EditFarmNodeDialog
				onClose={actions.closeEdit}
				open={actions.editing}
				row={row}
			/>
			<RotateFarmNodeTokenDialog
				onClose={actions.closeRotate}
				open={actions.rotating}
				row={row}
			/>
			<RemoveFarmNodeDialog
				error={actions.removeError}
				name={row.name}
				onClose={actions.closeRemove}
				onConfirm={actions.confirmRemove}
				open={actions.removing}
				pending={actions.removePending}
			/>
		</div>
	);
}
