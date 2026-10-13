import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@automationstack/ui/components/alert-dialog";
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { Label } from "@automationstack/ui/components/label";
import {
	type ChangeEvent,
	type FormEvent,
	type KeyboardEvent,
	useCallback,
	useId,
	useState,
} from "react";

import { FieldError } from "@/components/interaction/field-error";

interface TypeToConfirmDialogProps {
	confirmLabel: string;
	description: string;
	/** 用户必须输入的名称 */
	name: string;
	/** 名称的种类，例如「项目名称」 */
	nameLabel: string;
	onClose: () => void;
	onConfirm: () => void;
	open: boolean;
	pending: boolean;
	title: string;
}

type ConfirmFormProps = Omit<TypeToConfirmDialogProps, "onClose" | "open">;

interface ConfirmNameState {
	error: string | null;
	handleChange: (event: ChangeEvent<HTMLInputElement>) => void;
	handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
	matched: boolean;
	value: string;
}

function useConfirmName(props: ConfirmFormProps): ConfirmNameState {
	const { name, nameLabel, onConfirm, pending } = props;
	const [value, setValue] = useState("");
	const [error, setError] = useState<string | null>(null);
	// 名称为空时（例如数据还没加载）不允许确认
	const matched = name.trim() !== "" && value.trim() === name.trim();

	const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
		setValue(event.target.value);
		setError(null);
	}, []);
	// 名称不一致时确认按钮不可用，Enter 不会提交表单，所以在这里提示原因
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter" && !matched) {
				event.preventDefault();
				setError(`输入的名称与${nameLabel}不一致`);
			}
		},
		[matched, nameLabel]
	);
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (matched && !pending) {
				onConfirm();
			}
		},
		[matched, onConfirm, pending]
	);

	return { error, handleChange, handleKeyDown, handleSubmit, matched, value };
}

/**
 * 每次打开都重新挂载（见 useOpenCount），所以每次都从空输入开始。
 */
function ConfirmForm(props: ConfirmFormProps) {
	const { name, nameLabel, pending } = props;
	const inputId = useId();
	const errorId = useId();
	const { error, handleChange, handleKeyDown, handleSubmit, matched, value } =
		useConfirmName(props);

	return (
		<form className="grid gap-6" noValidate={true} onSubmit={handleSubmit}>
			<div className="flex flex-col gap-2">
				<Label className="block font-normal" htmlFor={inputId}>
					输入{nameLabel}「<span className="font-semibold">{name}</span>
					」以确认
				</Label>
				<Input
					aria-describedby={error === null ? undefined : errorId}
					aria-invalid={error !== null}
					autoComplete="off"
					id={inputId}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					readOnly={pending}
					spellCheck={false}
					value={value}
				/>
				<FieldError id={errorId} message={error} />
			</div>
			<AlertDialogFooter>
				<AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
				<Button
					disabled={!matched}
					focusableWhenDisabled={true}
					pending={pending}
					type="submit"
					variant="destructive"
				>
					{props.confirmLabel}
				</Button>
			</AlertDialogFooter>
		</form>
	);
}

/**
 * 对话框每打开一次加一。关闭动画还没结束就重新打开时，弹层不会卸载，
 * 所以用这个数作表单的 key，保证每次打开都清空上次的输入。
 */
function useOpenCount(open: boolean): number {
	const [count, setCount] = useState(0);
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setCount(count + 1);
		}
	}
	return count;
}

/**
 * 删除项目、删除模块这类影响大的操作：输入名称后才能确认。
 * Enter 提交，Esc 关闭；提交中不能关闭，也不能再次提交。
 */
export function TypeToConfirmDialog(props: TypeToConfirmDialogProps) {
	const { onClose, open, ...formProps } = props;
	const { pending } = formProps;
	const openCount = useOpenCount(open);
	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!(nextOpen || pending)) {
				onClose();
			}
		},
		[onClose, pending]
	);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{props.title}</AlertDialogTitle>
					<AlertDialogDescription>{props.description}</AlertDialogDescription>
				</AlertDialogHeader>
				<ConfirmForm key={openCount} {...formProps} />
			</AlertDialogContent>
		</AlertDialog>
	);
}
