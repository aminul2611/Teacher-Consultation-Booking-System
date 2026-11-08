import {
    getProfile,
    getSessionToken,
    logoutUser,
    rpcCall,
} from "./rpc.js";

const teacherName = document.getElementById("teacher-name");
const teacherDepartment = document.getElementById("teacher-department");
const profileAvatar = document.getElementById("profile-avatar");
const slotForm = document.getElementById("slot-form");
const slotStatus = document.getElementById("slot-status");
const requestsStatus = document.getElementById("requests-status");
const requestsList = document.getElementById("requests-list");
const logoutButton = document.getElementById("logout-button");

const token = getSessionToken();

function showInitials(fullName) {
    return fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("");
}

function showProfileAvatar(user) {
    profileAvatar.replaceChildren();

    if (!user.photo_path) {
        profileAvatar.textContent = showInitials(user.full_name);
        return;
    }

    const image = document.createElement("img");
    image.src = user.photo_path;
    image.alt = `${user.full_name}'s profile picture`;

    image.addEventListener("error", () => {
        profileAvatar.replaceChildren();
        profileAvatar.textContent = showInitials(user.full_name);
    });

    profileAvatar.append(image);
}

function formatDateTime(value) {
    if (!value) {
        return "Time not set";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function createTextElement(tagName, text, className = "") {
    const element = document.createElement(tagName);
    element.textContent = text;

    if (className) {
        element.className = className;
    }

    return element;
}

function createButton(
    label,
    onClick,
    className = "button button-primary"
) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", onClick);

    return button;
}

function convertToIsoDateTime(value) {
    const localDateTime = new Date(value);

    if (Number.isNaN(localDateTime.getTime())) {
        throw new Error("Choose a valid date and time.");
    }

    return localDateTime.toISOString();
}

function combineDateAndTime(date, time) {
    const localDateTime = new Date(`${date}T${time}`);

    if (Number.isNaN(localDateTime.getTime())) {
        throw new Error("Choose a valid date and time.");
    }

    return localDateTime.toISOString();
}

async function loadRequests() {
    requestsStatus.textContent = "Loading consultation requests...";
    requestsList.replaceChildren();

    try {
        const requests = await rpcCall(
            "get_teacher_requests",
            { token }
        );

        if (requests.length === 0) {
            requestsStatus.textContent =
                "There are no consultation requests yet.";
            return;
        }

        requestsStatus.textContent =
            `${requests.length} request(s).`;

        requests.forEach((request) => {
            const card = document.createElement("article");
            card.className = "data-card";

            card.append(
                createTextElement("h3", request.student_name),
                createTextElement(
                    "p",
                    request.student_id
                        ? `Student ID: ${request.student_id}`
                        : "Student ID not provided"
                ),
                createTextElement(
                    "p",
                    `Preferred time: ${formatDateTime(request.preferred_start)}`
                ),
                createTextElement(
                    "p",
                    `Status: ${request.status}`
                )
            );

            if (request.message) {
                card.append(
                    createTextElement(
                        "p",
                        `Message: ${request.message}`
                    )
                );
            }

            if (request.proposed_start) {
                card.append(
                    createTextElement(
                        "p",
                        `Your proposed time: ${formatDateTime(request.proposed_start)}`
                    )
                );
            }

            if (request.status === "pending") {
                const actions = document.createElement("div");
                actions.className = "request-actions";

                actions.append(
                    createButton(
                        "Accept request",
                        async () => {
                            await respondToRequest(request.id, "accept");
                        }
                    ),
                    createButton(
                        "Decline",
                        async () => {
                            await respondToRequest(request.id, "decline");
                        },
                        "button button-danger"
                    )
                );

                card.append(actions);
                card.append(createProposalForm(request.id));
            }

            requestsList.append(card);
        });
    } catch (error) {
        requestsStatus.textContent =
            `Could not load requests: ${error.message}`;
    }
}

function createProposalForm(requestId) {
    const form = document.createElement("form");
    form.className = "proposal-form";

    const field = document.createElement("div");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const submitButton = document.createElement("button");

    label.textContent = "Suggest another time";

    input.type = "datetime-local";
    input.required = true;

    submitButton.type = "submit";
    submitButton.className = "button button-outline";
    submitButton.textContent = "Send proposal";

    field.append(label, input);
    form.append(field, submitButton);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        try {
            const proposedStart = convertToIsoDateTime(input.value);

            submitButton.disabled = true;
            submitButton.textContent = "Sending...";

            await respondToRequest(
                requestId,
                "propose",
                proposedStart
            );
        } catch (error) {
            requestsStatus.textContent = error.message;
            submitButton.disabled = false;
            submitButton.textContent = "Send proposal";
        }
    });

    return form;
}

async function respondToRequest(
    requestId,
    action,
    proposedStart = ""
) {
    requestsStatus.textContent = "Saving your response...";

    try {
        const result = await rpcCall("respond_to_request", {
            token,
            request_id: requestId,
            action,
            proposed_start: proposedStart,
        });

        requestsStatus.textContent = result.message;
        await loadRequests();
    } catch (error) {
        requestsStatus.textContent = error.message;
    }
}

slotForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    slotStatus.textContent = "Adding slot...";

    const formData = new FormData(slotForm);
    const date = formData.get("date");
    const startTime = formData.get("start_time");
    const endTime = formData.get("end_time");

    try {
        const startsAt = combineDateAndTime(date, startTime);
        const endsAt = combineDateAndTime(date, endTime);

        const result = await rpcCall("add_teacher_slot", {
            token,
            starts_at: startsAt,
            ends_at: endsAt,
        });

        slotStatus.textContent = result.message;
        slotForm.reset();
    } catch (error) {
        slotStatus.textContent = error.message;
    }
});

document
    .getElementById("refresh-requests-button")
    .addEventListener("click", loadRequests);

logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging out...";

    try {
        await logoutUser();
    } finally {
        window.location.replace("/index.html");
    }
});

async function startTeacherPage() {
    if (!token) {
        window.location.replace("/index.html");
        return;
    }

    try {
        const user = await getProfile();

        if (user.role !== "teacher") {
            window.location.replace(
                user.role === "student"
                    ? "/student.html"
                    : "/index.html"
            );
            return;
        }

        teacherName.textContent = user.full_name;
        teacherDepartment.textContent = user.department || "Teacher";
        showProfileAvatar(user);

        await loadRequests();
    } catch {
        sessionStorage.removeItem("campusconnect_session_token");
        window.location.replace("/index.html");
    }
}

startTeacherPage();