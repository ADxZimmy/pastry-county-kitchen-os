create table if not exists app_users (
  id text primary key,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('Owner/Admin','Baker','Inventory Manager','Viewer')),
  password_hash text not null,
  active boolean not null default true,
  session_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists suppliers (
  id text primary key,
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  default_currency text not null default 'NGN',
  lead_time_days integer not null default 2 check (lead_time_days >= 0),
  supplied_ingredient_ids text[] not null default '{}',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ingredients (
  id text primary key,
  name text not null,
  category text not null,
  base_unit text not null check (base_unit in ('g','kg','ml','litre','pcs','cup','tablespoon','teaspoon','pack','roll','egg','yolk','white')),
  purchase_unit text not null default 'g' check (purchase_unit in ('g','kg','ml','litre','pcs','cup','tablespoon','teaspoon','pack','roll','egg','yolk','white')),
  current_stock numeric(14,3) not null default 0,
  reserved_stock numeric(14,3) not null default 0 check (reserved_stock >= 0),
  reorder_level numeric(14,3) not null default 0 check (reorder_level >= 0),
  latest_unit_cost numeric(14,4) not null default 0 check (latest_unit_cost >= 0),
  supplier_id text references suppliers(id) on delete set null,
  expiry_tracking_enabled boolean not null default false,
  default_expiry_days integer,
  expiry_date date,
  notes text,
  allergen_profile jsonb not null default '{}',
  storage_profile jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key,
  name text not null,
  category text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipes (
  id text primary key,
  product_id text not null references products(id),
  name text not null,
  category text not null,
  base_yield_quantity numeric(14,3) not null check (base_yield_quantity > 0),
  yield_unit text not null,
  instructions text[] not null default '{}',
  notes text,
  formula_metadata jsonb not null default '{}',
  cost_profile jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipe_items (
  id text primary key,
  recipe_id text not null references recipes(id),
  ingredient_id text not null references ingredients(id),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (unit in ('g','kg','ml','litre','pcs','cup','tablespoon','teaspoon','pack','roll','egg','yolk','white')),
  waste_percentage numeric(6,3) not null default 0 check (waste_percentage >= 0),
  notes text,
  prep_state jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id text primary key,
  customer_name text not null,
  customer_phone text,
  due_date date not null,
  delivery_method text not null check (delivery_method in ('Delivery','Pickup')),
  status text not null default 'Draft' check (status in ('Draft','Confirmed','Stock Reserved','In Production','Produced','Delivered','Cancelled')),
  payment_status text not null default 'Unpaid' check (payment_status in ('Unpaid','Deposit Paid','Paid')),
  production_status text not null default 'Not Started' check (production_status in ('Not Started','Ready','In Progress','Completed')),
  stock_status text not null default 'In Stock' check (stock_status in ('In Stock','Low Stock','Out of Stock','Reserved','Shortage')),
  notes text,
  archived boolean not null default false,
  delivery_fee numeric(14,2),
  discount_amount numeric(14,2),
  tax_rate numeric(6,3),
  amount_paid numeric(14,2),
  subtotal numeric(14,2),
  tax_amount numeric(14,2),
  net_total numeric(14,2),
  gross_total numeric(14,2),
  balance numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id text primary key,
  order_id text not null references orders(id),
  product_id text not null references products(id),
  recipe_id text not null references recipes(id),
  requested_yield_quantity numeric(14,3) not null check (requested_yield_quantity > 0),
  yield_unit text not null,
  quantity_multiplier numeric(14,3) not null default 1 check (quantity_multiplier > 0),
  notes text,
  sale_quantity numeric(14,3),
  unit_selling_price numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists purchase_logs (
  id text primary key,
  supplier_id text references suppliers(id),
  ingredient_id text not null references ingredients(id),
  purchase_quantity numeric(14,3) not null check (purchase_quantity > 0),
  purchase_unit text not null,
  purchase_price numeric(14,2) not null check (purchase_price >= 0),
  converted_quantity_in_base_unit numeric(14,3) not null check (converted_quantity_in_base_unit > 0),
  cost_per_base_unit numeric(14,4) not null check (cost_per_base_unit >= 0),
  purchase_date date not null default current_date,
  expiry_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists ingredient_batches (
  id text primary key,
  ingredient_id text not null references ingredients(id),
  purchase_id text references purchase_logs(id),
  quantity_received numeric(14,3) not null check (quantity_received >= 0),
  quantity_remaining numeric(14,3) not null check (quantity_remaining >= 0),
  unit text not null,
  expiry_date date,
  received_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory_movements (
  id text primary key,
  ingredient_id text not null references ingredients(id),
  movement_type text not null check (movement_type in ('purchase','production_use','reservation','reservation_release','adjustment','waste','return','correction')),
  quantity_change numeric(14,3) not null,
  unit text not null,
  related_order_id text references orders(id),
  related_order_item_id text references order_items(id),
  related_purchase_id text references purchase_logs(id),
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists conversion_rules (
  id text primary key,
  ingredient_id text not null references ingredients(id),
  from_unit text not null,
  to_unit text not null,
  conversion_factor numeric(14,6) not null check (conversion_factor > 0),
  conversion_type text not null check (conversion_type in ('direct','ingredient_specific')),
  confidence_level text not null check (confidence_level in ('Low','Medium','High')),
  source text not null check (source in ('AI estimate','manual entry','measured in kitchen','seed rule')),
  verified boolean not null default false,
  notes text,
  ingredient_state text,
  temperature_state text,
  formula_context text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists production_qc_logs (
  id text primary key,
  order_id text not null references orders(id),
  recipe_id text references recipes(id),
  batch_key text,
  formula_version text,
  expected_yield_quantity numeric(14,3),
  actual_yield_quantity numeric(14,3),
  yield_unit text,
  room_temperature text,
  mix_temperature text,
  oven_temperature text,
  bake_time_minutes numeric(8,2),
  rest_time_minutes numeric(8,2),
  sensory_notes text,
  defects text,
  next_adjustment text,
  passed_qc boolean not null default true,
  logged_by text,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  actor text not null default 'system',
  created_at timestamptz not null default now()
);

create table if not exists notification_events (
  id text primary key,
  type text not null,
  recipient text,
  subject text not null,
  body text not null,
  status text not null default 'logged',
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists order_events (
  id text primary key,
  order_id text not null references orders(id),
  event_type text not null,
  actor_user_id text,
  actor_name text not null default 'system',
  previous_status text,
  new_status text,
  metadata jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists production_runs (
  id text primary key,
  order_id text not null references orders(id),
  batch_key text,
  actor text,
  planned_yield numeric(14,3),
  actual_yield numeric(14,3),
  waste_quantity numeric(14,3),
  qc_log_id text,
  created_at timestamptz not null default now(),
  unique (order_id)
);

create table if not exists settings (
  id text primary key,
  business_name text not null default 'Pastry County',
  currency text not null default 'NGN',
  default_deduction_stage text not null default 'production_completion' check (default_deduction_stage in ('confirmation','production_start','production_completion')),
  allow_negative_inventory boolean not null default false,
  require_ai_conversion_confirmation boolean not null default true,
  gram_rounding_preference integer not null default 5 check (gram_rounding_preference in (1,5,10)),
  egg_rounding_preference text not null default 'nearest_whole_egg' check (egg_rounding_preference in ('nearest_whole_egg','allow_gram_conversion')),
  safety_margin_percentage numeric(6,3) not null default 10 check (safety_margin_percentage >= 0),
  default_tax_percentage numeric(6,3) not null default 0 check (default_tax_percentage >= 0),
  low_stock_notification_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ingredients_category_idx on ingredients(category);
create index if not exists inventory_movements_ingredient_idx on inventory_movements(ingredient_id, created_at desc);
create index if not exists ingredient_batches_fefo_idx on ingredient_batches(ingredient_id, expiry_date nulls last, received_date);
create index if not exists audit_logs_entity_idx on audit_logs(entity_type, entity_id, created_at desc);
create index if not exists order_events_order_idx on order_events(order_id, created_at);
create index if not exists order_items_order_idx on order_items(order_id);
create index if not exists recipe_items_recipe_idx on recipe_items(recipe_id);
create index if not exists conversion_rules_lookup_idx on conversion_rules(ingredient_id, from_unit, to_unit);
create index if not exists conversion_rules_scoped_lookup_idx on conversion_rules(ingredient_id, from_unit, to_unit, ingredient_state, temperature_state, formula_context);
create index if not exists production_qc_logs_order_idx on production_qc_logs(order_id, created_at desc);
