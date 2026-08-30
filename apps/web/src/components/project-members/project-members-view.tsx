import { Button } from "@automationstack/ui/components/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { UserPlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useSession } from "@/components/auth/use-session";
import { PageTransition } from "@/components/layout/page-transition";
import { AddProjectMemberDialog } from "@/components/project-members/add-project-member-dialog";
import { canManageProjectMembers } from "@/components/project-members/project-member-meta";
import { ProjectMembersTable } from "@/components/project-members/project-members-table";
import { orpc } from "@/utils/orpc";

/** 与 pendingComponent 共用同一份类名，两份迟早分叉、而分叉就是肉眼可见的跳动。 */
export const PROJECT_MEMBERS_MAIN =
	"flex min-h-0 flex-col gap-3 overflow-y-auto p-4";

/**
 * 页首那行说明：措辞按有没有管理权限分两句。
 *
 * 无权限时的那句是这一页唯一说明「为什么没有按钮」的地方。不写的话，普通成员
 * 看到的是一张干净的只读表格，没有任何线索表明这里本来还有别的东西——他会以为
 * 功能坏了，或者去找管理员问一个本来就有答案的问题。
 */
function ProjectMembersHint({ canManage }: { canManage: boolean }) {
	return (
		<p className="text-muted-foreground text-xs">
			{canManage
				? "项目拥有者可以添加成员、调整项目角色、把人移出项目。项目至少要留一个拥有者。"
				: "本项目的成员名单。添加成员、调整角色需要项目拥有者权限，找名单里的拥有者即可。"}
		</p>
	);
}

interface ProjectMembersViewProps {
	projectId: string;
}

/**
 * 项目成员管理页的主体。
 *
 * 权限判定只做一次、就在这一层：名单（`projectMembers.list`，项目内人人可读）
 * 与会话（`auth.me`）都在这里取，算出的 canManage 往下传。表格与行内菜单因此
 * 不各自查一次会话，也就不会出现「表头以为有权限、行尾以为没有」。
 *
 * 没权限时**不渲染**任何操作控件，而不是渲染成 disabled：禁用态是在说「这件事
 * 你现在做不了、待会儿也许可以」，而普通成员在这一页上永远做不了，摆一排灰按钮
 * 只是在反复告诉他不行。同理，这一页对普通成员也不摆「需要权限」的拦截页——
 * 名单本身他有权看，看得见队友是谁正是协作的前提。
 *
 * useSuspenseQuery 要求缓存已经预热（路由 loader 里 ensureQueryData），
 * 否则会在挂载时挂起、一路冒泡到根布局，把整个外壳变成空白。
 */
export function ProjectMembersView({ projectId }: ProjectMembersViewProps) {
	const membersQuery = useSuspenseQuery(
		orpc.projectMembers.list.queryOptions({ input: { projectId } })
	);
	const { user } = useSession();
	const canManage = canManageProjectMembers(user, membersQuery.data);
	const [adding, setAdding] = useState(false);
	const openAdd = useCallback(() => setAdding(true), []);
	const closeAdd = useCallback(() => setAdding(false), []);

	return (
		<PageTransition className={PROJECT_MEMBERS_MAIN} phase="ready">
			<div className="flex items-center justify-between gap-2">
				<ProjectMembersHint canManage={canManage} />
				{canManage ? (
					<Button onClick={openAdd}>
						<UserPlusIcon aria-hidden="true" data-icon="inline-start" />
						添加成员
					</Button>
				) : null}
			</div>
			<ProjectMembersTable
				canManage={canManage}
				members={membersQuery.data}
				projectId={projectId}
			/>
			{/* 无权限时连对话框都不挂：它唯一的入口是上面那颗按钮 */}
			{canManage ? (
				<AddProjectMemberDialog
					onClose={closeAdd}
					open={adding}
					projectId={projectId}
				/>
			) : null}
		</PageTransition>
	);
}
