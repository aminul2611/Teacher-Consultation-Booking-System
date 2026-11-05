const studentTab = document.getElementById("student-tab");
const teacherTab = document.getElementById("teacher-tab");
const studentPanel = document.getElementById("student-panel");
const teacherPanel = document.getElementById("teacher-panel");

function showPanel(selectedRole) {
    const showStudent = selectedRole === "student";

    studentPanel.hidden = !showStudent;
    teacherPanel.hidden = showStudent;

    studentTab.classList.toggle("active", showStudent);
    teacherTab.classList.toggle("active", !showStudent);

    studentTab.setAttribute("aria-selected", String(showStudent));
    teacherTab.setAttribute("aria-selected", String(!showStudent));
}

studentTab.addEventListener("click", () => {
    showPanel("student");
});

teacherTab.addEventListener("click", () => {
    showPanel("teacher");
});