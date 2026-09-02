import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	client: {
		/**
		 * 浏览器该去哪里连 farm（接入指南页生成示例代码、会话产物下载都用它）。
		 * 和 VITE_SERVER_URL 一样是**构建期烘焙**：Vite 在 build 时把值内联进
		 * 前端产物，运行时改环境变量、重启容器都不会生效，换地址等于重新 build。
		 *
		 * 给了默认值而 VITE_SERVER_URL 没给：farm 是后加的能力，存量的构建管线
		 * （docker-compose 的 web 服务、ci.yml 的 build-args）没人传这个 arg，
		 * 设成必需会让「还没用上 farm 的人」的构建当场变红。
		 */
		VITE_FARM_URL: z.url().default("http://localhost:3002"),
		VITE_SERVER_URL: z.url(),
	},
	clientPrefix: "VITE_",
	emptyStringAsUndefined: true,
	runtimeEnv: (
		import.meta as unknown as {
			env: Record<string, string | boolean | undefined>;
		}
	).env,
});
