#!/bin/bash

# 🚀 QLCD Docker Build & Push Script
# Cách dùng: ./build.sh

set -e

echo "================================"
echo "🐳 QLCD Docker Build & Push"
echo "================================"

# Configuration
DOCKER_USERNAME="manhkha8768"
IMAGE_NAME="qlcd"
IMAGE_TAG="latest"
FULL_IMAGE="${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker chưa được cài đặt!"
    exit 1
fi

echo "✅ Docker đã cài đặt: $(docker --version)"

# Build
echo ""
echo "📦 Building image: $FULL_IMAGE"
docker build -t "$FULL_IMAGE" .

if [ $? -eq 0 ]; then
    echo "✅ Build thành công!"
else
    echo "❌ Build thất bại!"
    exit 1
fi

# Ask to push
echo ""
echo "🔐 Đăng nhập Docker Hub..."
echo "Nhập token hoặc password Docker Hub:"
docker login -u "$DOCKER_USERNAME"

if [ $? -eq 0 ]; then
    echo "✅ Đã đăng nhập!"
else
    echo "❌ Đăng nhập thất bại!"
    exit 1
fi

# Push
echo ""
echo "📤 Pushing image lên Docker Hub..."
docker push "$FULL_IMAGE"

if [ $? -eq 0 ]; then
    echo ""
    echo "================================"
    echo "✅ Push thành công!"
    echo "================================"
    echo ""
    echo "Image: $FULL_IMAGE"
    echo "URL: https://hub.docker.com/r/$DOCKER_USERNAME/$IMAGE_NAME"
    echo ""
    echo "Bước tiếp theo:"
    echo "1. SSH vào server: ssh user@your-server-ip"
    echo "2. Chạy: docker pull $FULL_IMAGE"
    echo "3. Chạy: docker-compose up -d"
    echo ""
else
    echo "❌ Push thất bại!"
    exit 1
fi
