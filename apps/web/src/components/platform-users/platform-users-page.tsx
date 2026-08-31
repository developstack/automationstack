/**
 * 平台用户管理页。
 *
 * ── 为什么这个目录不叫 members/ ──
 * 仓库里已经有 components/project-members/，那是**项目级**的成员：某个项目里有
 * 谁、他在这个项目里是 owner 还是 member，端点在 orpc.projectMembers.*。
 * 本目录管的是**平台级**的账号：整个平台上有哪些人、谁是平台管理员、谁被停用，
 * 端点在 orpc.users.*。这一页的前身就叫 components/members/（在 7d3eadc 里被整个
 * 删掉，本次从那个提交里取回并改名）——两个 members/ 并排放，光看 import 路径分
 * 不出改的是哪一层权限，而这两层权限恰好长得很像（都有「角色」、都有一张成员
 * 表），认错一次就是把平台管理员发给了只该当项目 owner 的人。改叫
 * platform-users/，文件名里的 platform- 前缀同理。
 *
 * 两个目录之间只有一处刻意的重复：那一行服务端错误（PlatformUserFormError 与
 * ProjectMemberFormError），理由写在 platform-user-form-error.tsx。
 */

import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { useSession } from "@/components/auth/use-session";
import { CreatePlatformUserDialog } from "@/components/platform-users/create-platform-user-dialog";
import { PlatformUsersTable } from "@/components/platform-users/platform-users-table";
import { PlatformUsersTableSkeleton } from "@/components/platform-users/platform-users-table-skeleton";

/**
 * 非管理员的兜底空态。
 *
 * 侧栏里的「用户」那一项已经按角色藏掉了（platform-sidebar.tsx 有一整段在讲为什
 * 么它藏、而项目内的「成员」不藏），但**地址栏是拦不住的**：非管理员手敲 /users
 * 照样走到这里，而 `users.listWithProjects` 是 adminProcedure，会把他挡成
 * FORBIDDEN。放任那条失败冒到全站兜底的错误边界（router.tsx 的
 * defaultErrorComponent）不至于白页，但那儿只会把服务端那句 FORBIDDEN 原样摆
 * 出来、再配一颗重试按钮——权限不够，重试多少次都是同一句话。
 *
 * 所以这张空态不是「入口藏了就可以删」的冗余，它是这条路径上唯一说人话的一环。
 */
function PlatformUsersForbidden() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>需要管理员权限</EmptyTitle>
				<EmptyDescription>
					平台用户管理只对管理员开放。需要新账号、重置密码或调整项目归属，请联系管理员；也可以直接回到
					{/* 正文里的链接必须自带下划线：只靠颜色区分不满足对比度以外的可辨识要求 */}
					<Link className="underline underline-offset-4" to="/projects">
						项目列表
					</Link>
					。
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

export function PlatformUsersPage() {
	const { isPending, user } = useSession();
	const [creating, setCreating] = useState(false);
	const openCreate = useCallback(() => setCreating(true), []);
	const closeCreate = useCallback(() => setCreating(false), []);

	if (isPending) {
		return <PlatformUsersTableSkeleton />;
	}
	if (user?.role !== "admin") {
		return <PlatformUsersForbidden />;
	}

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-xs">
					管理员可以创建账号、重置密码、调整平台角色、停用账号，以及增删项目归属。
				</p>
				<Button onClick={openCreate}>
					<PlusIcon data-icon="inline-start" />
					新建用户
				</Button>
			</div>
			<PlatformUsersTable />
			<CreatePlatformUserDialog onClose={closeCreate} open={creating} />
		</section>
	);
}
