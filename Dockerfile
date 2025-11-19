# Use the official Python image
FROM python:3.11-slim

# Set working directory inside the container
WORKDIR /app/

# Prevent Python from creating .pyc files and buffer issues
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Add backend directory to Python path so imports work correctly
ENV PYTHONPATH=/app/backend

# Copy requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your app code
COPY . .

# Expose port 8000 for FastAPI
EXPOSE 5000

