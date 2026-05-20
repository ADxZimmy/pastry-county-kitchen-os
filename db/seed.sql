insert into app_users (id, email, full_name, role, password_hash) values
  ('user-owner', 'owner@pastrycounty.ng', 'Pastry County Owner', 'Owner/Admin', '$2a$10$/zx3vcuPpG/HOzAb8pM2tO4FnQdHDT1nCsxRdUaA636c22zbGtlCu')
on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, role = excluded.role, password_hash = excluded.password_hash, updated_at = now();

insert into suppliers (id, name, contact_name, phone, email, address, default_currency, lead_time_days, supplied_ingredient_ids, notes) values
  ('sup-market', 'Balogun Baking Market', 'Mrs Ade', '+234 801 555 0140', 'orders@balogunmarket.ng', 'Lagos Island', 'NGN', 2, array['flour','sugar','cocoa','dark-chocolate','white-chocolate','coconut-oil','vanilla','baking-powder','salt','peanuts'], 'Reliable dry goods and chocolate.'),
  ('sup-farm', 'Fresh Crate Farms', 'Timi', '+234 802 555 0172', 'hello@freshcrate.ng', 'Lekki', 'NGN', 1, array['eggs','egg-yolks','egg-whites','lemon','blueberries','banana'], 'Eggs, berries, lemons, bananas.'),
  ('sup-pack', 'Ivory Pack Studio', 'Nora', '+234 803 555 0188', 'sales@ivorypack.ng', 'Yaba', 'NGN', 3, array['box','parchment','stickers'], 'Boxes, stickers, parchment.')
on conflict (id) do update set name = excluded.name, contact_name = excluded.contact_name, phone = excluded.phone, email = excluded.email, address = excluded.address, default_currency = excluded.default_currency, lead_time_days = excluded.lead_time_days, supplied_ingredient_ids = excluded.supplied_ingredient_ids, notes = excluded.notes, updated_at = now();

insert into ingredients (id, name, category, base_unit, current_stock, reserved_stock, reorder_level, latest_unit_cost, supplier_id, expiry_tracking_enabled, notes) values
  ('flour', 'Flour', 'Dry Goods', 'g', 10000, 0, 3000, 0.50, 'sup-market', false, null),
  ('sugar', 'Sugar', 'Dry Goods', 'g', 8000, 0, 2500, 0.62, 'sup-market', false, null),
  ('cocoa', 'Cocoa Powder', 'Chocolate', 'g', 2000, 0, 800, 4.20, 'sup-market', false, null),
  ('dark-chocolate', 'Dark Chocolate', 'Chocolate', 'g', 450, 0, 1000, 7.80, 'sup-market', false, 'Use 55% to 70% cocoa for brownies.'),
  ('white-chocolate', 'White Chocolate', 'Chocolate', 'g', 1800, 0, 900, 8.10, 'sup-market', false, null),
  ('eggs', 'Eggs', 'Dairy', 'pcs', 8, 0, 30, 160.00, 'sup-farm', true, null),
  ('egg-yolks', 'Egg Yolks', 'Dairy', 'g', 0, 0, 0, 3.20, 'sup-farm', true, null),
  ('egg-whites', 'Egg Whites', 'Dairy', 'g', 0, 0, 0, 2.40, 'sup-farm', true, null),
  ('coconut-oil', 'Coconut Oil', 'Dairy', 'ml', 3000, 0, 1000, 2.80, 'sup-market', false, null),
  ('vanilla', 'Vanilla Extract', 'Dry Goods', 'ml', 500, 0, 150, 12.00, 'sup-market', false, null),
  ('baking-powder', 'Baking Powder', 'Dry Goods', 'g', 700, 0, 250, 1.10, 'sup-market', false, null),
  ('salt', 'Salt', 'Dry Goods', 'g', 1200, 0, 200, 0.20, 'sup-market', false, null),
  ('lemon', 'Lemon', 'Fruits', 'pcs', 20, 0, 12, 120.00, 'sup-farm', true, null),
  ('blueberries', 'Blueberries', 'Fruits', 'g', 300, 0, 500, 9.50, 'sup-farm', true, null),
  ('banana', 'Banana', 'Fruits', 'pcs', 14, 0, 10, 110.00, 'sup-farm', true, null),
  ('peanuts', 'Peanuts', 'Dry Goods', 'g', 2200, 0, 700, 2.20, 'sup-market', false, null),
  ('box', 'Packaging Box', 'Packaging', 'pcs', 50, 0, 20, 180.00, 'sup-pack', false, null),
  ('parchment', 'Parchment Paper', 'Packaging', 'roll', 1, 0, 2, 2500.00, 'sup-pack', false, null),
  ('stickers', 'Stickers', 'Packaging', 'pcs', 120, 0, 100, 25.00, 'sup-pack', false, null)
on conflict (id) do update set name = excluded.name, category = excluded.category, base_unit = excluded.base_unit, current_stock = excluded.current_stock, reserved_stock = excluded.reserved_stock, reorder_level = excluded.reorder_level, latest_unit_cost = excluded.latest_unit_cost, supplier_id = excluded.supplier_id, expiry_tracking_enabled = excluded.expiry_tracking_enabled, notes = excluded.notes, updated_at = now();

insert into products (id, name, category, description, active) values
  ('classic-brownies', 'Classic Brownies', 'Brownies', 'Deep cocoa brownies with dark chocolate pockets.', true),
  ('nutty-brownies', 'Nutty Brownies', 'Brownies', 'Classic brownies finished with roasted peanuts.', true),
  ('butterscotch-blondies', 'Butterscotch Blondies', 'Blondies', 'Caramel blondies with white chocolate.', true),
  ('red-velvet-cookies', 'Red Velvet Cookies', 'Cookies', 'Soft red velvet cookies with white chocolate.', true),
  ('lemon-blueberry-loaf', 'Lemon Blueberry Loaf', 'Loaves', 'Bright lemon loaf with blueberries.', true),
  ('banana-loaf', 'Banana Loaf', 'Loaves', 'Moist banana loaf for daily slices.', true)
on conflict (id) do update set name = excluded.name, category = excluded.category, description = excluded.description, active = excluded.active, updated_at = now();

insert into recipes (id, product_id, name, category, base_yield_quantity, yield_unit, instructions, active) values
  ('recipe-classic', 'classic-brownies', 'Classic Brownies', 'Brownies', 16, 'pieces', array['Melt chocolate with coconut oil.', 'Whisk eggs and sugar until glossy.', 'Fold in dry ingredients.', 'Bake until set and cool before cutting.'], true),
  ('recipe-nutty', 'nutty-brownies', 'Nutty Brownies', 'Brownies', 16, 'pieces', array['Prepare classic brownie batter.', 'Fold in roasted peanuts.', 'Bake and portion after cooling.'], true),
  ('recipe-blondies', 'butterscotch-blondies', 'Butterscotch Blondies', 'Blondies', 16, 'pieces', array['Cream sugar and oil.', 'Fold in flour and white chocolate.', 'Bake until the center is softly set.'], true),
  ('recipe-cookies', 'red-velvet-cookies', 'Red Velvet Cookies', 'Cookies', 12, 'cookies', array['Mix dough.', 'Scoop evenly.', 'Bake until edges set.'], true),
  ('recipe-lemon', 'lemon-blueberry-loaf', 'Lemon Blueberry Loaf', 'Loaves', 1, 'loaf', array['Cream wet ingredients.', 'Fold in flour and blueberries.', 'Bake in lined loaf tin.'], true),
  ('recipe-banana', 'banana-loaf', 'Banana Loaf', 'Loaves', 1, 'loaf', array['Mash bananas.', 'Fold batter gently.', 'Bake until skewer comes out clean.'], true)
on conflict (id) do update set product_id = excluded.product_id, name = excluded.name, category = excluded.category, base_yield_quantity = excluded.base_yield_quantity, yield_unit = excluded.yield_unit, instructions = excluded.instructions, active = excluded.active, updated_at = now();

insert into recipe_items (id, recipe_id, ingredient_id, quantity, unit) values
  ('ri-1', 'recipe-classic', 'flour', 300, 'g'), ('ri-2', 'recipe-classic', 'sugar', 500, 'g'), ('ri-3', 'recipe-classic', 'cocoa', 120, 'g'), ('ri-4', 'recipe-classic', 'dark-chocolate', 250, 'g'), ('ri-5', 'recipe-classic', 'eggs', 4, 'pcs'), ('ri-6', 'recipe-classic', 'coconut-oil', 180, 'ml'), ('ri-7', 'recipe-classic', 'box', 1, 'pcs'),
  ('ri-8', 'recipe-nutty', 'flour', 300, 'g'), ('ri-9', 'recipe-nutty', 'sugar', 480, 'g'), ('ri-10', 'recipe-nutty', 'cocoa', 120, 'g'), ('ri-11', 'recipe-nutty', 'dark-chocolate', 220, 'g'), ('ri-12', 'recipe-nutty', 'peanuts', 180, 'g'),
  ('ri-13', 'recipe-blondies', 'flour', 340, 'g'), ('ri-14', 'recipe-blondies', 'sugar', 420, 'g'), ('ri-15', 'recipe-blondies', 'white-chocolate', 240, 'g'), ('ri-16', 'recipe-blondies', 'eggs', 3, 'pcs'),
  ('ri-17', 'recipe-cookies', 'flour', 280, 'g'), ('ri-18', 'recipe-cookies', 'sugar', 260, 'g'), ('ri-19', 'recipe-cookies', 'white-chocolate', 160, 'g'),
  ('ri-20', 'recipe-lemon', 'flour', 420, 'g'), ('ri-21', 'recipe-lemon', 'sugar', 260, 'g'), ('ri-22', 'recipe-lemon', 'eggs', 3, 'pcs'), ('ri-23', 'recipe-lemon', 'lemon', 3, 'pcs'), ('ri-24', 'recipe-lemon', 'blueberries', 400, 'g'),
  ('ri-25', 'recipe-banana', 'flour', 360, 'g'), ('ri-26', 'recipe-banana', 'sugar', 180, 'g'), ('ri-27', 'recipe-banana', 'banana', 4, 'pcs')
on conflict (id) do update set recipe_id = excluded.recipe_id, ingredient_id = excluded.ingredient_id, quantity = excluded.quantity, unit = excluded.unit, updated_at = now();

insert into orders (id, customer_name, customer_phone, due_date, delivery_method, status, payment_status, production_status, stock_status, notes) values
  ('ord-chika', 'Chika', '+234 810 555 0101', current_date, 'Pickup', 'Confirmed', 'Deposit Paid', 'Ready', 'Shortage', 'Cut into 12 neat pieces.'),
  ('ord-tolu', 'Tolu', '+234 810 555 0111', current_date + 1, 'Delivery', 'Confirmed', 'Paid', 'Not Started', 'Shortage', 'Deliver before noon.'),
  ('ord-amaka', 'Amaka', '+234 810 555 0121', current_date + 4, 'Pickup', 'Draft', 'Unpaid', 'Not Started', 'In Stock', 'Birthday message sticker.')
on conflict (id) do update set customer_name = excluded.customer_name, customer_phone = excluded.customer_phone, due_date = excluded.due_date, delivery_method = excluded.delivery_method, status = excluded.status, payment_status = excluded.payment_status, production_status = excluded.production_status, stock_status = excluded.stock_status, notes = excluded.notes, updated_at = now();

insert into order_items (id, order_id, product_id, recipe_id, requested_yield_quantity, yield_unit, quantity_multiplier) values
  ('oi-1', 'ord-chika', 'classic-brownies', 'recipe-classic', 12, 'pieces', 1),
  ('oi-2', 'ord-tolu', 'lemon-blueberry-loaf', 'recipe-lemon', 2, 'loaves', 1),
  ('oi-3', 'ord-amaka', 'butterscotch-blondies', 'recipe-blondies', 16, 'pieces', 1)
on conflict (id) do update set order_id = excluded.order_id, product_id = excluded.product_id, recipe_id = excluded.recipe_id, requested_yield_quantity = excluded.requested_yield_quantity, yield_unit = excluded.yield_unit, quantity_multiplier = excluded.quantity_multiplier, updated_at = now();

insert into inventory_movements (id, ingredient_id, movement_type, quantity_change, unit, related_order_id, note, created_by, created_at) values
  ('mov-1', 'dark-chocolate', 'purchase', 5000, 'g', null, 'Added 5,000g from Market Purchase', 'Inventory Manager', now() - interval '6 day'),
  ('mov-2', 'dark-chocolate', 'production_use', -225, 'g', 'ord-chika', 'Used 225g for Classic Brownies Order', 'Baker', now() - interval '3 day'),
  ('mov-3', 'dark-chocolate', 'adjustment', -50, 'g', null, 'Adjusted -50g for spillage', 'Owner', now() - interval '2 day')
on conflict (id) do update set ingredient_id = excluded.ingredient_id, movement_type = excluded.movement_type, quantity_change = excluded.quantity_change, unit = excluded.unit, related_order_id = excluded.related_order_id, note = excluded.note, created_by = excluded.created_by;

insert into conversion_rules (id, ingredient_id, from_unit, to_unit, conversion_factor, conversion_type, confidence_level, source, verified) values
  ('cr-flour', 'flour', 'cup', 'g', 120, 'ingredient_specific', 'High', 'seed rule', true),
  ('cr-sugar', 'sugar', 'cup', 'g', 200, 'ingredient_specific', 'High', 'seed rule', true),
  ('cr-cocoa', 'cocoa', 'cup', 'g', 85, 'ingredient_specific', 'High', 'seed rule', true),
  ('cr-oil', 'coconut-oil', 'cup', 'ml', 240, 'ingredient_specific', 'High', 'seed rule', true),
  ('cr-egg', 'eggs', 'egg', 'g', 50, 'ingredient_specific', 'Medium', 'seed rule', true),
  ('cr-yolk', 'egg-yolks', 'yolk', 'g', 18, 'ingredient_specific', 'Medium', 'seed rule', true),
  ('cr-white', 'egg-whites', 'white', 'g', 30, 'ingredient_specific', 'Medium', 'seed rule', true)
on conflict (id) do update set ingredient_id = excluded.ingredient_id, from_unit = excluded.from_unit, to_unit = excluded.to_unit, conversion_factor = excluded.conversion_factor, conversion_type = excluded.conversion_type, confidence_level = excluded.confidence_level, source = excluded.source, verified = excluded.verified, updated_at = now();

insert into settings (id, business_name, currency, default_deduction_stage, allow_negative_inventory, require_ai_conversion_confirmation, gram_rounding_preference, egg_rounding_preference, safety_margin_percentage, default_tax_percentage, low_stock_notification_email) values
  ('default', 'Pastry County', 'NGN', 'production_completion', false, true, 5, 'nearest_whole_egg', 10, 0, null)
on conflict (id) do update set business_name = excluded.business_name, currency = excluded.currency, default_deduction_stage = excluded.default_deduction_stage, allow_negative_inventory = excluded.allow_negative_inventory, require_ai_conversion_confirmation = excluded.require_ai_conversion_confirmation, gram_rounding_preference = excluded.gram_rounding_preference, egg_rounding_preference = excluded.egg_rounding_preference, safety_margin_percentage = excluded.safety_margin_percentage, default_tax_percentage = excluded.default_tax_percentage, low_stock_notification_email = excluded.low_stock_notification_email, updated_at = now();
