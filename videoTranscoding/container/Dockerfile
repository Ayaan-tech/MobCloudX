FROM node:18-alpine



# RUN /usr/bin/apt-get update && \

#     /usr/bin/apt-get install -y curl && \

#     curl -sL https://deb.nodesource.com/setup_18.x | bash - && \

#     /usr/bin/apt-get update && \

#     /usr/bin/apt-get upgrade -y && \

#     /usr/bin/apt-get install -y nodejs ffmpeg

RUN apk update

RUN apk upgrade

RUN apk add --no-cache ffmpeg


WORKDIR /app



COPY package.json .

COPY package-lock.json .

RUN npm install



COPY index.js .
COPY services.js .
COPY s3.service.js .
COPY transcode.service.js .


#CMD ["npm", "start"]
CMD ["sh", "-c", "npm start & tail -f /dev/null"]

