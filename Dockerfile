# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
