FROM node:18
WORKDIR /app
COPY . .
RUN npm install express mineflayer bedrock-protocol --no-audit --no-fund
EXPOSE 3000
CMD ["node", "index.js"]
