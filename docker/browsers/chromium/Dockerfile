# 平台自建的浏览器镜像：一套 chromium 同时喂两种协议（plan §2 D5）。
#   MODE=webdriver → chromedriver :4444（Selenium 客户端）
#   MODE=cdp       → chromium --headless=new :9222（Playwright connectOverCDP）
#
# 为什么不用 selenium/standalone-chrome：它拖进整套 Grid，CDP 暴露还很别扭；
# 也不用 selenoid/vnc_chrome：版本陈旧。自建三十行，可控性完胜（plan §6）。
FROM debian:trixie-slim

# 关键：**chromium 与 chromium-driver 必须严格同版本**，版本对不上 chromedriver
# 会直接拒绝启动会话。这里不手动下载匹配版本，而是让 apt 在同一次事务里装两个包
# ——它们出自 Debian 的同一个源码包，天然同版本，也天然一起升级。
# 代价是版本由发行版决定（不能任意指定 chromium 大版本）；要钉版本就钉基础镜像
# 的 tag（debian:trixie-slim 的某个 digest），别去拆这两个包。
#
# fonts-noto-cjk 是必装项而不是可选项：测试对象是中文产品，缺 CJK 字体的截图
# 全是豆腐块，而且**页面本身也会因为字体回退而重排**——截图与线上不一致，
# 排查时先怀疑的却总是业务代码。
RUN apt-get update \
	&& apt-get install --no-install-recommends -y \
		ca-certificates \
		chromium \
		chromium-driver \
		fonts-liberation \
		fonts-noto-cjk \
		fonts-noto-color-emoji \
		procps \
	&& rm -rf /var/lib/apt/lists/*

# 容器里跑 chromium 的标准处置：关掉它自己的 setuid/namespace 沙箱。
# 理由：Chromium 的沙箱要么依赖 setuid helper（要 CAP_SYS_ADMIN），要么依赖
# 用户命名空间——容器默认的 seccomp / apparmor 策略两条路都堵着，不关就是
# 「Failed to move to new namespace」起不来。安全边界因此从「浏览器沙箱」
# 下移到「容器本身」：一个会话一个一次性容器、跑完即毁，这是 plan §3 的模型。
#
# 写成 /etc/chromium.d/ 里的片段而不是只写在 entrypoint 里：Debian 的
# /usr/bin/chromium 是个 shell wrapper，会 source 这个目录下的所有片段并把
# $CHROMIUM_FLAGS 追加到命令行——于是 **chromedriver 拉起的那个 chromium**
# （entrypoint 管不着的那条路径）也能吃到同样的 flag。
# ⚠️ 这依赖上游保持 wrapper 形态；哪天 Debian 改成直接装二进制，这层就失效，
# 届时 farm 侧仍须在 caps 的 goog:chromeOptions.args 里注入 --no-sandbox。
RUN mkdir -p /etc/chromium.d \
	&& printf '%s\n' \
		'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox --disable-dev-shm-usage --disable-gpu"' \
		> /etc/chromium.d/as-container-flags

# 非 root 用户。uid 1000 是为了和「宿主上挂进来的目录」（将来若要挂产物盘）
# 的属主对齐——绝大多数 Linux 主账号就是 1000。
RUN useradd --create-home --shell /bin/bash --uid 1000 browser \
	&& mkdir -p /home/browser/profile /home/browser/downloads \
	&& chown -R browser:browser /home/browser

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER browser
WORKDIR /home/browser

ENV MODE=webdriver \
	HOME=/home/browser

# 4444 = chromedriver（WebDriver），9222 = CDP。
# 两个端口都 EXPOSE：同一个镜像按 MODE 只会监听其中一个，
# 但 WebDriver 模式下 farm 还要用 9222 挂 recorder（plan §5.5），两个都得留着。
EXPOSE 4444 9222

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
