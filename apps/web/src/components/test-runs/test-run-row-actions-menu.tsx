import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";

function RowActionsTrigger({ runName }: { runName: string }) {
	return (
		<DropdownMenuTrigger
			render={
				<Button
					aria-label={`测试任务「${runName}」操作`}
					size="icon-xs"
					variant="ghost"
				>
					<MoreHorizontalIcon />
				</Button>
			}
		/>
	);
}

export interface TestRunRowActionsMenuProps {
	canEdit: boolean;
	canRetest: boolean;
	canVoid: boolean;
	onEdit: () => void;
	onRetest: () => void;
	onVoid: () => void;
	runName: string;
}

export function TestRunRowActionsMenu(props: TestRunRowActionsMenuProps) {
	return (
		<DropdownMenu>
			<RowActionsTrigger runName={props.runName} />
			<DropdownMenuContent align="end">
				{props.canEdit ? (
					<DropdownMenuItem onClick={props.onEdit}>编辑</DropdownMenuItem>
				) : null}
				{props.canRetest ? (
					<DropdownMenuItem onClick={props.onRetest}>
						从失败用例创建
					</DropdownMenuItem>
				) : null}
				{props.canVoid ? (
					<DropdownMenuItem onClick={props.onVoid} variant="destructive">
						作废
					</DropdownMenuItem>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
