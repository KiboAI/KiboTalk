FROM node:22-bookworm-slim AS landing-builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json ./
COPY apps/landing/package.json apps/landing/package.json
COPY packages/conversation/package.json packages/conversation/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter @kibotalk/landing...

COPY apps/landing apps/landing
COPY packages/conversation packages/conversation
COPY packages/ui packages/ui
RUN pnpm --filter @kibotalk/landing build

FROM caddy:2.10-alpine
COPY --from=landing-builder /workspace/apps/landing/dist /srv/landing
