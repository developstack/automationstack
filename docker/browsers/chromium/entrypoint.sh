#!/bin/sh
# 双模式入口（plan §2 D5）。一律 exec：让浏览器/driver 成为 PID 1 的那个进程，
# 容器收到 SIGTERM 时它能直接收到——包一层 sh 会把信号吞掉，
# 结果就是每次回收都得等 docker 的 10s 超时再 SIGKILL。
set -eu

MODE="${MODE:-webdriver}"

case "$MODE" in
webdriver)
	# --allowed-ips= 传空列表 = 放行任意来源 IP。chromedriver 默认只认 localhost，
	# 而调用方是容器外的 farm，不放行就是每个请求都被拒。
	# 容器只在 farm 能到的网络里可达，这一层不是安全边界（鉴权在 farm）。
	exec chromedriver \
		--port=4444 \
		--allowed-ips= \
		--allowed-origins='*'
	;;
cdp)
	# --remote-debugging-address=0.0.0.0 只在 headless 下可用（plan §11 风险 1）；
	# 将来上 Xvfb 有头模式录视频时，得在容器内用 socat 把 0.0.0.0:9222 转到
	# 127.0.0.1，入口在这里预留。
	#
	# --remote-allow-origins=*：chromium 会按 Origin 头拒绝 DevTools 的 WS 升级，
	# 而请求是 farm 代理过来的，Origin 不受我们控制——不放行就是握手 403。
	#
	# --user-data-dir 指到容器内的一次性目录：容器本身用后即毁，这里显式给一个
	# 可写路径只是为了不让 chromium 去猜（非 root 下猜错就是启动失败）。
	exec chromium \
		--headless=new \
		--remote-debugging-port=9222 \
		--remote-debugging-address=0.0.0.0 \
		--remote-allow-origins='*' \
		--no-sandbox \
		--disable-dev-shm-usage \
		--disable-gpu \
		--no-first-run \
		--no-default-browser-check \
		--disable-background-networking \
		--disable-backgrounding-occluded-windows \
		--disable-renderer-backgrounding \
		--disable-features=Translate,MediaRouter \
		--user-data-dir=/home/browser/profile \
		about:blank
	;;
*)
	echo "未知 MODE=$MODE，只支持 webdriver | cdp" >&2
	exit 64
	;;
esac
