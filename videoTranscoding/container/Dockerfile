FROM jrottenberg/ffmpeg:6.1-ubuntu2204

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json .
COPY package-lock.json .
RUN npm install --omit=dev

COPY index.js .
COPY services.js .
COPY s3.service.js .
COPY transcode.service.js .
COPY models ./models

ENTRYPOINT []
CMD ["npm", "start"]

