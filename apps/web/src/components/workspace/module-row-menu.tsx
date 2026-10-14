import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import {
	EllipsisIcon,
	FolderPlusIcon,
	PencilIcon,
	Trash2Icon,
} from "lucide-react";

import {
	type ModuleMenuProps,
	useInlineEditFocus,
} from "@/components/workspace/module-menu-focus";

/** 模块行右侧的「更多操作」按钮和菜单。 */
export function ModuleRowMenu(props: ModuleMenuProps) {
	const { createChild, finalFocus, rename } = useInlineEditFocus(props);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						aria-label={`模块「${props.name}」更多操作`}
						className="text-muted-foreground"
						size="icon-xs"
						variant="ghost"
					/>
				}
			>
				<EllipsisIcon aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				aria-label={`模块「${props.name}」操作`}
				className="min-w-36"
				finalFocus={finalFocus}
			>
				<DropdownMenuItem onClick={rename}>
					<PencilIcon aria-hidden="true" />
					重命名
				</DropdownMenuItem>
				<DropdownMenuItem onClick={createChild}>
					<FolderPlusIcon aria-hidden="true" />
					新建子模块
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={props.onDelete} variant="destructive">
					<Trash2Icon aria-hidden="true" />
					删除
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
