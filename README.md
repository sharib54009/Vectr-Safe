# VectrSafe

VectrSafe is a ride safety application with a Django REST and Channels backend and a React frontend.

## Run locally

In one terminal, start Django from `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python -m daphne -b 127.0.0.1 -p 8001 config.asgi:application
```

In a second backend terminal, run the server-side check-in deadline worker:

```powershell
cd backend
python manage.py process_due_checkins
```

In another terminal, start React:

```powershell
cd frontend
npm install
npm run dev
```

The API defaults to port 8001. Set `VITE_API_BASE_URL` when the frontend and backend use different hosts. See [README-DJANGO.md](README-DJANGO.md) for the API, safety flow, configuration, and verification details.

## Existing data

The existing `backend/saferoute.db` SQLite file is preserved in place. It is not the active Django database; Django uses `backend/django.sqlite3` by default. No automatic copy was performed because the legacy and Django schemas differ. Back up and migrate that data explicitly before retiring the legacy file.
