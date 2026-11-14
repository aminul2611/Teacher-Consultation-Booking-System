import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from auth import (
    get_user_from_token,
    login_user,
    logout_user,
    register_user,
    setup_auth_database,
    update_profile,
)
from booking import (
    add_teacher_slot,
    book_slot,
    get_available_slots,
    get_student_appointments,
    get_teacher_completed_appointments,
    get_teacher_requests,
    get_teacher_schedule,
    get_teacher_slots,
    get_teachers,
    request_consultation,
    respond_to_proposal,
    respond_to_request,
    save_consultation_followup,
    setup_booking_database,
)


PROJECT_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = PROJECT_DIR / "public"
HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8000"))
MAX_REQUEST_BYTES = 3_000_000

ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:8000,http://127.0.0.1:8000,"
        "http://localhost:5500,http://127.0.0.1:5500",
    ).split(",")
    if origin.strip()
}


def run_rpc_method(method, params):
    if not isinstance(params, dict):
        raise ValueError("RPC parameters must be sent as a JSON object.")

    token = params.get("token", "")

    if method == "register_user":
        return register_user(
            email=params.get("email", ""),
            password=params.get("password", ""),
            full_name=params.get("full_name", ""),
            role=params.get("role", ""),
            student_id=params.get("student_id", ""),
            department=params.get("department", ""),
            teacher_code=params.get("teacher_code", ""),
            photo_data=params.get("photo_data", ""),
        )

    if method in ("login", "login_user"):
        return login_user(
            email=params.get("email", ""),
            password=params.get("password", ""),
        )

    if method == "update_profile":
        return update_profile(
            token=token,
            full_name=params.get("full_name", ""),
            phone_number=params.get("phone_number", ""),
            department=params.get("department", ""),
            photo_data=params.get("photo_data", ""),
        )

    if method == "get_profile":
        return get_user_from_token(token)

    if method in ("logout", "logout_user"):
        return logout_user(token)

    if method == "get_available_slots":
        return get_available_slots(token)

    if method == "get_teachers":
        return get_teachers(token)

    if method == "get_teacher_schedule":
        return get_teacher_schedule(token)

    if method == "get_teacher_slots":
        return get_teacher_slots(token)

    if method == "add_teacher_slot":
        return add_teacher_slot(
            token=token,
            starts_at=params.get("starts_at", ""),
            ends_at=params.get("ends_at", ""),
        )

    if method == "book_slot":
        return book_slot(token=token, slot_id=params.get("slot_id"))

    if method == "request_consultation":
        return request_consultation(
            token=token,
            teacher_id=params.get("teacher_id", ""),
            preferred_start=params.get("preferred_start", ""),
            message=params.get("message", ""),
        )

    if method == "get_teacher_requests":
        return get_teacher_requests(token)

    if method == "respond_to_request":
        return respond_to_request(
            token=token,
            request_id=params.get("request_id", ""),
            action=params.get("action", ""),
            proposed_start=params.get("proposed_start", ""),
        )

    if method == "respond_to_proposal":
        return respond_to_proposal(
            token=token,
            request_id=params.get("request_id", ""),
            accept=params.get("accept", False),
        )

    if method == "get_teacher_completed_appointments":
        return get_teacher_completed_appointments(token)

    if method == "save_consultation_followup":
        return save_consultation_followup(
            token=token,
            appointment_id=params.get("appointment_id"),
            summary=params.get("summary", ""),
            action_items=params.get("action_items", ""),
        )

    if method == "get_student_appointments":
        return get_student_appointments(token)

    raise LookupError(f"Unknown RPC method: {method}")


class CampusConnectHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def _add_cors_headers(self):
        origin = self.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._add_cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path.rstrip("/") != "/rpc":
            self._send_error_json(
                None, -32600, "RPC requests must use the /rpc path.", status=404,
            )
            return

        request_id = None
        try:
            content_length = int(self.headers.get("Content-Length", "0"))

            if content_length <= 0:
                raise ValueError("The request body is missing.")
            if content_length > MAX_REQUEST_BYTES:
                raise ValueError(
                    "The request is too large. Profile pictures must be 2 MB or smaller."
                )

            raw_body = self.rfile.read(content_length)
            request = json.loads(raw_body.decode("utf-8"))

            if not isinstance(request, dict):
                raise ValueError("The RPC request must be a JSON object.")
            if request.get("jsonrpc") != "2.0":
                raise ValueError("The request must use JSON-RPC 2.0.")

            request_id = request.get("id")
            method = request.get("method")
            params = request.get("params", {})

            if not isinstance(method, str) or not method:
                raise ValueError("An RPC method name is required.")

            result = run_rpc_method(method, params)
            self._send_json({"jsonrpc": "2.0", "id": request_id, "result": result})

        except (json.JSONDecodeError, UnicodeDecodeError):
            self._send_error_json(request_id, -32700, "The request contains invalid JSON.")
        except (ValueError, TypeError, KeyError) as error:
            self._send_error_json(request_id, -32602, str(error))
        except LookupError as error:
            self._send_error_json(request_id, -32601, str(error))
        except Exception:
            self._send_error_json(request_id, -32603, "An internal server error occurred.")

    def _send_error_json(self, request_id, code, message, status=200):
        self._send_json({
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        }, status=status)

    def _send_json(self, data, status=200):
        response_body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self._add_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_body)))
        self.end_headers()
        self.wfile.write(response_body)


def main():
    if not PUBLIC_DIR.exists():
        print(f"Warning: public folder was not found: {PUBLIC_DIR}")

    setup_auth_database()
    setup_booking_database()

    server = ThreadingHTTPServer((HOST, PORT), CampusConnectHandler)
    print(f"CampusConnect server is running at http://localhost:{PORT}")
    print(f"JSON-RPC endpoint: http://localhost:{PORT}/rpc")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()