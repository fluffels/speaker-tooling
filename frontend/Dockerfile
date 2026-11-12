# Mehrstufig: Build mit Node (Node-Major wie .nvmrc, Angular 22 verlangt ^22.22.3), danach statische Auslieferung durch nginx ohne root.
FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx ng build

FROM nginxinc/nginx-unprivileged:1.31-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /build/dist/frontend/browser /usr/share/nginx/html
EXPOSE 8080
