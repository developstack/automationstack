import { defineConfig } from "vitest/config";

import AutomationStackVitestReporter from "./adapters/vitest-reporter.ts";

/**
 * 切面的接线处：`reporters` 是 vitest 自己的官方扩展位。
 *
 * `default` 留着是为了终端上还能看见测试进度；`AutomationStackVitestReporter`
 * 是我们挂上去的第二位，它一个字都不往终端写，只把结果搬给 SDK。
 *
 * ⚠️ 这份配置**不能**被根目录那份 vitest 配置扫到（示例的用例是故意有一条红的），
 * 所以它只跑 `tests/vitest/` 下面的东西，且示例包不参与根目录的 `pnpm test`。
 */
export default defineConfig({
	test: {
		include: ["tests/vitest/**/*.test.ts"],
		reporters: ["default", new AutomationStackVitestReporter()],
	},
});
