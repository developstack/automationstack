import { Input } from "@automationstack/ui/components/input";
import { Loader2Icon } from "lucide-react";
import {
	type ChangeEvent,
	type KeyboardEvent,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";

import { FieldError } from "@/components/interaction/field-error";
import {
	decideModuleNameCommit,
	type ModuleNameCommitTrigger,
} from "@/components/workspace/module-name-commit";

export type ModuleNameEndTrigger = ModuleNameCommitTrigger | "escape";

interface ModuleNameInputProps {
	/** 原来的名称。新建时为空字符串 */
	defaultValue: string;
	/** 保存失败的原因，显示在字段下方 */
	error: string | null;
	label: string;
	/** 取消编辑。trigger 说明用户怎样结束：失去焦点时外层不应移动焦点 */
	onCancel: (trigger: ModuleNameEndTrigger) => void;
	/** 用户修改了名称。外层用它清除上一次保存失败的原因 */
	onEdit?: () => void;
	onSubmit: (name: string, trigger: ModuleNameCommitTrigger) => void;
	pending: boolean;
	placeholder?: string;
}

/** Enter 保存，Esc 取消。 */
function useNameKeyDown(
	commit: (trigger: ModuleNameCommitTrigger) => void,
	onCancel: (trigger: ModuleNameEndTrigger) => void,
	pending: boolean
) {
	return useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				event.preventDefault();
				commit("enter");
				return;
			}
			if (event.key === "Escape") {
				// 不让 Esc 冒泡，否则窄屏下会同时关闭模块面板的抽屉
				event.preventDefault();
				event.stopPropagation();
				if (!pending) {
					onCancel("escape");
				}
			}
		},
		[commit, onCancel, pending]
	);
}

function useModuleNameInput(props: ModuleNameInputProps) {
	const { defaultValue, onCancel, onEdit, onSubmit, pending } = props;
	const serverError = props.error;
	const [value, setValue] = useState(defaultValue);
	const [localError, setLocalError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const commit = useCallback(
		(trigger: ModuleNameCommitTrigger) => {
			// 保存失败的原因还显示时，失去焦点不重复提交同一个名称，输入框和原因留在原处
			if (pending || (trigger === "blur" && serverError !== null)) {
				return;
			}
			const decision = decideModuleNameCommit(value, defaultValue, trigger);
			if (decision.kind === "invalid") {
				setLocalError(decision.message);
				return;
			}
			if (decision.kind === "cancel") {
				onCancel(trigger);
				return;
			}
			onSubmit(decision.name, trigger);
		},
		[defaultValue, onCancel, onSubmit, pending, serverError, value]
	);

	const handleChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			setValue(event.target.value);
			setLocalError(null);
			onEdit?.();
		},
		[onEdit]
	);

	const handleKeyDown = useNameKeyDown(commit, onCancel, pending);
	const handleBlur = useCallback(() => commit("blur"), [commit]);

	return {
		error: localError ?? serverError,
		handleBlur,
		handleChange,
		handleKeyDown,
		inputRef,
		value,
	};
}

/**
 * 在模块树中就地输入模块名称：Enter 保存，Esc 取消，失去焦点时有新名称就保存。
 * 出现时获得焦点并选中原来的名称。保存中只读并显示加载图标，焦点不丢失。
 */
export function ModuleNameInput(props: ModuleNameInputProps) {
	const { pending } = props;
	const errorId = useId();
	const { error, handleBlur, handleChange, handleKeyDown, inputRef, value } =
		useModuleNameInput(props);

	// 模块行是 select-none 的右键菜单触发器。Safari 中父元素 select-none 时输入框不能编辑，所以这里恢复 select-text
	return (
		<div className="flex min-w-0 flex-1 select-text flex-col gap-1">
			<div className="relative">
				<Input
					aria-busy={pending ? true : undefined}
					aria-describedby={error === null ? undefined : errorId}
					aria-invalid={error === null ? undefined : true}
					aria-label={props.label}
					autoComplete="off"
					className="h-7 px-2 md:text-sm"
					onBlur={handleBlur}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					placeholder={props.placeholder}
					readOnly={pending}
					ref={inputRef}
					spellCheck={false}
					value={value}
				/>
				{pending ? (
					<Loader2Icon
						aria-hidden="true"
						className="pointer-events-none absolute end-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground motion-reduce:animate-none"
						data-testid="module-name-saving"
					/>
				) : null}
			</div>
			<FieldError id={errorId} message={error} />
		</div>
	);
}
