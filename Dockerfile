###
# Dockerfile for Cashivo
# Builds the application, pre-generates summary data, and serves via Express
###
FROM node:20-slim AS build

# Install Python and build-essential packages (build-essential provides tools like make and gcc, often needed by node-gyp)
RUN apt-get update && apt-get install -y python3 make g++ gcc build-essential && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Install dependencies (production only)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Pre-generate data: ingest, categorize, summary
# RUN npm run start

###
# Final image: serve the app
FROM node:20-slim AS runtime

# App directory
WORKDIR /app

# Copy only needed artifacts from build stage
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/data ./data
# Copy default JSON seeds directory
COPY --from=build /app/defaults ./defaults
COPY --from=build /app/views ./views
# Copy utility scripts (e.g., training, category generation)
 COPY --from=build /app/scripts ./scripts
# Create import and providers directories for file uploads and classification hooks
RUN mkdir -p import data

# Expose server port
EXPOSE 3000

# Start Express server
CMD ["npm", "run", "serve"]