/**
 * 项目页顶栏，自 project-shell.tsx 拆出：外壳与顶栏各自一个文件，
 * 两者仍靠同一个 useIsCaseSection 决定「有没有二级面板」这件事。
 */
import { SecondaryPanelTrigger } from "@automationstack/ui/components/secondary-panel";
import { ListTreeIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { useIsCaseSection } from "@/components/layout/use-case-section";

interface ProjectShellHeaderProps {
	children?: ReactNode;
}

/**
 * 项目页顶栏：全站顶栏在用例管理这一段再挂一颗二级面板开关。
 *
 * 外观全部来自 AppHeader，这一层只多出「模块面板」这颗按钮——它只在真有面板可开
 * 的那一段出现，判定与 ProjectShell 挂不挂面板共用同一个 hook，两者不可能对不上
 * （不然就会出现「按钮在、面板没有」这种按下去毫无反应的开关）。
 */
export function ProjectShellHeader({ children }: ProjectShellHeaderProps) {
	const showPanelTrigger = useIsCaseSection();
	return (
		<AppHeader>
			{/*
			 * 二级面板的开关宽窄屏都在：面板收起后这是唯一的复位入口，而它刻意没有
			 * 全局快捷键（理由见 secondary-panel-context.tsx）。图标特意不用
			 * SidebarTrigger 的 PanelLeftIcon——两颗按钮紧挨着，同一个图标就分不出
			 * 谁开哪一块。
			 */}
			{showPanelTrigger ? (
				<SecondaryPanelTrigger label="模块面板">
					<ListTreeIcon aria-hidden="true" />
				</SecondaryPanelTrigger>
			) : null}
			{children}
		</AppHeader>
	);
}
