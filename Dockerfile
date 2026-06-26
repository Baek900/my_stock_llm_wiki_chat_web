# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Serve Backend with built Frontend
FROM python:3.10-slim
WORKDIR /app

# Install dependencies
RUN pip install --no-cache-dir fastapi uvicorn pydantic google-genai google-auth chromadb sentence-transformers requests

# Copy backend files
COPY backend /app/backend

# Copy built frontend static files
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Expose port
EXPOSE 8080

# Environment variables
ENV VAULT_DIR=/mnt/vault
ENV RUNNING_ON_GCP=true
ENV PORT=8080

# Run FastAPI via uvicorn
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
