FROM python:3.9-slim

WORKDIR /app

RUN pip install --no-cache-dir mitmproxy requests

COPY . .

EXPOSE 8080 8081

CMD ["mitmweb", "--web-host", "0.0.0.0", "--web-port", "8081", "-p", "8080", "-s", "main.py"]