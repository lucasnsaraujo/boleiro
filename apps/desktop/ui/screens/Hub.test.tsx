import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { afterEach, expect, test } from "vitest";
import { routes } from "../app/routes.js";
import { ServicesContext, type Services } from "../app/ServicesContext.js";
import { Shell } from "../app/Shell.js";
import type { EngineClient } from "@boleiro/game-client/engine/connectEngine";
import type { CommandResults, CommandType, GameCommand, PlayResult } from "@boleiro/game-client/engine/createEngineSession";
import { inMemoryEngine } from "@boleiro/game-client/engine/inMemoryEngine";
import type { JobOffer } from "@boleiro/engine/sim/coach/coach";
import type { TurningPoint } from "@boleiro/game-client/hub/turningPoints";
import { indexedDbSlots } from "@boleiro/game-client/saves/indexedDbSlots";
import { unlockedFakeSound } from "../sound/fakeAudioContext.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { Hub } from "./Hub.js";
import { Player } from "./Player.js";

const closers: (() => void)[] = [];

afterEach(() => {
  cleanup();
  localStorage.clear();
  for (const close of closers.splice(0)) close();
});

async function services(coachClubId: string | null, change: (engine: EngineClient) => EngineClient = (engine) => engine): Promise<Services> {
  const { engine, close } = inMemoryEngine();
  closers.push(close);
  await engine.apply({ type: "newGame", seed: 7, choices: { coachClubId, careerMode: coachClubId === null } });
  return { engine: change(engine), slots: indexedDbSlots(new IDBFactory()), game: { current: { slotId: "slot-1", coachName: "Tite" } } };
}

function renderApp(given: Services, routeList: RouteObject[], at: string) {
  render(
    <ServicesContext value={given}>
      <SoundProvider engine={unlockedFakeSound().engine} store={localStorage}>
        <RouterProvider router={createMemoryRouter(routeList, { initialEntries: [at] })} />
      </SoundProvider>
    </ServicesContext>,
  );
}

/** The hub inside the shell, with the screens it leads to stubbed. */
function openHub(given: Services) {
  const stubs = [
    ["/round", "Rodada aberta"],
    ["/offers", "Propostas abertas"],
    ["/sacked", "Demissão aberta"],
    ["/season-end", "Fim de temporada aberto"],
    ["/moment", "Momento aberto"],
    ["/", "Início"],
  ];
  renderApp(
    given,
    [
      {
        element: <Shell />,
        children: [{ path: "/hub", element: <Hub /> }, { path: "/squad/:playerId", element: <Player /> }, ...stubs.map(([path, text]) => ({ path, element: <p>{text}</p> }))],
      },
    ],
    "/hub",
  );
}

async function firstMatchOf(engine: EngineClient, clubId: string): Promise<string> {
  const { fixtures } = await engine.read(["fixtures"]);
  return fixtures.filter((f) => f.homeId === clubId || f.awayId === clubId).map((f) => f.date).sort()[0] ?? "";
}

const squadTable = () => screen.findByRole("table", { name: "Elenco do Bahia" });

test("the hub shows the club, its next opponent and the coach's job security", async () => {
  const given = await services("bahia-ba");
  const { fixtures } = await given.engine.read(["fixtures"]);
  const first = fixtures.filter((f) => f.homeId === "bahia-ba" || f.awayId === "bahia-ba").toSorted((a, b) => a.date.localeCompare(b.date))[0];
  const opponentId = first?.homeId === "bahia-ba" ? first.awayId : first?.homeId;
  const { clubs } = await given.engine.read(["clubs"]);
  openHub(given);
  expect(await screen.findByRole("heading", { name: "Bahia" })).toBeTruthy();
  const next = screen.getByRole("region", { name: "Próximo jogo" });
  expect(within(next).getByRole("img", { name: clubs[opponentId ?? ""]?.shortName })).toBeTruthy();
  expect(within(next).getByText(/^Baiano · \d+ª rodada$/)).toBeTruthy();
  expect(screen.getByText("Estável")).toBeTruthy();
});

test("Jogar rodada plays on to the first match day and opens the live round", async () => {
  const given = await services("bahia-ba");
  const firstMatch = await firstMatchOf(given.engine, "bahia-ba");
  openHub(given);
  await userEvent.click(await screen.findByRole("button", { name: "Jogar rodada" }));
  await screen.findByText("Rodada aberta");
  expect(await given.engine.read(["date"])).toEqual({ date: firstMatch });
});

test("when a day stops the coach early, the hub stays, opens the paper on the news that stopped it, and the bar moves to the new day", async () => {
  const given = await services("bahia-ba", (engine) => {
    function apply<T extends CommandType>(command: GameCommand<T>): Promise<CommandResults[T]>;
    async function apply(command: GameCommand): Promise<unknown> {
      if (command.type !== "playToMatchDay") return engine.apply(command);
      const played = await engine.apply({ type: "advance", days: [{}] });
      return { date: played.date, stop: "jobOffer", daysPlayed: 1 } satisfies PlayResult;
    }
    return {
      ...engine,
      apply,
      inbox: async () => [{ date: "2026-01-01", text: "Vitória faz proposta: R$ 250 mil por mês até 2026", tone: "good" }],
    };
  });
  openHub(given);
  expect(screen.queryByRole("list", { name: "Notícias" })).toBeNull();
  await userEvent.click(await screen.findByRole("button", { name: "Jogar rodada" }));
  const inbox = await screen.findByRole("list", { name: "Notícias" });
  expect(await within(inbox).findByText("Vitória faz proposta: R$ 250 mil por mês até 2026")).toBeTruthy();
  expect(screen.queryByText("Rodada aberta")).toBeNull();
  expect(await within(screen.getByRole("navigation", { name: "Telas" })).findByText("Sex, 2 jan")).toBeTruthy();
});

test("the paper opens and closes from the dock", async () => {
  openHub(await services("bahia-ba"));
  const paper = await screen.findByRole("button", { name: /^Jornal/ });
  await userEvent.click(paper);
  expect(paper.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("Nada de novo por enquanto.")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Fechar o jornal" }));
  expect(screen.queryByText("Nada de novo por enquanto.")).toBeNull();
});

test("the open paper is a dialog named Jornal that takes focus and closes on Escape", async () => {
  openHub(await services("bahia-ba"));
  await userEvent.click(await screen.findByRole("button", { name: /^Jornal/ }));
  const paper = screen.getByRole("dialog", { name: "Jornal" });
  expect(document.activeElement).toBe(within(paper).getByRole("heading", { name: "Jornal" }));
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "Jornal" })).toBeNull();
});

test("a coach without a club waits for offers instead of playing a round", async () => {
  openHub(await services(null));
  expect(await screen.findByRole("heading", { name: "Sem clube" })).toBeTruthy();
  expect(screen.getByText(/propostas? na mesa/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Esperar propostas" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Próximo jogo" })).toBeNull();
});

test("with no game open the hub sends the coach back to the start", async () => {
  const given = await services("bahia-ba");
  given.game.current = null;
  openHub(given);
  expect(await screen.findByRole("heading", { name: "Nenhum jogo aberto" })).toBeTruthy();
});

test("a coach without a club opens the offers on the table from the hub", async () => {
  openHub(await services(null));
  await userEvent.click(await screen.findByRole("link", { name: "Ver propostas" }));
  expect(await screen.findByText("Propostas abertas")).toBeTruthy();
});

test("a coach with a club sees an offer on the table without leaving his round", async () => {
  const given = await services("bahia-ba");
  const save: { game: { coach: { offers: JobOffer[] } } } = JSON.parse(await given.engine.save());
  save.game.coach.offers.push({ clubId: "vitoria-ba", salary: 90_000, untilSeason: 2026, expiresOn: "2026-01-14" });
  await given.engine.apply({ type: "load", save: JSON.stringify(save) });
  openHub(given);
  expect(await screen.findByRole("link", { name: "1 proposta" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Jogar rodada" })).toBeTruthy();
});

test.each<[TurningPoint["kind"], string]>([
  ["fired", "Demissão aberta"],
  ["seasonEnd", "Fim de temporada aberto"],
])("a %s waiting sends the hub to its own screen", async (kind, opened) => {
  const point: TurningPoint =
    kind === "fired"
      ? { kind, firing: { type: "coachFired", clubId: "bahia-ba", date: "2026-06-10", isYou: true, position: 18, targetPosition: 10 } }
      : { kind, review: { season: 2026, clubId: null, placing: null, titles: [], continental: null, prizeMoney: 0, verdict: null, champions: {}, hasLostJob: false } };
  openHub(await services("bahia-ba", (engine) => ({ ...engine, turningPoint: async () => point })));
  expect(await screen.findByText(opened)).toBeTruthy();
});

test("a career moment waiting sends the hub to its scene, but only after the turning points", async () => {
  const given = await services("bahia-ba");
  await given.engine.apply({ type: "retireCoach" });
  openHub(given);
  expect(await screen.findByText("Momento aberto")).toBeTruthy();
  cleanup();
  const firing: TurningPoint = { kind: "fired", firing: { type: "coachFired", clubId: "bahia-ba", date: "2026-06-10", isYou: true, position: 18, targetPosition: 10 } };
  openHub({ ...given, engine: { ...given.engine, turningPoint: async () => firing } });
  expect(await screen.findByText("Demissão aberta")).toBeTruthy();
});

const columnOf = (table: HTMLElement, title: string) => within(table).getAllByRole("columnheader").findIndex((header) => header.textContent === title);
const valuesIn = (group: HTMLElement, column: number) =>
  within(group)
    .getAllByRole("row")
    .map((row) => Number(within(row).getAllByRole("cell")[column]?.textContent));

test("the squad on the hub is grouped by position, keepers first", async () => {
  openHub(await services("bahia-ba"));
  const table = await squadTable();
  const groups = within(table).getAllByRole("rowgroup").slice(1);
  expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Goleiros", "Defensores", "Meio-campistas", "Atacantes"]);
});

test("clicking a squad column sorts each group by it, and clicking again flips it", async () => {
  openHub(await services("bahia-ba"));
  const table = await squadTable();
  const age = within(table).getByRole("columnheader", { name: "Idade" });
  const column = columnOf(table, "Idade");
  expect(age.getAttribute("aria-sort")).toBe("none");
  await userEvent.click(within(age).getByRole("button"));
  expect(age.getAttribute("aria-sort")).toBe("ascending");
  const defenders = within(table).getAllByRole("rowgroup")[2];
  if (!defenders) throw new Error("no defenders");
  expect(valuesIn(defenders, column)).toEqual(valuesIn(defenders, column).toSorted((a, b) => a - b));
  await userEvent.click(within(age).getByRole("button"));
  expect(age.getAttribute("aria-sort")).toBe("descending");
  expect(valuesIn(defenders, column)).toEqual(valuesIn(defenders, column).toSorted((a, b) => b - a));
});

test("the strongest player is on the sticker at first, and a click on a row puts another there", async () => {
  openHub(await services("bahia-ba"));
  const table = await squadTable();
  const strength = columnOf(table, "F");
  const rows = within(table).getAllByRole("row").slice(1);
  const best = rows.toSorted((a, b) => Number(within(b).getAllByRole("cell")[strength]?.textContent) - Number(within(a).getAllByRole("cell")[strength]?.textContent))[0];
  const bestName = within(best ?? table).getByRole("link").textContent ?? "";
  expect(screen.getByRole("region", { name: `Jogador: ${bestName}` })).toBeTruthy();
  const other = rows.find((row) => row !== best);
  if (!other) throw new Error("no other player");
  await userEvent.click(within(other).getAllByRole("cell")[strength] ?? other);
  const otherName = within(other).getByRole("link").textContent ?? "";
  expect(await screen.findByRole("region", { name: `Jogador: ${otherName}` })).toBeTruthy();
  expect(other.getAttribute("aria-current")).toBe("true");
});

test("the squad takes the keyboard: Tab stops on the picked row, the arrows move the pick, Enter and Space pick the focused row", async () => {
  openHub(await services("bahia-ba"));
  const table = await squadTable();
  const rows = within(table).getAllByRole("row").slice(1);
  const nameOf = (row: HTMLElement | undefined) => (row ? (within(row).getByRole("link").textContent ?? "") : "");
  const picked = rows.find((row) => row.getAttribute("aria-current") === "true");
  expect(rows.filter((row) => row.tabIndex === 0)).toEqual([picked]);

  rows[0]?.focus();
  await userEvent.keyboard("{Enter}");
  expect(rows[0]?.getAttribute("aria-current")).toBe("true");
  await userEvent.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(rows[1]);
  expect(rows[1]?.getAttribute("aria-current")).toBe("true");
  expect(await screen.findByRole("region", { name: `Jogador: ${nameOf(rows[1])}` })).toBeTruthy();
  expect(rows.filter((row) => row.tabIndex === 0)).toEqual([rows[1]]);
  await userEvent.keyboard("{End}");
  expect(document.activeElement).toBe(rows.at(-1));
  await userEvent.keyboard("{ArrowDown}");
  expect(document.activeElement).toBe(rows.at(-1));
  await userEvent.keyboard("{Home}{ArrowUp}");
  expect(document.activeElement).toBe(rows[0]);
  expect(rows[0]?.getAttribute("aria-current")).toBe("true");

  rows[2]?.focus();
  expect(fireEvent.keyDown(rows[2] ?? table, { key: " " })).toBe(false);
  expect(rows[2]?.getAttribute("aria-current")).toBe("true");
});

test("a player's name opens his screen, where the coach can ask to renew or sell him, and Voltar comes back to the hub", async () => {
  openHub(await services("bahia-ba"));
  const [first] = within(await squadTable()).getAllByRole("link");
  if (!first) throw new Error("no player link");
  const name = first.textContent ?? "";
  await userEvent.click(first);
  expect(await screen.findByRole("heading", { name })).toBeTruthy();
  for (const action of ["Renovar", "Vender"]) expect(screen.getByRole("button", { name: action })).toHaveProperty("disabled", false);
  await userEvent.click(screen.getByRole("button", { name: "Voltar" }));
  expect(await squadTable()).toBeTruthy();
});

test("a new game's player screen lists his strength for this season", async () => {
  openHub(await services("bahia-ba"));
  const [first] = within(await squadTable()).getAllByRole("link");
  if (!first) throw new Error("no player link");
  await userEvent.click(first);
  const history = (await screen.findByRole("heading", { name: "Força por temporada" })).closest("section");
  if (!history) throw new Error("no strength history");
  const strength = screen.getByLabelText(/^Força \d+$/).getAttribute("aria-label")?.replace("Força ", "");
  expect(within(history).getAllByRole("listitem").map((item) => item.textContent)).toEqual([`2026${strength}`]);
});

test("the squad's old address opens the club screen, where the squad now lives", async () => {
  renderApp(await services("bahia-ba"), routes, "/squad");
  expect(await screen.findByRole("heading", { name: "Bahia" })).toBeTruthy();
  expect(await squadTable()).toBeTruthy();
});

test("a coach without a club has no squad", async () => {
  openHub(await services(null));
  expect(await screen.findByText("Sem clube, sem elenco.")).toBeTruthy();
});

test("a retired coach's hub says the career is over, plays on and links his trajectory", async () => {
  const given = await services("bahia-ba");
  await given.engine.apply({ type: "retireCoach" });
  await given.engine.apply({ type: "closeMoment" });
  openHub(given);
  expect(await screen.findByText(/Carreira encerrada\./)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Seguir o campeonato" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Ver a trajetória" })).toBeTruthy();
});
