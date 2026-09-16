export type Service = {
  id: string;
  name: string;
  blurb: string;
};

export const SERVICES: Service[] = [
  { id: "handyman", name: "Handyman", blurb: "Small fixes around the house" },
  { id: "furniture-assembly", name: "Furniture Assembly", blurb: "Desks, beds, shelves" },
  { id: "tv-mounting", name: "TV Mounting", blurb: "Clean, level, cable-aware" },
  { id: "drywall-repair", name: "Drywall Repair", blurb: "Holes, seams, patches" },
  { id: "painting", name: "Painting", blurb: "Rooms, trim, touch-ups" },
  { id: "fence-repair", name: "Fence Repair", blurb: "Posts, pickets, gates" },
  { id: "pressure-washing", name: "Pressure Washing", blurb: "Driveways, siding, patios" },
  { id: "lawn-care", name: "Lawn Care", blurb: "Mow, edge, seasonal tidy" },
  { id: "landscaping", name: "Landscaping", blurb: "Beds, mulch, simple plantings" },
  { id: "junk-removal", name: "Junk Removal", blurb: "Haul-away, no dump-run drama" },
  { id: "moving-help", name: "Moving Help", blurb: "Lift, load, local muscle" },
  { id: "cleaning", name: "Cleaning", blurb: "Move-in, move-out, deep clean" },
  { id: "gutter-cleaning", name: "Gutter Cleaning", blurb: "Leaves out, water flowing" },
  { id: "door-repair", name: "Door Repair", blurb: "Stick, sag, latch, weather" },
  { id: "minor-carpentry", name: "Minor Carpentry", blurb: "Trim, shelves, small build" },
  { id: "property-cleanup", name: "Property Cleanup", blurb: "Yard, lot, after-storm" },
  { id: "appliance-installation", name: "Appliance Installation", blurb: "Swap-in, not a big remodel" },
  { id: "deck-repair", name: "Deck Repair", blurb: "Boards, rails, small rot" },
  { id: "small-concrete", name: "Small Concrete Projects", blurb: "Pads, steps, patch" },
  { id: "general-maintenance", name: "General Property Maintenance", blurb: "Ongoing upkeep, listed clearly" },
  { id: "other", name: "Other", blurb: "If it is a real local job, say so" },
];

export const PROJECT_PLACEHOLDERS = [
  "TV mounted in the living room",
  "Fence repaired before the weekend",
  "Junk hauled from the garage",
  "Bedroom painted this month",
  "Gutters cleaned after the storm",
  "Washer installed in the laundry",
];
