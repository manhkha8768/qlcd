# ✅ Deployment Checklist

## 📋 Pre-Deployment

- [ ] Docker Hub account tạo (manhkha8768)
- [ ] Docker Hub email verified
- [ ] Docker Hub personal access token created
- [ ] Production server ready (VPS, DigitalOcean, AWS)
- [ ] SSH access configured
- [ ] Docker installed trên server

## 🏗️ Build Phase

- [ ] docker-compose.yml ready
- [ ] .dockerignore ready
- [ ] Dockerfile chính xác (cũ sẵn)
- [ ] .env.example tạo
- [ ] Build script (build.sh) ready
- [ ] `./build.sh` chạy thành công
- [ ] Image push lên Docker Hub thành công
- [ ] Verify image trên Docker Hub: https://hub.docker.com/r/manhkha8768/qlcd

## 🚀 Deploy Phase

- [ ] SSH vào server thành công
- [ ] Tạo thư mục /opt/qlcd
- [ ] Copy docker-compose.yml lên server
- [ ] Copy .env.example và chỉnh sửa thành .env
- [ ] Set QLCD_SECRET với giá trị random
- [ ] `docker pull manhkha8768/qlcd:latest` thành công
- [ ] `docker-compose up -d` chạy không lỗi
- [ ] Container đang running: `docker ps`
- [ ] Logs không có error: `docker-compose logs`

## ✨ Post-Deployment

- [ ] Test health check: `curl http://localhost:3000/api/health`
- [ ] Access từ browser: `http://your-server-ip:3000`
- [ ] Database khởi tạo thành công
- [ ] Có thể login được
- [ ] Upload file hoạt động
- [ ] Database volume persistent

## 🔒 Security (Optional)

- [ ] Setup Nginx reverse proxy
- [ ] Configure SSL/HTTPS (Let's Encrypt)
- [ ] Change default QLCD_SECRET
- [ ] Configure firewall rules
- [ ] Setup automated backups

## 📊 Monitoring (Optional)

- [ ] Setup health check monitoring
- [ ] Configure log rotation
- [ ] Setup log collection (ELK, Datadog, etc.)
- [ ] Configure alerting

---

## 📞 Support

Nếu gặp vấn đề, check:
1. `docker-compose logs -f` - xem logs chi tiết
2. `docker ps` - container đang chạy?
3. Port 3000 mở không?
4. Server có kết nối internet?
5. Database file có quyền read/write?

---

Ngày deploy: _______________
Server IP: _______________
Notes: _____________________________________________________________________
