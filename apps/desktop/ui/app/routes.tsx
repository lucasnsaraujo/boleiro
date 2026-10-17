import type { ReactElement } from "react";
import { Navigate, type RouteObject } from "react-router";
import { Assistant } from "../screens/Assistant.js";
import { Awards } from "../screens/Awards.js";
import { Calendar } from "../screens/Calendar.js";
import { Chemistry } from "../screens/Chemistry.js";
import { Club } from "../screens/Club.js";
import { Coaches } from "../screens/Coaches.js";
import { Finances } from "../screens/Finances.js";
import { History } from "../screens/History.js";
import { Hub } from "../screens/Hub.js";
import { Market } from "../screens/Market.js";
import { NationalTeam } from "../screens/NationalTeam.js";
import { NewGame } from "../screens/NewGame.js";
import { Newspaper } from "../screens/Newspaper.js";
import { Offers } from "../screens/Offers.js";
import { Options } from "../screens/Options.js";
import { Round } from "../screens/Round.js";
import { Sacked } from "../screens/Sacked.js";
import { Sponsors } from "../screens/Sponsors.js";
import { Stadium } from "../screens/Stadium.js";
import { Saves } from "../screens/Saves.js";
import { SeasonEnd } from "../screens/SeasonEnd.js";
import { Player } from "../screens/Player.js";
import { StartMenu } from "../screens/StartMenu.js";
import { Tables } from "../screens/Tables.js";
import { Youth } from "../screens/Youth.js";
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
  "/youth": <Youth />,
  "/calendar": <Calendar />,
  "/round": <Round />,
  "/history": <History />,
  "/season-end": <SeasonEnd />,
  "/offers": <Offers />,
  "/coaches": <Coaches />,
  "/sacked": <Sacked />,
  "/options": <Options />,
  "/saves": <Saves />,
  "/turn": <Turn />,
  "/newspaper": <Newspaper />,
  "/chemistry": <Chemistry />,
  "/sponsors": <Sponsors />,
  "/awards": <Awards />,
  "/assistant": <Assistant />,
  "/national-team": <NationalTeam />,
};

export const routes: RouteObject[] = [
  {
    element: <Shell />,
    children: [
      ...SCREEN_PATHS.map((path) => ({ path, element: ELEMENTS[path] })),
      // The squad lives on the club screen now; the old address still leads to it.
      { path: "/squad", element: <Navigate to="/hub" replace /> },
      { path: "/squad/:playerId", element: <Player /> },
      { path: "/club/:clubId", element: <Club /> },
    ],
  },
];
