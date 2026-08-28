# ⚡ Quick Start - Deploy QLCD

## 🎯 3 Bước Deploy

### 1️⃣ Tạo Docker Hub Account (2 phút)

Truy cập: https://app.docker.com/signup

- **Email:** manhkha8768@gmail.com
- **Username:** manhkha8768  
- **Password:** Mật khẩu mạnh
- Verify email → Done!

---

### 2️⃣ Build & Push Image (5-10 phút)

#### Cách A: Dùng Script (Khuyến nghị)

```bash
cd H:\Du_an_APP
chmod +x build.sh
./build.sh
```

Khi hỏi, nhập Docker Hub password/token.

#### Cách B: Manual

```bash
cd H:\Du_an_APP

# Đăng nhập
docker login -u manhkha8768

# Build
docker build -t manhkha8768/qlcd:latest .

# Push
docker push manhkha8768/qlcd:latest
```

**✅ Sau bước này:** Image đã lên Docker Hub!

---

### 3️⃣ Deploy trên Server (5 phút)

SSH vào server production của bạn:

```bash
ssh user@your-server-ip
```

Chạy trên server:

```bash
# Tạo thư mục
mkdir -p /opt/qlcd && cd /opt/qlcd

# Copy docker-compose.yml (từ local)
# hoặc tạo mới với nội dung từ file docker-compose.yml

# Tạo .env với secret ngẫu nhiên
cat > .env << EOF
QLCD_SECRET=$(openssl rand -hex 32)
EOF

# Pull image
docker pull manhkha8768/qlcd:latest

# Khởi động
docker-compose up -d

# Kiểm tra
docker ps
docker-compose logs -f
```

**✅ Done!** App chạy tại `http://your-server-ip:3000`

---

## 🔍 Kiểm tra Status

```bash
# Xem container
docker ps

# Xem logs
docker-compose logs -f qlcd

# Test API
curl http://localhost:3000/api/health

# SSH vào container
docker-compose exec qlcd /bin/sh
```

---

## 📚 Tài liệu Chi Tiết

Xem file: **DEPLOY.md** để hiểu chi tiết hơn

---

## ⚠️ Lưu Ý

- ✅ Docker phải cài đặt trên server
- ✅ Port 3000 phải mở (hoặc dùng Nginx proxy)
- ✅ Database sẽ tự tạo lần đầu
- ✅ Uploads lưu persistent trong volume Docker

---

## 🆘 Troubleshoot

**Image không build:**
```bash
docker build --no-cache -t manhkha8768/qlcd:latest .
```

**Container không start:**
```bash
docker-compose logs qlcd
```

**Port đã sử dụng:**
```bash
# Sửa trong docker-compose.yml
ports:
  - "8080:3000"  # Thay port 8080 bằng port trống khác
```

---

**Bạn cần hỗ trợ gì? 🚀**
