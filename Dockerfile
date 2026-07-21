FROM node:20-alpine

WORKDIR /app

# Copy package.json files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY . .

EXPOSE 4000 4001 4002 4003 4004

CMD ["node", "router/server.js"]
