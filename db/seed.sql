-- ============================================================================
-- Car Show Judging App — `judging` database seed data
-- ----------------------------------------------------------------------------
-- Loads the rubric for the active show.
--
-- Counts:
--   - 1 row in shows (Corvettes on the Island 2026, marked active)
--   - 4 rows in rubric_sections (Interior 50, Exterior 100, Engine Bay 40, Bonus 10)
--   - 17 rows in rubric_subsections (5 Interior, 7 Exterior, 4 Engine Bay, 1 Bonus)
--   - 71 rows in rubric_items (max_points sums to 200)
--
-- Source: /Users/marcusgorski/Documents/Corvettes on the Island Docs/Car Show Judging Criteria App.docx
-- A handful of typos / extra spaces in the source have been cleaned up
-- (see seed.sql review notes).
--
-- This script must run AFTER db/schema.sql against the `judging` database.
-- Wrapped in BEGIN/COMMIT — if any statement fails, nothing is committed.
-- ============================================================================

BEGIN;


-- ----------------------------------------------------------------------------
-- 1. shows
-- ----------------------------------------------------------------------------
INSERT INTO shows (name, year, is_active)
VALUES ('Corvettes on the Island 2026', 2026, TRUE);


-- ----------------------------------------------------------------------------
-- 2. rubric_sections
-- Bonus uses scoring_mode = 'award' (start at zero, judge awards points
-- for upgrades). The other three default to 'deduct' (start at full
-- points, deduct for flaws).
-- ----------------------------------------------------------------------------
INSERT INTO rubric_sections (show_id, name, description, display_order, max_points, scoring_mode)
VALUES
  ((SELECT id FROM shows WHERE name = 'Corvettes on the Island 2026'),
   'Interior',   NULL,                                                                            1,  50, 'deduct'),
  ((SELECT id FROM shows WHERE name = 'Corvettes on the Island 2026'),
   'Exterior',   NULL,                                                                            2, 100, 'deduct'),
  ((SELECT id FROM shows WHERE name = 'Corvettes on the Island 2026'),
   'Engine Bay', 'Open the Hood/Rear Hatch (for mid-engine C8''s). Score what you can see.',     3,  40, 'deduct'),
  ((SELECT id FROM shows WHERE name = 'Corvettes on the Island 2026'),
   'Bonus',      NULL,                                                                            4,  10, 'award');


-- ----------------------------------------------------------------------------
-- 3. rubric_subsections (17 total)
-- ----------------------------------------------------------------------------
INSERT INTO rubric_subsections (section_id, name, display_order)
SELECT sec.id, t.sub_name, t.display_order
FROM (VALUES
  -- Interior (5)
  ('Interior',   'Seats',                                  1),
  ('Interior',   'Door Panels, Door Jambs, Roof Panels',   2),
  ('Interior',   'Dash/IP, Pedals, Steering Column',       3),
  ('Interior',   'Floor Carpet',                           4),
  ('Interior',   'Trunk/Frunk Areas',                      5),
  -- Exterior (7)
  ('Exterior',   'Body Condition',                         1),
  ('Exterior',   'Body Panel Fit',                         2),
  ('Exterior',   'Body Cleanliness',                       3),
  ('Exterior',   'Paint',                                  4),
  ('Exterior',   'Chrome, Painted or Carbon Fiber Trim',   5),
  ('Exterior',   'Glass',                                  6),
  ('Exterior',   'Wheels/Tires/Wheelwells',                7),
  -- Engine Bay (4)
  ('Engine Bay', 'General Components',                     1),
  ('Engine Bay', 'Compartment Paint Finish',               2),
  ('Engine Bay', 'Engine',                                 3),
  ('Engine Bay', 'Miscellaneous',                          4),
  -- Bonus (1) — flat list of 5 items wrapped under one subsection
  ('Bonus',      'Customizations',                         1)
) AS t(sec_name, sub_name, display_order)
JOIN rubric_sections sec ON sec.name = t.sec_name;


-- ----------------------------------------------------------------------------
-- 4. rubric_items (71 total — max_points sums to 200)
-- Items are looked up by their (section_name, subsection_name) pair so the
-- seed survives rerunning even if SERIAL ids land differently.
-- ----------------------------------------------------------------------------
INSERT INTO rubric_items (subsection_id, name, display_order, max_points)
SELECT sl.id, t.item_name, t.display_order, t.max_points
FROM (VALUES
  -- Interior > Seats (5 items × 2 pts = 10)
  ('Interior',   'Seats',                                  'Overall Cleanliness',                                  1, 2),
  ('Interior',   'Seats',                                  'No Rips/Tears',                                        2, 2),
  ('Interior',   'Seats',                                  'Lack of Discoloration',                                3, 2),
  ('Interior',   'Seats',                                  'Seat Backs Clean',                                     4, 2),
  ('Interior',   'Seats',                                  'Lack of Scratches',                                    5, 2),

  -- Interior > Door Panels, Door Jambs, Roof Panels (5 × 2 = 10)
  ('Interior',   'Door Panels, Door Jambs, Roof Panels',   'Paint Condition',                                      1, 2),
  ('Interior',   'Door Panels, Door Jambs, Roof Panels',   'Overall Cleanliness',                                  2, 2),
  ('Interior',   'Door Panels, Door Jambs, Roof Panels',   'No Rips/Tears',                                        3, 2),
  ('Interior',   'Door Panels, Door Jambs, Roof Panels',   'Lack of Discoloration',                                4, 2),
  ('Interior',   'Door Panels, Door Jambs, Roof Panels',   'Lack of Scratches',                                    5, 2),

  -- Interior > Dash/IP, Pedals, Steering Column (5 × 2 = 10)
  ('Interior',   'Dash/IP, Pedals, Steering Column',       'Excellent Paint Condition',                            1, 2),
  ('Interior',   'Dash/IP, Pedals, Steering Column',       'Overall Cleanliness',                                  2, 2),
  ('Interior',   'Dash/IP, Pedals, Steering Column',       'Lack of Scratches/Cracks',                             3, 2),
  ('Interior',   'Dash/IP, Pedals, Steering Column',       'Lack of Excessive Wear',                               4, 2),
  ('Interior',   'Dash/IP, Pedals, Steering Column',       'Lack of Discoloration',                                5, 2),

  -- Interior > Floor Carpet (5 × 2 = 10)
  ('Interior',   'Floor Carpet',                           'Proper Installation',                                  1, 2),
  ('Interior',   'Floor Carpet',                           'Cleanliness',                                          2, 2),
  ('Interior',   'Floor Carpet',                           'No Rips/Tears',                                        3, 2),
  ('Interior',   'Floor Carpet',                           'Lack of Discoloration',                                4, 2),
  ('Interior',   'Floor Carpet',                           'No Excessive Wear',                                    5, 2),

  -- Interior > Trunk/Frunk Areas (5 × 2 = 10)
  ('Interior',   'Trunk/Frunk Areas',                      'Excellent Paint Condition',                            1, 2),
  ('Interior',   'Trunk/Frunk Areas',                      'Overall Cleanliness',                                  2, 2),
  ('Interior',   'Trunk/Frunk Areas',                      'No Rips/Tears',                                        3, 2),
  ('Interior',   'Trunk/Frunk Areas',                      'Lack of Discoloration',                                4, 2),
  ('Interior',   'Trunk/Frunk Areas',                      'No Excessive Wear',                                    5, 2),

  -- Exterior > Body Condition (2 × 10 = 20)
  ('Exterior',   'Body Condition',                         'No Evidence of Repair',                                1, 10),
  ('Exterior',   'Body Condition',                         'No Cracks/Holes',                                      2, 10),

  -- Exterior > Body Panel Fit (4 × 5 = 20)
  ('Exterior',   'Body Panel Fit',                         'Door Gaps Consistent',                                 1, 5),
  ('Exterior',   'Body Panel Fit',                         'Fender to Door Gaps Consistent',                       2, 5),
  ('Exterior',   'Body Panel Fit',                         'Hood to Fender Gaps Consistent',                       3, 5),
  ('Exterior',   'Body Panel Fit',                         'Rear Decklid/Trunk/T-Top/Targa Top/Convertible Top Fit', 4, 5),

  -- Exterior > Body Cleanliness (4 × 5 = 20)
  ('Exterior',   'Body Cleanliness',                       'Lack of Water Spots',                                  1, 5),
  ('Exterior',   'Body Cleanliness',                       'Lack of Wax/Polish Residue at Panel Edges',            2, 5),
  ('Exterior',   'Body Cleanliness',                       'Lack of Dirt',                                         3, 5),
  ('Exterior',   'Body Cleanliness',                       'Lack of Smears/Smudges',                               4, 5),

  -- Exterior > Paint (5 × 2 = 10)
  ('Exterior',   'Paint',                                  'Luster/Shine',                                         1, 2),
  ('Exterior',   'Paint',                                  'Lack of Scratches',                                    2, 2),
  ('Exterior',   'Paint',                                  'Lack of Chips',                                        3, 2),
  ('Exterior',   'Paint',                                  'Lack of Excessive Wear',                               4, 2),
  ('Exterior',   'Paint',                                  'Lack of Discoloration',                                5, 2),

  -- Exterior > Chrome, Painted or Carbon Fiber Trim (5 × 2 = 10)
  ('Exterior',   'Chrome, Painted or Carbon Fiber Trim',   'High Gloss',                                           1, 2),
  ('Exterior',   'Chrome, Painted or Carbon Fiber Trim',   'Lack of Scratches',                                    2, 2),
  ('Exterior',   'Chrome, Painted or Carbon Fiber Trim',   'Lack of Chips',                                        3, 2),
  ('Exterior',   'Chrome, Painted or Carbon Fiber Trim',   'Overall Cleanliness',                                  4, 2),
  ('Exterior',   'Chrome, Painted or Carbon Fiber Trim',   'Proper Fit & Finish',                                  5, 2),

  -- Exterior > Glass (3 + 2 + 2 + 3 = 10)
  ('Exterior',   'Glass',                                  'Overall Cleanliness',                                  1, 3),
  ('Exterior',   'Glass',                                  'Lack of Scratches',                                    2, 2),
  ('Exterior',   'Glass',                                  'Lack of Cracks/Chips',                                 3, 2),
  ('Exterior',   'Glass',                                  'Excellent Condition of Weatherstripping',              4, 3),

  -- Exterior > Wheels/Tires/Wheelwells (3 + 2 + 3 + 2 = 10)
  ('Exterior',   'Wheels/Tires/Wheelwells',                'Overall Cleanliness',                                  1, 3),
  ('Exterior',   'Wheels/Tires/Wheelwells',                'Clean Tires/Whitewalls/White Letters',                 2, 2),
  ('Exterior',   'Wheels/Tires/Wheelwells',                'No Chips/Scratches in Wheel Paint/Chrome',             3, 3),
  ('Exterior',   'Wheels/Tires/Wheelwells',                'No Excessive Wear/Scratches/Need of Repair',           4, 2),

  -- Engine Bay > General Components (4 + 4 + 2 = 10)
  ('Engine Bay', 'General Components',                     'Overall Cleanliness',                                  1, 4),
  ('Engine Bay', 'General Components',                     'Excellent Paint Appearance',                           2, 4),
  ('Engine Bay', 'General Components',                     'High Polish',                                          3, 2),

  -- Engine Bay > Compartment Paint Finish (4 + 2 + 2 + 2 = 10)
  ('Engine Bay', 'Compartment Paint Finish',               'Cleanliness',                                          1, 4),
  ('Engine Bay', 'Compartment Paint Finish',               'Lack of Scratches',                                    2, 2),
  ('Engine Bay', 'Compartment Paint Finish',               'Lack of Discoloration',                                3, 2),
  ('Engine Bay', 'Compartment Paint Finish',               'Lack of Paint Damage or Missing Paint',                4, 2),

  -- Engine Bay > Engine (4 + 3 + 3 = 10)
  ('Engine Bay', 'Engine',                                 'Overall Cleanliness',                                  1, 4),
  ('Engine Bay', 'Engine',                                 'Excellent Paint Condition',                            2, 3),
  ('Engine Bay', 'Engine',                                 'High Polish',                                          3, 3),

  -- Engine Bay > Miscellaneous (4 + 3 + 3 = 10)
  ('Engine Bay', 'Miscellaneous',                          'Overall Cleanliness',                                  1, 4),
  ('Engine Bay', 'Miscellaneous',                          'Clean Wire Management',                                2, 3),
  ('Engine Bay', 'Miscellaneous',                          'Lack of Cuts/Scrapes/Scratches',                       3, 3),

  -- Bonus > Customizations (5 × 2 = 10) — scoring_mode = 'award' on the section
  ('Bonus',      'Customizations',                         'Outstanding Exterior Customization',                   1, 2),
  ('Bonus',      'Customizations',                         'Outstanding Paint Design/Finish',                      2, 2),
  ('Bonus',      'Customizations',                         'Exceptional Engine Compartment Customization',         3, 2),
  ('Bonus',      'Customizations',                         'Exceptional Wheels/Tires',                             4, 2),
  ('Bonus',      'Customizations',                         'Exceptional Interior Customization',                   5, 2)
) AS t(sec_name, sub_name, item_name, display_order, max_points)
JOIN rubric_sections sec     ON sec.name = t.sec_name
JOIN rubric_subsections sl   ON sl.section_id = sec.id AND sl.name = t.sub_name;


COMMIT;
