# The live Rabble server on a Hugging Face Space (Docker SDK).
# The Meta key comes from the Space's secrets as META_API_KEY; it is never in the image.
FROM python:3.12-slim

RUN useradd -m -u 1000 rabble
WORKDIR /home/rabble/app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=rabble tools/ tools/
COPY --chown=rabble app/ app/
RUN mkdir -p work && chown rabble work

USER rabble
ENV RABBLE_HOST=0.0.0.0 RABBLE_PORT=7860 RABBLE_TRUST_PROXY=1 PYTHONUNBUFFERED=1
EXPOSE 7860
CMD ["python", "tools/server.py"]
