# 🚀 Hướng dẫn Deploy QLCD lên Docker Hub

## 📋 Yêu cầu trước khi deploy

- ✅ Docker Hub account (manhkha8768)
- ✅ Docker Hub token/password
- ✅ Server production (VPS, DigitalOcean, AWS, etc.) với Docker cài đặt
- ✅ SSH access để server

---

## 🔧 Bước 1: Tạo Docker Hub Personal Access Token

1. Đăng nhập vào Docker Hub: https://hub.docker.com
2. Vào **Account Settings** → **Security**
3. Click **New Access Token**
4. Đặt tên: `qlcd-deploy`
5. Permissions: `Read, Write`
6. Sao chép token (giống như mật khẩu)

---

## 📦 Bước 2: Build & Push Docker Image

### Trên máy local/build server:

```bash
# 1. Đăng nhập Docker Hub
docker login -u manhkha8768 -p YOUR_TOKEN_HERE

# 2. Build image
docker build -t manhkha8768/qlcd:latest .

# 3. Push lên Docker Hub
docker push manhkha8768/qlcd:latest
```

### Hoặc dùng script (tự động):

```bash
# Chỉnh sửa BUILD_TOKEN trong build.sh rồi chạy
chmod +x build.sh
./build.sh
```

---

## 🖥️ Bước 3: Deploy trên Production Server

### SSH vào server:

```bash
ssh user@your-server-ip
```

### Trên server, clone hoặc tạo thư mục deployment:

```bash
mkdir -p /opt/qlcd
cd /opt/qlcd

# Copy docker-compose.yml từ local hoặc tạo mới
# (hoặc: wget https://raw.github.com/your-repo/docker-compose.yml)
```

### Tạo file .env:

```bash
cat > .env << EOF
QLCD_SECRET=$(openssl rand -hex 32)
EOF
```

### Khởi động container:

```bash
docker-compose up -d
```

### Kiểm tra logs:

```bash
docker-compose logs -f qlcd
```

---

## ✅ Bước 4: Kiểm tra ứng dụng

```bash
# Kiểm tra container chạy
docker ps

# Kiểm tra logs
docker logs qlcd-app

# Kiểm tra health
curl http://localhost:3000/api/health

# Hoặc từ browser: http://your-server-ip:3000
```

---

## 🔐 Bảo mật Production

### 1. Thay đổi QLCD_SECRET:

```bash
docker-compose down
# Chỉnh sửa .env với secret mới
docker-compose up -d
```

### 2. Setup Nginx reverse proxy (khuyến nghị):

```bash
# Cài Nginx
sudo apt update && sudo apt install -y nginx

# Config Nginx
sudo tee /etc/nginx/sites-available/qlcd > /dev/null << 'EOF'
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable & restart
sudo ln -s /etc/nginx/sites-available/qlcd /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3. SSL/HTTPS (Let's Encrypt):

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 📊 Quản lý ứng dụng

### Update ứng dụng (new version):

```bash
# Pull image mới
docker pull manhkha8768/qlcd:latest

# Restart container
docker-compose down
docker-compose up -d
```

### Backup database:

```bash
docker-compose exec qlcd sh -c 'cp /data/db/qlcd.db /data/db/qlcd.db.backup'
```

### Restore database:

```bash
docker-compose exec qlcd sh -c 'cp /data/db/qlcd.db.backup /data/db/qlcd.db'
docker-compose restart qlcd
```

---

## 🆘 Troubleshoot

### Container không chạy:

```bash
docker-compose logs qlcd
```

### Cổng 3000 bị chiếm:

```bash
# Thay đổi port trong docker-compose.yml
# ports:
#   - "8080:3000"  # (thay 8080 bằng port khác)
```

### Database bị lỗi:

```bash
# Xóa volume cũ (cảnh báo: mất dữ liệu)
docker-compose down -v
docker-compose up -d
```

---

## 📝 Lệnh hữu ích

```bash
# Xem logs
docker-compose logs -f

# Dừng app
docker-compose down

# Khởi động lại
docker-compose restart

# Shell vào container
docker-compose exec qlcd /bin/sh

# Xem dung lượng
docker volume ls
docker volume inspect qlcd_db

# Xóa tất cả (cảnh báo!)
docker-compose down -v
docker rmi manhkha8768/qlcd:latest
```

---

## 📌 Notes

- Database & uploads được lưu trong Docker volumes (persistent)
- Session timeout: 8 giờ (QLCD_PHIEN_GIO)
- Max upload size: 10MB (trong server.js)
- Health check mỗi 30 giây

Chúc bạn deploy thành công! 🎉
