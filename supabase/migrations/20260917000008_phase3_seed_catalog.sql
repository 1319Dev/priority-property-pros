-- Seed service categories (DB-managed) and smart questions.
-- Does NOT seed contractors, reviews, ratings, or auth users.

INSERT INTO public.service_categories (slug, name, blurb, sort_order, is_active, is_regulated, requires_verified_credential)
VALUES
  ('handyman', 'Handyman', 'Small fixes around the house', 10, true, false, false),
  ('furniture-assembly', 'Furniture Assembly', 'Desks, beds, shelves', 20, true, false, false),
  ('tv-mounting', 'TV Mounting', 'Clean, level, cable-aware', 30, true, false, false),
  ('drywall-repair', 'Drywall Repair', 'Holes, seams, patches', 40, true, false, false),
  ('painting', 'Painting', 'Rooms, trim, touch-ups', 50, true, false, false),
  ('fence-repair', 'Fence Repair', 'Posts, pickets, gates', 60, true, false, false),
  ('pressure-washing', 'Pressure Washing', 'Driveways, siding, patios', 70, true, false, false),
  ('lawn-care', 'Lawn Care', 'Mow, edge, seasonal tidy', 80, true, false, false),
  ('landscaping', 'Landscaping', 'Beds, mulch, simple plantings', 90, true, false, false),
  ('junk-removal', 'Junk Removal', 'Haul-away, no dump-run drama', 100, true, false, false),
  ('moving-help', 'Moving Help', 'Lift, load, local muscle', 110, true, false, false),
  ('cleaning', 'Cleaning', 'Move-in, move-out, deep clean', 120, true, false, false),
  ('gutter-cleaning', 'Gutter Cleaning', 'Leaves out, water flowing', 130, true, false, false),
  ('door-repair', 'Door Repair', 'Stick, sag, latch, weather', 140, true, false, false),
  ('minor-carpentry', 'Minor Carpentry', 'Trim, shelves, small build', 150, true, false, false),
  ('property-cleanup', 'Property Cleanup', 'Yard, lot, after-storm', 160, true, false, false),
  ('appliance-installation', 'Appliance Installation', 'Swap-in, not a big remodel', 170, true, false, false),
  ('deck-repair', 'Deck Repair', 'Boards, rails, small rot', 180, true, false, false),
  ('small-concrete', 'Small Concrete Projects', 'Pads, steps, patch', 190, true, false, false),
  ('general-maintenance', 'General Property Maintenance', 'Ongoing upkeep, listed clearly', 200, true, false, false),
  ('other', 'Other', 'If it is a real local job, say so', 210, true, false, false);

-- Intentionally omitted as ordinary unverified services: electrical, plumbing, HVAC.

INSERT INTO public.service_questions (category_id, prompt, help_text, kind, options, is_required, sort_order)
SELECT c.id, q.prompt, q.help_text, q.kind::public.question_kind, q.options::jsonb, q.is_required, q.sort_order
FROM public.service_categories c
JOIN (
  VALUES
    ('handyman', 'Indoor, outdoor, or both?', 'Helps a local pro pack the right tools.', 'SINGLE_CHOICE', '["Indoor","Outdoor","Both"]', true, 10),
    ('handyman', 'About how many separate tasks?', NULL, 'SINGLE_CHOICE', '["One","Two to three","A longer punch list"]', true, 20),
    ('handyman', 'Anything a pro should know about access or pets?', NULL, 'TEXT', '[]', false, 30),
    ('furniture-assembly', 'What are you assembling?', 'Brand and item name if you have it.', 'TEXT', '[]', true, 10),
    ('furniture-assembly', 'Are all parts and hardware on site?', NULL, 'BOOLEAN', '[]', true, 20),
    ('tv-mounting', 'What size is the TV?', NULL, 'SINGLE_CHOICE', '["32 inch or smaller","33–55 inch","56–75 inch","Larger than 75 inch"]', true, 10),
    ('tv-mounting', 'What is the wall made of?', NULL, 'SINGLE_CHOICE', '["Drywall","Plaster","Brick or masonry","I am not sure"]', true, 20),
    ('tv-mounting', 'Should cables be hidden?', NULL, 'SINGLE_CHOICE', '["Yes if possible","No, visible is fine","Not sure"]', false, 30),
    ('drywall-repair', 'About how large is the damaged area?', NULL, 'SINGLE_CHOICE', '["Nail or screw holes","Fist-sized hole","Larger patch or multiple spots"]', true, 10),
    ('drywall-repair', 'Does the area need texture matched?', NULL, 'BOOLEAN', '[]', false, 20),
    ('painting', 'Interior, exterior, or both?', NULL, 'SINGLE_CHOICE', '["Interior","Exterior","Both"]', true, 10),
    ('painting', 'About how many rooms or surfaces?', NULL, 'TEXT', '[]', true, 20),
    ('painting', 'Is the space emptied and ready?', NULL, 'SINGLE_CHOICE', '["Yes","Partly","Not yet"]', false, 30),
    ('fence-repair', 'What kind of fence?', NULL, 'SINGLE_CHOICE', '["Wood","Vinyl","Chain link","Other / mixed"]', true, 10),
    ('fence-repair', 'What failed — posts, pickets, gate, or several?', NULL, 'TEXT', '[]', true, 20),
    ('pressure-washing', 'What needs washing?', NULL, 'MULTI_CHOICE', '["Driveway","Siding","Patio or deck","Fence","Other"]', true, 10),
    ('lawn-care', 'Is this a one-time visit or ongoing?', NULL, 'SINGLE_CHOICE', '["One-time","A few visits","Ongoing if it works out"]', true, 10),
    ('lawn-care', 'Lot size, roughly?', NULL, 'SINGLE_CHOICE', '["Small yard","Typical suburban lot","Large lot"]', false, 20),
    ('landscaping', 'What do you want done?', NULL, 'TEXT', '[]', true, 10),
    ('junk-removal', 'About how much material?', NULL, 'SINGLE_CHOICE', '["A few items","A truckload","More than one load"]', true, 10),
    ('junk-removal', 'Any appliances, yard waste, or construction debris?', NULL, 'TEXT', '[]', false, 20),
    ('moving-help', 'What needs moving?', NULL, 'TEXT', '[]', true, 10),
    ('moving-help', 'Stairs, elevator, or long carry?', NULL, 'SINGLE_CHOICE', '["Ground floor","Stairs","Elevator","A mix"]', true, 20),
    ('cleaning', 'What kind of clean?', NULL, 'SINGLE_CHOICE', '["Standard","Deep clean","Move-in / move-out"]', true, 10),
    ('cleaning', 'About how many bedrooms and bathrooms?', NULL, 'TEXT', '[]', true, 20),
    ('gutter-cleaning', 'About how many stories?', NULL, 'SINGLE_CHOICE', '["One","Two","Three or more"]', true, 10),
    ('door-repair', 'Interior or exterior door?', NULL, 'SINGLE_CHOICE', '["Interior","Exterior","Both / more than one"]', true, 10),
    ('door-repair', 'What is wrong?', NULL, 'TEXT', '[]', true, 20),
    ('minor-carpentry', 'What do you want built or repaired?', NULL, 'TEXT', '[]', true, 10),
    ('property-cleanup', 'What needs clearing?', NULL, 'TEXT', '[]', true, 10),
    ('appliance-installation', 'Which appliance?', NULL, 'TEXT', '[]', true, 10),
    ('appliance-installation', 'Is the old appliance already disconnected and out of the way?', NULL, 'BOOLEAN', '[]', true, 20),
    ('deck-repair', 'What needs repair?', NULL, 'TEXT', '[]', true, 10),
    ('small-concrete', 'What is the project?', NULL, 'TEXT', '[]', true, 10),
    ('general-maintenance', 'What should a pro handle on this visit?', NULL, 'TEXT', '[]', true, 10),
    ('other', 'Describe the work in your own words.', 'Skip anything that needs a licensed electrician, plumber, or HVAC tech as an ordinary unverified job.', 'TEXT', '[]', true, 10)
) AS q(slug, prompt, help_text, kind, options, is_required, sort_order)
  ON c.slug = q.slug;
