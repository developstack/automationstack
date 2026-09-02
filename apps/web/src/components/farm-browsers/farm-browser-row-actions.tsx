/**
 * 目录行尾的两个动作：编辑、删除。
 *
 * 不套 DropdownMenu（平台用户那一行套了）：那一行有五个动作，摊开会占满半张
 * 表；这里只有两个，藏进菜单等于给每次编辑多加一次点击，而这一页本来就是给
 * 管理员批量核对镜像用的。
 */
import type { FarmBrowser } from "@automationstack/db/schema/farm-browsers";
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
import { PencilIcon, Trash2Icon } from "lucide-react";
import { useCallback, useState } from "react";

import { FarmFormError } from "@/components/farm/farm-form-error";
import { EditFarmBrowserDialog } from "@/components/farm-browsers/edit-farm-browser-dialog";
import { browserDisplayName } from "@/components/farm-browsers/farm-browser-meta";
import { useRemoveFarmBrowser } from "@/components/farm-browsers/use-farm-browser-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/**
 * 删除确认框。纯展示：过程与它的错误由调用方持有——那样「打开前先 reset」
 * 才做得到，否则上一次的失败会在下一次打开时原样浮出来，而它讲的是上一行的事。
 */
function RemoveBrowserDialog({
	error,
	name,
	onClose,
	onConfirm,
	open,
	pending,
}: {
	error: string | undefined;
	name: string;
	onClose: () => void;
	onConfirm: () => void;
	open: boolean;
	pending: boolean;
}) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>从目录删除「{name}」？</AlertDialogTitle>
					{/*
					 * 说清后果的边界：删的是「以后还能不能按这个版本要会话」，
					 * 不是已经跑完的会话记录——不写清楚，人会担心历史产物一起没了。
					 * 只是想暂时停用的话有更轻的办法，顺手指出来。
					 */}
					<AlertDialogDescription>
						之后指名这个版本的脚本会起不来；已经跑过的会话与产物照常保留。
						只是想暂时不接新会话的话，用编辑里的「启用」开关更合适。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<FarmFormError message={error} />
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
					<AlertDialogAction
						disabled={pending}
						onClick={onConfirm}
						variant="destructive"
					>
						删除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function FarmBrowserRowActions({ row }: { row: FarmBrowser }) {
	const [editing, setEditing] = useState(false);
	const [removing, setRemoving] = useState(false);
	const name = browserDisplayName(row);
	const closeRemove = useCallback(() => setRemoving(false), []);
	const remove = useRemoveFarmBrowser(name, closeRemove);
	const openEdit = useCallback(() => setEditing(true), []);
	const closeEdit = useCallback(() => setEditing(false), []);
	const openRemove = useCallback(() => {
		// 打开前清掉上一次的错误，否则会看到一条与这次删除无关的报错
		remove.reset();
		setRemoving(true);
	}, [remove]);
	const confirmRemove = useCallback(
		() => remove.mutate({ id: row.id }),
		[remove, row.id]
	);

	return (
		<div className="flex justify-end gap-1">
			{/*
			 * 图标 + sr-only 文案：读屏的按钮列表里，一排「编辑」互相分辨不出来，
			 * 而这张表里两行常常只差一个版本号——所以每个标签都带上行名。
			 */}
			<Button onClick={openEdit} size="icon-sm" type="button" variant="ghost">
				<PencilIcon aria-hidden="true" />
				<span className="sr-only">编辑「{name}」</span>
			</Button>
			<Button onClick={openRemove} size="icon-sm" type="button" variant="ghost">
				<Trash2Icon aria-hidden="true" />
				<span className="sr-only">删除「{name}」</span>
			</Button>
			<EditFarmBrowserDialog onClose={closeEdit} open={editing} row={row} />
			<RemoveBrowserDialog
				error={remove.error?.message}
				name={name}
				onClose={closeRemove}
				onConfirm={confirmRemove}
				open={removing}
				pending={remove.isPending}
			/>
		</div>
	);
}
