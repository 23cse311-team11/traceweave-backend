FROM python:3.9-slim

WORKDIR /app

RUN pip install --no-cache-dir mitmproxy requests

COPY . .

EXPOSE 9000

CMD ["mitmdump", "-p", "9000", "-s", "main.py"]