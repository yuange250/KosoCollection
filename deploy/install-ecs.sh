#!/usr/bin/env bash
# 阿里云 ECS：一键安装依赖、构建静态站、配置 nginx
# 支持：Ubuntu / Debian、Alibaba Cloud Linux / RHEL 系（含 dnf/yum）
# 用法（在仓库根目录）：
#   chmod +x deploy/install-ecs.sh
#   ./deploy/install-ecs.sh
# 可选环境变量：
#   DOMAIN=your.domain.com          默认 _
#   WEBROOT=/var/www/gamehistory    默认 /var/www/gamehistory
#   REMOVE_NGINX_DEFAULT=1          默认 1；单机部署时移除 nginx 自带 default，避免与 80 端口冲突
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

DOMAIN="${DOMAIN:-_}"
WEBROOT="${WEBROOT:-/var/www/gamehistory}"
REMOVE_NGINX_DEFAULT="${REMOVE_NGINX_DEFAULT:-1}"

if [[ ! -f "$ROOT/package.json" ]]; then
  echo "错误：请在包含 package.json 的仓库根目录运行（当前: $ROOT）" >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "错误：需要 sudo" >&2
  exit 1
fi

if [[ ! -f /etc/os-release ]]; then
  echo "错误：无法检测系统版本（缺少 /etc/os-release）" >&2
  exit 1
fi

# shellcheck source=/dev/null
. /etc/os-release

ID_L="${ID:-}"
ID_LIKE="${ID_LIKE:-}"

is_apt() {
  [[ "$ID_L" == "ubuntu" ]] || [[ "$ID_L" == "debian" ]] || [[ "$ID_L" == "linuxmint" ]]
}

is_dnf_yum() {
  [[ "$ID_L" == "alinux" ]] || [[ "$ID_L" == "centos" ]] || [[ "$ID_L" == "rhel" ]] ||
    [[ "$ID_L" == "rocky" ]] || [[ "$ID_L" == "almalinux" ]] || [[ "$ID_L" == "fedora" ]] ||
    [[ "$ID_L" == "anolis" ]] || [[ "$ID_LIKE" == *"rhel"* ]] || [[ "$ID_LIKE" == *"fedora"* ]] ||
    [[ "$ID_LIKE" == *"centos"* ]]
}

echo "==> 系统: ${PRETTY_NAME:-$ID $VERSION_ID}"

if is_apt; then
  echo "==> 安装系统依赖（apt：nginx、rsync、curl）…"
  sudo apt-get update -y
  sudo apt-get install -y nginx rsync curl ca-certificates openssl
elif is_dnf_yum; then
  echo "==> 安装系统依赖（dnf/yum：nginx、rsync、curl）…"
  if command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y nginx rsync curl ca-certificates openssl || sudo yum install -y nginx rsync curl ca-certificates openssl
  else
    sudo yum install -y nginx rsync curl ca-certificates openssl
  fi
  sudo systemctl enable nginx
else
  echo "错误：未识别的发行版（ID=$ID_L）。请使用 Ubuntu / Debian / Alibaba Cloud Linux，或改用 Docker：docker compose -f deploy/docker-compose.yml up -d --build" >&2
  exit 1
fi

install_node_20() {
  if command -v node >/dev/null 2>&1 && node -e "const m=+process.versions.node.split('.')[0]; process.exit(m<20?1:0)" 2>/dev/null; then
    echo "==> Node.js 已满足 $(node -v)"
    return 0
  fi
  echo "==> 安装 Node.js 20.x …"
  if is_apt; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif is_dnf_yum; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    if command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y nodejs
    else
      sudo yum install -y nodejs
    fi
  fi
}

install_node_20

echo "==> 构建前端…"
npm ci
npm run build

echo "==> 发布到 $WEBROOT …"
sudo mkdir -p "$WEBROOT"
sudo rsync -a --delete "$ROOT/dist/" "$WEBROOT/"

SSL_DIR="/etc/nginx/ssl"
SSL_CN="$DOMAIN"
[[ "$SSL_CN" == "_" ]] && SSL_CN="localhost"
if [[ ! -f "$SSL_DIR/gamehistory.crt" ]]; then
  echo "==> 生成 TLS 自签名证书 $SSL_DIR（日后可用 certbot 替换为正式证书）…"
  sudo mkdir -p "$SSL_DIR"
  sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "$SSL_DIR/gamehistory.key" -out "$SSL_DIR/gamehistory.crt" \
    -subj "/CN=$SSL_CN/O=gamehistory"
  sudo chmod 644 "$SSL_DIR/gamehistory.crt"
  sudo chmod 640 "$SSL_DIR/gamehistory.key"
fi

# nginx worker 需能读取私钥：root:root + chmod 640 会导致启动失败（Alinux 多为 nginx，Debian/Ubuntu 多为 www-data）
fix_ssl_key_owner() {
  local key="$SSL_DIR/gamehistory.key"
  [[ -f "$key" ]] || return 0
  local run_user=""
  if [[ -f /etc/nginx/nginx.conf ]]; then
    run_user=$(awk '/^[[:space:]]*user[[:space:]]+/ {gsub(/;/,"",$2); print $2; exit}' /etc/nginx/nginx.conf)
  fi
  if [[ -n "$run_user" ]] && getent group "$run_user" &>/dev/null; then
    sudo chown root:"$run_user" "$key"
  elif id -u nginx &>/dev/null && getent group nginx &>/dev/null; then
    sudo chown root:nginx "$key"
  elif getent group www-data &>/dev/null; then
    sudo chown root:www-data "$key"
  else
    sudo chmod 644 "$key"
    echo "警告：未识别 nginx 运行用户组，已将私钥 chmod 644（仅测试环境建议）" >&2
  fi
  sudo chmod 640 "$key"
}
fix_ssl_key_owner

if command -v getenforce &>/dev/null && [[ "$(getenforce 2>/dev/null)" == "Enforcing" ]]; then
  echo "==> SELinux Enforcing：为 $SSL_DIR 设置 nginx 可读标签…"
  sudo chcon -R -t cert_t "$SSL_DIR" 2>/dev/null || sudo chcon -R -t httpd_sys_content_t "$SSL_DIR" 2>/dev/null || true
fi

CONF_SRC="$SCRIPT_DIR/nginx-gamehistory.conf"
render_conf() {
  sed -e "s|__SERVER_NAME__|$DOMAIN|g" -e "s|__WEB_ROOT__|$WEBROOT|g" "$CONF_SRC"
}

if [[ ! -f "$CONF_SRC" ]]; then
  echo "错误：缺少 $CONF_SRC" >&2
  exit 1
fi

if is_apt; then
  CONF_DST="/etc/nginx/sites-available/gamehistory"
  render_conf | sudo tee "$CONF_DST" >/dev/null
  sudo mkdir -p /etc/nginx/sites-enabled
  sudo ln -sf "$CONF_DST" /etc/nginx/sites-enabled/gamehistory
  if [[ "$REMOVE_NGINX_DEFAULT" == "1" ]] && [[ -e /etc/nginx/sites-enabled/default ]]; then
    echo "==> 移除 /etc/nginx/sites-enabled/default（避免与站点抢 80；设 REMOVE_NGINX_DEFAULT=0 可保留）"
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
elif is_dnf_yum; then
  sudo mkdir -p /etc/nginx/conf.d
  render_conf | sudo tee /etc/nginx/conf.d/gamehistory.conf >/dev/null
  if [[ "$REMOVE_NGINX_DEFAULT" == "1" ]]; then
    for f in /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/welcome.conf /etc/nginx/default.d/default.conf; do
      if [[ -f "$f" ]]; then
        echo "==> 移除 $f（避免与 server_name _ 抢 80/443；设 REMOVE_NGINX_DEFAULT=0 可保留）"
        sudo rm -f "$f"
      fi
    done
  fi
fi

echo "==> 检测并重载 nginx …"
if ! sudo nginx -t; then
  echo "错误：nginx -t 未通过" >&2
  exit 1
fi
sudo systemctl enable nginx

# 直接 restart 时，若已有 nginx 未正确退出，会出现 bind() 80/443 Address already in use
echo "==> 停止已有 nginx，释放 80/443 …"
sudo systemctl stop nginx 2>/dev/null || true
sleep 2
if [[ -f /run/nginx.pid ]]; then
  OLD_PID="$(sudo cat /run/nginx.pid 2>/dev/null || true)"
  if [[ -n "$OLD_PID" ]] && sudo kill -0 "$OLD_PID" 2>/dev/null; then
    echo "==> 仍有残留 master PID $OLD_PID，发送 QUIT …"
    sudo kill -QUIT "$OLD_PID" 2>/dev/null || true
    sleep 2
  fi
fi
sudo rm -f /run/nginx.pid 2>/dev/null || true

if ! sudo systemctl start nginx; then
  echo "错误：nginx 启动失败。若日志为 bind() Address already in use，说明 80/443 仍被占用（其它 nginx、httpd、Docker 等）。" >&2
  echo "排查：sudo ss -tlnp | grep -E ':80 |:443 ' 或 sudo lsof -iTCP:80 -sTCP:LISTEN -iTCP:443 -sTCP:LISTEN" >&2
  sudo systemctl status nginx.service --no-pager -l 2>/dev/null || true
  sudo journalctl -u nginx.service -n 30 --no-pager 2>/dev/null || true
  exit 1
fi

echo ""
echo "完成。静态文件：$WEBROOT"
echo "本机自测：curl -I http://127.0.0.1  与  curl -k -I https://127.0.0.1"
echo "请在阿里云安全组放行 TCP 80、443。域名解析到本机公网 IP 后可用 certbot 将 /etc/nginx/ssl/ 替换为 Let's Encrypt。"
echo "Docker 备选：在项目根目录执行 docker compose -f deploy/docker-compose.yml up -d --build"
