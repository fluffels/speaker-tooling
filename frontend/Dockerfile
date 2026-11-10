# Mehrstufig: Build mit Node (Version wie .nvmrc), danach statische Auslieferung durch nginx ohne root.
FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build

FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist/frontend/browser /usr/share/nginx/html
EXPOSE 8080
