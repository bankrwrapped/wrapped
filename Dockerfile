FROM oven/bun:1
WORKDIR /app

# Copy the whole monorepo - needed so bun install can resolve the
# workspace:* link between apps/api and packages/shared correctly.
COPY . .

RUN bun install
RUN bunx turbo run build --filter=@bankr-wrapped/api

CMD ["bun", "run", "apps/api/dist/index.js"]
