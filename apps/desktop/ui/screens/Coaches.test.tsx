import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, test } from "vitest";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { Coaches, personInitials } from "./Coaches.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  for (const close of closers.splice(0)) close();
});

async function gameAt(clubId: string): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: clubId } });
  return { engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function openCoaches(given: Services, entry = "/coaches") {
  const router = createMemoryRouter(
    [
      { path: "/coaches", element: <Coaches /> },
      { path: "/offers", element: <p>Propostas abertas</p> },
    ],
    { initialEntries: [entry] },
  );
  render(
    <ServicesContext value={given}>
      <RouterProvider router={router} />
    </ServicesContext>,
  );
}

test("a person's initials are the first letters of the first and last names", () => {
  expect(personInitials("Abel Ferreira")).toBe("AF");
  expect(personInitials("Luiz Felipe Scolari")).toBe("LS");
  expect(personInitials("Tite")).toBe("TI");
});

test("before any season ends the rankings wait for it, and the profile shows the player at his club", async () => {
  openCoaches(await gameAt("bahia-ba"));
  expect(await screen.findByText("Ninguém no ranking ainda.")).toBeTruthy();
  const profile = screen.getByRole("complementary", { name: "Perfil de Tite" });
  expect(within(profile).getByText("no cargo")).toBeTruthy();
  await userEvent.click(screen.getByRole("tab", { name: "Ranking CBF" }));
  expect(screen.getByText("O ranking da CBF sai no fim da temporada.")).toBeTruthy();
});

test("resigning asks first, then leaves the coach without a club and shows the job his old club won't give him back", async () => {
  const given = await gameAt("bahia-ba");
  openCoaches(given);
  await userEvent.click(await screen.findByRole("button", { name: "Pedir demissão" }));
  // Club names take "o" or "a" and the game doesn't know which, so the copy names the club without an article.
  const question = screen.getByRole("alertdialog", { name: "Pedir demissão?" });
  expect(within(question).getByText(/Bahia não contrata você de novo até o fim de/)).toBeTruthy();
  await userEvent.click(within(question).getByRole("button", { name: "Continuar no cargo" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect((await given.engine.read(["coachClubId"])).coachClubId).toBe("bahia-ba");

  await userEvent.click(screen.getByRole("button", { name: "Pedir demissão" }));
  await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Pedir demissão" }));
  const jobs = await screen.findByRole("list", { name: "Vagas" });
  const bahia = within(jobs).getByText("Bahia").closest("li");
  expect(bahia && within(bahia).getByText("fora do alcance")).toBeTruthy();
  expect(bahia && within(bahia).getByText("não esqueceu sua saída")).toBeTruthy();
  expect(within(jobs).getByRole("button", { name: "Candidatar-se: Bahia" }).hasAttribute("disabled")).toBe(true);
  expect((await given.engine.read(["coachClubId"])).coachClubId).toBeNull();
  expect(screen.getByText(/Sem clube\./)).toBeTruthy();
});

test("applying for an open job the coach's name reaches puts the club's offer on the table", async () => {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId: "bahia-ba", hotSeat: { coachName: "Ana", otherCoaches: [{ name: "Bruno", clubId: "vitoria-ba" }] } } });
  await engine.apply({ type: "passTurn" });
  await engine.apply({ type: "resign" });
  await engine.apply({ type: "advance", days: [{}] });
  openCoaches({ engine, slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Ana" } } }, "/coaches?aba=vagas");
  await userEvent.click(await screen.findByRole("button", { name: "Candidatar-se: Vitória" }));
  expect((await screen.findByRole("status")).textContent).toContain("Vitória fez uma proposta");
  expect(await screen.findByRole("link", { name: "Proposta na mesa" })).toBeTruthy();
  const { coach } = await engine.read(["coach"]);
  expect(coach.offers.map((offer) => offer.clubId)).toContain("vitoria-ba");
});

test("after a season the ranking marks the coaches the game invented, and so does an invented coach's profile", async () => {
  const given = await gameAt("bahia-ba");
  await given.engine.apply({ type: "advance", days: Array.from({ length: 365 }, () => ({})) });
  const page = await given.engine.coaches();
  const invented = page.coaches.find((row) => row.isInvented);
  const real = page.coaches.find((row) => !row.isInvented && !row.isHuman);
  if (!invented || !real) throw new Error("the ranking has no invented or no real coach");
  openCoaches(given);
  const row = (name: string) => screen.getAllByRole("button", { name: new RegExp(name) })[0]?.closest("tr");
  await screen.findByRole("button", { name: new RegExp(invented.name) });
  expect(row(invented.name)?.textContent).toContain("fictício");
  expect(row(real.name)?.textContent).not.toContain("fictício");
  await userEvent.click(screen.getAllByRole("button", { name: new RegExp(invented.name) })[0] as HTMLElement);
  const profile = await screen.findByRole("complementary", { name: `Perfil de ${invented.name}` });
  expect(within(profile).getByText("fictício")).toBeTruthy();
}, 60_000);
