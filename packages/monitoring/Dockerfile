FROM node

WORKDIR /usr/k8s-monitoring

COPY . .

RUN yarn install --frozen-lockfile --production

EXPOSE 80

CMD ["node", "--unhandled-rejections=strict", "packages/monitoring/dist/src/index.js"]