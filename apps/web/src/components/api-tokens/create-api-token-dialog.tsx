import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useCallback, useState } from "react";

import {
	ApiTokenFormError,
	TokenNameField,
} from "@/components/api-tokens/api-token-form-fields";
import {
	TOKEN_NAME_HINT,
	validateTokenName,
} from "@/components/api-tokens/api-token-meta";
import { ApiTokenPlaintext } from "@/components/api-tokens/api-token-plaintext";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { orpc } from "@/utils/orpc";

const NAME_FIELD_ID = "api-token-name";

/*
 * 整段抄成常量而不是直接写在 JSX 里：格式化器按行宽折 JSX 文本，折点落在中文
 * 句读之间时会渲染出一个多余的空格（「给你自己认的， 换个名字」）。
 */
const CREATE_DESCRIPTION =
	"token 用来让自动化脚本以你的身份回传测试结果。备注名只是给你自己认的，换个名字不会换掉 token。";

/**
 * 创建。成功后把明文交给调用方的 `useState`，**只交给它**。
 *
 * 明文刻意不进 TanStack Query 缓存：缓存是会被 devtools 打开看、被
 * dehydrate 进 SSR 载荷、被别的组件顺手读到的地方，而这串东西等价于一次登录。
 * 只 invalidate 列表 key，让新行冒出来——列表回来的是 ApiTokenView，里面没有明文。
 */
function useCreateApiToken(onCreated: (plaintext: string) => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.apiTokens.create.mutationOptions({
			// 备注名被服务端拒掉时，错误要留在对话框里挨着输入框说
			meta: { suppressErrorToast: true },
			onSuccess: (created) => {
				queryClient.invalidateQueries({ queryKey: orpc.apiTokens.list.key() });
				onCreated(created.plaintext);
			},
		})
	);
}

/**
 * 表单状态与校验。
 * `submitted` 决定「还没动过的空字段」要不要报错：一进对话框就把唯一一个
 * 字段标红等于劈头指责，所以空值只在提交过一次之后才算错。
 */
function useCreateForm(onCreated: (plaintext: string) => void) {
	const create = useCreateApiToken(onCreated);
	const [name, setName] = useState("");
	const [submitted, setSubmitted] = useState(false);

	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			setSubmitted(true);
			if (validateTokenName(name) !== null) {
				return;
			}
			create.mutate({ name: name.trim() });
		},
		[create, name]
	);

	return {
		error: create.error?.message,
		handleSubmit,
		name,
		nameError: submitted || name !== "" ? validateTokenName(name) : null,
		pending: create.isPending,
		setName,
	};
}

interface CreateFormProps {
	onCancel: () => void;
	onCreated: (plaintext: string) => void;
}

function CreateApiTokenForm({ onCancel, onCreated }: CreateFormProps) {
	const form = useCreateForm(onCreated);

	return (
		// noValidate：原生气泡是英文的，也没法和这里的中文内联提示对齐
		<form
			className="flex flex-col gap-4"
			noValidate={true}
			onSubmit={form.handleSubmit}
		>
			<TokenNameField
				error={form.nameError}
				hint={TOKEN_NAME_HINT}
				id={NAME_FIELD_ID}
				onChange={form.setName}
				value={form.name}
			/>
			<ApiTokenFormError message={form.error} />
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
 * 对话框的两态：填备注名 → 看明文。
 *
 * 明文只活在这一个 `useState` 里，别处没有副本。它随这个组件一起卸载，
 * 而这个组件由外层的 `{open ? … : null}` 挂着——见下面 CreateApiTokenDialog
 * 那段注释：那不是省渲染，那就是「关掉就清空」本身。
 */
function CreateApiTokenBody({ onClose }: { onClose: () => void }) {
	const [plaintext, setPlaintext] = useState<string | null>(null);

	if (plaintext === null) {
		return (
			<>
				<DialogHeader>
					<DialogTitle>新建 API Token</DialogTitle>
					<DialogDescription>{CREATE_DESCRIPTION}</DialogDescription>
				</DialogHeader>
				<CreateApiTokenForm onCancel={onClose} onCreated={setPlaintext} />
			</>
		);
	}

	return (
		<>
			<DialogHeader>
				<DialogTitle>token 已创建</DialogTitle>
				<DialogDescription>
					复制下面这串，填进脚本的环境变量里。
				</DialogDescription>
			</DialogHeader>
			<ApiTokenPlaintext plaintext={plaintext} />
			<DialogFooter>
				{/* 只有一颗按钮：这一步没有「取消」可言，token 已经建出来了 */}
				<Button onClick={onClose} type="button">
					我已存好
				</Button>
			</DialogFooter>
		</>
	);
}

interface CreateApiTokenDialogProps {
	onClose: () => void;
	open: boolean;
}

/** 新建 API Token：备注名 → 明文（只显示这一次）。 */
export function CreateApiTokenDialog({
	onClose,
	open,
}: CreateApiTokenDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				{/*
				 * `open ? … : null` 删不得：它是明文「关掉就没了」的唯一保证。
				 * 关闭的路子有三条（按钮、Esc、点遮罩），全都只把 open 翻成 false；
				 * 把 body 常驻挂着的话，那三条路谁都不会清掉它的 useState，
				 * 明文会一直留在内存里，下次打开还原样躺在那儿。
				 * 顺带也让表单每次都是干净的一张，不留上次的输入和错误。
				 */}
				{open ? <CreateApiTokenBody onClose={onClose} /> : null}
			</DialogContent>
		</Dialog>
	);
}
