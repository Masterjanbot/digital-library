# Digital Library

A self-hosted digital library built with Django REST Framework, Next.js, PostgreSQL, Redis, Celery, MinIO, and Nginx.

## Windows installation (CMD)

1. Extract `DigitalLibrary_Complete.zip`.
2. Open CMD in the extracted `DigitalLibrary` directory.
3. Copy the sample configuration: `copy .env.example .env`
4. Edit `.env` and replace the local passwords and Django secret. Keep this file private.
5. Validate Docker configuration: `docker compose config`
6. Start the services: `docker compose up --build`
7. In another CMD window create an administrator: `docker compose exec backend python manage.py createsuperadmin`
8. Open the public application at `http://localhost:8081`, API at `http://localhost:8081/api/`, API documentation at `http://localhost:8081/api/docs/`, and Django admin at `http://localhost:8081/admin/`.

The Compose gateway uses host port 8081 by default to avoid conflicts with other local services; set `HTTP_PORT` in `.env` to override it. The initial catalog is empty; sign in with the super administrator you created and add books through the frontend or admin site. In local development the frontend dev server uses port 3000. The MinIO community server is built from its pinned upstream source revision because upstream no longer publishes community container images; the first Docker build therefore takes longer.

## Local development

- Backend (CMD): `cd backend`, run `python -m venv .venv`, `.venv\Scripts\activate`, `pip install -r requirements.txt`, `python manage.py migrate`, then `python manage.py runserver`.
- Frontend (CMD): in another window run `cd frontend`, `npm ci`, `set NEXT_PUBLIC_API_URL=http://localhost:8000/api`, then `npm run dev`.
- Docker Compose is the supported all-in-one deployment path.

See [installation](docs/installation.md), [architecture](docs/architecture.md), [database design](docs/database-design.md), [user guide](docs/user-guide.md), and [API documentation](docs/api-documentation.md).
