# Runs the analysis API (apps/api) with Chromium preinstalled.
# Build from the repo root: docker build -t saytlook-api .
#
# The image tag must match the Playwright version in pnpm-lock.yaml (1.63.0),
# or the bundled browsers will not match the library. Check the tag exists at
# https://mcr.microsoft.com/artifact/mar/playwright if the pull fails.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

# Install every workspace package. The root postinstall builds the analyzer
# that apps/api imports.
COPY . .
RUN pnpm install --frozen-lockfile \
 && pnpm --filter @digitalfeet/api build

ENV NODE_ENV=production \
    PORT=8787 \
    SCREENSHOT_DIR=/app/apps/api/.data/screenshots

WORKDIR /app/apps/api
EXPOSE 8787

CMD ["node", "dist/index.js"]
