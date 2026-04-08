FROM node:20-alpine

WORKDIR /app

# install deps first for better caching
COPY package*.json ./
RUN npm install

# copy project files
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
