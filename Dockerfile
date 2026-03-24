FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build && npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy || npx prisma db push && npm run start -- -H 0.0.0.0 -p 3000"]
