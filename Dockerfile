FROM node:18-slim

# Cài một số gói cơ bản
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Tạo thư mục làm việc
WORKDIR /app

# Copy file dự án
COPY package*.json ./
COPY tsconfig.json ./
COPY .env .env
COPY src ./src

# Cài thư viện
RUN npm install

# Chạy bằng npm script
CMD ["npm", "run", "start"]