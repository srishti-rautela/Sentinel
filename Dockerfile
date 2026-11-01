# One Dockerfile for all 7 backend services: docker build --build-arg SERVICE=auth-service .
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY common ./common
ARG SERVICE
COPY services/${SERVICE} ./services/${SERVICE}
ENV SERVICE=${SERVICE}
CMD node services/$SERVICE/index.js
