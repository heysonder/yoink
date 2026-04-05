FROM node:22-slim AS base

RUN apt-get update && apt-get install -y ffmpeg curl python3 python3-pip && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages yt-dlp

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG GIT_COMMIT=unknown
ENV NEXT_PUBLIC_GIT_COMMIT=$GIT_COMMIT
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NODE_OPTIONS=--dns-result-order=ipv4first

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
