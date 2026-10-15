import type { ReactElement } from "react";
import { Navigate, type RouteObject } from "react-router";
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
import { Stadium } from "../screens/Stadium.js";
import { Saves } from "../screens/Saves.js";
import { SeasonEnd } from "../screens/SeasonEnd.js";
import { Player } from "../screens/Player.js";
import { StartMenu } from "../screens/StartMenu.js";
import { Tables } from "../screens/Tables.js";
import { Turn } from "../screens/Turn.js";
import { SCREEN_PATHS, type ScreenPath } from "./screens.js";
import { Shell } from "./Shell.js";

const ELEMENTS: Record<ScreenPath, ReactElement> = {
  "/": <StartMenu />,
  "/new-game": <NewGame />,
  "/hub": <Hub />,
  "/tables": <Tables />,
  "/market": <Market />,
  "/finances": <Finances />,
  "/stadium": <Stadium />,
  "/calendar": <Calendar />,
  "/round": <Round />,
  "/history": <History />,
  "/season-end": <SeasonEnd />,
  "/offers": <Offers />,
  "/sacked": <Sacked />,
  "/options": <Options />,
  "/saves": <Saves />,
  "/turn": <Turn />,
};

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      ...SCREEN_PATHS.map((path) => ({ path, element: ELEMENTS[path] })),
      // The squad lives on the club screen now; the old address still leads to it.
      { path: "/squad", element: <Navigate to="/hub" replace /> },
      { path: "/squad/:playerId", element: <Player /> },
    ],
  },
];
