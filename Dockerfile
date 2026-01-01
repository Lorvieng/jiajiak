# 使用较新的 Node 20
FROM node:20-slim

# 安装系统基础依赖（保留你的写法，这很好，增加了兼容性）
RUN apt-get update && \
    apt-get install -y git build-essential curl unzip && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先复制依赖描述文件，利用缓存
COPY package.json ./

# 【关键修改】安装依赖，并强制安装 adm-zip 以防万一
RUN npm install && npm install adm-zip

# 【核心步骤】这行命令会把你所有的 index.html, bg.png, deploy.js 全部拷进去
COPY . .

# 暴露端口（好习惯）
EXPOSE 7860

# 启动
CMD ["node", "deploy.js"]
