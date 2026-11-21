import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchSatelliteOrbit, fetchUpcomingLaunches } from "./space-live.server";

export const getUpcomingLaunches = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return { launches: await fetchUpcomingLaunches(8), error: null as string | null };
  } catch (error) {
    console.error(error);
    return { launches: [], error: "Live launch data is unavailable right now." };
  }
});

export const getSatelliteOrbit = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ name: z.string().min(2).max(40) }).parse(data))
  .handler(async ({ data }) => {
    try {
      return { orbit: await fetchSatelliteOrbit(data.name), error: null as string | null };
    } catch (error) {
      console.error(error);
      return { orbit: null, error: "Live orbit data is unavailable right now." };
    }
  });
