FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 3001

CMD ["node", "src/index.js"]
