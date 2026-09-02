/**
 * 新建节点：名称 + 后端 + 槽位上限，建完当场把 token 摆出来。
 *
 * 不放「启用」：新登记的一台当然是启用的（登记一台却默认关着，等于白登记）。
 *
 * 两态的对话框（填表 → 看 token），形状照 api-tokens/create-api-token-dialog.tsx。
 * 那边的推导逐字适用：明文只活在下面那个 `useState` 里，别处没有副本。
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
import { FarmNodeBackendField } from "@/components/farm-nodes/farm-node-backend-field";
import { FarmNodeField } from "@/components/farm-nodes/farm-node-field";
import type { FarmNodeBackend } from "@/components/farm-nodes/farm-node-meta";
import {
	DEFAULT_NODE_SLOTS,
	NODE_NAME_HINT,
	NODE_SLOTS_HINT,
	validateMaxSlots,
	validateNodeName,
} from "@/components/farm-nodes/farm-node-meta";
import { FarmNodeTokenPlaintext } from "@/components/farm-nodes/farm-node-token-plaintext";
import { useCreateFarmNode } from "@/components/farm-nodes/use-farm-node-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（「一台真机； 建完之后」）。
 */
const CREATE_DESCRIPTION =
	"一个节点就是一台愿意出让浏览器算力的真机。建完之后会给你一枚 token，填进那台机器上的 agent，它才认得回来的路。";

/**
 * 表单状态与校验。
 * `submitted` 决定「还没动过的空字段」要不要报错：一进对话框就把名字标红等于
 * 劈头指责，所以空值只在提交过一次之后才算错（与本仓其它几张新建表单同规）。
 */
function useCreateNodeForm(onCreated: (token: string) => void) {
	const create = useCreateFarmNode(onCreated);
	const [backend, setBackend] = useState<FarmNodeBackend>("local");
	const [maxSlots, setMaxSlots] = useState(String(DEFAULT_NODE_SLOTS));
	const [name, setName] = useState("");
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
			// 名字 trim 之后再送：校验量的是 trim 后的长度，送原值等于绕过自己的规则
			create.mutate({
				backend,
				maxSlots: Number(maxSlots.trim()),
				name: name.trim(),
			});
		},
		[backend, create, maxSlots, name]
	);

	return {
		backend,
		error: create.error?.message,
		handleSubmit,
		maxSlots,
		maxSlotsError:
			submitted || maxSlots !== "" ? validateMaxSlots(maxSlots) : null,
		name,
		nameError: submitted || name !== "" ? validateNodeName(name) : null,
		pending: create.isPending,
		setBackend,
		setMaxSlots,
		setName,
	};
}

function CreateFarmNodeForm({
	onCancel,
	onCreated,
}: {
	onCancel: () => void;
	onCreated: (token: string) => void;
}) {
	const form = useCreateNodeForm(onCreated);

	return (
		// noValidate：原生气泡是英文的，也没法和这里的中文内联提示对齐
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<FarmNodeField
				error={form.nameError}
				hint={NODE_NAME_HINT}
				id="farm-node-name"
				label="名称"
				onChange={form.setName}
				value={form.name}
			/>
			<FarmNodeBackendField
				id="farm-node-backend"
				onChange={form.setBackend}
				value={form.backend}
			/>
			<FarmNodeField
				error={form.maxSlotsError}
				hint={NODE_SLOTS_HINT}
				id="farm-node-max-slots"
				label="槽位上限"
				onChange={form.setMaxSlots}
				type="number"
				value={form.maxSlots}
			/>
			<FarmFormError message={form.error} />
			<DialogFooter>
				<Button onClick={onCancel} type="button" variant="outline">
					取消
				</Button>
				<Button disabled={form.pending} type="submit">
					{form.pending ? "创建中…" : "创建"}
				</Button>
			</DialogFooter>
		</form>
	);
}

/**
 * 两态：填表 → 看 token。
 *
 * 明文只活在这一个 `useState` 里，别处没有副本。它随这个组件一起卸载，
 * 而这个组件由外层的 `{open ? … : null}` 挂着——见下面那段注释：
 * 那不是省渲染，那就是「关掉就清空」本身。
 */
function CreateFarmNodeBody({ onClose }: { onClose: () => void }) {
	const [token, setToken] = useState<string | null>(null);

	if (token === null) {
		return (
			<>
				<DialogHeader>
					<DialogTitle>添加节点</DialogTitle>
					<DialogDescription>{CREATE_DESCRIPTION}</DialogDescription>
				</DialogHeader>
				<CreateFarmNodeForm onCancel={onClose} onCreated={setToken} />
			</>
		);
	}

	return (
		<>
			<DialogHeader>
				<DialogTitle>节点已创建</DialogTitle>
				<DialogDescription>
					复制下面这串，填进那台机器上 agent 的 NODE_AGENT_TOKEN。
				</DialogDescription>
			</DialogHeader>
			<FarmNodeTokenPlaintext token={token} />
			<DialogFooter>
				{/* 只有一颗按钮：这一步没有「取消」可言，节点已经建出来了 */}
				<Button onClick={onClose} type="button">
					我已存好
				</Button>
			</DialogFooter>
		</>
	);
}

export function CreateFarmNodeDialog({
	onClose,
	open,
}: {
	onClose: () => void;
	open: boolean;
}) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				{/*
				 * `open ? … : null` 删不得：它是明文「关掉就没了」的唯一保证。
				 * 关闭的路子有三条（按钮、Esc、点遮罩），全都只把 open 翻成 false；
				 * 把 body 常驻挂着的话，那三条路谁都不会清掉它的 useState，
				 * token 会一直留在内存里，下次打开还原样躺在那儿。
				 * 顺带也让表单每次都是干净的一张，不留上次的输入和错误。
				 */}
				{open ? <CreateFarmNodeBody onClose={onClose} /> : null}
			</DialogContent>
		</Dialog>
	);
}
