import secrets

from auth import connect_db, _hash_password


email = input("Enter the old student account email: ").strip().lower()
new_password = input("Enter a new password (at least 8 characters): ")
confirm_password = input("Confirm the new password: ")

if len(new_password) < 8:
    print("Password must be at least 8 characters.")
    raise SystemExit(1)

if new_password != confirm_password:
    print("Passwords do not match.")
    raise SystemExit(1)

with connect_db() as db:
    user = db.execute(
        """
        SELECT id
        FROM users
        WHERE email = ?
          AND role = 'student'
        """,
        (email,),
    ).fetchone()

    if user is None:
        print("No student account was found with that email.")
        raise SystemExit(1)

    salt = secrets.token_bytes(16)
    password_hash = _hash_password(new_password, salt).hex()

    db.execute(
        """
        UPDATE users
        SET password_salt = ?, password_hash = ?
        WHERE id = ?
        """,
        (salt.hex(), password_hash, user["id"]),
    )

    db.execute(
        "DELETE FROM sessions WHERE user_id = ?",
        (user["id"],),
    )

print("Password reset successfully.")