export interface AssignmentListPosition { top: number; id: string | null }

export const restoreAssignmentListFocus = (list: HTMLElement, position: AssignmentListPosition | null) => {
  const origin = position
    ? position.id === null ? list.querySelector<HTMLButtonElement>("[data-assignment-create]")
      : Array.from(list.querySelectorAll<HTMLButtonElement>("[data-assignment-open]")).find((button) => button.dataset.assignmentOpen === position.id)
    : null;
  const target = origin
    ?? list.querySelector<HTMLInputElement>('input[type="search"]')
    ?? list.querySelector<HTMLButtonElement>("[data-assignment-create]")
    ?? list.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')
    ?? list;

  if (origin && position) window.scrollTo({ top: position.top, behavior: "auto" });
  target.focus({ preventScroll: Boolean(origin) });
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
};
