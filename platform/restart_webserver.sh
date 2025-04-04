#!/bin/bash
#
# Rebuilds and restarts the webserver container

set -e  # Exit on errors

echo "🔨 Rebuilding webserver image from fresh sources..."
sudo docker build --no-cache -t miniinterneteth/d_webserver ./docker_images/webserver

echo "🛑 Stopping and removing old WEB container (if any)..."
sudo docker stop WEB 2>/dev/null || true
sudo docker rm WEB 2>/dev/null || true

echo "🚀 Starting new WEB container..."
sudo docker run --name WEB -d \
  -v ${HOME}/mini_internet_project_fork/utils/dummy_traceroutes:/traceroutes:ro \
  miniinterneteth/d_webserver

echo "⚙️ Running website setup script..."
sudo setup/website_setup.sh .

echo "✅ Webserver rebuilt and restarted successfully."
