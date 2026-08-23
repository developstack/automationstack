import type { PublicUser } from "@automationstack/db/schema/users";
import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { MemberConfirmDialog } from "@/components/members/member-confirm-dialog";
import { ResetPasswordDialog } from "@/components/members/reset-password-dialog";
import { useMemberActions } from "@/components/members/use-member-actions";

interface MemberActionsMenuProps {
	member: PublicUser;
	onDemote: () => void;
	onDisable: () => void;
	onPromote: () => void;
	onReset: () => void;
	onRestore: () => void;
}

function MemberActionsMenu({
	member,
	onDemote,
	onDisable,
	onPromote,
	onReset,
	onRestore,
}: MemberActionsMenuProps) {
	return (
		<DropdownMenu>
			{/* 带上用户名：读屏的按钮列表里，一排「成员操作」互相分辨不出来 */}
			<DropdownMenuTrigger
				render={
					<Button
						aria-label={`成员「${member.username}」操作`}
						size="icon-xs"
						variant="ghost"
					>
						<MoreHorizontalIcon />
					</Button>
				}
			/>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={onReset}>重置密码</DropdownMenuItem>
				{member.role === "admin" ? (
					<DropdownMenuItem onClick={onDemote}>设为成员</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={onPromote}>设为管理员</DropdownMenuItem>
				)}
				{member.disabledAt === null ? (
					<DropdownMenuItem onClick={onDisable} variant="destructive">
						停用
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={onRestore}>恢复</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** 成员表格行尾的操作入口：菜单 + 它触发的两个对话框。 */
export function MemberRowActions({ member }: { member: PublicUser }) {
	const actions = useMemberActions(member);
	const { open } = actions;
	const [resetting, setResetting] = useState(false);
	const openReset = useCallback(() => setResetting(true), []);
	const closeReset = useCallback(() => setResetting(false), []);
	const askDemote = useCallback(() => open("demote"), [open]);
	const askDisable = useCallback(() => open("disable"), [open]);
	const askPromote = useCallback(() => open("promote"), [open]);
	const askRestore = useCallback(() => open("restore"), [open]);

	return (
		<>
			<MemberActionsMenu
				member={member}
				onDemote={askDemote}
				onDisable={askDisable}
				onPromote={askPromote}
				onReset={openReset}
				onRestore={askRestore}
			/>
			<MemberConfirmDialog actions={actions} member={member} />
			<ResetPasswordDialog
				member={resetting ? member : null}
				onClose={closeReset}
			/>
		</>
	);
}
