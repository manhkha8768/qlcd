# Ảnh chạy hệ thống QLCD trên máy chủ internet
FROM node:22-slim

# better-sqlite3 cần trình biên dịch để dựng phần gốc
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# Dữ liệu và tệp tải lên nằm ngoài ảnh, gắn ổ đĩa bền vào hai thư mục này
RUN mkdir -p /data/db /data/uploads
ENV QLCD_DB=/data/db/qlcd.db
ENV QLCD_UPLOAD=/data/uploads
ENV QLCD_INTERNET=1
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Khởi tạo database nếu chưa có rồi mới chạy
CMD ["sh", "-c", "node db/init.js && node server.js"]
