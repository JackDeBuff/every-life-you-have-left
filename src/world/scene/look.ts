import { createContext, useContext, type MutableRefObject } from "react";
import { lookFor, type Look } from "../palette";

/** The current (blending) look; components read it every frame. */
export const LookCtx = createContext<MutableRefObject<Look>>({
  current: lookFor({ season: "summer", timeOfDay: "day", weather: "clear", mood: "calm", flavor: "us_south" }),
});
export const useLookRef = () => useContext(LookCtx);
