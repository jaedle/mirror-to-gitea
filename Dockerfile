FROM node:lts-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY docker-entrypoint.sh .
COPY src ./src

RUN npm run build && rm -rf package*.json



CMD [ "/app/docker-entrypoint.sh" ]
