/**
 * 会话工作目录里的固定文件名。
 *
 * 单独一个模块而不是各写各的字符串：sink 写、har 读、collect 组清单，
 * 三处必须一致；名字要改时只改这里，也省得 collect 反向 import 到带 ws 依赖的
 * client.ts（collect 是 finalize 阶段调用的，那时 CDP 早断了）。
 */

/** 全量事件流，落盘的唯一真相；本身不作为产物上传。 */
export const EVENTS_FILE_NAME = "events.ndjson";

/** console 三类事件的副本，终产物直接就是它，不需要二次加工。 */
export const CONSOLE_FILE_NAME = "console.ndjson";

/** HAR 由 events.ndjson 在 finalize 时组装出来，不是录制期写的。 */
export const HAR_FILE_NAME = "har.json";

export const SCREENSHOTS_DIR_NAME = "screenshots";
