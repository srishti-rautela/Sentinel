FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p uploads && chown -R node:node /app
ENV NODE_ENV=production
USER node
# Each compose service overrides the command (gateway / auth / products / orders / media).
CMD ["npm", "run", "gateway"]
