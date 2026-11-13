from datetime import datetime, timedelta, timezone
import time

from auth import connect_db, require_role


def _parse_time(value):
    if not isinstance(value, str) or not value.strip():
        raise ValueError("A date and time are required.")

    try:
        parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(
            "Use an ISO date-time, for example 2026-11-20T09:30:00Z."
        )

    # If no timezone is supplied, interpret the time in the server's local zone.
    if parsed.tzinfo is None:
        parsed = parsed.astimezone()

    return parsed.astimezone(timezone.utc)


def _format_time(value):
    return value.astimezone(timezone.utc).isoformat(timespec="seconds")


def _now():
    return datetime.now(timezone.utc)


def _check_future(start):
    if start <= _now():
        raise ValueError("Choose a future date and time.")


def _positive_id(value, label):
    try:
        number = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"Invalid {label}.")

    if number <= 0:
        raise ValueError(f"Invalid {label}.")

    return number


def setup_booking_database():
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS teacher_slots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id TEXT NOT NULL,
                starts_at TEXT NOT NULL,
                ends_at TEXT NOT NULL,
                booked_by_student TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (teacher_id) REFERENCES users(id),
                FOREIGN KEY (booked_by_student) REFERENCES users(id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS consultation_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL,
                teacher_id TEXT NOT NULL,
                preferred_start TEXT NOT NULL,
                message TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN (
                        'pending', 'proposed', 'accepted', 'declined'
                    )),
                proposed_start TEXT,
                created_at INTEGER NOT NULL,
                FOREIGN KEY (student_id) REFERENCES users(id),
                FOREIGN KEY (teacher_id) REFERENCES users(id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS appointments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                teacher_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                starts_at TEXT NOT NULL,
                ends_at TEXT NOT NULL,
                slot_id INTEGER UNIQUE,
                request_id INTEGER UNIQUE,
                status TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed', 'cancelled')),
                created_at INTEGER NOT NULL,
                FOREIGN KEY (teacher_id) REFERENCES users(id),
                FOREIGN KEY (student_id) REFERENCES users(id),
                FOREIGN KEY (slot_id) REFERENCES teacher_slots(id),
                FOREIGN KEY (request_id)
                    REFERENCES consultation_requests(id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS consultation_followups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                appointment_id INTEGER NOT NULL UNIQUE,
                teacher_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                summary TEXT NOT NULL,
                action_items TEXT NOT NULL DEFAULT '',
                updated_at INTEGER NOT NULL,
                FOREIGN KEY (appointment_id)
                    REFERENCES appointments(id) ON DELETE CASCADE,
                FOREIGN KEY (teacher_id) REFERENCES users(id),
                FOREIGN KEY (student_id) REFERENCES users(id)
            )
        """)

        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_slots_teacher_time
            ON teacher_slots (teacher_id, starts_at, ends_at)
        """)

        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_requests_teacher_status
            ON consultation_requests (teacher_id, status)
        """)

        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_appointments_teacher_time
            ON appointments (teacher_id, starts_at, ends_at)
        """)


def get_teachers(token):
    require_role(token, "student")

    with connect_db() as db:
        rows = db.execute("""
            SELECT id, full_name, department, photo_path
            FROM users
            WHERE role = 'teacher'
            ORDER BY full_name
        """).fetchall()

    return [dict(row) for row in rows]


def get_available_slots(token):
    require_role(token, "student")
    now_text = _format_time(_now())

    with connect_db() as db:
        rows = db.execute("""
            SELECT
                s.id,
                s.teacher_id,
                u.full_name AS teacher_name,
                s.starts_at,
                s.ends_at
            FROM teacher_slots AS s
            JOIN users AS u ON u.id = s.teacher_id
            WHERE s.booked_by_student IS NULL
              AND s.starts_at > ?
              AND u.role = 'teacher'
              AND NOT EXISTS (
                  SELECT 1
                  FROM appointments AS a
                  WHERE a.teacher_id = s.teacher_id
                    AND a.status = 'confirmed'
                    AND a.starts_at < s.ends_at
                    AND a.ends_at > s.starts_at
              )
            ORDER BY s.starts_at
        """, (now_text,)).fetchall()

    return [dict(row) for row in rows]


def add_teacher_slot(token, starts_at, ends_at):
    teacher = require_role(token, "teacher")
    start = _parse_time(starts_at)
    end = _parse_time(ends_at)
    _check_future(start)

    if end <= start:
        raise ValueError("The end time must be later than the start time.")

    start_text = _format_time(start)
    end_text = _format_time(end)

    with connect_db() as db:
        slot_overlap = db.execute("""
            SELECT 1
            FROM teacher_slots
            WHERE teacher_id = ?
              AND starts_at < ?
              AND ends_at > ?
            LIMIT 1
        """, (teacher["id"], end_text, start_text)).fetchone()

        appointment_overlap = db.execute("""
            SELECT 1
            FROM appointments
            WHERE teacher_id = ?
              AND status = 'confirmed'
              AND starts_at < ?
              AND ends_at > ?
            LIMIT 1
        """, (teacher["id"], end_text, start_text)).fetchone()

        if slot_overlap or appointment_overlap:
            raise ValueError("This time overlaps another slot or appointment.")

        db.execute("""
            INSERT INTO teacher_slots (
                teacher_id, starts_at, ends_at, created_at
            )
            VALUES (?, ?, ?, ?)
        """, (
            teacher["id"],
            start_text,
            end_text,
            int(time.time()),
        ))

    return {"message": "Available slot added."}


def get_teacher_slots(token):
    teacher = require_role(token, "teacher")

    with connect_db() as db:
        rows = db.execute("""
            SELECT
                s.id,
                s.starts_at,
                s.ends_at,
                s.booked_by_student,
                u.full_name AS student_name
            FROM teacher_slots AS s
            LEFT JOIN users AS u
                ON u.id = s.booked_by_student
            WHERE s.teacher_id = ?
            ORDER BY s.starts_at DESC
        """, (teacher["id"],)).fetchall()

    slots = []

    for row in rows:
        slot = dict(row)
        slot["status"] = (
            "booked" if slot["booked_by_student"] else "available"
        )
        slots.append(slot)

    return slots


def book_slot(token, slot_id):
    student = require_role(token, "student")
    slot_id = _positive_id(slot_id, "slot")

    with connect_db() as db:
        db.execute("BEGIN IMMEDIATE")

        slot = db.execute("""
            SELECT *
            FROM teacher_slots
            WHERE id = ?
        """, (slot_id,)).fetchone()

        if slot is None:
            raise ValueError("This slot does not exist.")

        if slot["booked_by_student"] is not None:
            raise ValueError("This slot has already been booked.")

        start = _parse_time(slot["starts_at"])
        end = _parse_time(slot["ends_at"])
        _check_future(start)

        conflict = db.execute("""
            SELECT 1
            FROM appointments
            WHERE status = 'confirmed'
              AND (teacher_id = ? OR student_id = ?)
              AND starts_at < ?
              AND ends_at > ?
            LIMIT 1
        """, (
            slot["teacher_id"],
            student["id"],
            _format_time(end),
            _format_time(start),
        )).fetchone()

        if conflict:
            raise ValueError(
                "You or the teacher already has an appointment at this time."
            )

        updated = db.execute("""
            UPDATE teacher_slots
            SET booked_by_student = ?
            WHERE id = ? AND booked_by_student IS NULL
        """, (student["id"], slot_id))

        if updated.rowcount != 1:
            raise ValueError("This slot was just booked by someone else.")

        db.execute("""
            INSERT INTO appointments (
                teacher_id, student_id, starts_at, ends_at,
                slot_id, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            slot["teacher_id"],
            student["id"],
            _format_time(start),
            _format_time(end),
            slot_id,
            int(time.time()),
        ))

    return {"message": "Slot booked successfully."}


def request_consultation(token, teacher_id, preferred_start, message=""):
    student = require_role(token, "student")
    start = _parse_time(preferred_start)
    _check_future(start)

    if not isinstance(message, str) or len(message) > 500:
        raise ValueError("The message must be 500 characters or fewer.")

    with connect_db() as db:
        teacher = db.execute("""
            SELECT id
            FROM users
            WHERE id = ? AND role = 'teacher'
        """, (teacher_id,)).fetchone()

        if teacher is None:
            raise ValueError("Choose a valid teacher.")

        db.execute("""
            INSERT INTO consultation_requests (
                student_id, teacher_id, preferred_start,
                message, created_at
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            student["id"],
            teacher_id,
            _format_time(start),
            message.strip(),
            int(time.time()),
        ))

    return {"message": "Your time request has been sent."}


def get_teacher_requests(token):
    teacher = require_role(token, "teacher")

    with connect_db() as db:
        rows = db.execute("""
            SELECT
                r.id,
                r.preferred_start,
                r.message,
                r.status,
                r.proposed_start,
                r.created_at,
                u.full_name AS student_name,
                u.student_id
            FROM consultation_requests AS r
            JOIN users AS u ON u.id = r.student_id
            WHERE r.teacher_id = ?
            ORDER BY r.created_at DESC
        """, (teacher["id"],)).fetchall()

    return [dict(row) for row in rows]


def _create_appointment(db, teacher_id, student_id, start, request_id=None):
    end = start + timedelta(minutes=30)
    start_text = _format_time(start)
    end_text = _format_time(end)

    conflict = db.execute("""
        SELECT 1
        FROM appointments
        WHERE status = 'confirmed'
          AND (teacher_id = ? OR student_id = ?)
          AND starts_at < ?
          AND ends_at > ?
        LIMIT 1
    """, (teacher_id, student_id, end_text, start_text)).fetchone()

    if conflict:
        raise ValueError(
            "You or the teacher already has an appointment at this time."
        )

    db.execute("""
        INSERT INTO appointments (
            teacher_id, student_id, starts_at, ends_at,
            request_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        teacher_id,
        student_id,
        start_text,
        end_text,
        request_id,
        int(time.time()),
    ))


def respond_to_request(token, request_id, action, proposed_start=""):
    teacher = require_role(token, "teacher")
    request_id = _positive_id(request_id, "request")
    action = str(action).strip().lower()

    if action not in ("accept", "decline", "propose"):
        raise ValueError("Choose accept, decline, or propose.")

    with connect_db() as db:
        db.execute("BEGIN IMMEDIATE")

        request = db.execute("""
            SELECT *
            FROM consultation_requests
            WHERE id = ? AND teacher_id = ?
        """, (request_id, teacher["id"])).fetchone()

        if request is None:
            raise ValueError("Request not found.")

        if request["status"] != "pending":
            raise ValueError("This request has already been answered.")

        if action == "accept":
            start = _parse_time(request["preferred_start"])
            _check_future(start)

            _create_appointment(
                db,
                teacher["id"],
                request["student_id"],
                start,
                request_id=request["id"],
            )

            db.execute("""
                UPDATE consultation_requests
                SET status = 'accepted'
                WHERE id = ?
            """, (request["id"],))

        elif action == "decline":
            db.execute("""
                UPDATE consultation_requests
                SET status = 'declined'
                WHERE id = ?
            """, (request["id"],))

        else:
            start = _parse_time(proposed_start)
            _check_future(start)

            db.execute("""
                UPDATE consultation_requests
                SET status = 'proposed', proposed_start = ?
                WHERE id = ?
            """, (_format_time(start), request["id"]))

    return {"message": "Your response has been saved."}


def respond_to_proposal(token, request_id, accept):
    student = require_role(token, "student")
    request_id = _positive_id(request_id, "request")

    if not isinstance(accept, bool):
        raise ValueError("The proposal response must be true or false.")

    with connect_db() as db:
        db.execute("BEGIN IMMEDIATE")

        request = db.execute("""
            SELECT *
            FROM consultation_requests
            WHERE id = ? AND student_id = ?
        """, (request_id, student["id"])).fetchone()

        if request is None or request["status"] != "proposed":
            raise ValueError("No pending time proposal was found.")

        if accept:
            start = _parse_time(request["proposed_start"])
            _check_future(start)

            _create_appointment(
                db,
                request["teacher_id"],
                student["id"],
                start,
                request_id=request["id"],
            )

            new_status = "accepted"
        else:
            new_status = "declined"

        db.execute("""
            UPDATE consultation_requests
            SET status = ?
            WHERE id = ?
        """, (new_status, request["id"]))

    return {"message": "Your response has been saved."}


def get_teacher_completed_appointments(token):
    teacher = require_role(token, "teacher")
    now_text = _format_time(_now())

    with connect_db() as db:
        rows = db.execute("""
            SELECT
                a.id AS appointment_id,
                a.starts_at,
                a.ends_at,
                u.full_name AS student_name,
                u.student_id,
                f.summary,
                f.action_items
            FROM appointments AS a
            JOIN users AS u ON u.id = a.student_id
            LEFT JOIN consultation_followups AS f
                ON f.appointment_id = a.id
            WHERE a.teacher_id = ?
              AND a.status = 'confirmed'
              AND a.ends_at <= ?
            ORDER BY a.starts_at DESC
        """, (teacher["id"], now_text)).fetchall()

    return [dict(row) for row in rows]


def save_consultation_followup(
    token,
    appointment_id,
    summary,
    action_items="",
):
    teacher = require_role(token, "teacher")
    appointment_id = _positive_id(appointment_id, "appointment")
    summary = (summary or "").strip()
    action_items = (action_items or "").strip()

    if not summary:
        raise ValueError("Enter a consultation summary.")

    if len(summary) > 3000:
        raise ValueError("The summary must be 3000 characters or fewer.")

    if len(action_items) > 3000:
        raise ValueError("The action items must be 3000 characters or fewer.")

    now_text = _format_time(_now())
    updated_at = int(time.time())

    with connect_db() as db:
        appointment = db.execute("""
            SELECT id, student_id
            FROM appointments
            WHERE id = ?
              AND teacher_id = ?
              AND status = 'confirmed'
              AND ends_at <= ?
        """, (
            appointment_id,
            teacher["id"],
            now_text,
        )).fetchone()

        if appointment is None:
            raise ValueError(
                "Completed consultation not found for your account."
            )

        db.execute("""
            INSERT INTO consultation_followups (
                appointment_id,
                teacher_id,
                student_id,
                summary,
                action_items,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(appointment_id) DO UPDATE SET
                summary = excluded.summary,
                action_items = excluded.action_items,
                updated_at = excluded.updated_at
        """, (
            appointment_id,
            teacher["id"],
            appointment["student_id"],
            summary,
            action_items,
            updated_at,
        ))

    return {"message": "Consultation follow-up saved."}


def get_student_appointments(token):
    student = require_role(token, "student")

    with connect_db() as db:
        appointments = db.execute("""
            SELECT
                a.id,
                a.starts_at,
                a.ends_at,
                a.status,
                u.full_name AS teacher_name,
                f.summary AS followup_summary,
                f.action_items AS followup_action_items
            FROM appointments AS a
            JOIN users AS u ON u.id = a.teacher_id
            LEFT JOIN consultation_followups AS f
                ON f.appointment_id = a.id
            WHERE a.student_id = ?
            ORDER BY a.starts_at
        """, (student["id"],)).fetchall()

        requests = db.execute("""
            SELECT
                r.id,
                r.preferred_start,
                r.proposed_start,
                r.message,
                r.status,
                u.full_name AS teacher_name
            FROM consultation_requests AS r
            JOIN users AS u ON u.id = r.teacher_id
            WHERE r.student_id = ?
            ORDER BY r.created_at DESC
        """, (student["id"],)).fetchall()

    return {
        "appointments": [dict(row) for row in appointments],
        "requests": [dict(row) for row in requests],
    }