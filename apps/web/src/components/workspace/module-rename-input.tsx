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
