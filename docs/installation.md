# Installation

## Windows with Docker Desktop

1. Install Docker Desktop and start its Linux-container engine.
2. Extract the project archive and open CMD in the `DigitalLibrary` directory.
3. Run `copy .env.example .env`.
4. Edit `.env` and set unique local values for `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, `MINIO_ROOT_USER`, and `MINIO_ROOT_PASSWORD`. Do not commit this file.
5. Run `docker compose config` to validate configuration.
6. Run `docker compose up --build`; first startup may take several minutes while images and packages are downloaded and the pinned MinIO community server source is compiled.
7. In another CMD window, run `docker compose exec backend python manage.py createsuperadmin` and follow the credential prompts.
8. Visit `http://localhost:8081`, `http://localhost:8081/admin/`, and `http://localhost:8081/api/docs/`.

The Compose gateway uses host port 8081 by default to avoid conflicts with other local services. Set `HTTP_PORT` in `.env` to use a different available port.

The compose stack persists PostgreSQL, Redis append-only data, and MinIO objects in named Docker volumes. To stop it, use Ctrl+C or `docker compose down`; `docker compose down -v` also removes the persistent data.

The Compose setup builds MinIO from a pinned upstream source revision because upstream no longer publishes community container images. The backend creates the configured bucket during startup.

For production, terminate TLS in a trusted reverse proxy and set `DJANGO_SECURE_SSL_REDIRECT=True` and `DJANGO_HSTS_SECONDS=31536000` only after HTTPS is serving the domain. The default Compose gateway is HTTP for local development.

## Local development

Backend dependencies: `cd backend`, `python -m venv .venv`, activate the environment, `pip install -r requirements.txt`, then use `python manage.py migrate` and `python manage.py runserver`. Without `DATABASE_URL`, Django uses a local SQLite database. Set `DJANGO_SECRET_KEY` and any required storage settings before deploying.

Frontend: `cd frontend`, `npm ci`, then `npm run dev`. Configure `NEXT_PUBLIC_API_URL` to the backend API origin (default `http://localhost/api` when using the compose Nginx gateway).
