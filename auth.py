import hashlib
import hmac
import secrets
import sqlite3
import time
import uuid
from pathlib import Path

from profile_photos import delete_profile_photo, save_profile_photo


PROJECT_DIR = Path(__file__).resolve().parent
DATABASE = PROJECT_DIR / "campusconnect_auth.db"

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
                approval_status TEXT NOT NULL DEFAULT 'approved'
                    CHECK (approval_status IN ('pending', 'approved')),
                student_id TEXT,
                department TEXT,
                phone_number TEXT NOT NULL DEFAULT '',
                photo_path TEXT,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        """)

        columns = {
            row["name"]
            for row in db.execute(
                "PRAGMA table_info(users)"
            ).fetchall()
        }

        if "approval_status" not in columns:
            db.execute("""
                ALTER TABLE users
                ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved'
            """)

        if "phone_number" not in columns:
            db.execute("""
                ALTER TABLE users
                ADD COLUMN phone_number TEXT NOT NULL DEFAULT ''
            """)

        # Keep teacher accounts active; this project does not use approval.
        db.execute("""
            UPDATE users
            SET approval_status = 'approved'
            WHERE role = 'teacher'
              AND approval_status = 'pending'
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
    email = (email or "").strip().lower()
    full_name = (full_name or "").strip()
    role = (role or "").strip().lower()
    student_id = (student_id or "").strip()
    department = (department or "").strip()

    # Kept for compatibility with server.py.
    _ = teacher_code

    if not email or "@" not in email:
        raise ValueError("Enter a valid email address.")

    if not isinstance(password, str) or len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")

    if not full_name:
        raise ValueError("Full name is required.")

    if role not in ("student", "teacher"):
        raise ValueError("Role must be student or teacher.")

    approval_status = "approved"
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
                    approval_status,
                    student_id,
                    department,
                    phone_number,
                    photo_path,
                    password_salt,
                    password_hash,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                email,
                full_name,
                role,
                approval_status,
                student_id,
                department,
                "",
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
        "approval_status": approval_status,
        "student_id": student_id,
        "department": department,
        "phone_number": "",
        "photo_path": photo_path,
        "message": "Account created successfully. Please sign in.",
    }


def login_user(email, password):
    email = (email or "").strip().lower()

    if not isinstance(password, str):
        raise ValueError("Email or password is incorrect.")

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
            "approval_status": "approved",
            "student_id": user["student_id"],
            "department": user["department"],
            "phone_number": user["phone_number"],
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
                users.approval_status,
                users.student_id,
                users.department,
                users.phone_number,
                users.photo_path
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ?
              AND sessions.expires_at > ?
        """, (token, int(time.time()))).fetchone()

    if user is None:
        raise ValueError("Your session has expired. Please log in again.")

    user_data = dict(user)
    user_data["approval_status"] = "approved"
    return user_data


def update_profile(
    token,
    full_name,
    phone_number="",
    department="",
    photo_data="",
):
    user = get_user_from_token(token)

    full_name = (full_name or "").strip()
    phone_number = (phone_number or "").strip()
    department = (department or "").strip()

    if not full_name:
        raise ValueError("Full name is required.")

    if len(full_name) > 120:
        raise ValueError("Name must be 120 characters or fewer.")

    if len(phone_number) > 30:
        raise ValueError("Phone number must be 30 characters or fewer.")

    if phone_number:
        digit_count = sum(character.isdigit() for character in phone_number)

        if not 7 <= digit_count <= 15:
            raise ValueError(
                "Enter a phone number with 7 to 15 digits."
            )

        allowed_phone_characters = set("0123456789+()- .")

        if any(
            character not in allowed_phone_characters
            for character in phone_number
        ):
            raise ValueError("Enter a valid phone number.")

    if len(department) > 120:
        raise ValueError("Department must be 120 characters or fewer.")

    new_photo_path = (
        save_profile_photo(photo_data)
        if photo_data
        else None
    )

    try:
        with connect_db() as db:
            current_user = db.execute("""
                SELECT photo_path
                FROM users
                WHERE id = ?
            """, (user["id"],)).fetchone()

            if current_user is None:
                raise ValueError("Your account could not be found.")

            old_photo_path = current_user["photo_path"]

            db.execute("""
                UPDATE users
                SET
                    full_name = ?,
                    phone_number = ?,
                    department = ?,
                    photo_path = ?
                WHERE id = ?
            """, (
                full_name,
                phone_number,
                department,
                new_photo_path or old_photo_path,
                user["id"],
            ))
    except Exception:
        delete_profile_photo(new_photo_path)
        raise

    if new_photo_path and old_photo_path:
        delete_profile_photo(old_photo_path)

    return get_user_from_token(token)


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