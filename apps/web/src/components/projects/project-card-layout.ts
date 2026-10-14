/*
 * 项目卡片和它的骨架屏共用的尺寸。卡片的宽度和高度固定，不随屏幕宽度或描述长度变化。
 *
 * 网格从左排列，换行后屏幕越宽一行的卡片越多。卡片宽度固定，所以 flex-wrap 与
 * repeat(auto-fill, 18rem) 的网格效果相同，也不需要自定义的网格工具类。
 */
export const PROJECT_CARD_GRID = "flex flex-wrap gap-4";

/*
 * 宽 18rem（w-72）：屏幕宽 1280px、侧栏展开时一行放 3 张；320px 宽的手机也放得下一张。
 * 高 146px（h-36.5）：上下边框 2 × 1px，上下内边距 2 × 24px，标题一行 24px、
 * 描述两行 40px、底部一行 24px，以及两个 4px 的间距。
 * max-w-full：内容区比卡片还窄时卡片变窄，不出现横向滚动。
 */
export const PROJECT_CARD_SIZE = "h-36.5 w-72 max-w-full";

/** 描述最多两行。高度固定为两行，只有一行描述时底部一行也不上移。 */
export const PROJECT_CARD_DESCRIPTION = "line-clamp-2 h-10 wrap-break-word";
