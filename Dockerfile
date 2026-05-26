FROM node:25-slim

WORKDIR /app

RUN npm install -g pnpm@10.12.1

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
ENV TIMEZONE=Asia/Shanghai
ENV PORT=3877
ENV ENABLE_INTERNAL_SCHEDULER=false

EXPOSE 3877

CMD ["pnpm", "serve"]
