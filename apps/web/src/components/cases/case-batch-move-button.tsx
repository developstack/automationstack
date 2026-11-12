import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Button } from "@automationstack/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";
import { FolderInputIcon } from "lucide-react";
import { useCallback, useState } from "react";
import {
	CaseMoveRunsConfirm,
	type PendingRunsConfirm,
} from "@/components/cases/case-move-runs-confirm";
import {
	findModuleNode,
	ModuleOptionList,
} from "@/components/cases/module-option-list";
import type {
	CaseMoveTarget,
	MoveImpactRun,
} from "@/components/cases/use-case-batch-move";

interface CaseMoveDialogBaseProps {
	count: number;
	modules: readonly ModuleTreeNode[];
}

interface CaseBatchMoveButtonProps extends CaseMoveDialogBaseProps {
	/** 移动前查出模块会跟着改的测试任务。返回 null 表示查询失败。 */
	loadImpact: (moduleId: string) => Promise<readonly MoveImpactRun[] | null>;
	onMove: (module: CaseMoveTarget) => void;
}

function MoveTargetLine({ name }: { name: string | undefined }) {
	if (name === undefined) {
		return <p className="text-muted-foreground text-sm">请选择目标模块</p>;
	}
	return (
		<p className="text-sm">
			移动到「<span className="font-medium">{name}</span>」
		</p>
	);
}

interface CaseMoveDialogProps extends CaseMoveDialogBaseProps {
	onMove: (module: CaseMoveTarget) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}

/** 弹窗中选中的模块，以及「取消」和「确认移动」。 */
function useMoveSelection(
	modules: readonly ModuleTreeNode[],
	onMove: (module: CaseMoveTarget) => void,
	onOpenChange: (open: boolean) => void
) {
	const [selectedId, setSelectedId] = useState<string | undefined>();
	const selected =
		selectedId === undefined ? undefined : findModuleNode(modules, selectedId);
	const close = useCallback(() => onOpenChange(false), [onOpenChange]);
	const handleConfirm = useCallback(() => {
		if (selected !== undefined) {
			onOpenChange(false);
			onMove({ id: selected.id, name: selected.name });
		}
	}, [onMove, onOpenChange, selected]);
	return { close, handleConfirm, selected, setSelectedId };
}

/** 选择目标模块的弹窗：选中模块后显示模块名，「确认移动」才可以点击。 */
function CaseMoveDialog({
	count,
	modules,
	onMove,
	onOpenChange,
	open,
}: CaseMoveDialogProps) {
	const { close, handleConfirm, selected, setSelectedId } = useMoveSelection(
		modules,
		onMove,
		onOpenChange
	);

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						移动 <span className="numeric">{count}</span> 条用例
					</DialogTitle>
					<DialogDescription>
						选择目标模块。用例移到这个模块的最后。
					</DialogDescription>
				</DialogHeader>
				<nav
					aria-label="目标模块"
					className="max-h-80 overflow-y-auto rounded-lg border p-2"
				>
					<ModuleOptionList
						nodes={modules}
						onSelect={setSelectedId}
						selectedModuleId={selected?.id}
					/>
				</nav>
				<MoveTargetLine name={selected?.name} />
				<DialogFooter>
					<Button onClick={close} type="button" variant="outline">
						取消
					</Button>
					<Button
						disabled={selected === undefined}
						onClick={handleConfirm}
						type="button"
					>
						确认移动
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/**
 * 选中模块并确认后：先查出模块会跟着改的测试任务。没有时直接移动；
 * 有时再弹窗确认，用户确认后才移动。
 */
function useMoveWithRunsConfirm({
	loadImpact,
	onMove,
}: Pick<CaseBatchMoveButtonProps, "loadImpact" | "onMove">) {
	const [pending, setPending] = useState<PendingRunsConfirm | null>(null);
	const handleChosen = useCallback(
		async (module: CaseMoveTarget) => {
			const runs = await loadImpact(module.id);
			if (runs === null) {
				return;
			}
			if (runs.length === 0) {
				onMove(module);
				return;
			}
			setPending({ module, runs });
		},
		[loadImpact, onMove]
	);
	const cancel = useCallback(() => setPending(null), []);
	const confirm = useCallback(() => {
		if (pending !== null) {
			setPending(null);
			onMove(pending.module);
		}
	}, [onMove, pending]);
	return { cancel, confirm, handleChosen, pending };
}

/**
 * 批量操作栏的「移动到模块」：弹窗中选择目标模块，显示选中的模块名，确认后移动。
 * 这些用例在进行中的测试任务中时，再弹窗确认测试任务中的模块也一起改。
 * 每次打开弹窗都重新选择。
 */
export function CaseBatchMoveButton({
	count,
	loadImpact,
	modules,
	onMove,
}: CaseBatchMoveButtonProps) {
	const [open, setOpen] = useState(false);
	// 每次打开换一个 key，弹窗中上次的选择不保留
	const [session, setSession] = useState(0);
	const openDialog = useCallback(() => {
		setSession((value) => value + 1);
		setOpen(true);
	}, []);
	const runsConfirm = useMoveWithRunsConfirm({ loadImpact, onMove });
	const { handleChosen } = runsConfirm;
	const choose = useCallback(
		(module: CaseMoveTarget) => {
			handleChosen(module).catch(() => undefined);
		},
		[handleChosen]
	);

	return (
		<>
			<Button onClick={openDialog} size="sm" variant="outline">
				<FolderInputIcon data-icon="inline-start" />
				移动到模块
			</Button>
			<CaseMoveDialog
				count={count}
				key={session}
				modules={modules}
				onMove={choose}
				onOpenChange={setOpen}
				open={open}
			/>
			<CaseMoveRunsConfirm
				onCancel={runsConfirm.cancel}
				onConfirm={runsConfirm.confirm}
				pending={runsConfirm.pending}
			/>
		</>
	);
}
