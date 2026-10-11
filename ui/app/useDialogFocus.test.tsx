import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, expect, test } from "vitest";
import { useDialogFocus } from "./useDialogFocus.js";

afterEach(cleanup);

function Sheet({ onClose }: { onClose: () => void }) {
  const title = useDialogFocus<HTMLHeadingElement>(true, { isModal: true });
  return createPortal(
    <section role="dialog" aria-labelledby="sheet-title">
      <h2 id="sheet-title" ref={title} tabIndex={-1}>
        Folha
      </h2>
      <button onClick={onClose}>Fechar</button>
    </section>,
    document.body,
  );
}

function WithSheet() {
  const [isOpen, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      {isOpen && <Sheet onClose={() => setOpen(false)} />}
    </>
  );
}

function WithConfirm() {
  const [isOpen, setOpen] = useState(false);
  const start = useRef<HTMLButtonElement>(null);
  const title = useDialogFocus<HTMLParagraphElement>(isOpen, { returnTo: start });
  return isOpen ? (
    <div role="alertdialog" aria-labelledby="confirm-title">
      <p id="confirm-title" ref={title} tabIndex={-1}>
        Substituir?
      </p>
      <button onClick={() => setOpen(false)}>Voltar</button>
    </div>
  ) : (
    <button ref={start} onClick={() => setOpen(true)}>
      Começar
    </button>
  );
}

test("opening a dialog moves focus to its title, and closing it gives focus back to the button that opened it", async () => {
  render(<WithSheet />);
  const opener = screen.getByRole("button", { name: "Abrir" });
  await userEvent.click(opener);
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Folha" }));
  await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
  expect(document.activeElement).toBe(opener);
});

test("while a modal sheet is open the screen behind it is inert", async () => {
  const { container } = render(<WithSheet />);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  expect(container.hasAttribute("inert")).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Fechar" }));
  expect(container.hasAttribute("inert")).toBe(false);
});

test("a dialog that takes the place of its button gives focus back to the button that returns", async () => {
  render(<WithConfirm />);
  await userEvent.click(screen.getByRole("button", { name: "Começar" }));
  expect(document.activeElement).toBe(screen.getByText("Substituir?"));
  await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Começar" }));
});
