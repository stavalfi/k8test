FROM node

WORKDIR /usr/simple-service

COPY yarn.lock package.json ./
COPY packages/simple-service/package.json ./packages/simple-service/package.json
COPY packages/log/package.json ./packages/log/package.json

RUN yarn install --frozen-lockfile --production

COPY packages/simple-service/dist/src ./packages/simple-service/dist/src
COPY packages/log/dist/src ./packages/log/dist/src

EXPOSE 80

CMD ["node", "--unhandled-rejections=strict", "--trace-deprecation","packages/simple-service/dist/src/index.js"]