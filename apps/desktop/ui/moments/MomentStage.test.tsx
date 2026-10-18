import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { Cue } from "../sound/soundCatalog.js";
import { SILENT_SOUND, withCueLog } from "../sound/soundEngine.js";
import { SoundProvider } from "../sound/SoundProvider.js";
import { MomentStage, useCueAt } from "./MomentStage.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function Scene() {
  useCueAt("title", 300);
  useCueAt("comeback", 900);
  return <p>Campeão</p>;
}

function openMoment(isReduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: isReduced && query.includes("reduce") }));
  const heard: Cue[] = [];
  render(
    <SoundProvider engine={withCueLog(SILENT_SOUND, heard)} store={localStorage}>
      <MomentStage durationMs={1200} backdrop="#000" tone="dark" label="Título" className="mo-test" actions={<button>Continuar</button>}>
        <Scene />
      </MomentStage>
    </SoundProvider>,
  );
  return heard;
}

test("with less motion a moment shows its last frame at once and still plays its sounds on their beats", async () => {
  vi.useFakeTimers();
  const heard = openMoment(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByRole("button", { name: "Continuar" })).toBeTruthy();
  expect(heard).toEqual([]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
  expect(heard).toEqual(["title"]);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
  expect(heard).toEqual(["title", "comeback"]);
});

test("a moment skipped before its sounds stays quiet", async () => {
  const heard = openMoment(false);
  await userEvent.click(await screen.findByRole("button", { name: /Pular/ }));
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(heard.filter((cue) => cue !== "click")).toEqual([]);
});
