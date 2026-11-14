import { getProfile, getSessionToken, logoutUser, rpcCall } from "./rpc.js";
import "./profile-ui.js";

const byId = (id) => document.getElementById(id);
const token = getSessionToken();
const api = (method, params = {}) => rpcCall(method, { ...params, token });

const slotDialog = byId("slot-dialog");
const slotForm = byId("slot-form");
const reviewDialog = byId("review-dialog");
const proposalForm = byId("proposal-form");
const pageSize = 6;

const dateFormat = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
});

const weekdayFormat = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

const statusNames = {
    pending: "Pending",
    accepted: "Accepted",
    declined: "Declined",
    proposed: "Proposed",
};

let currentView = "overview";
let requests = [];
let history = [];
let requestsPage = 0;
let historyPage = 0;
let requestsLoaded = false;
let requestsError = "";
let historyLoaded = false;
let historyError = "";
let historyLoading = false;
let scheduleLoad = null;
let requestsLoad = null;
let selectedRequest = null;
let reviewBusy = false;

function clockDate(date = new Date()) {
    const pad = (value) => String(value).padStart(2, "0");

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join("-");
}

function dateText(value) {
    return dateFormat.format(new Date(value));
}

function timeText(value) {
    return timeFormat.format(new Date(value));
}

function rangeText(record) {
    return `${timeText(record.starts_at)}–${timeText(record.ends_at)}`;
}

function dateTime(value) {
    return `${dateText(value)} · ${timeText(value)}`;
}

function el(tag, text = "", className = "") {
    const node = document.createElement(tag);
    node.textContent = text;
    node.className = className;
    return node;
}

function button(text, handler, className = "button") {
    const node = el("button", text, className);
    node.type = "button";
    node.addEventListener("click", handler);
    return node;
}

function setText(id, value) {
    byId(id).textContent = value;
}

function message(id, text, type = "") {
    const node = byId(id);
    node.textContent = text;
    node.hidden = !text;

    if (type) node.dataset.type = type;
    else delete node.dataset.type;
}

function empty(container, text) {
    container.replaceChildren(el("p", text, "empty"));
}

function makeRow(title, description) {
    const row = el("div", "", "data-row");
    const details = el("div", "", "row-details");

    details.append(el("strong", title));

    if (description) {
        details.append(el("span", description, "muted"));
    }

    row.append(details);
    return row;
}

function renderSchedule(records) {
    const now = new Date();
    const today = dateText(now);
    const todayKey = clockDate(now);
    const booked = (record) => record.status === "booked";

    const live = records.filter((record) => {
        const boundary = booked(record) ? record.ends_at : record.starts_at;
        return new Date(boundary) > now;
    });

    const todayRecords = live.filter((record) =>
        clockDate(new Date(record.starts_at)) <= todayKey
    );

    const futureRecords = live.filter((record) =>
        clockDate(new Date(record.starts_at)) > todayKey
    );

    const next = live.find(booked);

    setText("today-label", `${weekdayFormat.format(now)} · ${today}`);
    setText("metric-today", todayRecords.filter(booked).length);
    setText("metric-future", futureRecords.filter(booked).length);

    const inProgress = next && new Date(next.starts_at) <= now;

    setText(
        "next-label",
        inProgress ? "Consultation in progress" : "Next consultation",
    );
    setText(
        "next-name",
        next ? next.student_name || "Student" : "No upcoming consultations",
    );

    byId("next-when").hidden = !next;
    byId("next-topic").hidden = !next?.topic;
    setText("next-topic", next?.topic || "");

    if (next) {
        setText("next-time", rangeText(next));

        const nextDay = dateText(next.starts_at);
        setText("next-date", nextDay === today ? `Today · ${today}` : nextDay);
    }

    const list = byId("schedule-list");
    list.replaceChildren();

    const groups = [
        ["Today", todayRecords],
        ["Upcoming", futureRecords],
    ];

    for (const [label, items] of groups) {
        list.append(el("h3", label, "schedule-group"));

        if (!items.length) {
            list.append(el("p", "No slots scheduled.", "empty"));
        }

        for (const record of items) {
            const isBooked = booked(record);
            const day = dateText(record.starts_at);

            const row = makeRow(
                isBooked ? record.student_name || "Student" : "Open for booking",
                day === today ? "" : day,
            );

            row.classList.add("schedule-row");
            row.prepend(el("span", rangeText(record), "time"));
            row.append(el(
                "span",
                isBooked ? "Booked" : "Available",
                isBooked ? "badge booked" : "badge",
            ));

            list.append(row);
        }
    }
}

async function fetchSchedule() {
    try {
        renderSchedule(await api("get_teacher_schedule"));
    } catch (error) {
        setText("next-label", "Next consultation");
        setText("next-name", "Schedule unavailable");

        byId("next-when").hidden = true;
        byId("next-topic").hidden = true;

        setText("metric-today", "—");
        setText("metric-future", "—");
        empty(byId("schedule-list"), error.message);
    }
}

function loadSchedule() {
    scheduleLoad ??= fetchSchedule().finally(() => {
        scheduleLoad = null;
    });

    return scheduleLoad;
}

function pagination(prefix, count, page) {
    const start = page * pageSize;

    byId(`${prefix}-pages`).hidden = count === 0;

    setText(
        `${prefix}-range`,
        count ? `${start + 1}–${Math.min(start + pageSize, count)} of ${count}` : "",
    );

    byId(`${prefix}-prev`).disabled = page === 0;
    byId(`${prefix}-next`).disabled = start + pageSize >= count;

    return start;
}

function requestRow(request, compact = false) {
    const requested = request.proposed_start || request.preferred_start;

    const description = compact
        ? request.message || dateTime(requested)
        : [request.student_id, dateTime(requested)].filter(Boolean).join(" · ");

    const row = makeRow(request.student_name || "Student", description);

    if (request.status === "pending") {
        const review = button("Review", () => openReview(request));

        review.setAttribute(
            "aria-label",
            `Review request from ${request.student_name || "student"}`,
        );

        row.append(review);
    } else {
        const className = request.status === "accepted" ? "badge booked" : "badge";
        row.append(el("span", statusNames[request.status] || request.status, className));
    }

    return row;
}

function renderRequests() {
    const inbox = byId("inbox-list");
    const list = byId("requests-list");

    if (!requestsLoaded || requestsError) {
        const text = requestsError || "Loading requests…";

        empty(inbox, text);
        empty(list, text);
        byId("requests-pages").hidden = true;
        byId("nav-count").hidden = true;
        setText("metric-pending", "—");

        return;
    }

    const pending = requests.filter((request) => request.status === "pending");

    setText("metric-pending", pending.length);
    setText("nav-count", pending.length);
    byId("nav-count").hidden = pending.length === 0;

    if (pending.length) {
        inbox.replaceChildren(
            ...pending.slice(0, 3).map((request) => requestRow(request, true)),
        );
    } else {
        empty(inbox, "No requests need a reply.");
    }

    const query = byId("request-search").value.trim().toLowerCase();
    const status = byId("request-status").value;

    const matching = requests.filter((request) => {
        const student = `${request.student_name || ""} ${request.student_id || ""}`
            .toLowerCase();

        return (!status || request.status === status) && student.includes(query);
    });

    requestsPage = Math.min(
        requestsPage,
        Math.max(0, Math.ceil(matching.length / pageSize) - 1),
    );

    const start = pagination("requests", matching.length, requestsPage);

    if (matching.length) {
        const page = matching.slice(start, start + pageSize);
        list.replaceChildren(...page.map((request) => requestRow(request)));
    } else {
        empty(list, "No matching requests.");
    }
}

async function fetchRequests() {
    try {
        requests = await api("get_teacher_requests");
        requestsLoaded = true;
        requestsError = "";
    } catch (error) {
        requestsError = error.message;
    } finally {
        renderRequests();
    }
}

function loadRequests() {
    requestsLoad ??= fetchRequests().finally(() => {
        requestsLoad = null;
    });

    return requestsLoad;
}

function followup(record) {
    const wrapper = el("div", "", "record-detail");
    const preview = el("div", "", "note-preview");

    function renderPreview() {
        preview.replaceChildren(
            el("p", record.summary || "No summary saved.", record.summary ? "" : "muted"),
        );

        if (record.action_items) {
            preview.append(el("p", `Action items: ${record.action_items}`));
        }
    }

    const editor = el("details", "", "followup-editor");
    const toggle = el("summary", record.summary ? "Edit follow-up" : "Add follow-up");
    const form = el("form", "", "followup-form");

    const summaryLabel = el("label", "Consultation summary");
    const summary = el("textarea");

    summary.rows = 3;
    summary.required = true;
    summary.maxLength = 3000;
    summary.value = record.summary || "";
    summaryLabel.append(summary);

    const actionsLabel = el("label", "Action items (optional)");
    const actions = el("textarea");

    actions.rows = 2;
    actions.maxLength = 3000;
    actions.value = record.action_items || "";
    actionsLabel.append(actions);

    const save = el("button", "Save follow-up", "button primary");
    save.type = "submit";

    const feedback = el("p", "", "inline-error");
    feedback.setAttribute("role", "status");

    form.append(summaryLabel, actionsLabel, save, feedback);
    editor.append(toggle, form);
    wrapper.append(preview, editor);

    renderPreview();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        feedback.textContent = "";

        const summaryValue = summary.value.trim();
        const actionItems = actions.value.trim();

        if (!summaryValue) {
            feedback.textContent = "Enter a consultation summary.";
            summary.focus();
            return;
        }

        save.disabled = true;

        try {
            const result = await api("save_consultation_followup", {
                appointment_id: record.appointment_id,
                summary: summaryValue,
                action_items: actionItems,
            });

            record.summary = summaryValue;
            record.action_items = actionItems;

            renderPreview();

            toggle.textContent = "Edit follow-up";
            editor.open = false;
            toggle.focus();

            message("page-message", result.message, "success");
        } catch (error) {
            feedback.textContent = error.message;
        } finally {
            save.disabled = false;
        }
    });

    return wrapper;
}

function historyRow(record) {
    const completed = record.kind === "completed";
    const item = el("details", "", "history-record");
    const line = el("summary", "", "data-row");
    const title = el("span", "", "row-details");

    title.append(
        el("strong", completed ? record.student_name || "Student" : "Unused availability"),
        el("span", `${dateText(record.starts_at)} · ${rangeText(record)}`, "muted"),
    );

    line.append(
        title,
        el(
            "span",
            completed ? "Completed" : "Expired slot",
            completed ? "badge booked" : "badge",
        ),
    );

    item.append(line);

    if (completed) {
        if (record.student_id) {
            item.append(el("p", `Student ID: ${record.student_id}`, "muted record-id"));
        }

        item.append(followup(record));
    } else {
        item.append(el("p", "This slot ended without a booking.", "muted record-detail"));
    }

    return item;
}

function renderHistory() {
    const list = byId("history-list");

    if (historyError || !historyLoaded) {
        empty(list, historyError || "Loading past activity…");
        byId("history-pages").hidden = true;
        return;
    }

    const query = byId("history-search").value.trim().toLowerCase();
    const kind = byId("history-type").value;

    const matching = history.filter((record) => {
        const searchText = [
            record.student_name,
            record.student_id,
            dateText(record.starts_at),
        ].join(" ").toLowerCase();

        return (!kind || kind === record.kind) && searchText.includes(query);
    });

    historyPage = Math.min(
        historyPage,
        Math.max(0, Math.ceil(matching.length / pageSize) - 1),
    );

    const start = pagination("history", matching.length, historyPage);

    if (matching.length) {
        list.replaceChildren(...matching.slice(start, start + pageSize).map(historyRow));
    } else {
        empty(list, "No matching past activity.");
    }
}

async function loadHistory() {
    if (historyLoading) return;

    historyLoading = true;
    historyError = "";

    if (!historyLoaded) renderHistory();

    try {
        const [consultations, slots] = await Promise.all([
            api("get_teacher_completed_appointments"),
            api("get_teacher_slots"),
        ]);

        const now = Date.now();

        const expired = slots.filter((slot) =>
            slot.status === "available" && Date.parse(slot.ends_at) <= now
        );

        history = [
            ...consultations.map((record) => ({ ...record, kind: "completed" })),
            ...expired.map((record) => ({ ...record, kind: "expired" })),
        ].sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));

        historyLoaded = true;
    } catch (error) {
        historyError = error.message;
    } finally {
        historyLoading = false;
        renderHistory();
    }
}

function setView(view) {
    if (view === currentView) return;

    currentView = view;
    message("page-message", "");

    for (const section of document.querySelectorAll("[data-panel]")) {
        section.hidden = section.dataset.panel !== view;

        if (!section.hidden) {
            section.querySelector("h1").focus();
        }
    }

    for (const control of document.querySelectorAll(".teacher-nav [data-view]")) {
        if (control.dataset.view === view) {
            control.setAttribute("aria-current", "page");
        } else {
            control.removeAttribute("aria-current");
        }
    }

    if (view === "history") loadHistory();
    if (view === "requests") loadRequests();
    if (view === "overview") refreshOverview();
}

function syncDate(input) {
    const display = input.parentElement.querySelector("[data-date-display]");

    display.textContent = input.value
        ? input.value.split("-").reverse().join("/")
        : "DD/MM/YYYY";
}

function prepareDate(form) {
    form.reset();

    const input = form.elements.date;
    input.min = clockDate();

    syncDate(input);
}

function isoTime(date, time) {
    const value = new Date(`${date}T${time}`);

    if (Number.isNaN(value.getTime())) {
        throw new Error("Choose a valid date and time.");
    }

    const normalized = `${clockDate(value)}T${timeText(value)}`;

    if (normalized !== `${date}T${time}`) {
        throw new Error("Choose a valid date and time.");
    }

    return value.toISOString();
}

function openReview(request) {
    selectedRequest = request;

    byId("review-info").replaceChildren(
        el("strong", request.student_name || "Student"),
        el("p", request.student_id ? `Student ID: ${request.student_id}` : "", "muted"),
        el("p", `Preferred time: ${dateTime(request.preferred_start)}`),
        el("p", request.message || "", "request-message"),
    );

    byId("proposal-details").open = false;
    prepareDate(proposalForm);
    message("review-error", "");
    reviewDialog.showModal();
}

async function refreshOverview() {
    await Promise.all([loadSchedule(), loadRequests()]);
}

async function answerRequest(action, proposedStart = "") {
    if (reviewBusy || !selectedRequest) return;

    reviewBusy = true;

    const buttons = [...reviewDialog.querySelectorAll("button")];
    buttons.forEach((control) => {
        control.disabled = true;
    });

    message("review-error", "");

    try {
        const result = await api("respond_to_request", {
            request_id: selectedRequest.id,
            action,
            proposed_start: proposedStart,
        });

        reviewDialog.close();
        message("page-message", result.message, "success");

        await Promise.all([scheduleLoad, requestsLoad]);
        await refreshOverview();

        byId(currentView === "requests" ? "request-search" : "attention-title").focus();
    } catch (error) {
        message("review-error", error.message);
    } finally {
        buttons.forEach((control) => {
            control.disabled = false;
        });

        reviewBusy = false;
    }
}

for (const control of document.querySelectorAll("[data-view]")) {
    control.addEventListener("click", () => setView(control.dataset.view));
}

for (const control of document.querySelectorAll("[data-close]")) {
    control.addEventListener("click", () => control.closest("dialog").close());
}

for (const input of document.querySelectorAll(".date-field input[type='date']")) {
    input.addEventListener("input", () => syncDate(input));
    input.addEventListener("change", () => syncDate(input));

    input.addEventListener("click", () => {
        try {
            input.showPicker?.();
        } catch {
            // The native date input remains available.
        }
    });
}

byId("open-slot").addEventListener("click", () => {
    prepareDate(slotForm);
    message("slot-error", "");
    slotDialog.showModal();
});

slotForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const { date, start, end } = slotForm.elements;
    const submit = slotForm.querySelector('button[type="submit"]');
    const close = slotForm.querySelector("[data-close]");

    if (submit.disabled) return;

    submit.disabled = true;
    close.disabled = true;
    message("slot-error", "");

    try {
        const startsAt = isoTime(date.value, start.value);
        const endsAt = isoTime(date.value, end.value);

        if (Date.parse(startsAt) <= Date.now()) {
            throw new Error("Choose a future start time.");
        }

        if (endsAt <= startsAt) {
            throw new Error("End time must be after start time.");
        }

        const result = await api("add_teacher_slot", {
            starts_at: startsAt,
            ends_at: endsAt,
        });

        slotDialog.close();
        message("page-message", result.message, "success");

        await scheduleLoad;
        await loadSchedule();
    } catch (error) {
        message("slot-error", error.message);
    } finally {
        submit.disabled = false;
        close.disabled = false;
    }
});

slotDialog.addEventListener("cancel", (event) => {
    if (slotForm.querySelector('button[type="submit"]').disabled) {
        event.preventDefault();
    }
});

for (const control of reviewDialog.querySelectorAll("[data-action]")) {
    control.addEventListener("click", () => answerRequest(control.dataset.action));
}

reviewDialog.addEventListener("cancel", (event) => {
    if (reviewBusy) event.preventDefault();
});

proposalForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
        const proposedStart = isoTime(
            proposalForm.elements.date.value,
            proposalForm.elements.time.value,
        );

        if (Date.parse(proposedStart) <= Date.now()) {
            throw new Error("Choose a future time.");
        }

        await answerRequest("propose", proposedStart);
    } catch (error) {
        message("review-error", error.message);
    }
});

for (const [id, event] of [["request-search", "input"], ["request-status", "change"]]) {
    byId(id).addEventListener(event, () => {
        requestsPage = 0;
        renderRequests();
    });
}

for (const [id, event] of [["history-search", "input"], ["history-type", "change"]]) {
    byId(id).addEventListener(event, () => {
        historyPage = 0;
        renderHistory();
    });
}

byId("requests-prev").addEventListener("click", () => {
    requestsPage -= 1;
    renderRequests();
});

byId("requests-next").addEventListener("click", () => {
    requestsPage += 1;
    renderRequests();
});

byId("history-prev").addEventListener("click", () => {
    historyPage -= 1;
    renderHistory();
});

byId("history-next").addEventListener("click", () => {
    historyPage += 1;
    renderHistory();
});

byId("refresh-overview").addEventListener("click", refreshOverview);
byId("refresh-requests").addEventListener("click", loadRequests);
byId("refresh-history").addEventListener("click", loadHistory);

byId("teacher-logout-button").addEventListener("click", async (event) => {
    event.currentTarget.disabled = true;

    try {
        await logoutUser();
    } finally {
        window.location.replace("/index.html");
    }
});

async function start() {
    if (!token) {
        window.location.replace("/teacher-login.html");
        return;
    }

    let user;

    try {
        user = await getProfile();
    } catch (error) {
        setText("teacher-startup-message", "Could not sign you in. " + error.message);
        return;
    }

    if (user.role !== "teacher") {
        window.location.replace(
            user.role === "student" ? "/student.html" : "/teacher-login.html",
        );
        return;
    }

    setText("teacher-name", user.full_name || "Teacher");

    const now = new Date();
    setText("today-label", `${weekdayFormat.format(now)} · ${dateText(now)}`);

    renderRequests();

    byId("teacher-startup").hidden = true;
    byId("teacher-dashboard").hidden = false;

    await refreshOverview();
}

await start();