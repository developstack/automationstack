import { flushSync } from "react-dom";

const TRANSITION_CLASS = "theme-transitioning";

const NEW_ROOT_PSEUDO = "::view-transition-new(root)";

const DURATION_MS = 820;
const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

const RADIUS_OVERSHOOT = 1.25;

const HALF = 0.5;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export interface ThemeTransitionOrigin {
	x: number;
	y: number;
}

export interface ThemeTransitionClick {
	clientX: number;
	clientY: number;
	currentTarget: EventTarget | null;
}

function viewportCenter(): ThemeTransitionOrigin {
	return { x: window.innerWidth * HALF, y: window.innerHeight * HALF };
}

export function originFromEvent(
	event: ThemeTransitionClick
): ThemeTransitionOrigin {
	if (event.clientX !== 0 || event.clientY !== 0) {
		return { x: event.clientX, y: event.clientY };
	}
	const target = event.currentTarget;
	if (target instanceof Element) {
		const rect = target.getBoundingClientRect();
		return {
			x: rect.left + rect.width * HALF,
			y: rect.top + rect.height * HALF,
		};
	}
	return viewportCenter();
}

function canReveal(): boolean {
	return (
		typeof document !== "undefined" &&
		typeof document.startViewTransition === "function" &&
		!window.matchMedia(REDUCED_MOTION_QUERY).matches
	);
}

function revealRadius(origin: ThemeTransitionOrigin): number {
	const dx = Math.max(origin.x, window.innerWidth - origin.x);
	const dy = Math.max(origin.y, window.innerHeight - origin.y);
	return Math.hypot(dx, dy) * RADIUS_OVERSHOOT;
}

function playReveal(origin: ThemeTransitionOrigin): void {
	const radius = revealRadius(origin);
	const diameter = radius + radius;
	document.documentElement.animate(
		{
			maskPosition: [
				`${origin.x}px ${origin.y}px`,
				`${origin.x - radius}px ${origin.y - radius}px`,
			],
			maskSize: ["0px 0px", `${diameter}px ${diameter}px`],
		},
		{
			duration: DURATION_MS,
			easing: EASING,
			fill: "forwards",
			pseudoElement: NEW_ROOT_PSEUDO,
		}
	);
}

let activeReveals = 0;

function endReveal(): void {
	activeReveals -= 1;
	if (activeReveals === 0) {
		document.documentElement.classList.remove(TRANSITION_CLASS);
	}
}

export function runThemeTransition(
	origin: ThemeTransitionOrigin | null,
	apply: () => void
): void {
	if (!canReveal()) {
		apply();
		return;
	}
	document.documentElement.classList.add(TRANSITION_CLASS);
	activeReveals += 1;
	const transition = document.startViewTransition(() => {
		flushSync(apply);
	});
	transition.finished.then(endReveal, endReveal);
	transition.ready.then(() => playReveal(origin ?? viewportCenter()), noop);
}

// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
function noop(): void {}
