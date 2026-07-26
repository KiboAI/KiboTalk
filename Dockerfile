FROM node:22-bookworm-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/audio/package.json packages/audio/package.json
COPY packages/app-shared/package.json packages/app-shared/package.json
COPY packages/conversation/package.json packages/conversation/package.json
COPY packages/llm/package.json packages/llm/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/pages/package.json packages/pages/package.json
COPY packages/pipeline/package.json packages/pipeline/package.json
COPY packages/prompts/package.json packages/prompts/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/speaker/package.json packages/speaker/package.json
COPY packages/stt/package.json packages/stt/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile \
  --filter @kibotalk/api... \
  --filter @kibotalk/web...

COPY apps/api apps/api
COPY apps/web apps/web
COPY packages/audio packages/audio
COPY packages/app-shared packages/app-shared
COPY packages/conversation packages/conversation
COPY packages/llm packages/llm
COPY packages/observability packages/observability
COPY packages/pages packages/pages
COPY packages/pipeline packages/pipeline
COPY packages/prompts packages/prompts
COPY packages/shared packages/shared
COPY packages/speaker packages/speaker
COPY packages/stt packages/stt
COPY packages/ui packages/ui
RUN pnpm --filter @kibotalk/web build \
  && pnpm --filter @kibotalk/api build \
  && mkdir -p /output/api \
  && cp -R apps/api/dist /output/api/dist \
  && mkdir -p /output/web \
  && cp -R apps/web/dist /output/web/dist

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app/api
COPY --from=builder /output/api /app/api
COPY --from=builder /output/web /app/web

USER root
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8787
CMD ["node", "dist/index.cjs"]
