/**
 * 接入指南里那三段示例代码的生成。纯函数，配 connect-snippets.test.ts。
 *
 * 两个值由这一层填进去：farm 地址（构建期烘焙的 `VITE_FARM_URL`）与**当前项目
 * 的真实 projectId**。token 反过来一律留成占位符 `<AS_TOKEN>`——个人 token 的
 * 明文只在创建那一刻出现过一次（api-token-plaintext.tsx），页面这边根本拿不到，
 * 想拿也不该拿：把别人的 token 渲染进一段可复制的代码，等于给截图和录屏留了个
 * 泄密口子。
 *
 * 代码里的两条 URL 形状照 plan §5.3 / §5.4 的线格式逐字写：WebDriver 走
 * `POST <farm>/wd/hub` 并把身份塞进 `as:options` 这个自定义 capability，
 * CDP 走 `<farm>/cdp?token=…&projectId=…` 的查询串。改这两处形状就是改协议，
 * 必须与 apps/farm 同步。
 */

/** token 占位符。三段代码共用同一个字面量，改文案时不会只改中一处。 */
export const TOKEN_PLACEHOLDER = "<AS_TOKEN>";

export interface ConnectSnippet {
	code: string;
	id: string;
	/** 围栏语言标记，交给 DocCodeBlock 做可访问名。 */
	language: string;
	/** tab 标题，同时是 React key。 */
	title: string;
}

const TRAILING_SLASHES_PATTERN = /\/+$/;

function normalizeOrigin(farmUrl: string): string {
	return farmUrl.trim().replace(TRAILING_SLASHES_PATTERN, "");
}

/**
 * `http(s)://` → `ws(s)://`。
 *
 * Playwright 的 `connectOverCDP` 两种都收，但示例里必须写 ws：写成 http 的话
 * 用户照抄进自己的代码后，一旦把 farm 放到 https 反代后面，就会拿着一个
 * `http://` 去连一条要求 `wss://` 的通道，报出来的错（握手失败）与「地址写错」
 * 长得一模一样。前缀不认识时原样返回——那多半是用户自己配了个 `ws://` 开头的
 * `VITE_FARM_URL`，改写反而会毁掉它。
 */
export function toWebSocketUrl(farmUrl: string): string {
	const origin = normalizeOrigin(farmUrl);
	if (origin.startsWith("https://")) {
		return `wss://${origin.slice("https://".length)}`;
	}
	if (origin.startsWith("http://")) {
		return `ws://${origin.slice("http://".length)}`;
	}
	return origin;
}

function pythonSnippet(hubUrl: string, projectId: string): string {
	return `from selenium import webdriver

options = webdriver.ChromeOptions()
# as:options 是农场自定义的 capability：农场会先把它整段剥掉再转发给浏览器，
# 浏览器本身看不到 token。name 可选，只是让会话列表里认得出这一条是什么。
options.set_capability(
    "as:options",
    {
        "token": "${TOKEN_PLACEHOLDER}",
        "projectId": "${projectId}",
        "name": "冒烟-登录流程",
    },
)

driver = webdriver.Remote(
    command_executor="${hubUrl}",
    options=options,
)
try:
    driver.get("https://example.com")
    print(driver.title)
finally:
    # quit() 触发农场侧的收尾：停录制、组装 HAR、上传产物、销毁容器。
    # 漏掉它也不会泄漏容器（有空闲超时兜底），但那一条会被记成超时结束。
    driver.quit()
`;
}

function seleniumNodeSnippet(hubUrl: string, projectId: string): string {
	return `import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

const options = new chrome.Options();
// 与 Python 版同一个 capability，只是这一侧的写法是 set(key, value)
options.set("as:options", {
  token: "${TOKEN_PLACEHOLDER}",
  projectId: "${projectId}",
  name: "冒烟-登录流程",
});

const driver = await new Builder()
  .forBrowser("chrome")
  .usingServer("${hubUrl}")
  .setChromeOptions(options)
  .build();

try {
  await driver.get("https://example.com");
  console.log(await driver.getTitle());
} finally {
  await driver.quit();
}
`;
}

function playwrightSnippet(cdpUrl: string): string {
	return `import { chromium } from "playwright";

// CDP 这一侧没有 capability 可挂，身份与项目走查询串。
// token 是明文，别把这一行提交进版本库——从环境变量读。
const browser = await chromium.connectOverCDP("${cdpUrl}");

const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
try {
  await page.goto("https://example.com");
  console.log(await page.title());
} finally {
  // close() 是农场判定「这条会话结束了」的信号，同 Selenium 的 quit()
  await browser.close();
}
`;
}

export interface ConnectSnippetsInput {
	/** `VITE_FARM_URL` 的值，如 http://localhost:3002 */
	farmUrl: string;
	projectId: string;
}

/**
 * 三段示例。顺序按「用的人从多到少」排：Selenium 两种语言在前，
 * Playwright 在后——本仓的存量自动化脚本以 Selenium 为主。
 */
export function buildConnectSnippets({
	farmUrl,
	projectId,
}: ConnectSnippetsInput): ConnectSnippet[] {
	const hubUrl = `${normalizeOrigin(farmUrl)}/wd/hub`;
	/*
	 * projectId 走 encodeURIComponent：它现在是 uuid，编不编码都一样，但这行
	 * 代码是**拼 URL**，拼 URL 就得转义——哪天 projectId 换成别的形状（slug、
	 * 带中文的短名），漏掉这一步就是一条断掉的示例。token 反过来不编码：
	 * 那是个尖括号占位符，编码之后变成 %3CAS_TOKEN%3E，用户就看不出那是要替换的了。
	 */
	const query = `token=${TOKEN_PLACEHOLDER}&projectId=${encodeURIComponent(projectId)}&browser=chromium`;
	const cdpUrl = `${toWebSocketUrl(farmUrl)}/cdp?${query}`;

	return [
		{
			code: pythonSnippet(hubUrl, projectId),
			id: "selenium-python",
			language: "python",
			title: "Selenium · Python",
		},
		{
			code: seleniumNodeSnippet(hubUrl, projectId),
			id: "selenium-node",
			language: "javascript",
			title: "Selenium · Node",
		},
		{
			code: playwrightSnippet(cdpUrl),
			id: "playwright-node",
			language: "javascript",
			title: "Playwright · Node",
		},
	];
}
