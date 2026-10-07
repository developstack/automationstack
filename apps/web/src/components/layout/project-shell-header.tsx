import { SecondaryPanelTrigger } from "@automationstack/ui/components/secondary-panel";
import { ListTreeIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { useIsCaseSection } from "@/components/layout/use-case-section";

interface ProjectShellHeaderProps {
	children?: ReactNode;
}

export function ProjectShellHeader({ children }: ProjectShellHeaderProps) {
	const showPanelTrigger = useIsCaseSection();
	return (
		<AppHeader>
			{showPanelTrigger ? (
				<SecondaryPanelTrigger label="模块面板">
					<ListTreeIcon aria-hidden="true" />
				</SecondaryPanelTrigger>
			) : null}
			{children}
		</AppHeader>
	);
}
