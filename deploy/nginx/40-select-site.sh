#!/bin/sh
# 按证书是否存在选择站点配置，写入 /etc/nginx/conf.d/default.conf。
#
# nginx 官方镜像在启动时执行 /docker-entrypoint.d/ 中的脚本，本脚本挂载在那里。
# make up:prod 在申请证书后也执行它，然后 reload nginx。
set -eu

if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
	site=https
else
	site=http
fi

# 只替换 ${DOMAIN}。模板中的 $host、$request_uri 等是 nginx 的变量。
# shellcheck disable=SC2016
envsubst '${DOMAIN}' < "/etc/nginx/automationstack/site-${site}.conf.template" > /etc/nginx/conf.d/default.conf
echo "automationstack: ${DOMAIN} 使用 ${site} 站点配置"
