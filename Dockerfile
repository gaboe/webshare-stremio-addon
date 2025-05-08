FROM node:24-alpine AS builder

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./
COPY config ./config/

# Using npm ci for cleaner installs if package-lock.json is present
RUN npm ci --only=production

# Bundle app source
COPY src ./src

EXPOSE 3000

CMD [ "node", "src/server.js" ] 