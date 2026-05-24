FROM nginx:alpine

# Remove default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom configuration
COPY nginx/conf.d/ /etc/nginx/conf.d/
COPY nginx/nginx.conf /etc/nginx/nginx.conf

# Copy SSL certificates (in production, these would be mounted as secrets or generated)
COPY nginx/ssl/ /etc/nginx/ssl/

# Copy custom HTML error pages
COPY nginx/html/ /usr/share/nginx/html/

# Expose ports
EXPOSE 80
EXPOSE 443

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
