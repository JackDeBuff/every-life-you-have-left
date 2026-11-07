/**
 * The curated CC0 asset catalog for the 3D world (docs/WORLD.md, ASSETS.md).
 * Each kit becomes one compressed GLB in public/world/, lazy-loaded by the settings that need it.
 * `src` paths are relative to scripts/assets/raw/<pack>/x/.
 */

export interface KitModel {
  /** Model id inside the kit (node name in the output GLB). */
  id: string;
  /** Source file relative to raw/<pack>/x/. */
  src: string;
}

export interface Kit {
  name: string;
  pack: string;
  /** Skinned + animated (characters): keep skins and one shared set of clips. */
  animated?: boolean;
  /** Max texture size (px). */
  texSize?: number;
  /** Recompute smooth normals (soft "clay" shading instead of faceted low-poly). */
  smooth?: boolean;
  models: KitModel[];
}

const kenney = (dir: string, names: string[]): KitModel[] =>
  names.map((n) => ({ id: n, src: `${dir}/${n}.glb` }));
const fbx = (dir: string, names: string[]): KitModel[] => names.map((n) => ({ id: n, src: `${dir}/${n}.fbx` }));

const Q_CHARS = "Ultimate Animated Character Pack - Nov 2019/FBX";
const Q_NATURE = "Ultimate Nature Pack - Jun 2019/FBX";
const Q_INTERIOR = "Ultimate House Interior Pack - June 2020/FBX";
const Q_ANIMALS = "Animal Pack Vol.2 by @Quaternius/FBX";

export const KITS: Kit[] = [
  {
    name: "people",
    pack: "quaternius-characters",
    animated: true,
    models: fbx(Q_CHARS, [
      "Casual_Male", "Casual_Female", "Casual2_Male", "Casual2_Female", "Casual3_Male", "Casual3_Female",
      "Casual_Bald", "Suit_Male", "Suit_Female", "OldClassy_Male", "OldClassy_Female", "Worker_Female",
      "Doctor_Female_Young",
    ]),
  },
  {
    name: "animals",
    pack: "quaternius-animals",
    animated: true,
    models: fbx(Q_ANIMALS, ["Dog", "Cat"]),
  },
  {
    name: "nature",
    pack: "quaternius-ultimate-nature",
    smooth: true,
    models: fbx(Q_NATURE, [
      "CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4",
      "CommonTree_Autumn_1", "CommonTree_Autumn_2", "CommonTree_Autumn_3", "CommonTree_Autumn_4",
      "CommonTree_Snow_1", "CommonTree_Snow_2", "CommonTree_Snow_3", "CommonTree_Snow_4",
      "CommonTree_Dead_1", "CommonTree_Dead_Snow_1",
      "BirchTree_1", "BirchTree_2", "BirchTree_Autumn_1", "BirchTree_Autumn_2", "BirchTree_Snow_1", "BirchTree_Snow_2",
      "BirchTree_Dead_1", "BirchTree_Dead_Snow_1",
      "PineTree_1", "PineTree_2", "PineTree_3", "PineTree_Autumn_1", "PineTree_Snow_1", "PineTree_Snow_2", "PineTree_Snow_3",
      "Willow_1", "Willow_2", "Willow_Autumn_1", "Willow_Autumn_2", "Willow_Snow_1", "Willow_Dead_1",
      "PalmTree_1", "PalmTree_2", "PalmTree_3", "PalmTree_4",
      "Cactus_1", "Cactus_3", "CactusFlowers_2",
      "Bush_1", "Bush_2", "Bush_Snow_1", "Bush_Snow_2", "BushBerries_1", "BushBerries_2",
      "Rock_1", "Rock_2", "Rock_3", "Rock_Moss_1", "Rock_Moss_2", "Rock_Snow_1", "Rock_Snow_2",
      "Grass", "Grass_2", "Grass_Short", "Flowers", "Plant_1", "Plant_2", "Plant_3", "Plant_5",
      "Wheat", "Corn_1", "Corn_2", "TreeStump", "TreeStump_Snow", "WoodLog", "Lilypad",
    ]),
  },
  {
    name: "interior",
    pack: "quaternius-house-interior",
    models: fbx(Q_INTERIOR, [
      "Bed_Single", "Bed_King", "Bed_Bunk", "Bookshelf", "Carpet_1", "Carpet_2", "Carpet_Round",
      "Chair_1", "Chair_2", "Chair_3", "Couch_Medium1", "Couch_Medium2", "Couch_Large1", "Couch_Small1", "Couch_Small2", "Couch_L",
      "Drawer_1", "Drawer_3", "Fireplace", "Houseplant_1", "Houseplant_3", "Houseplant_5", "Houseplant_7",
      "Kitchen_Fridge", "Kitchen_2Drawers", "Kitchen_Sink", "Kitchen_Oven", "Kitchen_Cabinet1",
      "Light_Floor1", "Light_Floor3", "Light_Desk", "Light_Stand1", "Light_Ceiling1", "NightStand_1", "NightStand_2",
      "Shelf_1", "Shelf_Small1", "Stool", "Table_RoundLarge", "Table_RoundSmall", "Curtains_Double",
      "Window_Large1", "Window_Small1", "Plate_1", "Trashcan_Small1",
    ]),
  },
  {
    name: "suburban",
    pack: "kenney-city-suburban",
    texSize: 256,
    models: kenney("Models/GLB format", [
      ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u"].map(
        (c) => `building-type-${c}`,
      ),
      "fence", "fence-low", "fence-1x2", "fence-1x3", "fence-2x2", "planter", "driveway-long", "driveway-short",
      "path-long", "path-short", "path-stones-long", "path-stones-short", "tree-large", "tree-small",
    ]),
  },
  {
    name: "commercial",
    pack: "kenney-city-commercial",
    texSize: 256,
    models: kenney("Models/GLB format", [
      ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"].map((c) => `building-${c}`),
      "building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c", "building-skyscraper-d", "building-skyscraper-e",
      "low-detail-building-a", "low-detail-building-b", "low-detail-building-c", "low-detail-building-d",
      "low-detail-building-e", "low-detail-building-f", "low-detail-building-wide-a", "low-detail-building-wide-b",
      "detail-awning", "detail-awning-wide", "detail-parasol-a", "detail-parasol-b",
    ]),
  },
  {
    name: "street",
    pack: "kenney-city-roads",
    texSize: 256,
    models: kenney("Models/GLB format", [
      "road-straight", "road-crossroad", "road-intersection", "road-bend", "road-curve", "road-end-round", "road-side",
      "road-square", "road-crossing", "road-driveway-single", "road-bend-sidewalk",
      "light-curved", "light-square", "light-square-double", "traffic-light", "road-sign-street", "dumpster",
      "construction-cone", "construction-barrier", "electricity-pole", "tile-low",
    ]),
  },
  {
    name: "cars",
    pack: "kenney-car",
    texSize: 256,
    models: kenney("Models/GLB format", [
      "sedan", "hatchback-sports", "suv", "taxi", "van", "truck", "delivery", "police", "ambulance", "tractor", "box",
    ]),
  },
  {
    name: "props",
    pack: "kenney-holiday",
    texSize: 256,
    models: kenney("Models/GLB format", [
      "bench", "bench-short", "lantern", "lantern-hanging", "lights-colored", "present-a-cube", "present-a-rectangle",
      "present-b-cube", "present-b-round", "snowman", "snowman-hat", "sled", "snow-pile", "tree-decorated",
      "tree-decorated-snow", "wreath-decorated", "rocks-small",
    ]),
  },
  {
    name: "camp",
    pack: "kenney-survival",
    texSize: 256,
    models: kenney("Models/GLB format", [
      "box", "box-large", "box-large-open", "box-open", "barrel", "bucket", "campfire-pit", "tent", "tent-canvas",
      "signpost", "signpost-single", "workbench", "chest", "resource-planks", "bedroll-packed", "fence",
    ]),
  },
  {
    name: "food",
    pack: "kenney-food",
    texSize: 256,
    models: kenney("Models/GLB format", [
      "cake-birthday", "cake", "cupcake", "cup-coffee", "mug", "glass-wine", "wine-red", "plate-dinner", "pizza-box",
      "pizza", "salad", "bread", "loaf-baguette", "apple", "watermelon", "soda-can", "cocktail", "croissant", "dim-sum",
      "sushi-salmon", "tajine", "pumpkin",
    ]),
  },
];
