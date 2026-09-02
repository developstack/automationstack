/**
 * 实机节点管理页。
 *
 * ── 这一页管的是什么 ──
 * 农场的会话最终要落在某台真机上跑。一个节点就是这样一台机器：上面装一个
 * node-agent，凭 token 向控制面报到，之后由农场往它身上派会话。这张表回答的是
 * 「平台现在有多少算力、哪几台还活着」——与某个具体项目无关，因此它是**顶级**
 * 路由 /nodes，与 /users、/browsers 并列（完整推导见 routes/nodes.tsx）。
 *
 * ── 它是这一层的**主入口**（plan §12 的模型转向）──
 * 「一台机器上有哪些浏览器」的答案在这一页：agent 探出来上报，每行展开即见
 * （能力清单）。隔壁 /browsers 因此退回它本来的位置，改称**镜像库**——docker
 * 后端要拉哪个镜像时查的那本目录，它登记了一行不代表任何一台机器已经把那个镜像
 * 拉下来了。侧栏里节点排在镜像库之前，也是这个顺序。
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
import { CreateFarmNodeDialog } from "@/components/farm-nodes/create-farm-node-dialog";
import { FarmNodeSetupCard } from "@/components/farm-nodes/farm-node-setup-card";
import { FarmNodesTable } from "@/components/farm-nodes/farm-nodes-table";
import { FarmNodesTableSkeleton } from "@/components/farm-nodes/farm-nodes-table-skeleton";

/**
 * 非管理员的兜底空态。
 *
 * 侧栏里的「节点」一项已经按角色藏掉了，但**地址栏是拦不住的**：非 admin 手敲
 * /nodes 照样走到这里，而这一支**六条过程全是 adminProcedure**（比镜像库还
 * 紧一档，理由见 packages/api/src/routers/farm-nodes.ts 的文件头）。入口藏了不
 * 等于这张空态可以删，它是这条路径上唯一说人话的一环。
 *
 * 措辞上不像浏览器目录那样附一句「想知道有哪些版本可以去哪查」：节点表回答不了
 * 任何一个写脚本的人会问的问题，对他而言这一页本来就没有内容可看，指个别处反而
 * 像是在暗示这里藏着他需要的东西。
 */
function FarmNodesForbidden() {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyTitle>需要管理员权限</EmptyTitle>
				<EmptyDescription>
					节点管理只对管理员开放。要新增一台机器、调整槽位或让某台机器下线，请联系管理员；也可以直接回到
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

export function FarmNodesPage() {
	const { isPending, user } = useSession();
	const [creating, setCreating] = useState(false);
	const openCreate = useCallback(() => setCreating(true), []);
	const closeCreate = useCallback(() => setCreating(false), []);

	if (isPending) {
		return <FarmNodesTableSkeleton />;
	}
	if (user?.role !== "admin") {
		return <FarmNodesForbidden />;
	}

	return (
		<section className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-xs">
					农场把会话派到这些机器上跑。展开一行看它上面有哪些浏览器；停用或离线的机器不会接到新会话。
				</p>
				<Button onClick={openCreate}>
					<PlusIcon data-icon="inline-start" />
					添加节点
				</Button>
			</div>
			<FarmNodesTable />
			{/*
			 * 接入指引摆在表格**下面**：表格是这一页的主体，装机命令是「建完之后
			 * 再做的事」，压在表格上头会把每次来看状态的人都先挡一道。
			 */}
			<FarmNodeSetupCard />
			<CreateFarmNodeDialog onClose={closeCreate} open={creating} />
		</section>
	);
}
