#!/bin/sh
# certbot 续期后，证书文件改变，nginx 必须 reload 才使用新证书。
# 本脚本在后台每 6 小时重新选择站点配置，然后 reload nginx。
# 证书第一次出现时，这一步也把站点从 HTTP 改为 HTTPS。
set -eu

reload_interval_seconds=21600

(
	while :; do
		sleep "${reload_interval_seconds}"
		/docker-entrypoint.d/40-automationstack-select-site.sh && nginx -s reload
	done
) &
