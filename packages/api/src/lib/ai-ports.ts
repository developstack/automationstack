/**
 * agent 的**组装点**：把三个端口的实现拼成一份 `AgentPorts`。
 *
 * 为什么落在 `packages/api` 而不是 `apps/server`：生成入口是 oRPC 的
 * `ai.generate`，它本来就住在这一层；agent 的生命周期与那次调用完全一致，
 * 没有任何跨请求的单例状态需要 server 在启动时接线。放到 apps/server 只会
 * 让路由为了拿一份 ports 再穿一层 context。
 *
 * 这里没有破坏「api 不得运行时导入 drizzle / db client」那条线：本文件只
 * 引用 `packages/db` 导出的**适配器工厂**，drizzle 与连接池仍然只在 db 包里。
 */
import type { AgentPorts } from "@automationstack/agent/ports";
import { createProviderConfigStore } from "@automationstack/ai/provider-config-store";
import { createCaseCatalog } from "@automationstack/db/agent-adapters/case-catalog";
import { createSessionStore } from "@automationstack/db/agent-adapters/session-store";

/** projectId 作为闭包传进只读端口，agent 只能看到当前项目的数据。 */
export function createAgentPorts(projectId: string): AgentPorts {
	return {
		caseCatalog: createCaseCatalog(projectId),
		providerConfig: createProviderConfigStore(),
		sessionStore: createSessionStore(),
	};
}
