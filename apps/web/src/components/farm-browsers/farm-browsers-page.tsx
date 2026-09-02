/**
 * 镜像库：**docker 后端的镜像目录**。
 *
 * ── 这一页管的是什么 ──
 * 一台 `backend: docker` 的节点要起浏览器时，得知道拉哪个镜像。这张表就是那本
 * 对照表：browser + version → 完整镜像引用。它与某个具体项目无关，因此是**顶级**
 * 路由 /browsers（路径没跟着改名的理由见 routes/browsers.tsx）。
 *
 * ── 它**不再**是「农场能跑什么」的答案（plan §12 的模型转向）──
 * 现在节点是主体：一台机器上到底有哪些浏览器、哪些能用，由它自己探出来上报，
 * 答案在 /nodes 页每行展开的能力清单里。这张目录只回答「docker 那条路上，
 * 某个 browser+version 对应哪个镜像」——它登记了一行，不代表任何一台机器已经
 * 把那个镜像拉下来了。两处都说成「有哪些浏览器」的话，它们给的答案可以不一样，
 * 而看的人没有任何线索知道该信哪一个。
 *
 * `backend: local` 的节点压根不看这张表：那条路上起的是机器上装着的浏览器。
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
import { CreateFarmBrowserDialog } from "@/components/farm-browsers/create-farm-browser-dialog";
import { FarmBrowsersTable } from "@/components/farm-browsers/farm-browsers-table";
import { FarmBrowsersTableSkeleton } from "@/components/farm-browsers/farm-browsers-table-skeleton";

/**
 * 非管理员的兜底空态。
 *
 * 侧栏里的「镜像库」一项已经按角色藏掉了，但**地址栏是拦不住的**：非 admin 手敲
 * /browsers 照样走到这里，而写目录的三条过程都是 adminProcedure。理由与
 * platform-users-page.tsx 里同位置那一段逐字相同——入口藏了不等于这张空态可以删，
 * 它是这条路径上唯一说人话的一环。
 *
 * 措辞上比用户管理页多说一句「去哪问现在有哪些版本可用」：读目录本身不是敏感
 * 操作，一个写脚本的人到这里来，多半只是想知道 browserVersion 该填什么。
 */
function FarmBrowsersForbidden() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>需要管理员权限</EmptyTitle>
				<EmptyDescription>
					镜像库只对管理员开放。需要新增版本或更换镜像，请联系管理员；
					想知道当前能用哪些版本，也请找管理员确认，或直接回到
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

export function FarmBrowsersPage() {
	const { isPending, user } = useSession();
	const [creating, setCreating] = useState(false);
	const openCreate = useCallback(() => setCreating(true), []);
	const closeCreate = useCallback(() => setCreating(false), []);

	if (isPending) {
		return <FarmBrowsersTableSkeleton />;
	}
	if (user?.role !== "admin") {
		return <FarmBrowsersForbidden />;
	}

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-xs">
					docker 后端的节点按「浏览器 +
					版本」在这里查该拉哪个镜像。想知道某台机器上现在真的有什么，去
					{/* 正文里的链接必须自带下划线：只靠颜色区分不满足可辨识要求 */}
					<Link className="underline underline-offset-4" to="/nodes">
						节点
					</Link>
					页展开那一行。
				</p>
				<Button onClick={openCreate}>
					<PlusIcon data-icon="inline-start" />
					添加镜像
				</Button>
			</div>
			<FarmBrowsersTable />
			<CreateFarmBrowserDialog onClose={closeCreate} open={creating} />
		</section>
	);
}
