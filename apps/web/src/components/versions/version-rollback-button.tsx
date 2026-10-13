import { Button } from "@automationstack/ui/components/button";
import { UndoIcon } from "lucide-react";
import { useCallback } from "react";

interface VersionRollbackButtonProps {
	onRollback: (version: number) => void;
	version: number;
}

/** 版本列表一行右侧的回滚按钮。它在整行的选择按钮上层，所以按下时不会选择这一行。 */
export function VersionRollbackButton({
	onRollback,
	version,
}: VersionRollbackButtonProps) {
	const handleClick = useCallback(() => {
		onRollback(version);
	}, [onRollback, version]);
	return (
		<Button
			aria-label={`回滚到 v${version}`}
			className="relative ml-auto"
			onClick={handleClick}
			size="xs"
			variant="ghost"
		>
			<UndoIcon data-icon="inline-start" />
			回滚
		</Button>
	);
}
