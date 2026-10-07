import type { Theme } from "mind-elixir";

export const MINDMAP_THEME: Theme = {
	cssVar: {
		"--accent-color": "var(--primary)",
		"--bgcolor": "var(--background)",
		"--color": "var(--foreground)",
		"--main-bgcolor": "var(--card)",
		"--main-bgcolor-transparent":
			"color-mix(in oklab, var(--card) 80%, transparent)",
		"--main-color": "var(--card-foreground)",
		"--panel-bgcolor": "var(--popover)",
		"--panel-border-color": "var(--border)",
		"--panel-color": "var(--popover-foreground)",
		"--root-bgcolor": "var(--primary)",
		"--root-border-color": "var(--border)",
		"--root-color": "var(--primary-foreground)",
		"--selected": "var(--ring)",
	},
	name: "automationstack",
	palette: ["var(--primary)"],
	type: "light",
};
