# Sử dụng base image tích hợp sẵn cả Node.js và Python
FROM nikolaik/python-nodejs:python3.11-nodejs20-slim

WORKDIR /app

# Cài đặt các thư viện hệ thống cần thiết
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# 1. SAO CHÉP & CÀI ĐẶT THƯ VIỆN PYTHON ADAPTIVE CHUNKING
# Sao chép code thư viện adaptive-chunking
COPY ./adaptive-chunking /app/adaptive-chunking

# Cài đặt thư viện Python
RUN pip install --no-cache-dir -e /app/adaptive-chunking

# Tải sẵn model SentenceTransformer để tránh tình trạng tải chậm (Cold Start) khi chạy thực tế
RUN python -c "from sentence_transformers import SentenceTransformer; Model = SentenceTransformer('all-MiniLM-L6-v2')"

# 2. CÀI ĐẶT BACKEND NODE.JS
# Sao chép package.json, lockfile và thư mục prisma từ thư mục gốc vào /app
COPY ./package.json ./pnpm-lock.yaml* ./yarn.lock* ./package-lock.json* ./
COPY ./prisma ./prisma

# Cài đặt pnpm và dependencies của Node.js (tự động chạy prisma generate qua postinstall)
RUN npm install -g pnpm@9.15.4 --force && pnpm install --frozen-lockfile

# Sao chép toàn bộ mã nguồn backend từ thư mục gốc vào /app
COPY . .

# Build dự án Node.js (biên dịch TypeScript sang JS)
RUN pnpm run build

# Cấu hình biến môi trường mặc định cho Docker
ENV PYTHON_PATH=python
ENV NODE_ENV=production
EXPOSE 5000

CMD ["pnpm", "start"]
