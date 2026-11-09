/**
 * 测试用例平台的 dsh 插件入口：挂载包内的两个 skill，并连接平台的远程 MCP。
 *
 * 只有这个文件 import dsh 的包（宿主提供的 peer）。配置的计算全部在 config.js，
 * 这样单测不需要装 dsh。
 */
import { fileURLToPath } from "node:url";
// 两个子插件必须以整个模块（name、inject、Config、apply）交给 ctx.plugin。
// biome-ignore lint/performance/noNamespaceImport: Cordis 需要完整的插件模块对象
import * as McpClientPlugin from "@deepseek-ai/dsh-mcp-client";
// biome-ignore lint/performance/noNamespaceImport: Cordis 需要完整的插件模块对象
import * as SkillFilesystemPlugin from "@deepseek-ai/dsh-skill-filesystem";

import { buildPluginSetup } from "./config.js";

/** Cordis 在加载诊断里显示的插件名。 */
export const name = "testcase-platform";

const skillsDir = fileURLToPath(new URL("./skills", import.meta.url));

export function apply(ctx, config) {
	const setup = buildPluginSetup({ config, env: process.env, skillsDir });
	for (const warning of setup.warnings) {
		ctx.logger.warn(`${name}: ${warning}`);
	}
	for (const error of setup.errors) {
		ctx.logger.error(`${name}: ${error}`);
	}

	ctx.plugin(SkillFilesystemPlugin, setup.skills);
	if (setup.mcp === null) {
		ctx.logger.error(
			`${name}: MCP 配置有错，未连接测试用例平台；skill 照常加载`
		);
		return;
	}
	ctx.plugin(McpClientPlugin, setup.mcp);
}
