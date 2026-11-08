from auth import (
    approve_teacher_account,
    list_pending_teacher_accounts,
    setup_auth_database,
)


def main():
    setup_auth_database()
    pending_teachers = list_pending_teacher_accounts()

    if not pending_teachers:
        print("There are no teacher accounts waiting for approval.")
        return

    print("Teacher accounts waiting for approval:\n")

    for teacher in pending_teachers:
        print(
            f"Name: {teacher['full_name']}\n"
            f"Email: {teacher['email']}\n"
            f"Teacher ID: {teacher['student_id'] or 'Not provided'}\n"
            f"Department: {teacher['department'] or 'Not provided'}\n"
        )

    email = input("Enter the email to approve: ").strip()

    try:
        result = approve_teacher_account(email)
        print(result["message"])
    except ValueError as error:
        print(f"Approval failed: {error}")


if __name__ == "__main__":
    main()