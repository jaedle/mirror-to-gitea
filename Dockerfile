FROM node:lts-alpine

WORKDIR /app
COPY package.json package-lock.json .
RUN npm ci
COPY docker-entrypoint.sh .
COPY src ./src
CMD [ "/app/docker-entrypoint.sh" ]
