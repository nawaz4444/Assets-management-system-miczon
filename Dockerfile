# ── Backend (Django) ──────────────────────────────────────────
FROM python:3.12-slim AS backend

# Prevents Python from buffering stdout/stderr (good for Docker logs)
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install OS-level dependencies needed by psycopg2-binary, Pillow, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
  build-essential \
  libpq-dev \
  && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer-cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy the full project
COPY . .

# Collect static files so Nginx / WhiteNoise can serve them
RUN python manage.py collectstatic --noinput || true

# Expose Django's default port
EXPOSE 8000

# Entrypoint: run migrations, setup initial data, then start Gunicorn
CMD ["sh", "-c", \
  "python manage.py migrate --noinput && \
  python docker-setup.py && \
  gunicorn inventory_system.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers 3 \
  --timeout 120"]
