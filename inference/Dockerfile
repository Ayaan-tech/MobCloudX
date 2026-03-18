FROM python:3.11-slim
 
WORKDIR /app
 
# Install dependencies
COPY requirements.txt .
# Install PyTorch CPU-only first (to avoid 1GB CUDA download)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt uvicorn[standard]
 
# Copy the entire inference package
COPY . ./inference/
 
# Add /app to PYTHONPATH so `from inference.xxx import yyy` works everywhere
ENV PYTHONPATH=/app
 
EXPOSE 8000
 
# Run app.py directly from the package — no stale copy
CMD ["uvicorn", "inference.app:app", "--host", "0.0.0.0", "--port", "8000"]