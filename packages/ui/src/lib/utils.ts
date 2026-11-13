import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// theme.css 的字号层级和阴影令牌。不登记的话，tailwind-merge 把 text-page-title
// 和 shadow-card 当成颜色，合并时会丢掉不冲突的类，或者留下冲突的类。
// kbd-hint 是 apps/web 的 index.css 中的字号，用在 Kbd 上。
const twMerge = extendTailwindMerge({
	extend: {
		theme: {
			shadow: ["card", "popover"],
			text: ["page-title", "card-title", "body", "caption", "kbd-hint"],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
