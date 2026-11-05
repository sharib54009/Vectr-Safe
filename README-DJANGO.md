# VectrSafe Django backend

The VectrSafe React application uses Django REST Framework for account, journey, safety, and guardian APIs, and Django Channels for private journey events. The local Django database defaults to `backend/django.sqlite3`; `DJANGO_DATABASE_PATH` can override it.

## Local setup

From `backend/`, create a virtual environment and install the only backend requirements file:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python -m daphne -b 127.0.0.1 -p 8001 config.asgi:application
```

Run the deadline worker in a second backend terminal. It must stay running to escalate unanswered check-ins:

```powershell
python manage.py process_due_checkins
```

The worker can also be run once with `python manage.py process_due_checkins --once`. Set `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, and `DJANGO_ALLOWED_HOSTS` appropriately outside local development. `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` accept comma-separated origins; local Vite origins are configured by default. `VITE_API_BASE_URL` optionally sets the frontend API host.

In a third terminal, run the React app from `frontend/` with `npm install` and `npm run dev`. Open the Vite URL printed in that terminal (normally `http://localhost:5173`). Browser geolocation requires permission and a secure context; localhost is permitted by modern browsers. GPS samples are sent no more often than every 15 seconds while a journey is open.

## Accounts and guardian access

The React app supports signup, login, logout, trusted-contact invitations, and guardian acceptance. It uses Django sessions and CSRF protection. An invitation can only be accepted by a signed-in account whose email matches the invited address. Guardians can read only journeys and alerts associated with an accepted, active trusted-contact record. Owners and authorized guardians can receive that journey's private Channels events; other users are rejected at the WebSocket connection and API query layers.

## Safety flow

High risk creates one pending check-in with a server-calculated deadline. The deadline worker atomically marks overdue records missed/escalated, creates an incident with the latest location and risk snapshot, and creates an incident-linked alert. A safe response records the response without escalation. A help or cannot-respond response creates an incident immediately. SOS creation is idempotent when the same `Idempotency-Key` is retried and always creates a high-severity incident. Alert and SOS delivery states remain `NOT_CONFIGURED` until a delivery provider is integrated; no SMS or email is sent by this backend.

## API

All routes below require a signed-in session except the health endpoint.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health/` | Public health check |
| POST | `/api/auth/signup/` | Create an account and session |
| POST | `/api/auth/login/` | Start a session |
| GET, POST | `/api/auth/trusted-contacts/` | List or invite a trusted contact |
| POST | `/api/auth/guardian-invitations/accept/` | Accept a matching invitation |
| GET, POST | `/api/journeys/` | List or create owned journeys |
| GET | `/api/journeys/<id>/` | Journey details and location/risk history |
| POST | `/api/journeys/<id>/locations/` | Record location, update risk/ETA, and request check-in at high risk |
| POST | `/api/journeys/<id>/complete/` | Complete the owned journey, save its end time, and cancel a pending check-in |
| GET | `/api/journeys/<id>/check-ins/` | List owner check-ins |
| POST | `/api/journeys/<id>/check-in/respond/` | Respond `SAFE`, `HELP`, or `CANNOT_RESPOND` |
| POST | `/api/journeys/<id>/sos/` | Create an idempotent SOS and incident (`Idempotency-Key` required) |
| GET | `/api/safety/alerts/` | List alerts visible to the owner or accepted guardian |
| GET | `/api/safety/alerts/<id>/` | Read an authorized alert |
| GET | `/api/guardian/journeys/` | List journeys shared with the signed-in guardian |
| GET | `/api/guardian/journeys/<id>/` | Read a shared journey |
| WebSocket | `/ws/journeys/<id>/` | Receive private location, risk, check-in, alert, and journey-status events |

The journey setup screen saves the chosen start and destination coordinates, but does not invent a road route. Until a directions provider is configured, `planned_route` remains empty: the map shows the selected endpoints and the recorded GPS trace, while route-deviation and wrong-direction signals and route-based ETA remain unavailable. Map tiles come from OpenStreetMap and require an internet connection.

The rider experience includes home, journey setup/review, live journey, history, and trusted-contact pages. The guardian experience has its own authorized journey list and detail view. Active rider and guardian journey screens reconnect to Channels with backoff and refresh their authorized REST detail after reconnecting. GPS history responses are bounded to the latest 500 samples; journey summaries do not include raw GPS history.

## Existing data

`backend/saferoute.db` has been left in place and was inspected read-only. Django currently uses a separate `django.sqlite3` file. The differing schemas mean legacy records have not been copied or deleted; preserve and back up the legacy file until an explicit data migration is planned.

## Verification

From `backend/`, run `python manage.py check`, `python manage.py makemigrations --check --dry-run`, and `python manage.py test`. The suite covers owner/guardian authorization, completion, check-in outcomes and expiry, alert snapshots, idempotent SOS, and private WebSocket access. From `frontend/`, `npm run build` verifies the production bundle.

## Local manual walkthrough

1. Create an account, sign out, and sign in again.
2. Add a trusted contact using the account email the guardian will use; share the one-time invitation code manually.
3. Sign in as that guardian and accept the code.
4. Sign in as the rider, choose a start location (browser GPS or map), choose a destination on the map, review the summary, and start a journey.
5. Allow location access to share real GPS updates. Check the live status and location trace. Route guidance is unavailable until a directions service is configured.
6. Use the check-in response buttons if a check-in appears. The deadline worker must be running to escalate an unanswered check-in.
7. Trigger SOS from the live journey only when appropriate; confirm it in the second step. Verify the VectrSafe alert in the guardian dashboard. External texts, calls, or emails are not sent.
8. End the journey and confirm that the end time is saved and GPS updates stop. Review it in Journey History.
9. Sign in as the guardian and open the authorized journey to inspect its last location, risk, check-ins, incidents, and alert-delivery status.

The current milestone does not include turn-by-turn routing, crowdsourced danger reports, offline GPS upload queues, voice SOS, or an external SMS/email/phone provider. Risk thresholds are explainable software signals, not a substitute for emergency services or validated safety advice.
