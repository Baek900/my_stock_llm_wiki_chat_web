FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (build-essential, git, etc. if needed for chromadb/sentence-transformers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Set Default Environment Variables
ENV VAULT_DIR="/vault"
ENV PORT=8080
ENV HOST="0.0.0.0"

EXPOSE 8080

CMD ["python", "main.py"]
