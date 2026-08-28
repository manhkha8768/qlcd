#!/bin/bash

# 🚀 QLCD Docker Deploy Script (chạy trên server production)
# Cách dùng: ./deploy.sh

set -e

echo "================================"
echo "🚀 QLCD Docker Deploy"
echo "================================"

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose chưa được cài đặt!"
    echo "Cài đặt: sudo apt install -y docker-compose-plugin"
    exit 1
fi

echo "✅ Docker Compose đã cài: $(docker-compose --version)"

# Setup directory
DEPLOY_DIR="/opt/qlcd"
echo ""
echo "📁 Setup directory: $DEPLOY_DIR"
sudo mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# Copy files
echo "📋 Copy docker-compose.yml..."
# Giả sử file đã có sẵn hoặc từ remote
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml không tìm thấy!"
    echo "Vui lòng tải từ repo hoặc copy từ máy local"
    exit 1
fi

# Create .env
echo "🔐 Create .env..."
if [ ! -f ".env" ]; then
    RANDOM_SECRET=$(openssl rand -hex 32)
    cat > .env << EOF
QLCD_SECRET=$RANDOM_SECRET
EOF
    echo "✅ .env tạo thành công"
else
    echo "⚠️  .env đã tồn tại, bỏ qua"
fi

# Pull image
echo ""
echo "📥 Pull image từ Docker Hub..."
docker pull manhkha8768/qlcd:latest

# Start
echo ""
echo "🔄 Khởi động container..."
docker-compose up -d

if [ $? -eq 0 ]; then
    echo ""
    echo "================================"
    echo "✅ Deploy thành công!"
    echo "================================"
    echo ""
    echo "Kiểm tra:"
    echo "  docker ps"
    echo "  docker-compose logs -f"
    echo "  curl http://localhost:3000/api/health"
    echo ""
else
    echo "❌ Deploy thất bại!"
    docker-compose logs
    exit 1
fi
