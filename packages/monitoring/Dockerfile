FROM node

WORKDIR /usr/k8s-monitoring

COPY yarn.lock package.json ./
COPY packages/monitoring/package.json ./packages/monitoring/package.json
COPY packages/monitoring/dist ./packages/monitoring/dist
COPY packages/log/package.json ./packages/log/package.json
COPY packages/log/dist ./packages/log/dist
COPY packages/k8s-api/package.json ./packages/k8s-api/package.json
COPY packages/k8s-api/dist ./packages/k8s-api/dist

RUN yarn install --frozen-lockfile --production

EXPOSE 80

CMD ["node", "--unhandled-rejections=strict", "packages/monitoring/dist/src/index.js"]