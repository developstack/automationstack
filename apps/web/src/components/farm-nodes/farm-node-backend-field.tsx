/**
 * 「后端」下拉：这台机器上的浏览器怎么起。
 *
 * 只出现在**新建**表单里。后端是那台机器上 agent 的启动方式，在这边改一下并不
 * 会让对面换个方式重启，只会让列表说谎——所以编辑框里没有它，服务端的
 * `update` 也不收（见 packages/api/src/routers/farm-nodes.ts）。
 */
import { Label } from "@automationstack/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { useCallback } from "react";

import type { FarmNodeBackend } from "@/components/farm-nodes/farm-node-meta";
import { NODE_BACKEND_OPTIONS } from "@/components/farm-nodes/farm-node-meta";

const BACKEND_HINTS: Record<FarmNodeBackend, string> = {
	docker:
		"在那台机器的 Docker 里起容器：与真人的桌面互不打扰，浏览器版本由镜像决定，但那台机器得先装好 Docker。",
	local:
		"直接拉起那台机器上装着的 Chrome：装起来最省事，代价是会占用真人的桌面，浏览器版本也是那台机器上的那个。",
};

interface FarmNodeBackendFieldProps {
	id: string;
	onChange: (backend: FarmNodeBackend) => void;
	value: FarmNodeBackend;
}

export function FarmNodeBackendField({
	id,
	onChange,
	value,
}: FarmNodeBackendFieldProps) {
	const handleValueChange = useCallback(
		(next: string | null) => {
			// Base UI 的清空动作会给 null；两个字面量之外的值一律不理，
			// 保住 onChange 的类型就是 FarmNodeBackend 而不是随便一个 string
			if (next === "local" || next === "docker") {
				onChange(next);
			}
		},
		[onChange]
	);
	const hintId = `${id}-hint`;

	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>后端</Label>
			<Select
				items={NODE_BACKEND_OPTIONS}
				onValueChange={handleValueChange}
				value={value}
			>
				<SelectTrigger aria-describedby={hintId} className="w-full" id={id}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{NODE_BACKEND_OPTIONS.map((option) => (
						<SelectItem key={option.value} value={option.value}>
							{option.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			{/*
			 * 说明随选中项换，而不是把两句话一起摆着：两档的差别是「会不会占用
			 * 真人的桌面」，那句话只有落在他刚选中的那一档上才读得进去。
			 * 两句共用同一个节点，切换时下面的字段不会上下跳。
			 */}
			<p className="text-muted-foreground text-xs" id={hintId}>
				{BACKEND_HINTS[value]}
			</p>
		</div>
	);
}
