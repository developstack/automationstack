import { useSyncExternalStore } from "react";

import type { ThemeTransitionOrigin } from "@/components/theme/theme-transition";
import { runThemeTransition } from "@/components/theme/theme-transition";

export type ThemeAppearance = "dark" | "light";

const STORAGE_KEY = "theme";
const DARK_CLASS = "dark";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export const THEME_INIT_SCRIPT = `(()=>{let p=null;try{p=localStorage.getItem("${STORAGE_KEY}")}catch{}const d=p==="${DARK_CLASS}"||(p!=="light"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.classList.toggle("${DARK_CLASS}",d)})()`;

const listeners = new Set<() => void>();

function readStoredAppearance(): ThemeAppearance | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "dark" || stored === "light") {
			return stored;
		}
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
	return null;
}

function resolveAppearance(): ThemeAppearance {
	const stored = readStoredAppearance();
	if (stored !== null) {
		return stored;
	}
	return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyAppearance(appearance: ThemeAppearance): void {
	document.documentElement.classList.toggle(DARK_CLASS, appearance === "dark");
}

function notify(): void {
	for (const listener of listeners) {
		listener();
	}
}

function handleExternalChange(): void {
	applyAppearance(resolveAppearance());
	notify();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	const media = window.matchMedia(DARK_QUERY);
	media.addEventListener("change", handleExternalChange);
	window.addEventListener("storage", handleExternalChange);
	return () => {
		listeners.delete(listener);
		media.removeEventListener("change", handleExternalChange);
		window.removeEventListener("storage", handleExternalChange);
	};
}

function getSnapshot(): ThemeAppearance {
	return document.documentElement.classList.contains(DARK_CLASS)
		? "dark"
		: "light";
}

function getServerSnapshot(): ThemeAppearance {
	return "light";
}

export function useThemeAppearance(): ThemeAppearance {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setThemeAppearance(
	appearance: ThemeAppearance,
	origin?: ThemeTransitionOrigin | null
): void {
	try {
		localStorage.setItem(STORAGE_KEY, appearance);
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
	runThemeTransition(origin ?? null, () => {
		applyAppearance(appearance);
		notify();
	});
}
