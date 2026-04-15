FROM python:3.11-slim
 
WORKDIR /app
 
# Install system + ZK toolchain dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends bash curl nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY inference/requirements.txt ./requirements.txt
# Install PyTorch CPU-only first (to avoid 1GB CUDA download)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r requirements.txt uvicorn[standard]
RUN npm install -g snarkjs circom2
 
# Copy application + proof assets
COPY inference ./inference/
COPY zk ./zk/

# Pre-generate Groth16 artifacts during the image build
RUN chmod +x /app/zk/setup.sh && CIRCOM_BIN=circom2 /app/zk/setup.sh
 
# Add /app to PYTHONPATH so `from inference.xxx import yyy` works everywhere
ENV PYTHONPATH=/app
 
EXPOSE 8000
 
# Run app.py directly from the package — no stale copy
CMD ["uvicorn", "inference.app:app", "--host", "0.0.0.0", "--port", "8000"]
