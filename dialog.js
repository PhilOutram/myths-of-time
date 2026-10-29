// App-styled confirmation dialog (copied from Mech Attack), used instead of confirm().
// confirmDialog resolves true when the player chooses the confirm button, false otherwise.

export function confirmDialog({ title, text, confirm = "OK", cancel = "Cancel" }) {
  const overlay = document.getElementById("confirm-dialog");
  const yes = document.getElementById("confirm-yes");
  const no = document.getElementById("confirm-no");
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-text").textContent = text;
  yes.textContent = confirm;
  no.textContent = cancel;
  overlay.hidden = false;
  yes.focus();

  return new Promise((resolve) => {
    const close = (answer) => {
      overlay.hidden = true;
      yes.removeEventListener("click", onYes);
      no.removeEventListener("click", onNo);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      resolve(answer);
    };
    const onYes = () => close(true);
    const onNo = () => close(false);
    const onBackdrop = (e) => {
      if (e.target === overlay) close(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
    };
    yes.addEventListener("click", onYes);
    no.addEventListener("click", onNo);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
  });
}
