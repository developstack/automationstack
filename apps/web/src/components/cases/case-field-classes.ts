/**
 * 用例表单字段的公共类名。
 *
 * 单独成模块是因为 case-text-field.tsx 与 case-select-field.tsx 拆成了两个文件，
 * 而这几档尺寸必须逐字相同——两种控件同格并排时，标签基线与控件上边缘要落在
 * 同一条水平线上，各写一份迟早会各改各的。
 */

/*
 * 编辑界面统一用 14px（text-sm），不再吃 Sheet / Dialog 基类上的 12px。
 * 覆盖写在内容层而不是改 packages/ui 的基类：那两条 text-xs/relaxed 是全站
 * 所有抽屉与弹窗的默认字号，为了用例编辑去掀基类会波及每一个弹层。
 */
export const CONTROL_TEXT = "text-sm";
export const LABEL_TEXT = "text-sm";

/**
 * 字段外框：标签与控件之间 8px。
 * markdown 字段（markdown-field.tsx）用的是同一档，表单里每个标签到控件的
 * 距离才都一样；这一档也必须小于字段之间的 16px，字段才分得出组。
 */
export const FIELD_CLASS = "flex flex-col gap-2";
