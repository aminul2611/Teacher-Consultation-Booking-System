# CampusConnect — Teacher Consultation Booking System

CampusConnect is a web application for booking consultations between students and teachers. Students can book an available time or ask for a different one. Teachers can manage their availability, respond to requests, and share follow-up notes after a consultation.

The project demonstrates JSON-RPC 2.0 between a browser client and a Python server. Both portals share the same backend and SQLite database.

## Features

| Student Portal | Teacher Portal |
| --- | --- |
| Find teachers by name or department. | Publish available time slots and view the schedule. |
| Book an open slot or request a preferred time. | Accept or decline a request, or propose a different time. |
| Accept or decline a proposed time. | Filter and review requests and past activity. |
| View upcoming consultations, booking history, and follow-up notes. | Save a consultation summary and action items. |

Both roles can create an account, sign in, and update their profile and optional profile photo.

## Run locally

Use Python 3.9 or later, Git, and a web browser. The local server uses Python's standard library, including `sqlite3`.

```bash
git clone https://github.com/aminul2611/Teacher-Consultation-Booking-System.git
cd Teacher-Consultation-Booking-System
python server.py
```

If your system uses `python3`, run `python3 server.py`. Open [http://localhost:8000](http://localhost:8000) and keep the terminal running while using the app. On first start, the server initializes an empty `campusconnect_auth.db` in the project folder.

To try the booking flow, create one account in each portal using different email addresses. Open the second portal in a separate browser tab to keep the sign-in sessions separate.

1. Sign in as a teacher and add a future time slot.
2. Sign in as a student, find that teacher, and book the slot.
3. To try the request flow, submit a request for a different time. Sign in as the teacher to respond. If the teacher proposes another time, switch to the student portal to accept or decline it.

## System architecture

| Component | Responsibility |
| --- | --- |
| [Browser portals](public/) | HTML, CSS, and JavaScript for role selection, sign-in, and dashboards. |
| [RPC client](public/js/rpc.js) | Sends named JSON-RPC methods to `POST /rpc` and reads the result or error. |
| [Python server](server.py) | Serves the web pages and routes RPC calls to the appropriate Python function. |
| [Authentication](auth.py) | Registers users, verifies passwords, manages sessions, and checks user roles. |
| [Booking](booking.py) | Manages slots, requests, appointments, and follow-up notes. |
| [Profile photos](profile_photos.py) | Validates and stores profile images under `public/uploads/avatars/`. |

SQLite stores `users`, `sessions`, `teacher_slots`, `consultation_requests`, `appointments`, and `consultation_followups`. A direct booking links an appointment to a slot. An accepted request or proposal links an appointment to the original request.

### System Architecture Diagram

![CampusConnect System Architecture](docs/Campus%20Connect-System-Architecture%20.drawio.png)

[View the Python RPC Architecture Diagram](docs/Campus%20Connect%20Python%20RPC%20Architecture.png)

### Booking Workflow Diagram

![CampusConnect Booking Workflow](docs/Campus%20Connect-Workflow.png)

### Entity Relationship Diagram (ERD)

![CampusConnect Entity Relationship Diagram](docs/Campus%20Connect-ER-Diagram.png)

## JSON-RPC example

After signing in as a student, the portal can list available slots by sending this request to `POST /rpc` with the `application/json` content type. The login response supplies the session token used in `params.token`.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "get_available_slots",
  "params": {
    "token": "<student-session-token>"
  }
}
```

For example, when no slots are available, the server returns the same request ID and an empty list.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": []
}
```

| Operation | RPC method |
| --- | --- |
| Register or sign in | `register_user`, `login` |
| Read or update a profile | `get_profile`, `update_profile` |
| Find teachers or see available slots | `get_teachers`, `get_available_slots` |
| Publish or book a slot | `add_teacher_slot`, `book_slot` |
| Request another time | `request_consultation` |
| Respond to a request or proposal | `respond_to_request`, `respond_to_proposal` |
| View a schedule or consultation history | `get_teacher_schedule`, `get_student_appointments` |
| Save consultation follow-up notes | `save_consultation_followup` |

## Local configuration

| Environment variable | Purpose |
| --- | --- |
| `PORT` | Changes the server port from its default of `8000`. |
| `CORS_ORIGINS` | Sets the comma-separated browser origins allowed to call the server from a separate frontend. Same-origin use through `server.py` needs no CORS configuration. |
