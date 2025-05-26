###
# Dockerfile for Cashivo
# Builds the application, pre-generates summary data, and serves via Express
###
FROM node:20-slim AS build

# Create app directory
WORKDIR /app

# Install dependencies (production only)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Ensure data directory exists (empty if not present in build context)
RUN mkdir -p data
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
RUN mkdir -p import providers

# Expose server port
EXPOSE 3000

# Start Express server
CMD ["npm", "run", "serve"]