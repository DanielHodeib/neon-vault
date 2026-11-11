FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production DATABASE_URL="file:/data/neon.db?connection_limit=1"
VOLUME /data
EXPOSE 3000
CMD ["npm", "start"]
