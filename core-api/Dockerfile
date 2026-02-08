# backend/core-api/Dockerfile

# 1. Use Node 22 (Required by Prisma 7 & Mongoose 9)
FROM node:22-alpine

# 2. Set working directory
WORKDIR /app

# 3. Install OpenSSL (Required by Prisma Client on Alpine Linux)
RUN apk add --no-cache openssl

# 4. Copy package files first (Caching layer)
COPY package*.json ./

# 5. Install dependencies
RUN npm install

# 6. Copy source code AND Prisma Schema
COPY . .

# 7. Generate Prisma Client (Must happen after copying schema)
RUN npx prisma generate

# 8. Expose the API port
EXPOSE 4000

# 9. Start in Dev mode
CMD ["npm", "run", "dev"]