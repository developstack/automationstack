/**
 * 用例正文渲染的文本流类名。block.tsx 与 heading.tsx 都要用它，所以单独成模块，
 * 而不是让其中一方去 import 另一方（那会在两个文件之间绕出一条没必要的依赖）。
 */

/**
 * `whitespace-pre-wrap` 是这一页的关键类。
 *
 * 编辑器里存的就是原文，用户按下的每一个回车都在字符串里；markdown 的标准做法
 * 是把单个换行折叠成空格，那会让「所见（编辑器里三行）」与「所得（预览里一行）」
 * 对不上。保留换行同时也让硬换行（HardBreak 的原文 `"  \n"`）不需要任何特殊处理
 * ——它作为纯文本原样带过来，在这里就是一次换行，一个字符都没丢。
 */
export const TEXT_FLOW_CLASS = "whitespace-pre-wrap break-words";
