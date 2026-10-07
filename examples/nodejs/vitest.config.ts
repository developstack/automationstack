import { defineConfig } from "vitest/config";

import AutomationStackVitestReporter from "./adapters/vitest-reporter.ts";

export default defineConfig({
	test: {
		include: ["tests/vitest/**/*.test.ts"],
		reporters: ["default", new AutomationStackVitestReporter()],
	},
});
