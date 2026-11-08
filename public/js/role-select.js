const roleCards = document.querySelectorAll(".role-card");

roleCards.forEach((card) => {
    card.addEventListener("click", () => {
        const selectedRole = card.dataset.role;

        if (selectedRole) {
            sessionStorage.setItem(
                "campusconnect_selected_role",
                selectedRole
            );
        }
    });
});