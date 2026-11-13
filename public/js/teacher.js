import {
    getProfile,
    getSessionToken,
    logoutUser,
    rpcCall,
} from "./rpc.js";
import "./profile-ui.js";

const teacherName = document.getElementById("teacher-name");
const teacherAvatar = document.getElementById("teacher-avatar");
const pageMessage = document.getElementById("teacher-message");
const slotForm = document.getElementById("teacher-availability-form");
const startDate = document.getElementById("slot-start-date");
const startDateDisplay = document.getElementById("slot-start-date-display");
const startTime = document.getElementById("slot-start-time");
const endTime = document.getElementById("slot-end-time");
const slotsList = document.getElementById("teacher-slots");
const requestsList = document.getElementById("teacher-requests");
const completedList = document.getElementById(
    "teacher-completed-consultations"
);
const logoutButton = document.getElementById("teacher-logout-button");

const token = getSessionToken();

function openDatePicker(input) {
    try {
        if (typeof input.showPicker === "function") {
            input.showPicker();
        } else {
            input.click();
        }
    } catch {
        input.click();
    }
}

function localToday() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function initials(name = "Teacher") {
    return String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("") || "T";
}

function setAvatar(user) {
    if (!teacherAvatar) return;

    teacherAvatar.replaceChildren();

    if (!user.photo_path) {
        teacherAvatar.textContent = initials(user.full_name);
        return;
    }

    const image = document.createElement("img");
    image.src = user.photo_path;
    image.alt = `${user.full_name || "Teacher"}'s profile photo`;

    image.addEventListener("error", () => {
        teacherAvatar.replaceChildren();
        teacherAvatar.textContent = initials(user.full_name);
    });

    teacherAvatar.append(image);
}

function showMessage(text, type = "") {
    pageMessage.textContent = text;
    pageMessage.hidden = !text;
    pageMessage.className =
        `teacher-dashboard-message ${type}`.trim();
}

function textElement(tag, text, className = "") {
    const element = document.createElement(tag);
    element.textContent = text ?? "";

    if (className) {
        element.className = className;
    }

    return element;
}

function button(
    label,
    handler,
    className = "teacher-secondary-button"
) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = className;
    element.textContent = label;
    element.addEventListener("click", handler);

    return element;
}

function formatDateTime(value) {
    if (!value) return "Time not set";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    const dateText = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);

    const timeText = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);

    return `${dateText} ${timeText}`;
}

function localIso(dateValue, timeValue) {
    if (!dateValue || !timeValue) {
        throw new Error("Choose a date, start time, and end time.");
    }

    const date = new Date(`${dateValue}T${timeValue}`);

    if (Number.isNaN(date.getTime())) {
        throw new Error("Choose a valid date and time.");
    }

    return date.toISOString();
}

function displayDate(dateValue) {
    if (!dateValue) {
        startDateDisplay.value = "";
        return;
    }

    const [year, month, day] = dateValue.split("-");
    startDateDisplay.value = `${day}/${month}/${year}`;
}

async function loadSlots() {
    slotsList.replaceChildren(
        textElement(
            "p",
            "Loading your available slots...",
            "teacher-empty-state"
        )
    );

    try {
        const slots = await rpcCall("get_teacher_slots", { token });
        slotsList.replaceChildren();

        if (!slots.length) {
            slotsList.append(
                textElement(
                    "p",
                    "You have not added any available times yet.",
                    "teacher-empty-state"
                )
            );
            return;
        }

        slots.forEach((slot) => {
            const card = document.createElement("article");
            card.className = "teacher-slot-card";

            const details = document.createElement("div");
            details.className = "teacher-slot-details";
            details.append(
                textElement(
                    "h3",
                    formatDateTime(slot.starts_at),
                    "teacher-slot-title"
                ),
                textElement(
                    "p",
                    `Ends: ${formatDateTime(slot.ends_at)}`,
                    "teacher-slot-meta"
                ),
                textElement(
                    "p",
                    slot.status === "booked"
                        ? `Booked by ${slot.student_name || "a student"}`
                        : "Available for students",
                    "teacher-slot-meta"
                )
            );

            card.append(details);
            slotsList.append(card);
        });
    } catch (error) {
        slotsList.replaceChildren(
            textElement(
                "p",
                `Could not load slots: ${error.message}`,
                "teacher-empty-state"
            )
        );
    }
}

function makeProposalForm(requestId) {
    const form = document.createElement("form");
    form.className = "teacher-proposal-form";

    const field = document.createElement("div");
    field.className = "teacher-proposal-field";

    const dateLabel = document.createElement("label");
    dateLabel.textContent = "Suggested date (DD/MM/YYYY)";

    const dateControl = document.createElement("div");
    dateControl.className = "teacher-proposal-date-control";

    const dateDisplay = document.createElement("input");
    dateDisplay.type = "text";
    dateDisplay.className = "teacher-proposal-date-display";
    dateDisplay.placeholder = "DD/MM/YYYY";
    dateDisplay.readOnly = true;

    const calendarIcon = document.createElement("span");
    calendarIcon.className = "teacher-calendar-icon";
    calendarIcon.setAttribute("aria-hidden", "true");
    calendarIcon.textContent = "▦";

    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.required = true;
    dateInput.min = localToday();
    dateInput.setAttribute("aria-label", "Choose proposed date");

    dateInput.addEventListener("change", () => {
        if (!dateInput.value) {
            dateDisplay.value = "";
            return;
        }

        const [year, month, day] = dateInput.value.split("-");
        dateDisplay.value = `${day}/${month}/${year}`;
    });

    dateDisplay.addEventListener("click", () => {
        openDatePicker(dateInput);
    });

    dateControl.append(dateDisplay, calendarIcon, dateInput);

    const timeLabel = document.createElement("label");
    timeLabel.textContent = "Suggested time";

    const timeInput = document.createElement("input");
    timeInput.type = "time";
    timeInput.required = true;

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "teacher-primary-button";
    submit.textContent = "Send proposal";

    field.append(dateLabel, dateControl, timeLabel, timeInput);
    form.append(field, submit);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const proposed = new Date(
            `${dateInput.value}T${timeInput.value}`
        );

        if (Number.isNaN(proposed.getTime())) {
            showMessage(
                "Choose a valid proposed date and time.",
                "error"
            );
            return;
        }

        submit.disabled = true;
        submit.textContent = "Sending...";

        await answerRequest(
            requestId,
            "propose",
            proposed.toISOString()
        );

        submit.disabled = false;
        submit.textContent = "Send proposal";
    });

    return form;
}

async function loadRequests() {
    requestsList.replaceChildren(
        textElement(
            "p",
            "Loading student requests...",
            "teacher-empty-state"
        )
    );

    try {
        const requests = await rpcCall(
            "get_teacher_requests",
            { token }
        );

        requestsList.replaceChildren();

        if (!requests.length) {
            requestsList.append(
                textElement(
                    "p",
                    "There are no student requests yet.",
                    "teacher-empty-state"
                )
            );
            return;
        }

        requests.forEach((request) => {
            const card = document.createElement("article");
            card.className = "teacher-request-card";

            const details = document.createElement("div");
            details.className = "teacher-request-details";
            details.append(
                textElement(
                    "h3",
                    request.student_name,
                    "teacher-request-title"
                ),
                textElement(
                    "p",
                    request.student_id
                        ? `Student ID: ${request.student_id}`
                        : "Student ID not provided",
                    "teacher-request-meta"
                ),
                textElement(
                    "p",
                    `Preferred time: ${formatDateTime(request.preferred_start)}`,
                    "teacher-request-meta"
                ),
                textElement(
                    "p",
                    `Status: ${request.status}`,
                    "teacher-request-meta"
                )
            );

            if (request.message) {
                details.append(
                    textElement(
                        "p",
                        `Message: ${request.message}`,
                        "teacher-request-meta"
                    )
                );
            }

            if (request.proposed_start) {
                details.append(
                    textElement(
                        "p",
                        `Proposed time: ${formatDateTime(request.proposed_start)}`,
                        "teacher-request-meta"
                    )
                );
            }

            card.append(details);

            if (request.status === "pending") {
                const actions = document.createElement("div");
                actions.className = "teacher-request-actions";
                actions.append(
                    button(
                        "Accept",
                        async () => {
                            await answerRequest(request.id, "accept");
                        },
                        "teacher-action-button accept"
                    ),
                    button(
                        "Decline",
                        async () => {
                            await answerRequest(request.id, "decline");
                        },
                        "teacher-action-button reject"
                    )
                );

                card.append(actions, makeProposalForm(request.id));
            }

            requestsList.append(card);
        });
    } catch (error) {
        requestsList.replaceChildren(
            textElement(
                "p",
                `Could not load requests: ${error.message}`,
                "teacher-empty-state"
            )
        );
    }
}

async function answerRequest(
    requestId,
    action,
    proposedStart = ""
) {
    try {
        const result = await rpcCall("respond_to_request", {
            token,
            request_id: requestId,
            action,
            proposed_start: proposedStart,
        });

        showMessage(result.message, "success");
        await Promise.all([loadRequests(), loadSlots()]);
    } catch (error) {
        showMessage(error.message, "error");
    }
}

async function loadCompletedConsultations() {
    completedList.replaceChildren(
        textElement(
            "p",
            "Loading completed consultations...",
            "teacher-empty-state"
        )
    );

    try {
        const appointments = await rpcCall(
            "get_teacher_completed_appointments",
            { token }
        );

        completedList.replaceChildren();

        if (!appointments.length) {
            completedList.append(
                textElement(
                    "p",
                    "There are no completed consultations yet.",
                    "teacher-empty-state"
                )
            );
            return;
        }

        appointments.forEach((appointment) => {
            const card = document.createElement("article");
            card.className = "teacher-completed-item";

            const details = document.createElement("div");
            details.className = "teacher-completed-details";
            details.append(
                textElement(
                    "h3",
                    appointment.student_name,
                    "teacher-completed-title"
                ),
                textElement(
                    "p",
                    `${formatDateTime(appointment.starts_at)} – ${formatDateTime(appointment.ends_at)}`,
                    "teacher-completed-meta"
                )
            );

            const form = document.createElement("form");
            form.className = "teacher-followup-form";

            const summaryLabel = document.createElement("label");
            summaryLabel.textContent = "Consultation summary";

            const summary = document.createElement("textarea");
            summary.required = true;
            summary.maxLength = 3000;
            summary.placeholder = "Write a brief summary";
            summary.value = appointment.summary || "";

            const actionLabel = document.createElement("label");
            actionLabel.textContent = "Action items (optional)";

            const actions = document.createElement("textarea");
            actions.maxLength = 3000;
            actions.placeholder = "Add any action items";
            actions.value = appointment.action_items || "";

            const save = document.createElement("button");
            save.type = "submit";
            save.className = "teacher-primary-button";
            save.textContent = "Save follow-up";

            summaryLabel.append(summary);
            actionLabel.append(actions);
            form.append(summaryLabel, actionLabel, save);

            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                save.disabled = true;

                try {
                    const result = await rpcCall(
                        "save_consultation_followup",
                        {
                            token,
                            appointment_id: appointment.appointment_id,
                            summary: summary.value.trim(),
                            action_items: actions.value.trim(),
                        }
                    );

                    showMessage(result.message, "success");
                    await loadCompletedConsultations();
                } catch (error) {
                    showMessage(error.message, "error");
                } finally {
                    save.disabled = false;
                }
            });

            card.append(details, form);
            completedList.append(card);
        });
    } catch (error) {
        completedList.replaceChildren(
            textElement(
                "p",
                `Could not load completed consultations: ${error.message}`,
                "teacher-empty-state"
            )
        );
    }
}

slotForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage("Adding available time...");

    try {
        const startsAt = localIso(
            startDate.value,
            startTime.value
        );
        const endsAt = localIso(
            startDate.value,
            endTime.value
        );

        const result = await rpcCall("add_teacher_slot", {
            token,
            starts_at: startsAt,
            ends_at: endsAt,
        });

        showMessage(result.message, "success");
        slotForm.reset();
        startDateDisplay.value = "";
        await loadSlots();
    } catch (error) {
        showMessage(error.message, "error");
    }
});

startDate.min = localToday();

startDate.addEventListener("change", () => {
    displayDate(startDate.value);
});

startDateDisplay.addEventListener("click", () => {
    openDatePicker(startDate);
});

document
    .getElementById("teacher-refresh-slots")
    .addEventListener("click", loadSlots);

document
    .getElementById("teacher-refresh-requests")
    .addEventListener("click", loadRequests);

document
    .getElementById("teacher-refresh-completed")
    .addEventListener("click", loadCompletedConsultations);

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

        teacherName.textContent = user.full_name || "Teacher";
        setAvatar(user);

        await Promise.all([
            loadSlots(),
            loadRequests(),
            loadCompletedConsultations(),
        ]);
    } catch (error) {
        console.error("Could not start teacher page:", error);
        sessionStorage.removeItem("campusconnect_session_token");
        window.location.replace("/index.html");
    }
}

startTeacherPage();