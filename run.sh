#!/bin/sh
docker run --rm -p 8080:80 -v "$(pwd):/usr/share/nginx/html:ro" nginx:alpine
