/**
 * 切换器菜单里的一条项目，自 project-switcher.tsx 拆出。
 * 列表的取数与三种占位仍在那边，这里只负责「一条项目长什么样」。
 */
import type { Project } from "@automationstack/db/schema/projects";
import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";

interface ProjectSwitcherItemProps {
	isCurrent: boolean;
	project: Project;
}

export function ProjectSwitcherItem({
	isCurrent,
	project,
}: ProjectSwitcherItemProps) {
	if (isCurrent) {
		/*
		 * 当前项目不渲染成链接：点自己只是原地重跳一次。也刻意不加 disabled——
		 * 读屏会把它念成「不可用」，听着像坏了，而它其实是「你已经在这儿了」；
		 * 保持可聚焦、由 aria-current 播报当前态，右侧的对勾是同一件事的视觉版本。
		 */
		return (
			<DropdownMenuItem aria-current="true">
				<span className="min-w-0 flex-1 truncate">{project.name}</span>
				<CheckIcon aria-hidden="true" />
			</DropdownMenuItem>
		);
	}
	return (
		<DropdownMenuItem
			render={
				/*
				 * 落在概览而不是用例列表，与项目列表页的卡片同一个落点（理由见
				 * components/projects/project-list.tsx）。
				 *
				 * 顺带解决了旧写法要 clearModuleSelection 的那件事：URL 里的
				 * moduleId / caseId 属于上一个项目，原样带过去会指向新项目里根本不
				 * 存在的模块，落地就是一片「加载不出来」。概览页没有 search 参数，
				 * Link 不指定 search 时也不会把当前这份带过去，那些参数自己就掉了。
				 */
				<Link
					params={{ projectId: project.id }}
					to="/projects/$projectId/overview"
				/>
			}
		>
			<span className="min-w-0 flex-1 truncate">{project.name}</span>
		</DropdownMenuItem>
	);
}
