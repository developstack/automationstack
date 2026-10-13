import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@automationstack/ui/components/context-menu";
import { FolderPlusIcon, PencilIcon, Trash2Icon } from "lucide-react";

import {
	type ModuleMenuProps,
	useInlineEditFocus,
} from "@/components/workspace/module-menu-focus";

/** 右键或按菜单键打开的模块菜单，内容与行尾的「更多操作」相同。 */
export function ModuleContextMenuContent(props: ModuleMenuProps) {
	const { createChild, finalFocus, rename } = useInlineEditFocus(props);
	return (
		<ContextMenuContent
			aria-label={`模块「${props.name}」操作`}
			finalFocus={finalFocus}
		>
			<ContextMenuItem onClick={rename}>
				<PencilIcon aria-hidden="true" />
				重命名
			</ContextMenuItem>
			<ContextMenuItem onClick={createChild}>
				<FolderPlusIcon aria-hidden="true" />
				新建子模块
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={props.onDelete} variant="destructive">
				<Trash2Icon aria-hidden="true" />
				删除
			</ContextMenuItem>
		</ContextMenuContent>
	);
}
