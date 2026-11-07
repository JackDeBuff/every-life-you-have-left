/** "Alex's life": hand-written SceneSpecs for the lab autoplay (Durham -> Singapore -> Lisbon -> coast -> home). */
import type { InterludeCut } from "../../shared/engine";
import type { SceneSpec } from "../../shared/sim";

type P = SceneSpec["people"];
const self = (b: P[number]["ageBand"]): P[number] => ({ role: "self", ageBand: b });

export interface AlexYear {
  year: number;
  age: number;
  spec: SceneSpec;
}

const S = (s: Partial<SceneSpec> & Pick<SceneSpec, "setting" | "flavor" | "placeLabel" | "home" | "activity" | "people" | "caption">): SceneSpec => ({
  season: "summer",
  timeOfDay: "day",
  weather: "clear",
  mood: "calm",
  moment: null,
  ...s,
});

const DURHAM = { setting: "city_midrise", flavor: "us_south", placeLabel: "Durham, NC" } as const;
const SINGAPORE = { setting: "city_dense", flavor: "southeast_asia", placeLabel: "Singapore" } as const;
const LISBON = { setting: "city_midrise", flavor: "europe_south", placeLabel: "Lisbon, Portugal" } as const;
const COAST = { setting: "coastal", flavor: "europe_south", placeLabel: "Ericeira, Portugal" } as const;
const HOME = { setting: "suburb", flavor: "us_south", placeLabel: "Chapel Hill, NC" } as const;

export const ALEX: AlexYear[] = [
  { year: 2026, age: 24, spec: S({ ...DURHAM, home: "apartment_small", activity: "job_hunting", people: [self("young_adult")], season: "autumn", timeOfDay: "golden", mood: "tense", caption: "Applications, late afternoons" }) },
  { year: 2027, age: 25, spec: S({ ...DURHAM, home: "apartment_small", activity: "office_work", people: [self("young_adult"), { role: "colleague", ageBand: "adult" }, { role: "colleague", ageBand: "young_adult" }], season: "spring", mood: "bright", moment: "new_job", caption: "First real job" }) },
  { year: 2028, age: 26, spec: S({ ...DURHAM, home: "apartment_small", activity: "socializing", people: [self("young_adult"), { role: "partner", ageBand: "young_adult" }, { role: "friend", ageBand: "young_adult" }, { role: "friend", ageBand: "young_adult" }], timeOfDay: "golden", mood: "joyful", caption: "Friday nights on Main Street" }) },
  { year: 2029, age: 27, spec: S({ ...SINGAPORE, home: "apartment", activity: "moving", people: [self("young_adult"), { role: "partner", ageBand: "young_adult" }], weather: "cloudy", mood: "bright", moment: "travel_abroad", caption: "Took Singapore" }) },
  { year: 2030, age: 28, spec: S({ ...SINGAPORE, home: "apartment", activity: "office_work", people: [self("young_adult"), { role: "colleague", ageBand: "adult" }, { role: "colleague", ageBand: "young_adult" }], timeOfDay: "night", weather: "rain", mood: "tense", moment: "promotion", caption: "Promoted, working late" }) },
  { year: 2031, age: 29, spec: S({ ...SINGAPORE, home: "apartment", activity: "commuting", people: [self("young_adult")], timeOfDay: "dawn", mood: "calm", caption: "The 7:40 to Raffles Place" }) },
  { year: 2032, age: 30, spec: S({ ...SINGAPORE, home: "apartment", activity: "celebrating", people: [self("adult"), { role: "partner", ageBand: "adult" }, { role: "friend", ageBand: "adult" }, { role: "parent", ageBand: "senior" }], timeOfDay: "golden", mood: "joyful", moment: "wedding", caption: "Married at thirty" }) },
  { year: 2034, age: 32, spec: S({ ...LISBON, home: "townhouse", activity: "moving", people: [self("adult"), { role: "partner", ageBand: "adult" }], season: "spring", mood: "bright", moment: "house_keys", caption: "Keys to a house in Lisbon" }) },
  { year: 2035, age: 33, spec: S({ ...LISBON, home: "townhouse", activity: "family_time", people: [self("adult"), { role: "partner", ageBand: "adult" }, { role: "child", ageBand: "baby" }], timeOfDay: "golden", mood: "joyful", moment: "new_baby", caption: "Maya is born" }) },
  { year: 2037, age: 35, spec: S({ ...LISBON, home: "townhouse", activity: "studio_creating", people: [self("adult"), { role: "child", ageBand: "child" }, { role: "pet", ageBand: "adult" }], season: "autumn", timeOfDay: "golden", caption: "Painting again, weekends" }) },
  { year: 2040, age: 38, spec: S({ ...LISBON, home: "townhouse", activity: "family_time", people: [self("adult"), { role: "partner", ageBand: "adult" }, { role: "child", ageBand: "child" }, { role: "pet", ageBand: "adult" }], season: "winter", timeOfDay: "night", weather: "rain", caption: "Rainy winter evenings in" }) },
  { year: 2045, age: 43, spec: S({ ...LISBON, home: "townhouse", activity: "job_hunting", people: [self("adult"), { role: "pet", ageBand: "adult" }], season: "autumn", weather: "fog", mood: "heavy", moment: "layoff", caption: "Laid off at forty-three" }) },
  { year: 2047, age: 45, spec: S({ ...COAST, home: "house", activity: "studio_creating", people: [self("middle"), { role: "partner", ageBand: "middle" }], timeOfDay: "golden", mood: "bright", moment: "first_show", caption: "First show, by the sea" }) },
  { year: 2054, age: 52, spec: S({ ...COAST, home: "house", activity: "caregiving", people: [self("middle"), { role: "parent", ageBand: "senior" }, { role: "partner", ageBand: "middle" }], season: "winter", timeOfDay: "dawn", weather: "cloudy", mood: "heavy", moment: "caregiving_start", caption: "Mom moves in" }) },
  { year: 2062, age: 60, spec: S({ ...HOME, home: "house_large", activity: "family_time", people: [self("senior"), { role: "partner", ageBand: "senior" }, { role: "child", ageBand: "young_adult" }, { role: "pet", ageBand: "adult" }], timeOfDay: "golden", mood: "joyful", moment: "reunion", caption: "Back near Durham, Maya visits" }) },
  { year: 2066, age: 64, spec: S({ ...HOME, home: "house_large", activity: "celebrating", people: [self("senior"), { role: "partner", ageBand: "senior" }, { role: "friend", ageBand: "senior" }, { role: "friend", ageBand: "middle" }], season: "autumn", timeOfDay: "golden", mood: "joyful", moment: "retirement", caption: "Retired, with a cake" }) },
  { year: 2071, age: 69, spec: S({ ...HOME, home: "house_large", activity: "resting", people: [self("senior"), { role: "partner", ageBand: "senior" }, { role: "pet", ageBand: "senior" }], season: "spring", mood: "calm", caption: "Seventy, almost" }) },
];

export const DEMO_CUTS: InterludeCut[] = [
  { branchId: "b-stay", title: "Stayed in Durham", age: 35, caption: "Still in Durham, two kids, a porch", scene: S({ setting: "suburb", flavor: "us_south", placeLabel: "Durham, NC", home: "house", activity: "family_time", people: [self("adult"), { role: "partner", ageBand: "adult" }, { role: "child", ageBand: "child" }, { role: "child", ageBand: "child" }], timeOfDay: "golden", mood: "calm", caption: "Still in Durham" }) },
  { branchId: "b-alone", title: "Singapore, alone", age: 35, caption: "Director at 35, mostly at the office", scene: S({ setting: "city_dense", flavor: "southeast_asia", placeLabel: "Singapore", home: "apartment", activity: "office_work", people: [self("adult"), { role: "colleague", ageBand: "adult" }], timeOfDay: "night", weather: "rain", mood: "tense", caption: "Director at 35" }) },
  { branchId: "b-paint", title: "Quit to paint", age: 35, caption: "A studio in Kyoto, selling a few canvases", scene: S({ setting: "small_town", flavor: "east_asia", placeLabel: "Kyoto, Japan", home: "loft_studio", activity: "studio_creating", people: [self("adult"), { role: "pet", ageBand: "adult" }], season: "spring", timeOfDay: "day", mood: "bright", caption: "Painting in Kyoto" }) },
];
