#!/bin/bash
#
# Rebuilds and restarts the webserver container

set -e  # Exit on errors

echo "Rebuilding webserver image from fresh sources..."
sudo docker build --no-cache -t miniinterneteth/d_webserver ./docker_images/webserver

echo "Stopping and removing old WEB and PROXY container (if any)..."
sudo docker stop WEB 2>/dev/null || true
sudo docker rm WEB 2>/dev/null || true
sudo docker stop PROXY 2>/dev/null || true
sudo docker rm PROXY 2>/dev/null || true

echo "Running website setup script..."
sudo setup/website_setup.sh .

echo "Webserver rebuilt and restarted successfully."
