# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Set environment
ENV NODE_ENV=production

# EXPOSE port removed — Railway dynamically assigns and injects PORT
# Hardcoding EXPOSE can interfere with Railway's port injection
# See: https://docs.railway.app/deploy/deployments#port-variable

# Health check disabled in Dockerfile — Railway provides its own healthcheck mechanism
# Railway will use the healthcheckPath from railway.json (/health)
# Dockerfile HEALTHCHECK conflicts with Railway's healthcheck probe

# Start application
CMD ["npm", "start"]
