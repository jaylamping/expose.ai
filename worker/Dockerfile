FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* .npmrc* ./
# Install dev deps for build, prune later
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "dist/index.js"]


