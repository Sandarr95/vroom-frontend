FROM node:slim as build
COPY . /vroom-frontend
WORKDIR /vroom-frontend
RUN npm install && npm run dist

FROM caddy:alpine
COPY --from=build /vroom-frontend/dist /srv
WORKDIR /srv
CMD ["caddy", "file-server"]