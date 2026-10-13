import { AvatarGroup } from "@automationstack/ui/components/avatar-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { cn } from "@automationstack/ui/lib/utils";
import type { ReactNode } from "react";

import {
	PRESENCE_AVATAR_CLASS,
	PRESENCE_OVERFLOW_CLASS,
	PresenceAvatar,
	type PresenceAvatarRenderProps,
} from "@/realtime/presence-avatar";
import type {
	CaseCollaborator,
	CaseCollaborators,
} from "@/realtime/use-editing";

const NAME_SEPARATOR = "、";

const CLAUSE_SEPARATOR = "；";

const AVATAR_SIZE = "size-5";

// 正在编辑用状态色令牌 warning，浅色和暗色模式各有一组值
const EDITING_RING = "ring-warning";

// 头像只有 20px，按钮至少 24px 高，满足点击区域的要求
const TRIGGER_CLASS =
	"flex min-h-6 min-w-6 items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

const STACK_CLASS = "-space-x-1";

const MAX_VISIBLE_AVATARS = 3;

// 头像挂载时淡入并轻微放大。行和头像的 key 不变时不会重播
const AVATAR_ENTER = "animate-in fade-in-0 zoom-in-95 duration-200";

type CollaboratorActivity = "editing" | "viewing";

function decorativeAvatar(activity: CollaboratorActivity) {
	return (props: PresenceAvatarRenderProps): ReactNode => (
		<span aria-hidden={true} data-collaborator={activity} {...props} />
	);
}

const AVATAR_RENDERERS: Record<
	CollaboratorActivity,
	ReturnType<typeof decorativeAvatar>
> = {
	editing: decorativeAvatar("editing"),
	viewing: decorativeAvatar("viewing"),
};

function joinNames(collaborators: CaseCollaborator[]): string {
	return collaborators
		.map((collaborator) => collaborator.name)
		.join(NAME_SEPARATOR);
}

function clausesFor({ editors, viewers }: CaseCollaborators): string[] {
	const clauses: string[] = [];
	if (editors.length > 0) {
		clauses.push(`${joinNames(editors)} 正在编辑`);
	}
	if (viewers.length > 0) {
		clauses.push(`${joinNames(viewers)} 正在查看`);
	}
	return clauses;
}

interface StackedCollaborator {
	collaborator: CaseCollaborator;
	editing: boolean;
}

function stackFor({
	editors,
	viewers,
}: CaseCollaborators): StackedCollaborator[] {
	return [
		...editors.map((collaborator) => ({ collaborator, editing: true })),
		...viewers.map((collaborator) => ({ collaborator, editing: false })),
	];
}

interface CaseCollaboratorsBadgeProps {
	collaborators: CaseCollaborators;
}

function CaseCollaboratorsBadge({
	collaborators,
}: CaseCollaboratorsBadgeProps) {
	const stacked = stackFor(collaborators);
	const visible = stacked.slice(0, MAX_VISIBLE_AVATARS);
	const overflow = stacked.length - visible.length;
	const clauses = clausesFor(collaborators);
	const label = clauses.join(CLAUSE_SEPARATOR);
	return (
		<Tooltip>
			<TooltipTrigger aria-label={label} className={TRIGGER_CLASS}>
				<AvatarGroup className={STACK_CLASS} lift={false}>
					{visible.map(({ collaborator, editing }) => (
						<PresenceAvatar
							className={cn(
								AVATAR_SIZE,
								AVATAR_ENTER,
								editing ? EDITING_RING : undefined
							)}
							key={collaborator.clientId}
							name={collaborator.name}
							render={AVATAR_RENDERERS[editing ? "editing" : "viewing"]}
						/>
					))}
					{overflow > 0 ? (
						<span
							aria-hidden={true}
							className={cn(
								PRESENCE_AVATAR_CLASS,
								PRESENCE_OVERFLOW_CLASS,
								AVATAR_SIZE,
								AVATAR_ENTER
							)}
						>
							{`+${overflow}`}
						</span>
					) : null}
				</AvatarGroup>
			</TooltipTrigger>
			<TooltipContent className="flex-col items-start gap-0.5">
				{clauses.map((clause) => (
					<span key={clause}>{clause}</span>
				))}
			</TooltipContent>
		</Tooltip>
	);
}

interface CaseCollaboratorsCellProps {
	collaborators: CaseCollaborators | undefined;
}

export function CaseCollaboratorsCell({
	collaborators,
}: CaseCollaboratorsCellProps) {
	if (!collaborators) {
		return <span className="text-muted-foreground">—</span>;
	}
	return <CaseCollaboratorsBadge collaborators={collaborators} />;
}
