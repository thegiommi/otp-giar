FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/otp.sqlite
# adapter-node bundles all devDependencies, so the build folder is self-contained.
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
# For `docker exec … npm run apikey -- create "name"`
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src/lib/server/database.ts /app/src/lib/server/tokens.ts ./src/lib/server/
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "build"]
