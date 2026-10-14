import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { FolderTreeIcon, PlusIcon } from "lucide-react";

interface ModuleTreeEmptyProps {
	onCreateRoot: () => void;
}

/** 项目还没有模块：说明模块的用途，并给出新建模块的按钮。 */
export function ModuleTreeEmpty({ onCreateRoot }: ModuleTreeEmptyProps) {
	return (
		<Empty className="gap-3 p-4 md:p-6">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<FolderTreeIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle className="text-sm">暂无模块</EmptyTitle>
				<EmptyDescription className="text-xs">
					用例按模块归类。先新建一个模块，再在模块中新建用例。
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button onClick={onCreateRoot} size="sm" variant="outline">
					<PlusIcon data-icon="inline-start" />
					新建模块
				</Button>
			</EmptyContent>
		</Empty>
	);
}
