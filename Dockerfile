FROM nginx:alpine

# Copy all game files to Nginx html directory
COPY . /usr/share/nginx/html

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

