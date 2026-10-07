import { cn } from "@automationstack/ui/lib/utils";
import { Blobatar } from "@blobatar/react";
import type { ReactNode } from "react";

export const PRESENCE_AVATAR_CLASS =
	"flex size-6 shrink-0 select-none items-center justify-center rounded-full font-medium text-presence-label ring-2 ring-background focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

export const PRESENCE_OVERFLOW_CLASS = "bg-muted text-muted-foreground";

const AVATAR_TONE = 0.7;

export interface PresenceAvatarRenderProps {
	children: ReactNode;
	className: string;
}

interface PresenceAvatarProps {
	className?: string;
	name: string;
	render?: (props: PresenceAvatarRenderProps) => ReactNode;
}

const renderDecorativeAvatar = (
	props: PresenceAvatarRenderProps
): ReactNode => <span aria-hidden={true} {...props} />;

export function PresenceAvatar({
	className,
	name,
	render = renderDecorativeAvatar,
}: PresenceAvatarProps): ReactNode {
	return render({
		children: (
			<Blobatar
				alt=""
				background={false}
				className="size-full"
				name={name}
				tone={AVATAR_TONE}
			/>
		),
		className: cn(PRESENCE_AVATAR_CLASS, className),
	});
}
