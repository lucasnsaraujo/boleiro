import type { ReactElement } from "react";
import type { RouteObject } from "react-router";
import { Calendar } from "../screens/Calendar.js";
import { Finances } from "../screens/Finances.js";
import { Hub } from "../screens/Hub.js";
import { Market } from "../screens/Market.js";
import { NewGame } from "../screens/NewGame.js";
import { Placeholder } from "../screens/Placeholder.js";
import { Player } from "../screens/Player.js";
import { Squad } from "../screens/Squad.js";
import { StartMenu } from "../screens/StartMenu.js";
import { Tables } from "../screens/Tables.js";
import { SCREENS, type ScreenPath } from "./screens.js";
import { Shell } from "./Shell.js";

const BUILT: Partial<Record<ScreenPath, ReactElement>> = {
  "/": <StartMenu />,
  "/new-game": <NewGame />,
  "/hub": <Hub />,
  "/tables": <Tables />,
  "/squad": <Squad />,
  "/market": <Market />,
  "/finances": <Finances />,
  "/calendar": <Calendar />,
};

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      ...SCREENS.map(({ path, title }) => ({ path, element: BUILT[path] ?? <Placeholder title={title} /> })),
      { path: "/squad/:playerId", element: <Player /> },
      { path: "/options", element: <Placeholder title="Opções" back={{ to: "/", label: "Voltar ao início" }} /> },
    ],
  },
];
