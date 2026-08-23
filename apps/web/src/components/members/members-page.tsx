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
import { CreateMemberDialog } from "@/components/members/create-member-dialog";
import {
	MembersTable,
	MembersTableSkeleton,
} from "@/components/members/members-table";

/**
 * 侧边栏只给管理员显示入口，但地址栏是拦不住的：非管理员直接输 /members
 * 会被 adminProcedure 挡成 FORBIDDEN。放任它冒到全站兜底的错误边界
 * （router.tsx 的 defaultErrorComponent）不至于白页，但那儿只会把服务端那句
 * FORBIDDEN 原样摆出来，还配一颗重试——权限不够，重试多少次都是同一句话。
 * 不如在这里说清楚「这页要管理员」以及从哪儿回去。
 */
function MembersForbidden() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>需要管理员权限</EmptyTitle>
				<EmptyDescription>
					成员管理只对管理员开放。需要新账号或重置密码，请联系管理员；也可以直接回到
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

export function MembersPage() {
	const { isPending, user } = useSession();
	const [creating, setCreating] = useState(false);
	const openCreate = useCallback(() => setCreating(true), []);
	const closeCreate = useCallback(() => setCreating(false), []);

	if (isPending) {
		return <MembersTableSkeleton />;
	}
	if (user?.role !== "admin") {
		return <MembersForbidden />;
	}

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-xs">
					管理员可以创建成员、重置密码、停用账号。
				</p>
				<Button onClick={openCreate}>
					<PlusIcon data-icon="inline-start" />
					新建成员
				</Button>
			</div>
			<MembersTable />
			<CreateMemberDialog onClose={closeCreate} open={creating} />
		</section>
	);
}
