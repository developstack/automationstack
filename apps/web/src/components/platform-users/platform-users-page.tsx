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
import { createUserAccess } from "@/components/platform-users/platform-user-access";
import { PlatformUsersTable } from "@/components/platform-users/platform-users-table";
import { PlatformUsersTableSkeleton } from "@/components/platform-users/platform-users-table-skeleton";
import { useKnownProvider } from "@/components/platform-users/use-known-provider";

const CREATE_HINT_ID = "platform-users-create-hint";
const LOCAL_MODE_INTRO =
	"管理员可以创建账号、重置密码、调整平台角色、停用账号，以及增删项目归属。";

function PlatformUsersForbidden() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>需要管理员权限</EmptyTitle>
				<EmptyDescription>
					平台用户管理只对管理员开放。需要新账号、重置密码或调整项目归属，请联系管理员；也可以直接回到
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
	const createAccess = createUserAccess(useKnownProvider());
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
				<p className="text-muted-foreground text-xs" id={CREATE_HINT_ID}>
					{createAccess.hint ?? LOCAL_MODE_INTRO}
				</p>
				<Button
					aria-describedby={createAccess.allowed ? undefined : CREATE_HINT_ID}
					disabled={!createAccess.allowed}
					onClick={openCreate}
				>
					<PlusIcon data-icon="inline-start" />
					新建用户
				</Button>
			</div>
			<PlatformUsersTable />
			<CreatePlatformUserDialog onClose={closeCreate} open={creating} />
		</section>
	);
}
