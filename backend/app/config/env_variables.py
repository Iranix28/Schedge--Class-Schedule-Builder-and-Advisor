#gotta change this to be safer, will do this at some point -abdul

OLLAMA_URL = "http://host.docker.internal:11434/v1/chat/completions" #this link may change, good right now for development
OLLAMA_EMBEDDED_URL = "http://host.docker.internal:11434/v1/embeddings"
API_KEY = "local"          # whatever you use nowW
CHAT_MODEL = "gemma3n:latest"      # this can change whenever, just a test
EMBEDDING_MODEL = "mxbai-embed-large"
DATABASE_URL = "postgresql+psycopg://postgres:postgres@db:5432/schedge_db"