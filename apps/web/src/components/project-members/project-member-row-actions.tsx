import type { ProjectMemberView } from "@automationstack/db/repositories/project-members-repository";
import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import { useCallback } from "react";

import { ProjectMemberConfirmDialog } from "@/components/project-members/project-member-confirm-dialog";
import { useProjectMemberActions } from "@/components/project-members/use-project-member-actions";

interface ProjectMemberActionsMenuProps {
	isSelf: boolean;
	member: ProjectMemberView;
	onDemote: () => void;
	onPromote: () => void;
	onRemove: () => void;
}

function ProjectMemberActionsMenu({
	isSelf,
	member,
	onDemote,
	onPromote,
	onRemove,
}: ProjectMemberActionsMenuProps) {
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
				{member.role === "owner" ? (
					<DropdownMenuItem onClick={onDemote}>设为成员</DropdownMenuItem>
				) : (
					<DropdownMenuItem onClick={onPromote}>设为拥有者</DropdownMenuItem>
				)}
				{/*
				 * 自己那一行没有这一项，而不是画一颗禁用的：这件事不是「现在不行、
				 * 待会儿也许可以」，是永远不该由自己发起（服务端同样拒绝，见
				 * routers/project-members.ts 的 SELF_REMOVE_MESSAGE）。
				 * 「设为成员」留着：自降为 member 仍然留在项目里，页面照常能用，
				 * 而且另一个 owner 随时能改回来。
				 */}
				{isSelf ? null : (
					<DropdownMenuItem onClick={onRemove} variant="destructive">
						移出项目
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

interface ProjectMemberRowActionsProps {
	/** 这一行是当前登录者自己；由表格算好传进来（那里只订阅一次会话）。 */
	isSelf: boolean;
	member: ProjectMemberView;
	projectId: string;
}

/**
 * 成员表格行尾的操作入口：菜单 + 它触发的确认框。
 *
 * 这个组件只在有管理权限时才被渲染（判定在 project-members-page.tsx），所以
 * 里面没有任何 disabled 分支：一颗点得下去却每次都被服务端拒绝的按钮，比一个
 * 干脆不出现的按钮更难理解。
 *
 * 「最后一个 owner 不许降级 / 移除」这条**没有**在这里做前端预判（比如数一数
 * owner 有几个就把菜单项藏起来）：名单可能是过期的缓存，藏错了就变成「明明还有
 * 别的 owner 却不让改」，而这条规则服务端本来就拦得住，报错也落在确认框里。
 *
 * 「不许把自己移出项目」反过来，是**要**在这里预判的（`isSelf`）：它只取决于
 * 「这一行是不是我」，答案来自会话而不是那份可能过期的名单，藏错不了；而放它
 * 点下去的代价与上面那条完全不是一个量级——移出成功后当前这一页立刻变成
 * FORBIDDEN，整页塌成错误屏，人被卡在一个自己已经不属于的项目里，连个出口都
 * 没有。这条规则的本体仍在服务端，见 routers/project-members.ts。
 */
export function ProjectMemberRowActions({
	isSelf,
	member,
	projectId,
}: ProjectMemberRowActionsProps) {
	const actions = useProjectMemberActions(projectId, member);
	const { open } = actions;
	const askDemote = useCallback(() => open("demote"), [open]);
	const askPromote = useCallback(() => open("promote"), [open]);
	const askRemove = useCallback(() => open("remove"), [open]);

	return (
		<>
			<ProjectMemberActionsMenu
				isSelf={isSelf}
				member={member}
				onDemote={askDemote}
				onPromote={askPromote}
				onRemove={askRemove}
			/>
			<ProjectMemberConfirmDialog actions={actions} member={member} />
		</>
	);
}
