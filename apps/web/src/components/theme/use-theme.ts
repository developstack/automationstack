import { useSyncExternalStore } from "react";

import type { ThemeTransitionOrigin } from "@/components/theme/theme-transition";
import { runThemeTransition } from "@/components/theme/theme-transition";

export type ThemeAppearance = "dark" | "light";

const STORAGE_KEY = "theme";
const DARK_CLASS = "dark";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/*
 * 首屏防闪脚本，必须在 <head> 里同步执行：等到 hydration 再加 .dark，浏览器已经用
 * :root（亮色令牌）画过一帧，暗色偏好的用户会看到一次白闪。规则与下面的
 * resolveAppearance 完全一致——显式偏好（localStorage）优先，没有就跟随系统。
 * localStorage 在部分隐私模式下读取即抛异常，所以 try 只裹住那一次读取——裹住整段的话，
 * 异常会连「跟随系统」一起吞掉，存储被禁用 + 系统暗色的用户会一直停在亮色。
 * 写成字符串常量是因为它要交给 <ScriptOnce> 内联进 HTML，不参与打包。
 */
export const THEME_INIT_SCRIPT = `(()=>{let p=null;try{p=localStorage.getItem("${STORAGE_KEY}")}catch{}const d=p==="${DARK_CLASS}"||(p!=="light"&&matchMedia("${DARK_QUERY}").matches);document.documentElement.classList.toggle("${DARK_CLASS}",d)})()`;

const listeners = new Set<() => void>();

function readStoredAppearance(): ThemeAppearance | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "dark" || stored === "light") {
			return stored;
		}
	} catch {
		// 隐私模式下读取会抛异常，按「没有显式偏好」处理
	}
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

/* 系统偏好变化、以及别的标签页改了偏好（storage 事件）都要重新解析并落到 <html> 上。
   只有「没有显式偏好」时系统变化才会真的改变结果，resolveAppearance 已经含这个判断。 */
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

/* 快照直接读 <html> 上的类，而不是重新解析偏好：那个类是首屏脚本已经画出来的事实，
   读它才能保证「组件显示的状态」与「用户看到的颜色」永远同源。 */
function getSnapshot(): ThemeAppearance {
	return document.documentElement.classList.contains(DARK_CLASS)
		? "dark"
		: "light";
}

/* SSR 时没有 DOM，也无从知道用户偏好：HTML 里 <html> 不带 .dark，等价于亮色。
   客户端 useSyncExternalStore 会在 hydration 后立刻用 getSnapshot 复核并重渲染，
   所以这里返回常量不会造成 hydration 不一致的警告。 */
function getServerSnapshot(): ThemeAppearance {
	return "light";
}

/** 当前生效的外观（已把「跟随系统」解析成具体值）。 */
export function useThemeAppearance(): ThemeAppearance {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * 记下显式偏好并立即生效；显式偏好会一直覆盖系统设置，直到用户再次切换。
 *
 * 全站翻主题的唯一收口：<html> 上那个类只有 applyAppearance 一处在改，所以圆形揭示
 * 也只需要包住这一处（见 theme-transition.ts）。首屏防闪脚本 THEME_INIT_SCRIPT 走的
 * 是另一条路——它在 <head> 里同步跑，那时既没有 React 也没有转场，一个字都没动过，
 * 暗色用户第一帧仍然是暗的。
 *
 * origin 是圆心（视口坐标），由调用方从点击事件里取（originFromEvent）。不传或传
 * null 就落到视口中心；播不播得成由 runThemeTransition 自己判定，无论如何主题都会翻。
 *
 * localStorage 的写入放在转场之外、且先于它：写不进去（隐私模式）不该拦住这次切换，
 * 而它抛出的异常若落在转场回调里，会连着让 startViewTransition 的 promise 变成
 * rejected，转场卡在冻结的旧画面上——颜色翻了，用户却还看着旧的那一帧。
 */
export function setThemeAppearance(
	appearance: ThemeAppearance,
	origin?: ThemeTransitionOrigin | null
): void {
	try {
		localStorage.setItem(STORAGE_KEY, appearance);
	} catch {
		// 隐私模式下写不进去：本次会话仍然生效，只是刷新后回到跟随系统
	}
	/*
	 * applyAppearance 在 notify 之前，两者又同在一次 flushSync 里：任何被 notify
	 * 叫醒的监听者读 getSnapshot 时，<html> 上的类已经是新值，React 拿到的状态与
	 * 用户即将看到的颜色永远同源。aria-pressed 因此不会与实际配色错开。
	 */
	runThemeTransition(origin ?? null, () => {
		applyAppearance(appearance);
		notify();
	});
}
