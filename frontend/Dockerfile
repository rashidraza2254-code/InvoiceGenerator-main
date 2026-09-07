FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 120000

COPY . .
# nginx.conf already reverse-proxies /api/ to the backend on the same origin
# in every environment (Docker Compose, AKS behind the Ingress, or a bare
# port-forward), so the frontend needs no absolute backend URL - a relative
# path works everywhere. CRA/craco bakes REACT_APP_* vars in at build time,
# so this must be set here, not just at container runtime.
ENV REACT_APP_BACKEND_URL=""
RUN yarn build

FROM nginx:1.25-alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80 || exit 1

CMD ["nginx", "-g", "daemon off;"]
