import type { MindElixirInstance } from "mind-elixir";

const DIRECTION_TOOLBAR_SELECTOR = ".mind-elixir-toolbar.lt";

export function pruneMindmapToolbar(mind: MindElixirInstance): void {
	mind.container.querySelector(DIRECTION_TOOLBAR_SELECTOR)?.remove();
}
