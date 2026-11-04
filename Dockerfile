# The live Rabble server (Render builds this from the repo; see render.yaml).
# The Meta key comes from the host's environment as META_API_KEY; it is never in the image.
FROM python:3.12-slim

RUN useradd -m -u 1000 rabble
WORKDIR /home/rabble/app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=rabble tools/ tools/
COPY --chown=rabble app/ app/
RUN rm -rf app/people && mkdir -p work && chown rabble work

USER rabble
ENV RABBLE_HOST=0.0.0.0 PYTHONUNBUFFERED=1
CMD ["python", "tools/server.py"]
