import { cn } from "@automationstack/ui/lib/utils";

interface VersionTagProps {
	className?: string;
	version: number;
}

/** 版本号，例如「v3」。用等宽字体。 */
export function VersionTag({ className, version }: VersionTagProps) {
	return (
		<span className={cn("numeric font-medium text-sm", className)}>
			{`v${version}`}
		</span>
	);
}
