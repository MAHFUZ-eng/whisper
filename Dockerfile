# use the official Bun image
FROM oven/bun:latest

WORKDIR /app

#buuld web frontend
WORKDIR /app/web
COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

#install backend dependencies

WORKDIR /app/backend
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile
COPY backend/ ./

#expose port
EXPOSE 3000
# set non sensitive defaults 
ENV PORT=3000
ENV NODE_ENV=production

#start the application
CMD ["bun","index.ts"]