export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

export const EASE_OUT_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";

export const SPRING_PRESS = {
	damping: 30,
	mass: 0.6,
	stiffness: 500,
	type: "spring",
} as const;

export const SPRING_SWAP = {
	damping: 30,
	mass: 0.55,
	stiffness: 460,
	type: "spring",
} as const;

export const SPRING_PANEL = {
	damping: 40,
	mass: 0.5,
	stiffness: 420,
	type: "spring",
} as const;

export const SPRING_LAYOUT = {
	damping: 32,
	mass: 0.6,
	stiffness: 360,
	type: "spring",
} as const;

export const SPRING_MOUSE = {
	damping: 15,
	mass: 0.3,
	stiffness: 200,
} as const;

export const SPRING_GLIDE = {
	damping: 50,
	mass: 0.5,
	stiffness: 700,
} as const;
