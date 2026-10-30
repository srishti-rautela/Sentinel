FROM node:22-alpine
WORKDIR /app
COPY package.json server.js ./
ENV NODE_ENV=production
EXPOSE 7000
# Runs as root only because it must talk to the Docker socket; it is not published to the host or the browser.
CMD ["node", "server.js"]
