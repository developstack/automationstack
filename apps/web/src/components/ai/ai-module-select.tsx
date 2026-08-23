/**
 * 目标模块选择：把模块树拍平成带缩进的下拉项。
 * 输入阶段用它决定生成上下文，评审阶段用它决定采纳落到哪个模块。
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Label } from "@automationstack/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { orpc } from "@/utils/orpc";

/** 「不指定模块」的哨兵值：Select 的 value 必须是字符串。 */
const NO_MODULE = "none";
const INDENT = "— ";

interface ModuleOption {
	label: string;
	value: string;
}

function collectModuleOptions(
	nodes: ModuleTreeNode[],
	depth: number,
	out: ModuleOption[]
): void {
	for (const node of nodes) {
		out.push({ label: `${INDENT.repeat(depth)}${node.name}`, value: node.id });
		collectModuleOptions(node.children, depth + 1, out);
	}
}

export interface AiModuleSelectProps {
	disabled: boolean;
	id: string;
	label: string;
	moduleId: string | undefined;
	onChange: (moduleId: string | undefined) => void;
	projectId: string;
}

export function AiModuleSelect(props: AiModuleSelectProps) {
	const treeQuery = useQuery(
		orpc.modules.tree.queryOptions({ input: { projectId: props.projectId } })
	);

	const options = useMemo(() => {
		const collected: ModuleOption[] = [
			{ label: "不指定（由 AI 浏览全部模块）", value: NO_MODULE },
		];
		collectModuleOptions(treeQuery.data ?? [], 0, collected);
		return collected;
	}, [treeQuery.data]);

	const { onChange } = props;
	const handleValueChange = useCallback(
		(value: string | null) =>
			onChange(value === null || value === NO_MODULE ? undefined : value),
		[onChange]
	);

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={props.id}>{props.label}</Label>
			<Select
				disabled={props.disabled}
				items={options}
				onValueChange={handleValueChange}
				value={props.moduleId ?? NO_MODULE}
			>
				<SelectTrigger className="w-full" id={props.id}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
