import base64
import binascii
import uuid
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent
PHOTO_DIR = PROJECT_DIR / "public" / "uploads" / "avatars"
MAX_PHOTO_BYTES = 2 * 1024 * 1024

ALLOWED_PHOTOS = {
    "image/jpeg": {
        "extension": ".jpg",
        "signature": lambda data: data.startswith(b"\xff\xd8\xff"),
    },
    "image/png": {
        "extension": ".png",
        "signature": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
    },
    "image/webp": {
        "extension": ".webp",
        "signature": lambda data: (
            len(data) >= 12
            and data[:4] == b"RIFF"
            and data[8:12] == b"WEBP"
        ),
    },
}


def save_profile_photo(photo_data):
    if not photo_data:
        return None

    if not isinstance(photo_data, str) or "," not in photo_data:
        raise ValueError("The profile picture is not valid.")

    header, encoded_data = photo_data.split(",", 1)

    mime_type = header.removeprefix("data:").split(";", 1)[0]
    photo_type = ALLOWED_PHOTOS.get(mime_type)

    if photo_type is None or ";base64" not in header:
        raise ValueError("Use a JPG, PNG, or WebP profile picture.")

    try:
        image_bytes = base64.b64decode(encoded_data, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("The profile picture data is not valid.")

    if not image_bytes:
        raise ValueError("The selected profile picture is empty.")

    if len(image_bytes) > MAX_PHOTO_BYTES:
        raise ValueError("The profile picture must be 2 MB or smaller.")

    if not photo_type["signature"](image_bytes):
        raise ValueError("The selected file does not match its image type.")

    PHOTO_DIR.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4().hex}{photo_type['extension']}"
    photo_path = PHOTO_DIR / filename
    photo_path.write_bytes(image_bytes)

    return f"/uploads/avatars/{filename}"


def delete_profile_photo(photo_url):
    if not photo_url or not photo_url.startswith("/uploads/avatars/"):
        return

    filename = Path(photo_url).name
    photo_path = PHOTO_DIR / filename

    if photo_path.exists():
        photo_path.unlink()