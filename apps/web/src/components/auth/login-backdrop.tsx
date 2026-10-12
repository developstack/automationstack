import { FlickeringGrid } from "@/components/auth/flickering-grid";

const GRID_MAX_OPACITY = 0.2;

/** 登录页左栏的装饰背景。宽度小于 md 断点时隐藏。 */
export function LoginBackdrop() {
	return (
		<div
			aria-hidden="true"
			className="relative hidden overflow-hidden bg-muted md:block"
		>
			<FlickeringGrid
				className="absolute inset-0 text-foreground"
				maxOpacity={GRID_MAX_OPACITY}
			/>
			<div className="absolute inset-0 bg-linear-to-t from-muted to-transparent" />
		</div>
	);
}
