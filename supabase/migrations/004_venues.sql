-- Saanjh: venues table (Bangalore corpus) — idempotent / safe to re-run
-- L2 of the 3-layer RAG. Tag-based filtering, not vector embeddings.

CREATE TABLE IF NOT EXISTS public.venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  lat NUMERIC(9,6) NOT NULL,
  lng NUMERIC(9,6) NOT NULL,
  dietary_tags TEXT[] NOT NULL DEFAULT '{}',
  vibe_tags TEXT[] NOT NULL DEFAULT '{}',
  interest_tags TEXT[] NOT NULL DEFAULT '{}',
  price_tier SMALLINT NOT NULL CHECK (price_tier BETWEEN 1 AND 3),
  opening_hours TEXT,
  why_this_short TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, neighborhood)
);

-- Indexes for the typical RAG filter pattern: filter by neighborhood + category, then tag overlap.
CREATE INDEX IF NOT EXISTS idx_venues_neighborhood ON public.venues (neighborhood);
CREATE INDEX IF NOT EXISTS idx_venues_category ON public.venues (category);
CREATE INDEX IF NOT EXISTS idx_venues_dietary_gin ON public.venues USING GIN (dietary_tags);
CREATE INDEX IF NOT EXISTS idx_venues_vibe_gin ON public.venues USING GIN (vibe_tags);
CREATE INDEX IF NOT EXISTS idx_venues_interest_gin ON public.venues USING GIN (interest_tags);

DROP TRIGGER IF EXISTS venues_updated_at ON public.venues;
CREATE TRIGGER venues_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

-- Public read (anyone authenticated can browse venues); writes are service-role only.
DROP POLICY IF EXISTS "Venues readable by anyone" ON public.venues;
CREATE POLICY "Venues readable by anyone"
  ON public.venues FOR SELECT
  USING (true);

-- ============================================================
-- Seed data: 79 hand-tagged Bangalore venues
-- ============================================================
INSERT INTO public.venues
  (name, category, neighborhood, lat, lng, dietary_tags, vibe_tags, interest_tags, price_tier, opening_hours, why_this_short)
VALUES
  ('46 Ounces Brewhouse', 'bar', 'bagmane_orr', 12.9939892, 77.6614082, '{"no_restrictions"}', '{"lively","social"}', '{"night_out"}', 3, '11:30-00:30', 'Open-air brewpub inside RMZ Infinity, in-house pints, weekend crowd spills past midnight.'),
  ('ThinkBox Children''s Library', 'bookstore', 'bagmane_orr', 12.9739042, 77.6735548, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"art"}', 1, '11:00-13:30,16:30-20:00', 'Storytelling sessions, big curated kids collection in Malleshpalya, toys to borrow too.'),
  ('Ginger Cafe', 'cafe', 'bagmane_orr', 12.9829253, 77.6801934, '{"vegetarian"}', '{"chill","quiet"}', '{"cafe_hopping"}', 1, '05:30-11:00,16:00-22:30', 'Jaggery ginger tea with Variar Bakery biscuits, casual chats over warm comforting brews.'),
  ('Lipsip Cafe', 'cafe', 'bagmane_orr', 12.9778085, 77.6665094, '{"vegetarian"}', '{"chill","social"}', '{"cafe_hopping"}', 1, '17:00-22:30', 'Street-side spot behind Bagmane back gate, shaadi-wali coffee, owners remember regular faces.'),
  ('Pages N Pours Playing Zone', 'cafe', 'bagmane_orr', 12.9849156, 77.6750777, '{"vegetarian"}', '{"lively","social"}', '{"cafe_hopping"}', 1, '11:00-21:30', 'Cafe-meets-arcade with table tennis, carrom, pool, crunchy biscoff milkshakes after work.'),
  ('PNP Cafe', 'cafe', 'bagmane_orr', 12.9861322, 77.6699304, '{"vegetarian"}', '{"chill","social"}', '{"cafe_hopping"}', 1, '11:00-23:00', 'Pocket-friendly Kaggadasapura corner with chess and ludo, cheese toast pulls a regular crowd.'),
  ('Waffcha', 'cafe', 'bagmane_orr', 12.9843936, 77.6774574, '{"vegetarian"}', '{"chill","social"}', '{"cafe_hopping"}', 1, '11:00-23:30', 'Cozy waffle counter with carrom, chess, PS5, melted chocolate dripping through every bite.'),
  ('The Cuisine Story', 'restaurant', 'bagmane_orr', 12.9815836, 77.6751832, '{"no_restrictions"}', '{"chill","social"}', '{"cafe_hopping"}', 2, '11:30-22:30', 'Hidden-gem Bengali kitchen, kosha mangsho and basanti pulao, festival pithe in season.'),
  ('Ugadi Cafe', 'restaurant', 'bagmane_orr', 12.9977685, 77.6701387, '{"vegetarian","jain_friendly"}', '{"lively","social"}', '{"cafe_hopping"}', 1, '07:00-22:30', 'Crisp masala dosas and strong filter coffee, walk over from Benniganahalli metro stop.'),
  ('Vaishnavi Vaibhava', 'restaurant', 'bagmane_orr', 12.9852817, 77.6675617, '{"vegetarian","jain_friendly"}', '{"lively","social"}', '{"cafe_hopping"}', 1, '06:00-22:45', 'Pure-veg go-to near Bagmane, dal kolhapuri locals swear by, dosas crisp by 7am.'),
  ('Zaatar Multicuisine', 'restaurant', 'bagmane_orr', 12.9952584, 77.6669003, '{"halal","no_restrictions"}', '{"lively","social"}', '{"night_out"}', 2, '12:00-00:00', 'Late-night biryanis and grills on Swami Vivekananda Road, mutton gosh runs out fast.'),
  ('Atal Bihari Vajpayee Park', 'walk', 'bagmane_orr', 12.9768417, 77.6731919, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"walks","parks","workout"}', 1, '04:30-09:00,16:30-20:30', 'Lake-rimmed 2.5km circuit in Malleshpalya, open gym mid-route, dawn brings birdsong.'),
  ('Byrasandra Lake Walking Track', 'walk', 'bagmane_orr', 12.9774927, 77.6628152, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"walks","parks"}', 1, '05:00-10:00,16:00-19:00', 'Newly-paved loop sharing Bagmane back boundary, paved path, no dogs allowed though.'),
  ('Ananda-X Wellness Center', 'wellness', 'bagmane_orr', 12.985689, 77.671712, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"workout"}', 2, '05:30-12:30,15:30-20:30', 'Holistic Kaggadasapura center mixing yoga, meditation, and life-coaching, flexible morning and evening slots.'),
  ('Chaitanya Wellness', 'wellness', 'bagmane_orr', 12.9843082, 77.6747962, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"workout"}', 2, '06:00-20:00', 'Kaggadasapura yoga studio mixing breath-led classes with satvik diet guidance for beginners.'),
  ('Be and Make Swami Vivekananda Yoga', 'wellness', 'bagmane_orr', 12.9762324, 77.6752979, '{"no_restrictions"}', '{"contemplative","quiet"}', '{"workout"}', 2, '05:00-21:00', 'Traditional yoga institute off Kaggadasapura, structured asana classes, teachers trained in lineage.'),
  ('Affordable Art India', 'art', 'indiranagar', 12.96958, 77.6415177, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"art"}', 2, '11:00-21:00', 'Browse hand-painted canvases and Tanjore work, staff explain pieces without rushing you.'),
  ('Artisera', 'art', 'indiranagar', 12.9828768, 77.6387599, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"art"}', 3, '10:30-18:30', 'Tiny upstairs gallery in chaotic Indiranagar, rotating fine art, appointments preferred.'),
  ('Tarang Arts', 'art', 'indiranagar', 12.968507, 77.6430634, '{"no_restrictions"}', '{"quiet"}', '{"art"}', 3, '10:00-21:00', 'Traditional Tanjore paintings, brassware, the kind of place to gift a wedding piece.'),
  ('Toit', 'bar', 'indiranagar', 12.9795441, 77.6406542, '{"no_restrictions"}', '{"lively","social"}', '{"night_out"}', 3, '08:30-01:00', 'Cavernous brewpub on 100ft Road, in-house stout and hefeweizen, packed by seven nightly.'),
  ('Atta Galatta', 'bookstore', 'indiranagar', 12.980109, 77.6393497, '{"vegetarian"}', '{"contemplative","chill"}', '{"art","music"}', 2, '11:00-20:00', 'Indian-language bookshop with weekend readings, ginger chai, cake-mixing events around the holidays.'),
  ('Champaca Bookstore', 'bookstore', 'indiranagar', 12.97779, 77.6372491, '{"vegan","vegetarian"}', '{"quiet","contemplative"}', '{"art"}', 2, '11:00-20:00', 'Cottage-core indie bookstore with a thrift basement and a tucked-away outdoor cafe.'),
  ('Copper + Cloves', 'cafe', 'indiranagar', 12.9777487, 77.6372497, '{"vegan","vegetarian","gluten_free"}', '{"chill","quiet"}', '{"cafe_hopping"}', 2, '09:30-20:00', 'All-vegan, secondhand books on shelves, sourdough that has its own fan club.'),
  ('HumbleBean Coffee', 'cafe', 'indiranagar', 12.9692005, 77.6358218, '{"vegetarian"}', '{"quiet","productive"}', '{"cafe_hopping"}', 2, '08:00-22:00', 'Pour-over nerd haven, whiskey-barrel-aged arabica, soft mornings before the Indiranagar crowd arrives.'),
  ('Latte & Co', 'cafe', 'indiranagar', 12.9798622, 77.6403225, '{"vegetarian"}', '{"chill","quiet"}', '{"cafe_hopping"}', 2, '08:30-21:00', 'Calm European-feel corner with ceremonial matcha, owners pour their attention into every cup.'),
  ('Paper & Pie', 'cafe', 'indiranagar', 12.9810313, 77.6409712, '{"vegetarian"}', '{"productive","chill"}', '{"cafe_hopping"}', 2, '08:00-23:00', 'Two-storey loft with flaky croissants, laptops humming, mornings smell like fresh pies baking.'),
  ('The Kind Roastery', 'cafe', 'indiranagar', 12.9701071, 77.6447307, '{"vegetarian"}', '{"lively","social"}', '{"cafe_hopping"}', 3, '08:00-01:00', 'Plant-filled brunch spot, Indiranagar in full chatter, raw mango salad worth the wait.'),
  ('Tribal Brew Daily', 'cafe', 'indiranagar', 12.9806136, 77.6409761, '{"vegetarian","vegan"}', '{"chill"}', '{"cafe_hopping"}', 1, '07:00-00:00', 'Footpath coffee cart turned counter, dark espresso, hellos from the same baristas daily.'),
  ('CMH Park', 'park', 'indiranagar', 12.9779951, 77.6412589, '{"no_restrictions"}', '{"chill","quiet"}', '{"walks","parks"}', 1, '05:00-12:00,15:30-20:00', 'Pocket of green near KFC signal, 300m loop, traffic noise fades surprisingly fast.'),
  ('Indiranagar Park', 'park', 'indiranagar', 12.9713289, 77.6442157, '{"no_restrictions"}', '{"chill","quiet"}', '{"walks","parks"}', 1, '05:00-11:30,16:00-20:00', 'Old shaded park behind Indiranagar Club, big trees, gazebo for stretching at dawn.'),
  ('Burma Burma', 'restaurant', 'indiranagar', 12.9704847, 77.6447032, '{"vegan","vegetarian"}', '{"lively","social"}', '{"night_out"}', 3, '12:00-15:30,18:30-22:30', 'Pure-veg Burmese, samosa soup tastes weird and wonderful, plan for the wait.'),
  ('Cafe Graze', 'restaurant', 'indiranagar', 12.9743309, 77.6566885, '{"vegan","gluten_free"}', '{"quiet","contemplative"}', '{"cafe_hopping"}', 2, '10:00-18:00', 'All-vegan villa, no dairy gluten sugar oil, the founder explains every dish slowly.'),
  ('Element3', 'restaurant', 'indiranagar', 12.9790335, 77.6438159, '{"vegetarian","jain_friendly","vegan"}', '{"social"}', '{"cafe_hopping"}', 2, '11:00-23:00', 'Pure-veg sattvik kitchen, no onion or garlic, lachha parathas lighter than air.'),
  ('Jeevanam Yoga', 'wellness', 'indiranagar', 12.9689588, 77.6483185, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"workout"}', 2, '06:00-10:00,18:00-20:00', 'Green oasis off Jeevan Bima Nagar, slow breath-led yoga, Deepti adjusts you gently.'),
  ('Shades Creative Gallery', 'art', 'koramangala', 12.9367782, 77.6151736, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"art"}', 1, '11:00-19:00', 'Tucked-away second-floor gallery, rotating shows from abstract to wildlife, artists actually gather here.'),
  ('Tallenge Store', 'art', 'koramangala', 12.9327799, 77.6304619, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"art"}', 2, '10:30-18:00', 'Fine-art print studio off 5th Cross, warm-hued canvases, staff frame to order.'),
  ('Ganbeii Microbrewery', 'bar', 'koramangala', 12.9330126, 77.6147269, '{"no_restrictions","halal"}', '{"lively","social"}', '{"night_out","music"}', 3, '07:30-23:30', 'In-house brews and pork fry, quieter ground floor, live music up on the rooftop.'),
  ('The Bier Library', 'bar', 'koramangala', 12.9392206, 77.6261115, '{"no_restrictions"}', '{"social","lively"}', '{"night_out"}', 3, '12:00-01:00', 'Koi pond seating and seasonal house beer, ask for the sampler, weekend buzz spills over.'),
  ('Dialogues Cafe', 'cafe', 'koramangala', 12.9324179, 77.631954, '{"vegetarian"}', '{"productive","quiet"}', '{"cafe_hopping"}', 2, '09:00-21:00', 'Coworking-friendly calm, staff remember your order, good for laptop work and quiet meetings.'),
  ('Dyu Art Cafe', 'cafe', 'koramangala', 12.9373076, 77.6176544, '{"vegetarian"}', '{"quiet","contemplative"}', '{"cafe_hopping","art"}', 2, '10:00-22:30', 'Kerala-style bungalow with red-oxide floors, courtyard plants, art on every wall, slow afternoons.'),
  ('Maverick & Farmer Coffee', 'cafe', 'koramangala', 12.9354367, 77.6284138, '{"vegetarian","no_restrictions"}', '{"chill","productive"}', '{"cafe_hopping"}', 2, '09:00-23:00', 'Coffee roastery tucked in a bike showroom, reliable cup, occasional engine revving nearby.'),
  ('Roastea', 'cafe', 'koramangala', 12.9358255, 77.6281926, '{"vegetarian"}', '{"chill","social"}', '{"cafe_hopping"}', 2, '07:00-23:00', 'Greenery-wrapped 80ft Road spot, Kahva tea and outdoor seating, brunch worth the splurge.'),
  ('Story Coffee House', 'cafe', 'koramangala', 12.92917, 77.6346981, '{"vegetarian","no_restrictions"}', '{"chill","social"}', '{"cafe_hopping","music"}', 2, '08:30-23:30', 'Retro first-floor hangout, house-baked bread, weekend art and game events draw regulars.'),
  ('BBMP Park', 'park', 'koramangala', 12.9310243, 77.6267418, '{"no_restrictions"}', '{"chill","quiet"}', '{"walks","parks","workout"}', 1, '05:00-10:00,16:00-19:30', 'Lake, jogging track, open gym, kids zone, clean greenery, weekend family refuge.'),
  ('Maffei Kitchen', 'restaurant', 'koramangala', 12.9352217, 77.6226019, '{"vegetarian","halal"}', '{"social","lively"}', '{"night_out"}', 3, '10:30-00:30', 'Soft warm pita, creamy hummus, zaatar grills, window seats with a city view.'),
  ('Xero Degrees', 'restaurant', 'koramangala', 12.9343178, 77.6166312, '{"vegetarian","no_restrictions"}', '{"lively","social"}', '{"night_out"}', 2, '10:00-23:00', 'Cheesy peri peri fries and freakshakes, buzzy 5th Block room, comes alive at night.'),
  ('Yuki Brewhouse', 'restaurant', 'koramangala', 12.9342107, 77.6233371, '{"vegetarian","no_restrictions"}', '{"lively","social"}', '{"night_out","music"}', 3, '12:00-00:00', 'Japanese plates and house brews, miso ramen and nigiri, modern room fills fast.'),
  ('Open Studio Yoga', 'wellness', 'koramangala', 12.9314801, 77.6357296, '{"no_restrictions"}', '{"contemplative","quiet"}', '{"workout"}', 2, '05:30-22:30', 'ST Bed studio where the teacher watches every posture, beginners build strength slowly.'),
  ('The Yoga Room by Vidhya Vakil', 'wellness', 'koramangala', 12.9425955, 77.6254159, '{"no_restrictions"}', '{"contemplative","quiet"}', '{"workout"}', 2, '06:30-12:00,17:30-19:30', 'Never the same routine twice, counter-poses taught alongside, calm structured morning sessions.'),
  ('MAP Conservation Centre', 'art', 'mg_road_brigade', 12.9744, 77.5965, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"art","museum","photography"}', 1, '10:00-18:30', 'Rotating exhibits on art conservation inside a focused Kasturba Road gallery.'),
  ('Sublime Galleria', 'art', 'mg_road_brigade', 12.9716, 77.5965, '{"no_restrictions"}', '{"contemplative","social"}', '{"art","photography"}', 1, '11:00-20:00', 'Rotating contemporary paintings on the eighth floor above UB City piazza.'),
  ('Venkatappa Art Gallery', 'art', 'mg_road_brigade', 12.9742, 77.5953, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"art","museum"}', 1, '10:00-17:00', 'Freshly renovated gallery holding Ajanta replica murals over a century old.'),
  ('Amoeba Sports Bar', 'bar', 'mg_road_brigade', 12.9747, 77.6049, '{"no_restrictions"}', '{"lively","social"}', '{"music","night_out"}', 2, '11:00-01:00', 'Open deck over Church Street with live sport on every screen.'),
  ('Church Street SOCIAL', 'bar', 'mg_road_brigade', 12.9756, 77.6027, '{"no_restrictions"}', '{"lively","social"}', '{"night_out","music"}', 2, '9:00-01:00', 'Quirky industrial interiors and a buzzing crowd on the Church Street end.'),
  ('Pegs N Bottles', 'bar', 'mg_road_brigade', 12.9752, 77.6037, '{"no_restrictions"}', '{"chill","social"}', '{"night_out"}', 2, '12:00-00:00', 'Standing bar with karaoke and BYOB at MRP right on Church Street.'),
  ('Gangarams Book Bureau', 'bookstore', 'mg_road_brigade', 12.9743, 77.6068, '{"no_restrictions"}', '{"quiet","productive"}', '{"cafe_hopping"}', 1, '10:00-20:00', 'Heritage bookstore since 1977 with rare titles and genuinely helpful staff.'),
  ('Premier Book Shop', 'bookstore', 'mg_road_brigade', 12.975, 77.604, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"art","walks"}', 1, '10:00-19:30', 'Church Street''s oldest curated indie bookshop packed floor to ceiling.'),
  ('Cubbon Park (Sri Chamarajendra Park)', 'park', 'mg_road_brigade', 12.9752, 77.5929, '{"no_restrictions"}', '{"contemplative","quiet"}', '{"walks","parks","photography"}', 1, '6:00-18:00', '300 acres of canopied paths and lawns breathing cool air over central Bangalore.'),
  ('Mahatma Gandhi Park', 'park', 'mg_road_brigade', 12.9772, 77.5997, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"walks","photography","parks"}', 1, '00:00-00:00', 'Shaded Gandhi statues and a quiet perimeter walk beside Chinnaswamy stadium.'),
  ('Bheema''s Restaurant', 'restaurant', 'mg_road_brigade', 12.9752, 77.6036, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"cafe_hopping"}', 2, '11:30-15:30,19:00-22:30', 'Andhra banana-leaf meals with unlimited rice and slow-cooked gravies.'),
  ('Burma Burma Restaurant and Tea Room', 'restaurant', 'mg_road_brigade', 12.973, 77.6061, '{"vegetarian","vegan"}', '{"romantic","chill"}', '{"cafe_hopping","art"}', 3, '12:30-16:00,18:30-22:30', 'Lotus stem crisps and samosa soup in a quiet Burmese tea room.'),
  ('Queens Restaurant', 'restaurant', 'mg_road_brigade', 12.9747, 77.6067, '{"no_restrictions"}', '{"quiet","social"}', '{"cafe_hopping"}', 2, '12:00-23:30', 'North Indian curries and biryani sizzlers steps from the MG Road metro exit.'),
  ('The Promenade at MG Road', 'walk', 'mg_road_brigade', 12.9761, 77.6048, '{"no_restrictions"}', '{"chill","social"}', '{"walks","photography","art"}', 1, '9:00-18:00', 'Restored colonial walkway with public art nooks beside the metro station.'),
  ('Spaine Spa', 'wellness', 'mg_road_brigade', 12.9752, 77.6037, '{"no_restrictions"}', '{"quiet","romantic"}', '{"workout"}', 2, '12:00-22:30', 'Foot reflexology with a glass of wine in a clean Church Street hideaway.'),
  ('Unified Art Gallery', 'art', 'whitefield', 12.9596, 77.7479, '{"no_restrictions"}', '{"contemplative","social"}', '{"art","photography"}', 1, '10:00-22:00', 'Custom sketches and rotating local art inside Nexus Whitefield Mall.'),
  ('Dock 66', 'bar', 'whitefield', 12.971, 77.7252, '{"no_restrictions"}', '{"social","chill"}', '{"night_out","cafe_hopping"}', 2, '12:00-00:00', 'Waterside gastropub with inventive cocktails and warm string lights.'),
  ('Hard Rock Cafe Whitefield', 'bar', 'whitefield', 12.9871, 77.7365, '{"no_restrictions"}', '{"lively","social"}', '{"night_out","music"}', 3, '12:00-00:00', 'Live bands and terrace seats with rock memorabilia lining every wall.'),
  ('Underdoggs Whitefield', 'bar', 'whitefield', 12.9886, 77.7332, '{"no_restrictions"}', '{"lively","social"}', '{"night_out","music"}', 2, '12:00-01:00', 'Twenty screens and cold beer make every match feel electric.'),
  ('Windmills Craftworks', 'bar', 'whitefield', 12.9825, 77.7218, '{"no_restrictions"}', '{"social","lively"}', '{"music","night_out"}', 3, '12:00-00:00', 'Craft beer and live jazz on the sixth floor above the EPIP trees.'),
  ('Cafe Fiori', 'cafe', 'whitefield', 12.9804, 77.7508, '{"vegetarian","gluten_free"}', '{"romantic","chill"}', '{"cafe_hopping","photography"}', 2, '11:00-22:00', 'Floral-walled garden cafe with fresh continental plates and good light.'),
  ('Issimo Cafe', 'cafe', 'whitefield', 12.9896, 77.7326, '{"vegetarian"}', '{"productive","quiet"}', '{"cafe_hopping"}', 2, '8:00-19:00', 'Sunlit ITPL-side cafe perfect for client calls and slow mornings.'),
  ('Lavonne Cafe', 'cafe', 'whitefield', 12.9896, 77.7278, '{"vegetarian"}', '{"chill","social"}', '{"cafe_hopping"}', 2, '11:00-23:00', 'Warm croissants and pistachio cappuccinos inside Forum Mall.'),
  ('Paper & Pie', 'cafe', 'whitefield', 12.9654, 77.7324, '{"vegetarian","vegan"}', '{"productive","chill"}', '{"cafe_hopping","walks"}', 2, '8:00-22:00', 'Avocado toasts and strong mochas in a quiet plant-lit corner.'),
  ('The Chocolate Room', 'cafe', 'whitefield', 12.9923, 77.7197, '{"vegetarian"}', '{"social","lively"}', '{"cafe_hopping","night_out"}', 2, '11:00-01:00', 'Fondue and ferrero rocher shakes in a chocolate-scented lounge.'),
  ('Inner Circle Municipal Park', 'park', 'whitefield', 12.9719, 77.7485, '{"no_restrictions"}', '{"chill","quiet"}', '{"walks","parks"}', 1, '5:00-10:00,16:30-20:00', 'Shaded 400-metre loop for morning walks inside Dodsworth Layout.'),
  ('Kadugodi Tree Park', 'park', 'whitefield', 12.9866, 77.7448, '{"no_restrictions"}', '{"contemplative","quiet"}', '{"walks","photography","parks"}', 1, '06:00-17:30', 'Dense canopy trails and an open-air gym tucked off noisy ITPL Road.'),
  ('Kake Di Hatti Whitefield', 'restaurant', 'whitefield', 12.9658, 77.7493, '{"vegetarian","jain_friendly"}', '{"social","lively"}', '{"walks","music"}', 2, '11:00-23:00', 'Fluffy naans and smoky paneer in a buzzy North Indian dining room.'),
  ('Oota Bangalore', 'restaurant', 'whitefield', 12.9825, 77.7218, '{"vegetarian","no_restrictions"}', '{"contemplative","quiet"}', '{"art","cafe_hopping"}', 3, '12:00-15:00,19:00-22:30', 'Karnataka thali served on a breezy covered terrace with classical music.'),
  ('Meghavi Wellness Spa', 'wellness', 'whitefield', 12.9597, 77.7479, '{"no_restrictions"}', '{"quiet","contemplative"}', '{"workout"}', 2, '10:00-22:00', 'Skilled therapists melt shoulder tension in a clean and calm setting.')
ON CONFLICT (name, neighborhood) DO NOTHING;
