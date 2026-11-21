// Built-in reference set of ISRO missions and launch vehicles.
// Facts are drawn from public ISRO mission records. Update when new missions fly.

export type MissionStatus = "Success" | "Active" | "Completed" | "Partial" | "Planned";

export type SpaceMission = {
  name: string;
  vehicle: string;
  launchDate: string;
  type: string;
  status: MissionStatus;
  orbit: string;
  celestrakName?: string;
  summary: string;
};

export const SPACE_MISSIONS: SpaceMission[] = [
  {
    name: "Chandrayaan-3",
    vehicle: "LVM3-M4",
    launchDate: "2023-07-14",
    type: "Lunar lander and rover",
    status: "Success",
    orbit: "Lunar surface, near the south pole",
    summary:
      "Chandrayaan-3 launched on 14 July 2023 from Satish Dhawan Space Centre, Sriharikota. The Vikram lander touched down near the lunar south pole on 23 August 2023, making India the first nation to land in that region. The Pragyan rover traversed the surface and its instruments confirmed sulphur in the lunar soil.",
  },
  {
    name: "Aditya-L1",
    vehicle: "PSLV-C57",
    launchDate: "2023-09-02",
    type: "Solar observatory",
    status: "Active",
    orbit: "Halo orbit around Sun-Earth Lagrange point L1",
    summary:
      "Aditya-L1 is India's first space-based solar observatory. Launched on 2 September 2023 by PSLV-C57, it was inserted into a halo orbit around the Sun-Earth L1 point, about 1.5 million km from Earth, on 6 January 2024. It carries seven payloads including the VELC coronagraph and the SUIT ultraviolet imager.",
  },
  {
    name: "Mars Orbiter Mission (Mangalyaan)",
    vehicle: "PSLV-C25",
    launchDate: "2013-11-05",
    type: "Mars orbiter",
    status: "Completed",
    orbit: "Elliptical Mars orbit",
    summary:
      "The Mars Orbiter Mission launched on 5 November 2013 on PSLV-C25 and entered Mars orbit on 24 September 2014, making ISRO the first agency to reach Mars orbit on its first attempt. Designed for six months, it operated for about eight years until communication was lost in 2022.",
  },
  {
    name: "Chandrayaan-2",
    vehicle: "GSLV Mk III-M1",
    launchDate: "2019-07-22",
    type: "Lunar orbiter, lander and rover",
    status: "Partial",
    orbit: "100 km polar lunar orbit",
    summary:
      "Chandrayaan-2 launched on 22 July 2019. Its orbiter continues to operate in lunar polar orbit with high-resolution cameras. The Vikram lander lost contact during descent on 6 September 2019 and crash-landed.",
  },
  {
    name: "Chandrayaan-1",
    vehicle: "PSLV-C11",
    launchDate: "2008-10-22",
    type: "Lunar orbiter",
    status: "Completed",
    orbit: "100 km polar lunar orbit",
    summary:
      "Chandrayaan-1, India's first lunar probe, launched on 22 October 2008. Its Moon Mineralogy Mapper instrument helped detect water molecules on the lunar surface. The mission ended in August 2009.",
  },
  {
    name: "Gaganyaan",
    vehicle: "HLVM3 (human-rated LVM3)",
    launchDate: "Planned",
    type: "Human spaceflight",
    status: "Planned",
    orbit: "Low Earth orbit, about 400 km",
    summary:
      "Gaganyaan is India's human spaceflight programme, aiming to carry astronauts to low Earth orbit on a human-rated LVM3. Uncrewed test flights precede the first crewed mission.",
  },
  {
    name: "INSAT-3D",
    vehicle: "Ariane 5 VA214",
    launchDate: "2013-07-26",
    type: "Meteorological satellite",
    status: "Active",
    orbit: "Geostationary, 82 degrees East",
    celestrakName: "INSAT-3D",
    summary:
      "INSAT-3D is an advanced geostationary weather satellite launched on 26 July 2013. It carries a six-channel imager and a nineteen-channel sounder for atmospheric temperature and humidity profiles, plus data relay and search-and-rescue transponders. Its data is distributed through MOSDAC.",
  },
  {
    name: "INSAT-3DR",
    vehicle: "GSLV-F05",
    launchDate: "2016-09-08",
    type: "Meteorological satellite",
    status: "Active",
    orbit: "Geostationary, 74 degrees East",
    celestrakName: "INSAT-3DR",
    summary:
      "INSAT-3DR launched on 8 September 2016 on GSLV-F05. It follows the INSAT-3D design with an imager and sounder, and operates in tandem with INSAT-3D so imaging can be staggered for more frequent observations.",
  },
  {
    name: "INSAT-3DS",
    vehicle: "GSLV-F14",
    launchDate: "2024-02-17",
    type: "Meteorological satellite",
    status: "Active",
    orbit: "Geostationary",
    celestrakName: "INSAT-3DS",
    summary:
      "INSAT-3DS launched on 17 February 2024 on GSLV-F14 as the follow-on meteorological satellite in the INSAT-3D series, funded by the Ministry of Earth Sciences.",
  },
  {
    name: "Oceansat-3 (EOS-06)",
    vehicle: "PSLV-C54",
    launchDate: "2022-11-26",
    type: "Ocean observation",
    status: "Active",
    orbit: "Sun-synchronous polar orbit",
    celestrakName: "EOS-06",
    summary:
      "EOS-06 (Oceansat-3) launched on 26 November 2022 and carries an Ocean Colour Monitor, sea surface temperature monitor and Ku-band scatterometer for ocean and wind observation.",
  },
  {
    name: "SCATSAT-1",
    vehicle: "PSLV-C35",
    launchDate: "2016-09-26",
    type: "Ocean wind scatterometer",
    status: "Completed",
    orbit: "Sun-synchronous polar orbit, about 720 km",
    summary:
      "SCATSAT-1 launched on 26 September 2016 carrying a Ku-band scatterometer to provide ocean surface wind vectors for weather forecasting and cyclone detection.",
  },
  {
    name: "Megha-Tropiques",
    vehicle: "PSLV-C18",
    launchDate: "2011-10-12",
    type: "Tropical climate research (ISRO-CNES)",
    status: "Completed",
    orbit: "Low inclination orbit, 20 degrees",
    summary:
      "Megha-Tropiques, a joint ISRO-CNES mission launched on 12 October 2011, studied the tropical water cycle and energy budget. It was deorbited in a controlled re-entry in March 2023.",
  },
  {
    name: "SARAL",
    vehicle: "PSLV-C20",
    launchDate: "2013-02-25",
    type: "Ocean altimetry (ISRO-CNES)",
    status: "Active",
    orbit: "Sun-synchronous orbit, about 800 km",
    celestrakName: "SARAL",
    summary:
      "SARAL launched on 25 February 2013 carrying the Ka-band AltiKa altimeter to measure sea surface height, supporting ocean circulation and sea level studies.",
  },
  {
    name: "Cartosat-3",
    vehicle: "PSLV-C47",
    launchDate: "2019-11-27",
    type: "Earth observation (optical)",
    status: "Active",
    orbit: "Sun-synchronous orbit, 509 km",
    celestrakName: "CARTOSAT-3",
    summary:
      "Cartosat-3 launched on 27 November 2019 and provides very high resolution optical imagery with a panchromatic resolution of about 0.25 m for mapping and urban planning.",
  },
  {
    name: "RISAT-2B",
    vehicle: "PSLV-C46",
    launchDate: "2019-05-22",
    type: "Radar imaging (SAR)",
    status: "Active",
    orbit: "Low Earth orbit, 555 km, 37 degrees",
    celestrakName: "RISAT-2B",
    summary:
      "RISAT-2B launched on 22 May 2019 with an X-band synthetic aperture radar that images day and night through cloud, supporting agriculture, forestry and disaster management.",
  },
  {
    name: "AstroSat",
    vehicle: "PSLV-C30",
    launchDate: "2015-09-28",
    type: "Multi-wavelength space observatory",
    status: "Active",
    orbit: "Low Earth orbit, 650 km, 6 degrees",
    celestrakName: "ASTROSAT",
    summary:
      "AstroSat, India's first dedicated astronomy observatory, launched on 28 September 2015 and observes simultaneously in ultraviolet, optical and X-ray bands.",
  },
  {
    name: "XPoSat",
    vehicle: "PSLV-C58",
    launchDate: "2024-01-01",
    type: "X-ray polarimetry observatory",
    status: "Active",
    orbit: "Low Earth orbit, about 650 km",
    celestrakName: "XPOSAT",
    summary:
      "XPoSat launched on 1 January 2024 to study the polarisation of X-rays from bright astronomical sources such as black holes and neutron stars.",
  },
  {
    name: "EOS-08",
    vehicle: "SSLV-D3",
    launchDate: "2024-08-16",
    type: "Earth observation microsatellite",
    status: "Active",
    orbit: "Low Earth orbit, 475 km",
    celestrakName: "EOS-08",
    summary:
      "EOS-08 launched on 16 August 2024 on the third developmental flight of the Small Satellite Launch Vehicle, which completed SSLV development. It carries an infrared payload, a GNSS reflectometry payload and a UV dosimeter.",
  },
  {
    name: "SpaDeX",
    vehicle: "PSLV-C60",
    launchDate: "2024-12-30",
    type: "Space docking experiment",
    status: "Success",
    orbit: "Low Earth orbit, about 475 km",
    summary:
      "SpaDeX launched two small spacecraft on 30 December 2024 to demonstrate rendezvous and docking. Docking was achieved on 16 January 2025, making India the fourth country to dock spacecraft in orbit.",
  },
  {
    name: "NVS-02",
    vehicle: "GSLV-F15",
    launchDate: "2025-01-29",
    type: "Navigation satellite (NavIC)",
    status: "Partial",
    orbit: "Geosynchronous transfer orbit",
    summary:
      "NVS-02 launched on 29 January 2025 on GSLV-F15, the 100th launch from Sriharikota. The launch was successful but orbit raising could not be completed because a valve in the satellite's propulsion system did not open.",
  },
  {
    name: "NISAR",
    vehicle: "GSLV-F16",
    launchDate: "2025-07-30",
    type: "Radar Earth observation (NASA-ISRO)",
    status: "Active",
    orbit: "Sun-synchronous orbit, about 747 km",
    celestrakName: "NISAR",
    summary:
      "NISAR is a joint NASA-ISRO mission launched on 30 July 2025. It carries L-band and S-band synthetic aperture radars to map changes in land, ice and ecosystems across the globe.",
  },
];

export type LaunchVehicle = {
  id: string;
  name: string;
  leoKg: number;
  ssoKg: number;
  gtoKg: number;
  note: string;
};

// Payload capacities are published nominal values.
export const LAUNCH_VEHICLES: LaunchVehicle[] = [
  { id: "pslv", name: "PSLV-XL", leoKg: 3800, ssoKg: 1750, gtoKg: 1425, note: "Four-stage workhorse, SSO at 600 km" },
  { id: "gslv", name: "GSLV Mk II", leoKg: 6000, ssoKg: 3000, gtoKg: 2250, note: "Indigenous cryogenic upper stage" },
  { id: "lvm3", name: "LVM3 (GSLV Mk III)", leoKg: 8000, ssoKg: 4000, gtoKg: 4000, note: "ISRO heavy lift, human-rating in progress" },
  { id: "sslv", name: "SSLV", leoKg: 500, ssoKg: 300, gtoKg: 0, note: "Small satellites to 500 km LEO" },
  { id: "falcon9", name: "Falcon 9 (expendable)", leoKg: 22800, ssoKg: 15000, gtoKg: 8300, note: "SpaceX partially reusable launcher" },
];

export function missionToText(m: SpaceMission) {
  return `${m.name}. Launch vehicle: ${m.vehicle}. Launch date: ${m.launchDate}. Mission type: ${m.type}. Status: ${m.status}. Orbit: ${m.orbit}. ${m.summary}`;
}

export function vehicleToText(v: LaunchVehicle) {
  return `${v.name} launch vehicle. Payload capacity: ${v.leoKg} kg to low Earth orbit, ${v.ssoKg} kg to sun-synchronous orbit${v.gtoKg ? `, ${v.gtoKg} kg to geosynchronous transfer orbit` : ", not used for GTO"}. ${v.note}.`;
}
