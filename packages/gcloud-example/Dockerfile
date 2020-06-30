FROM node

WORKDIR /usr/gcloud-example

COPY yarn.lock package.json ./
COPY packages/gcloud-example/package.json ./packages/gcloud-example/package.json

RUN yarn install --frozen-lockfile --production

COPY packages/gcloud-example/dist/src ./packages/gcloud-example/dist/src

EXPOSE 80

CMD ["node", "--unhandled-rejections=strict", "--trace-deprecation","packages/gcloud-example/dist/src/index.js"]