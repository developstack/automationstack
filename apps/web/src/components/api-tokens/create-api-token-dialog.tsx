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

import { ApiTokenFormError } from "@/components/api-tokens/api-token-form-error";
import {
	TOKEN_NAME_HINT,
	validateTokenName,
} from "@/components/api-tokens/api-token-meta";
import { ApiTokenPlaintext } from "@/components/api-tokens/api-token-plaintext";
import { TokenNameField } from "@/components/api-tokens/token-name-field";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";
import { orpc } from "@/utils/orpc";

const NAME_FIELD_ID = "api-token-name";

const CREATE_DESCRIPTION =
	"token 用来让自动化脚本以你的身份回传测试结果。备注名只是给你自己认的，换个名字不会换掉 token。";

function useCreateApiToken(onCreated: (plaintext: string) => void) {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.apiTokens.create.mutationOptions({
			meta: { suppressErrorToast: true },
			onSuccess: (created) => {
				queryClient.invalidateQueries({ queryKey: orpc.apiTokens.list.key() });
				onCreated(created.plaintext);
			},
		})
	);
}

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

export function CreateApiTokenDialog({
	onClose,
	open,
}: CreateApiTokenDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onClose);

	return (
		<Dialog onOpenChange={handleOpenChange} open={open}>
			<DialogContent>
				{open ? <CreateApiTokenBody onClose={onClose} /> : null}
			</DialogContent>
		</Dialog>
	);
}
