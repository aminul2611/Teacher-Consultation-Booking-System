import hashlib
import hmac
import os
import secrets
import sqlite3
import time
import uuid
from pathlib import Path

from profile_photos import delete_profile_photo, save_profile_photo


PROJECT_DIR = Path(__file__).parent
DATABASE = PROJECT_DIR / "campusconnect_auth.db"

# Set this in PyCharm before enabling teacher registration.
TEACHER_INVITE_CODE = os.environ.get("TEACHER_INVITE_CODE", "")

PASSWORD_ITERATIONS = 310_000
SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60


def connect_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def setup_auth_database():
    with connect_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                full_name TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
                student_id TEXT,
                department TEXT,
                photo_path TEXT,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)


def _hash_password(password, salt):
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_ITERATIONS,
    )


def register_user(
    email,
    password,
    full_name,
    role,
    student_id="",
    department="",
    teacher_code="",
    photo_data="",
):
    email = email.strip().lower()
    full_name = full_name.strip()
    role = role.strip().lower()
    student_id = (student_id or "").strip()
    department = (department or "").strip()
    teacher_code = teacher_code or ""

    if not email or "@" not in email:
        raise ValueError("Enter a valid email address.")

    if not isinstance(password, str) or len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")

    if not full_name:
        raise ValueError("Full name is required.")

    if role not in ("student", "teacher"):
        raise ValueError("Role must be student or teacher.")

    if role == "teacher":
        if not TEACHER_INVITE_CODE:
            raise ValueError("Teacher registration is not enabled yet.")

        if not hmac.compare_digest(teacher_code, TEACHER_INVITE_CODE):
            raise ValueError("Invalid teacher invitation code.")

    # The profile photo is optional. This returns None when no photo is sent.
    photo_path = save_profile_photo(photo_data)

    user_id = str(uuid.uuid4())
    salt = secrets.token_bytes(16)
    password_hash = _hash_password(password, salt)

    try:
        with connect_db() as db:
            db.execute("""
                INSERT INTO users (
                    id,
                    email,
                    full_name,
                    role,
                    student_id,
                    department,
                    photo_path,
                    password_salt,
                    password_hash,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                email,
                full_name,
                role,
                student_id,
                department,
                photo_path,
                salt.hex(),
                password_hash.hex(),
                int(time.time()),
            ))
    except sqlite3.IntegrityError:
        delete_profile_photo(photo_path)
        raise ValueError("An account with this email already exists.")
    except Exception:
        delete_profile_photo(photo_path)
        raise

    return {
        "id": user_id,
        "email": email,
        "full_name": full_name,
        "role": role,
        "student_id": student_id,
        "department": department,
        "photo_path": photo_path,
    }


def login_user(email, password):
    email = email.strip().lower()

    with connect_db() as db:
        user = db.execute("""
            SELECT *
            FROM users
            WHERE email = ?
        """, (email,)).fetchone()

        if user is None:
            raise ValueError("Email or password is incorrect.")

        salt = bytes.fromhex(user["password_salt"])
        entered_hash = _hash_password(password, salt)

        if not hmac.compare_digest(
            entered_hash.hex(),
            user["password_hash"],
        ):
            raise ValueError("Email or password is incorrect.")

        token = secrets.token_urlsafe(32)
        expires_at = int(time.time()) + SESSION_LIFETIME_SECONDS

        db.execute(
            "DELETE FROM sessions WHERE expires_at <= ?",
            (int(time.time()),),
        )

        db.execute("""
            INSERT INTO sessions (token, user_id, expires_at)
            VALUES (?, ?, ?)
        """, (token, user["id"], expires_at))

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
            "student_id": user["student_id"],
            "department": user["department"],
            "photo_path": user["photo_path"],
        },
    }


def get_user_from_token(token):
    if not token:
        raise ValueError("Please log in first.")

    with connect_db() as db:
        user = db.execute("""
            SELECT
                users.id,
                users.email,
                users.full_name,
                users.role,
                users.student_id,
                users.department,
                users.photo_path
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
              AND sessions.expires_at > ?
        """, (token, int(time.time()))).fetchone()

    if user is None:
        raise ValueError("Your session has expired. Please log in again.")

    return dict(user)


def require_role(token, required_role):
    user = get_user_from_token(token)

    if user["role"] != required_role:
        raise ValueError("You do not have permission to perform this action.")

    return user


def logout_user(token):
    if not token:
        return {"message": "Logged out."}

    with connect_db() as db:
        db.execute(
            "DELETE FROM sessions WHERE token = ?",
            (token,),
        )

    return {"message": "Logged out."}


if __name__ == "__main__":
    setup_auth_database()
    print("Authentication database is ready.")