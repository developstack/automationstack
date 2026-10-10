import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 测试没有开启 vitest 的 globals，testing-library 不会自动注册清理，所以在这里注册
afterEach(() => {
	cleanup();
});
