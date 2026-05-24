#!/usr/bin/env bash
set -euo pipefail

OLLAMA_PORT="${OLLAMA_PORT:-11434}"
OLLAMA_HOST="${OLLAMA_HOST:-http://localhost:$OLLAMA_PORT}"
MODELS=("all-MiniLM-L6-v2" "llama3.2-vision" "mistral")

echo "Checking Ollama availability at $OLLAMA_HOST..."
if ! curl -sf "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
  echo "Ollama not running. Attempting to start..."
  if command -v ollama &> /dev/null; then
    ollama serve &
    sleep 3
  else
    echo "Error: Ollama not installed. Install from https://ollama.ai"
    exit 1
  fi
fi

for model in "${MODELS[@]}"; do
  echo "Pulling model: $model"
  if curl -sf -X POST "$OLLAMA_HOST/api/pull" -d "{\"name\":\"$model\"}" > /dev/null; then
    echo "  -> $model pulled successfully"
  else
    echo "  -> Failed to pull $model"
    exit 1
  fi
done

cat << 'EMBED_CONF' > /etc/ollama/ollama.json
{
  "embedding_model": "all-MiniLM-L6-v2",
  "vision_model": "llama3.2-vision",
  "llm_model": "mistral",
  "context_window": 4096,
  "num_ctx": 2048,
  "num_predict": 512,
  "temperature": 0.1,
  "keep_alive": "5m",
  "batch_size": 32,
  "max_connections": 100
}
EMBED_CONF

echo "Ollama setup complete. Models ready: ${MODELS[*]}"
echo "Embedding dimension: 384 (all-MiniLM-L6-v2)"
echo "Verify with: curl $OLLAMA_HOST/api/tags"
