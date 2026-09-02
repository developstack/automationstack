/**
 * 编辑节点：名称 + 槽位上限 + 启用。
 *
 * `backend` 不在表单里，只在描述里说一句它改不了：它是那台机器上 agent 的启动
 * 方式，在这边改一下并不会让对面换个方式重启，只会让列表说谎。更要紧的是
 * **复位纪律跟着后端走**——一个会话跑完怎么把机器收拾干净，local 是清掉 profile
 * 目录、docker 是销毁容器，两套做法不通用。所以这一列在 db 层就是登记时定死的
 * （packages/db/src/schema/farm-nodes.ts 是刻意这么设计的），服务端的 `update`
 * 也不收这个字段，三边一致。真要换后端，就是去那台机器上重装一次 agent，
 * 对应这边「删掉再建一台」。
 */
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { type FormEvent, useCallback, useState } from "react";

import { FarmFormError } from "@/components/farm/farm-form-error";
import { FarmNodeField } from "@/components/farm-nodes/farm-node-field";
import type { FarmNodeRow } from "@/components/farm-nodes/farm-node-meta";
import {
	NODE_BACKEND_LABELS,
	NODE_NAME_HINT,
	NODE_SLOTS_HINT,
	validateMaxSlots,
	validateNodeName,
} from "@/components/farm-nodes/farm-node-meta";
import { FarmNodeToggleField } from "@/components/farm-nodes/farm-node-toggle-field";
import { useUpdateFarmNode } from "@/components/farm-nodes/use-farm-node-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/**
 * 后端那句说明。拼成一个函数而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，
 * 折点落在中文句读之间时会渲染出一个多余的空格（「改不了； 要换后端」）。
 */
function backendNotice(backend: FarmNodeRow["backend"]): string {
	return `后端是「${NODE_BACKEND_LABELS[backend]}」，登记之后就固定了，这里改不了：一个会话跑完怎么把机器收拾干净（清 profile 目录还是销毁容器）是跟着后端走的，中途换一列只会让平台按错的纪律去收拾。要换后端，请删除这个节点，在那台机器上重装 agent 之后重新登记一台。`;
}

interface NodePatch {
	enabled?: boolean;
	maxSlots?: number;
	name?: string;
}

/**
 * 只把**动过的字段**塞进 patch。全都没动时返回 null，调用方直接关框、不发请求。
 *
 * 这不是省流量：服务端的 `update` 是按「键在不在」决定写不写的
 * （schemas/farm.ts 里那段），原样回传三个字段等于每次保存都写三列，
 * 而其中两列的值和库里一模一样——真出问题时看审计日志分不出人到底改了什么。
 */
function buildPatch(
	row: FarmNodeRow,
	next: { enabled: boolean; maxSlots: string; name: string }
): NodePatch | null {
	const patch: NodePatch = {};
	const name = next.name.trim();
	if (name !== row.name) {
		patch.name = name;
	}
	const maxSlots = Number(next.maxSlots.trim());
	if (maxSlots !== row.maxSlots) {
		patch.maxSlots = maxSlots;
	}
	if (next.enabled !== row.enabled) {
		patch.enabled = next.enabled;
	}
	return Object.keys(patch).length === 0 ? null : patch;
}

function useEditNodeForm(row: FarmNodeRow, onClose: () => void) {
	const update = useUpdateFarmNode(onClose);
	const [enabled, setEnabled] = useState(row.enabled);
	const [maxSlots, setMaxSlots] = useState(String(row.maxSlots));
	const [name, setName] = useState(row.name);
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			const invalid =
				validateNodeName(name) !== null || validateMaxSlots(maxSlots) !== null;
			if (invalid) {
				return;
			}
			const patch = buildPatch(row, { enabled, maxSlots, name });
			if (patch === null) {
				// 什么都没改：不发请求，也不弹「已更新」——那句话会是假的
				onClose();
				return;
			}
			update.mutate({ id: row.id, ...patch });
		},
		[enabled, maxSlots, name, onClose, row, update]
	);

	return {
		enabled,
		error: update.error?.message,
		handleSubmit,
		maxSlots,
		maxSlotsError:
			submitted || maxSlots !== "" ? validateMaxSlots(maxSlots) : null,
		name,
		nameError: submitted || name !== "" ? validateNodeName(name) : null,
		pending: update.isPending,
		setEnabled,
		setMaxSlots,
		setName,
	};
}

function EditFarmNodeForm({
	onClose,
	row,
}: {
	onClose: () => void;
	row: FarmNodeRow;
}) {
	const form = useEditNodeForm(row, onClose);

	return (
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<FarmNodeField
				error={form.nameError}
				hint={NODE_NAME_HINT}
				id="farm-node-edit-name"
				label="名称"
				onChange={form.setName}
				value={form.name}
			/>
			<FarmNodeField
				error={form.maxSlotsError}
				hint={NODE_SLOTS_HINT}
				id="farm-node-edit-max-slots"
				label="槽位上限"
				onChange={form.setMaxSlots}
				type="number"
				value={form.maxSlots}
			/>
			<FarmNodeToggleField
				checked={form.enabled}
				id="farm-node-edit-enabled"
				onChange={form.setEnabled}
			/>
			<FarmFormError message={form.error} />
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					取消
				</Button>
				<Button disabled={form.pending} type="submit">
					{form.pending ? "保存中…" : "保存"}
				</Button>
			</DialogFooter>
		</form>
	);
}

export function EditFarmNodeDialog({
	onClose,
	open,
	row,
}: {
	onClose: () => void;
	open: boolean;
	row: FarmNodeRow;
}) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>编辑「{row.name}」</DialogTitle>
					<DialogDescription>{backendNotice(row.backend)}</DialogDescription>
				</DialogHeader>
				{/*
				 * 只在打开时挂载：表单的初值是从 row 抄进 useState 的，常挂着的话，
				 * 别处（比如刚失效重取回来的数据）改了这一行，框里还停在打开那一刻的旧值。
				 */}
				{open ? <EditFarmNodeForm onClose={onClose} row={row} /> : null}
			</DialogContent>
		</Dialog>
	);
}
