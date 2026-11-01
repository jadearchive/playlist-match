FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY public ./public
COPY lib ./lib
COPY server.mjs ./
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node","server.mjs"]
