import type { ReactElement } from "react";
import type { RouteObject } from "react-router";
import { Calendar } from "../screens/Calendar.js";
import { Finances } from "../screens/Finances.js";
import { History } from "../screens/History.js";
import { Hub } from "../screens/Hub.js";
import { Market } from "../screens/Market.js";
import { NewGame } from "../screens/NewGame.js";
import { Offers } from "../screens/Offers.js";
import { Options } from "../screens/Options.js";
import { Round } from "../screens/Round.js";
import { Sacked } from "../screens/Sacked.js";
import { SeasonEnd } from "../screens/SeasonEnd.js";
import { Player } from "../screens/Player.js";
import { Squad } from "../screens/Squad.js";
import { StartMenu } from "../screens/StartMenu.js";
import { Tables } from "../screens/Tables.js";
import { SCREENS, type ScreenPath } from "./screens.js";
import { Shell } from "./Shell.js";

const ELEMENTS: Record<ScreenPath, ReactElement> = {
  "/": <StartMenu />,
  "/new-game": <NewGame />,
  "/hub": <Hub />,
  "/tables": <Tables />,
  "/squad": <Squad />,
  "/market": <Market />,
  "/finances": <Finances />,
  "/calendar": <Calendar />,
  "/round": <Round />,
  "/history": <History />,
  "/season-end": <SeasonEnd />,
};

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      ...SCREENS.map(({ path }) => ({ path, element: ELEMENTS[path] })),
      { path: "/squad/:playerId", element: <Player /> },
      { path: "/offers", element: <Offers /> },
      { path: "/sacked", element: <Sacked /> },
      { path: "/options", element: <Options /> },
    ],
  },
];
