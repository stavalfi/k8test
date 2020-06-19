FROM node

WORKDIR /usr/k8s-monitoring

COPY yarn.lock package.json ./
COPY packages/monitoring/package.json ./packages/monitoring/package.json
COPY packages/log/package.json ./packages/log/package.json
COPY packages/k8s-api/package.json ./packages/k8s-api/package.json

RUN yarn install --frozen-lockfile --production

COPY packages/monitoring/dist/src ./packages/monitoring/dist/src
COPY packages/log/dist/src ./packages/log/dist/src
COPY packages/k8s-api/dist/src ./packages/k8s-api/dist/src

EXPOSE 80

CMD ["node", "--unhandled-rejections=strict", "--trace-deprecation","packages/monitoring/dist/src/index.js"]