FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# The browser calls the API Gateway on the host-published port.
ARG VITE_API_URL=http://localhost:5000/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
EXPOSE 5174
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5174", "--strictPort"]
