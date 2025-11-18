#gotta change this to be safer, will do this at some point -abdul

OLLAMA_URL = "http://host.docker.internal:11434/v1/chat/completions"
API_KEY = "local"          # whatever you use nowW
MODEL = "deepseek-r1:1.5b"      # this can change whenever, just a test

DATABASE_URL = "postgresql+psycopg://postgres:postgres@host.docker.internal:5432/schedge_db"