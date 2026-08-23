/** 模块行的就地重命名输入框：回车提交、失焦提交、Esc 放弃。 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Input } from "@automationstack/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	type ChangeEvent,
	type KeyboardEvent,
	useCallback,
	useState,
} from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

interface ModuleRenameInputProps {
	node: ModuleTreeNode;
	onDone: () => void;
}

export function ModuleRenameInput({ node, onDone }: ModuleRenameInputProps) {
	const [name, setName] = useState(node.name);
	const queryClient = useQueryClient();
	const rename = useMutation(
		orpc.modules.rename.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: orpc.modules.key() });
				toast.success("模块已重命名");
				onDone();
			},
		})
	);

	const submit = useCallback(() => {
		const trimmed = name.trim();
		if (trimmed === "" || trimmed === node.name) {
			onDone();
			return;
		}
		rename.mutate({ id: node.id, name: trimmed });
	}, [name, node.id, node.name, onDone, rename]);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
		[]
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				event.preventDefault();
				submit();
			}
			if (event.key === "Escape") {
				onDone();
			}
		},
		[onDone, submit]
	);

	return (
		/*
		 * 几何要接住 ModuleNodeLink：非编辑态的模块名前面有 FolderIcon（14px）
		 * 加 gap-1.5（6px），文字从容器左侧 20px 处起排。输入框此前是 px-1 + text-xs，
		 * 一进入重命名，同一串字符会往左窜 15px 还缩小一号，看着像换了一行。
		 * pl-5 = 20px（加上 1px 边框实际 21px，差 1px 是边框本身，无法再抠），
		 * text-sm 与链接同号；h-6 与行内其余 24px 控件同高，行高不变。
		 */
		<Input
			aria-label="模块名称"
			className="h-6 flex-1 pr-1 pl-5 text-sm"
			disabled={rename.isPending}
			onBlur={submit}
			onChange={handleChange}
			onKeyDown={handleKeyDown}
			value={name}
		/>
	);
}
