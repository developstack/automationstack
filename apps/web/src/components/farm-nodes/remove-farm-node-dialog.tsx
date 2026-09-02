/**
 * 删除节点的确认框。纯展示：过程与它的错误由调用方（farm-node-row-actions.tsx）
 * 持有——那样「打开前先 reset」才做得到，否则上一次的失败会在下一次打开时原样
 * 浮出来，而它讲的是上一台机器的事。
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

import { FarmFormError } from "@/components/farm/farm-form-error";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（「一起作废； 那台机器上」）。
 *
 * 说清后果的三个边界：token 作废（这是删除与停用的真正差别）、agent 进程不会
 * 自己停（这边动不了那台真机，D3），以及更轻的那条出路。不写清楚的话，人会
 * 以为删掉这一行就等于把那台机器上的东西也收拾干净了。
 */
const REMOVE_DESCRIPTION =
	"这台机器的 token 会一起作废，它上面的 agent 会开始报鉴权失败——但那个进程不会自己停，得有人去那台机器上关掉。已经跑过的会话与产物照常保留。只是想暂时不接新会话的话，用行上的启用开关更合适。";

export function RemoveFarmNodeDialog({
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
					<AlertDialogTitle>删除节点「{name}」？</AlertDialogTitle>
					<AlertDialogDescription>{REMOVE_DESCRIPTION}</AlertDialogDescription>
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
