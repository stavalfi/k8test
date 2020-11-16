FROM quay.io/stav1991/node:12

WORKDIR /usr/project1

COPY . ./

RUN echo "before-stav"

RUN yarn
RUN yarn build

RUN echo "after-stav123"