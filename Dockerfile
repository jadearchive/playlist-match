FROM node:22-alpine
WORKDIR /app
COPY public ./public
COPY lib ./lib
COPY server.mjs package.json ./
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node","server.mjs"]
