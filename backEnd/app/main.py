from fastapi import FastAPI

# Create a FastAPI instance
app = FastAPI()

# Define a path operation for the root URL ("/")
@app.get("/")
async def read_root():
    return {"message": "Hello world"}