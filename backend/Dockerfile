FROM node:22-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/server.js backend/docker-monitor.js backend/service-registry.js ./
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server.js"]
