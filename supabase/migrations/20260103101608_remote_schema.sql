drop extension if exists "pg_net";

create sequence "public"."external_event_mappings_id_seq";

create sequence "public"."external_events_id_seq";

create sequence "public"."local_event_meta_id_seq";


  create table "public"."activities" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "title" text not null,
    "activity_date" date not null,
    "activity_time" time without time zone not null,
    "location" text,
    "category_id" uuid,
    "is_external" boolean not null default false,
    "external_calendar_id" uuid,
    "external_event_id" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "series_id" uuid,
    "series_instance_date" date,
    "external_category" text,
    "manually_set_category" boolean default false,
    "category_updated_at" timestamp with time zone,
    "team_id" uuid,
    "player_id" uuid
      );


alter table "public"."activities" enable row level security;


  create table "public"."activity_categories" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "name" text not null,
    "color" text not null,
    "emoji" text not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "team_id" uuid,
    "player_id" uuid,
    "is_system" boolean default false
      );


alter table "public"."activity_categories" enable row level security;


  create table "public"."activity_series" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "title" text not null,
    "location" text,
    "category_id" uuid,
    "recurrence_type" text not null,
    "recurrence_days" integer[] default '{}'::integer[],
    "start_date" date not null,
    "end_date" date,
    "activity_time" time without time zone not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "team_id" uuid,
    "player_id" uuid
      );


alter table "public"."activity_series" enable row level security;


  create table "public"."activity_task_subtasks" (
    "id" uuid not null default gen_random_uuid(),
    "activity_task_id" uuid not null,
    "title" text not null,
    "completed" boolean not null default false,
    "sort_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."activity_task_subtasks" enable row level security;


  create table "public"."activity_tasks" (
    "id" uuid not null default gen_random_uuid(),
    "activity_id" uuid not null,
    "task_template_id" uuid,
    "title" text not null,
    "description" text,
    "completed" boolean not null default false,
    "reminder_minutes" integer,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."activity_tasks" enable row level security;


  create table "public"."admin_player_relationships" (
    "id" uuid not null default gen_random_uuid(),
    "admin_id" uuid not null,
    "player_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."admin_player_relationships" enable row level security;


  create table "public"."category_mappings" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "external_category" text not null,
    "internal_category_id" uuid not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."category_mappings" enable row level security;


  create table "public"."event_sync_log" (
    "id" uuid not null default gen_random_uuid(),
    "external_event_id" uuid,
    "calendar_id" uuid,
    "user_id" uuid,
    "action" text not null,
    "details" jsonb default '{}'::jsonb,
    "timestamp" timestamp with time zone default now()
      );


alter table "public"."event_sync_log" enable row level security;


  create table "public"."events_external" (
    "id" uuid not null default gen_random_uuid(),
    "provider" text not null,
    "provider_event_uid" text not null,
    "provider_calendar_id" uuid,
    "recurrence_id" text,
    "external_last_modified" timestamp with time zone,
    "fetched_at" timestamp with time zone default now(),
    "raw_payload" jsonb,
    "title" text not null,
    "description" text,
    "location" text,
    "start_date" date not null,
    "start_time" time without time zone not null,
    "end_date" date,
    "end_time" time without time zone,
    "is_all_day" boolean default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "miss_count" integer default 0,
    "deleted" boolean default false
      );


alter table "public"."events_external" enable row level security;


  create table "public"."events_local_meta" (
    "id" uuid not null default gen_random_uuid(),
    "external_event_id" uuid,
    "user_id" uuid not null,
    "category_id" uuid,
    "local_title_override" text,
    "local_description" text,
    "local_start_override" timestamp with time zone,
    "local_end_override" timestamp with time zone,
    "reminders" jsonb default '[]'::jsonb,
    "pinned" boolean default false,
    "custom_fields" jsonb default '{}'::jsonb,
    "last_local_modified" timestamp with time zone default now(),
    "manually_set_category" boolean default false,
    "category_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "team_id" uuid,
    "player_id" uuid
      );


alter table "public"."events_local_meta" enable row level security;


  create table "public"."exercise_assignments" (
    "id" uuid not null default gen_random_uuid(),
    "exercise_id" uuid not null,
    "trainer_id" uuid not null,
    "player_id" uuid,
    "team_id" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."exercise_assignments" enable row level security;


  create table "public"."exercise_library" (
    "id" uuid not null default gen_random_uuid(),
    "trainer_id" uuid not null,
    "title" text not null,
    "description" text,
    "video_url" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "is_system" boolean default false,
    "category_path" text
      );


alter table "public"."exercise_library" enable row level security;


  create table "public"."exercise_subtasks" (
    "id" uuid not null default gen_random_uuid(),
    "exercise_id" uuid not null,
    "title" text not null,
    "sort_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."exercise_subtasks" enable row level security;


  create table "public"."external_calendars" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null,
    "ics_url" text not null,
    "enabled" boolean not null default true,
    "last_fetched" timestamp with time zone,
    "event_count" integer default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "auto_sync_enabled" boolean default true,
    "sync_interval_minutes" integer default 60
      );


alter table "public"."external_calendars" enable row level security;


  create table "public"."external_event_mappings" (
    "id" bigint not null default nextval('public.external_event_mappings_id_seq'::regclass),
    "external_event_id" bigint not null,
    "provider" text not null,
    "provider_uid" text not null,
    "mapped_at" timestamp with time zone default now()
      );


alter table "public"."external_event_mappings" enable row level security;


  create table "public"."external_event_tasks" (
    "id" uuid not null default gen_random_uuid(),
    "local_meta_id" uuid not null,
    "task_template_id" uuid,
    "title" text not null,
    "description" text,
    "completed" boolean default false,
    "reminder_minutes" integer,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."external_event_tasks" enable row level security;


  create table "public"."external_events" (
    "id" bigint not null default nextval('public.external_events_id_seq'::regclass),
    "provider" text not null,
    "primary_provider_uid" text,
    "dtstart_utc" timestamp with time zone,
    "summary" text,
    "location" text,
    "external_last_modified" timestamp with time zone,
    "raw_payload" text,
    "raw_hash" text,
    "first_seen" timestamp with time zone default now(),
    "last_seen" timestamp with time zone default now(),
    "deleted" boolean default false
      );


alter table "public"."external_events" enable row level security;


  create table "public"."hidden_activity_categories" (
    "user_id" uuid not null,
    "category_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."hidden_activity_categories" enable row level security;


  create table "public"."hidden_task_templates" (
    "user_id" uuid not null,
    "task_template_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."hidden_task_templates" enable row level security;


  create table "public"."local_event_meta" (
    "id" bigint not null default nextval('public.local_event_meta_id_seq'::regclass),
    "external_event_id" bigint,
    "user_id" uuid,
    "category_id" uuid,
    "overrides" jsonb,
    "last_local_modified" timestamp with time zone default now()
      );


alter table "public"."local_event_meta" enable row level security;


  create table "public"."player_invitations" (
    "id" uuid not null default gen_random_uuid(),
    "admin_id" uuid not null,
    "email" text not null,
    "player_name" text not null,
    "invitation_code" text not null,
    "status" text not null default 'pending'::text,
    "expires_at" timestamp with time zone not null,
    "created_at" timestamp with time zone default now(),
    "accepted_at" timestamp with time zone,
    "player_id" uuid
      );


alter table "public"."player_invitations" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "full_name" text,
    "phone_number" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "subscription_tier" text,
    "subscription_product_id" text,
    "subscription_receipt" text,
    "subscription_updated_at" timestamp with time zone
      );


alter table "public"."profiles" enable row level security;


  create table "public"."subscription_plans" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "price_dkk" integer not null,
    "max_players" integer not null,
    "stripe_price_id" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."subscription_plans" enable row level security;


  create table "public"."subscriptions" (
    "id" uuid not null default gen_random_uuid(),
    "admin_id" uuid not null,
    "plan_id" uuid not null,
    "status" text not null,
    "trial_start" timestamp with time zone,
    "trial_end" timestamp with time zone,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "stripe_customer_id" text,
    "stripe_subscription_id" text,
    "cancel_at_period_end" boolean default false,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."subscriptions" enable row level security;


  create table "public"."task_template_categories" (
    "id" uuid not null default gen_random_uuid(),
    "task_template_id" uuid not null,
    "category_id" uuid not null,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."task_template_categories" enable row level security;


  create table "public"."task_template_subtasks" (
    "id" uuid not null default gen_random_uuid(),
    "task_template_id" uuid not null,
    "title" text not null,
    "sort_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."task_template_subtasks" enable row level security;


  create table "public"."task_templates" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "title" text not null,
    "description" text,
    "reminder_minutes" integer,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "team_id" uuid,
    "player_id" uuid,
    "video_url" text,
    "source_folder" text,
    "after_training_enabled" boolean not null default false,
    "after_training_delay_minutes" integer
      );


alter table "public"."task_templates" enable row level security;


  create table "public"."tasks" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "title" text not null,
    "description" text,
    "completed" boolean not null default false,
    "is_template" boolean not null default false,
    "category_ids" uuid[] default '{}'::uuid[],
    "reminder_minutes" integer,
    "subtasks" jsonb default '[]'::jsonb,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."tasks" enable row level security;


  create table "public"."team_members" (
    "id" uuid not null default gen_random_uuid(),
    "team_id" uuid not null,
    "player_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."team_members" enable row level security;


  create table "public"."teams" (
    "id" uuid not null default gen_random_uuid(),
    "admin_id" uuid not null,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."teams" enable row level security;


  create table "public"."trophies" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "week" integer not null,
    "year" integer not null,
    "type" text not null,
    "percentage" integer not null,
    "completed_tasks" integer not null default 0,
    "total_tasks" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."trophies" enable row level security;


  create table "public"."user_roles" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "role" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."user_roles" enable row level security;


  create table "public"."weekly_performance" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "week_number" integer not null,
    "year" integer not null,
    "trophy_type" text not null,
    "percentage" integer not null,
    "completed_tasks" integer not null default 0,
    "total_tasks" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "team_id" uuid,
    "player_id" uuid
      );


alter table "public"."weekly_performance" enable row level security;

alter sequence "public"."external_event_mappings_id_seq" owned by "public"."external_event_mappings"."id";

alter sequence "public"."external_events_id_seq" owned by "public"."external_events"."id";

alter sequence "public"."local_event_meta_id_seq" owned by "public"."local_event_meta"."id";

CREATE INDEX activities_category_id_idx ON public.activities USING btree (category_id);

CREATE INDEX activities_date_idx ON public.activities USING btree (activity_date);

CREATE INDEX activities_external_calendar_id_idx ON public.activities USING btree (external_calendar_id) WHERE (external_calendar_id IS NOT NULL);

CREATE UNIQUE INDEX activities_pkey ON public.activities USING btree (id);

CREATE INDEX activities_user_id_idx ON public.activities USING btree (user_id);

CREATE UNIQUE INDEX activity_categories_pkey ON public.activity_categories USING btree (id);

CREATE INDEX activity_categories_user_id_idx ON public.activity_categories USING btree (user_id);

CREATE UNIQUE INDEX activity_series_pkey ON public.activity_series USING btree (id);

CREATE UNIQUE INDEX activity_task_subtasks_pkey ON public.activity_task_subtasks USING btree (id);

CREATE INDEX activity_task_subtasks_task_id_idx ON public.activity_task_subtasks USING btree (activity_task_id);

CREATE INDEX activity_tasks_activity_id_idx ON public.activity_tasks USING btree (activity_id);

CREATE UNIQUE INDEX activity_tasks_pkey ON public.activity_tasks USING btree (id);

CREATE INDEX activity_tasks_template_id_idx ON public.activity_tasks USING btree (task_template_id) WHERE (task_template_id IS NOT NULL);

CREATE UNIQUE INDEX admin_player_relationships_admin_id_player_id_key ON public.admin_player_relationships USING btree (admin_id, player_id);

CREATE UNIQUE INDEX admin_player_relationships_pkey ON public.admin_player_relationships USING btree (id);

CREATE UNIQUE INDEX category_mappings_pkey ON public.category_mappings USING btree (id);

CREATE UNIQUE INDEX category_mappings_user_id_external_category_key ON public.category_mappings USING btree (user_id, external_category);

CREATE UNIQUE INDEX event_sync_log_pkey ON public.event_sync_log USING btree (id);

CREATE UNIQUE INDEX events_external_pkey ON public.events_external USING btree (id);

CREATE UNIQUE INDEX events_external_provider_calendar_id_provider_event_uid_rec_key ON public.events_external USING btree (provider_calendar_id, provider_event_uid, recurrence_id);

CREATE UNIQUE INDEX events_local_meta_external_event_id_user_id_key ON public.events_local_meta USING btree (external_event_id, user_id);

CREATE UNIQUE INDEX events_local_meta_pkey ON public.events_local_meta USING btree (id);

CREATE UNIQUE INDEX exercise_assignments_pkey ON public.exercise_assignments USING btree (id);

CREATE UNIQUE INDEX exercise_library_pkey ON public.exercise_library USING btree (id);

CREATE UNIQUE INDEX exercise_subtasks_pkey ON public.exercise_subtasks USING btree (id);

CREATE UNIQUE INDEX external_calendars_pkey ON public.external_calendars USING btree (id);

CREATE INDEX external_calendars_user_id_idx ON public.external_calendars USING btree (user_id);

CREATE UNIQUE INDEX external_event_mappings_pkey ON public.external_event_mappings USING btree (id);

CREATE UNIQUE INDEX external_event_tasks_pkey ON public.external_event_tasks USING btree (id);

CREATE UNIQUE INDEX external_events_pkey ON public.external_events USING btree (id);

CREATE UNIQUE INDEX hidden_activity_categories_pkey ON public.hidden_activity_categories USING btree (user_id, category_id);

CREATE UNIQUE INDEX hidden_task_templates_pkey ON public.hidden_task_templates USING btree (user_id, task_template_id);

CREATE INDEX idx_activities_category_updated_at ON public.activities USING btree (category_updated_at);

CREATE INDEX idx_activities_manually_set_category ON public.activities USING btree (manually_set_category) WHERE (manually_set_category = true);

CREATE INDEX idx_activities_player_id ON public.activities USING btree (player_id);

CREATE INDEX idx_activities_series_id ON public.activities USING btree (series_id);

CREATE INDEX idx_activities_team_id ON public.activities USING btree (team_id);

CREATE INDEX idx_activity_categories_is_system ON public.activity_categories USING btree (is_system);

CREATE INDEX idx_activity_categories_player_id ON public.activity_categories USING btree (player_id);

CREATE INDEX idx_activity_categories_team_id ON public.activity_categories USING btree (team_id);

CREATE INDEX idx_activity_categories_user_id ON public.activity_categories USING btree (user_id);

CREATE INDEX idx_activity_series_user_id ON public.activity_series USING btree (user_id);

CREATE UNIQUE INDEX idx_activity_tasks_unique_template ON public.activity_tasks USING btree (activity_id, task_template_id) WHERE (task_template_id IS NOT NULL);

CREATE INDEX idx_admin_player_relationships_admin_id ON public.admin_player_relationships USING btree (admin_id);

CREATE INDEX idx_admin_player_relationships_player_id ON public.admin_player_relationships USING btree (player_id);

CREATE INDEX idx_category_mappings_user_external ON public.category_mappings USING btree (user_id, external_category);

CREATE INDEX idx_event_sync_log_calendar ON public.event_sync_log USING btree (calendar_id);

CREATE INDEX idx_event_sync_log_timestamp ON public.event_sync_log USING btree ("timestamp" DESC);

CREATE INDEX idx_events_external_calendar ON public.events_external USING btree (provider_calendar_id);

CREATE INDEX idx_events_external_deleted ON public.events_external USING btree (deleted) WHERE (deleted = false);

CREATE INDEX idx_events_external_start_date ON public.events_external USING btree (start_date);

CREATE INDEX idx_events_external_uid ON public.events_external USING btree (provider_event_uid);

CREATE INDEX idx_events_local_meta_category ON public.events_local_meta USING btree (category_id);

CREATE INDEX idx_events_local_meta_external ON public.events_local_meta USING btree (external_event_id);

CREATE INDEX idx_events_local_meta_user ON public.events_local_meta USING btree (user_id);

CREATE INDEX idx_exercise_assignments_exercise_id ON public.exercise_assignments USING btree (exercise_id);

CREATE INDEX idx_exercise_assignments_player_id ON public.exercise_assignments USING btree (player_id);

CREATE INDEX idx_exercise_assignments_team_id ON public.exercise_assignments USING btree (team_id);

CREATE INDEX idx_exercise_assignments_trainer_id ON public.exercise_assignments USING btree (trainer_id);

CREATE INDEX idx_exercise_library_category_path ON public.exercise_library USING btree (category_path);

CREATE INDEX idx_exercise_library_is_system ON public.exercise_library USING btree (is_system);

CREATE INDEX idx_exercise_library_trainer_id ON public.exercise_library USING btree (trainer_id);

CREATE INDEX idx_exercise_subtasks_exercise_id ON public.exercise_subtasks USING btree (exercise_id);

CREATE INDEX idx_external_event_tasks_local_meta ON public.external_event_tasks USING btree (local_meta_id);

CREATE INDEX idx_external_event_tasks_template ON public.external_event_tasks USING btree (task_template_id);

CREATE UNIQUE INDEX idx_external_event_tasks_unique_template ON public.external_event_tasks USING btree (local_meta_id, task_template_id) WHERE (task_template_id IS NOT NULL);

CREATE INDEX idx_player_invitations_admin_id ON public.player_invitations USING btree (admin_id);

CREATE INDEX idx_player_invitations_code ON public.player_invitations USING btree (invitation_code);

CREATE INDEX idx_player_invitations_status ON public.player_invitations USING btree (status);

CREATE INDEX idx_profiles_subscription_product_id ON public.profiles USING btree (subscription_product_id);

CREATE INDEX idx_profiles_subscription_tier ON public.profiles USING btree (subscription_tier);

CREATE INDEX idx_profiles_user_id ON public.profiles USING btree (user_id);

CREATE INDEX idx_task_templates_player_id ON public.task_templates USING btree (player_id);

CREATE INDEX idx_task_templates_team_id ON public.task_templates USING btree (team_id);

CREATE INDEX idx_tasks_is_template ON public.tasks USING btree (is_template);

CREATE INDEX idx_tasks_user_id ON public.tasks USING btree (user_id);

CREATE INDEX idx_team_members_player_id ON public.team_members USING btree (player_id);

CREATE INDEX idx_team_members_team_id ON public.team_members USING btree (team_id);

CREATE INDEX idx_trophies_user_id ON public.trophies USING btree (user_id);

CREATE INDEX idx_trophies_week_year ON public.trophies USING btree (week, year);

CREATE INDEX idx_user_roles_role ON public.user_roles USING btree (role);

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);

CREATE INDEX ix_external_events_dtstart_summary ON public.external_events USING btree (dtstart_utc);

CREATE INDEX ix_external_events_summary ON public.external_events USING gin (to_tsvector('simple'::regconfig, summary));

CREATE INDEX ix_mappings_provider_uid ON public.external_event_mappings USING btree (provider, provider_uid);

CREATE UNIQUE INDEX local_event_meta_pkey ON public.local_event_meta USING btree (id);

CREATE UNIQUE INDEX player_invitations_invitation_code_key ON public.player_invitations USING btree (invitation_code);

CREATE UNIQUE INDEX player_invitations_pkey ON public.player_invitations USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX profiles_user_id_key ON public.profiles USING btree (user_id);

CREATE UNIQUE INDEX subscription_plans_pkey ON public.subscription_plans USING btree (id);

CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id);

CREATE INDEX task_template_categories_category_id_idx ON public.task_template_categories USING btree (category_id);

CREATE UNIQUE INDEX task_template_categories_pkey ON public.task_template_categories USING btree (id);

CREATE UNIQUE INDEX task_template_categories_task_template_id_category_id_key ON public.task_template_categories USING btree (task_template_id, category_id);

CREATE INDEX task_template_categories_template_id_idx ON public.task_template_categories USING btree (task_template_id);

CREATE UNIQUE INDEX task_template_subtasks_pkey ON public.task_template_subtasks USING btree (id);

CREATE INDEX task_template_subtasks_template_id_idx ON public.task_template_subtasks USING btree (task_template_id);

CREATE UNIQUE INDEX task_templates_pkey ON public.task_templates USING btree (id);

CREATE INDEX task_templates_user_id_idx ON public.task_templates USING btree (user_id);

CREATE UNIQUE INDEX tasks_pkey ON public.tasks USING btree (id);

CREATE UNIQUE INDEX team_members_pkey ON public.team_members USING btree (id);

CREATE UNIQUE INDEX team_members_team_id_player_id_key ON public.team_members USING btree (team_id, player_id);

CREATE UNIQUE INDEX teams_pkey ON public.teams USING btree (id);

CREATE UNIQUE INDEX trophies_pkey ON public.trophies USING btree (id);

CREATE UNIQUE INDEX trophies_user_id_week_year_key ON public.trophies USING btree (user_id, week, year);

CREATE UNIQUE INDEX user_roles_pkey ON public.user_roles USING btree (id);

CREATE UNIQUE INDEX user_roles_user_id_key ON public.user_roles USING btree (user_id);

CREATE UNIQUE INDEX ux_external_events_provider_uid ON public.external_events USING btree (provider, primary_provider_uid);

CREATE UNIQUE INDEX weekly_performance_pkey ON public.weekly_performance USING btree (id);

CREATE INDEX weekly_performance_user_id_idx ON public.weekly_performance USING btree (user_id);

CREATE UNIQUE INDEX weekly_performance_user_id_week_number_year_key ON public.weekly_performance USING btree (user_id, week_number, year);

CREATE INDEX weekly_performance_year_week_idx ON public.weekly_performance USING btree (year, week_number);

alter table "public"."activities" add constraint "activities_pkey" PRIMARY KEY using index "activities_pkey";

alter table "public"."activity_categories" add constraint "activity_categories_pkey" PRIMARY KEY using index "activity_categories_pkey";

alter table "public"."activity_series" add constraint "activity_series_pkey" PRIMARY KEY using index "activity_series_pkey";

alter table "public"."activity_task_subtasks" add constraint "activity_task_subtasks_pkey" PRIMARY KEY using index "activity_task_subtasks_pkey";

alter table "public"."activity_tasks" add constraint "activity_tasks_pkey" PRIMARY KEY using index "activity_tasks_pkey";

alter table "public"."admin_player_relationships" add constraint "admin_player_relationships_pkey" PRIMARY KEY using index "admin_player_relationships_pkey";

alter table "public"."category_mappings" add constraint "category_mappings_pkey" PRIMARY KEY using index "category_mappings_pkey";

alter table "public"."event_sync_log" add constraint "event_sync_log_pkey" PRIMARY KEY using index "event_sync_log_pkey";

alter table "public"."events_external" add constraint "events_external_pkey" PRIMARY KEY using index "events_external_pkey";

alter table "public"."events_local_meta" add constraint "events_local_meta_pkey" PRIMARY KEY using index "events_local_meta_pkey";

alter table "public"."exercise_assignments" add constraint "exercise_assignments_pkey" PRIMARY KEY using index "exercise_assignments_pkey";

alter table "public"."exercise_library" add constraint "exercise_library_pkey" PRIMARY KEY using index "exercise_library_pkey";

alter table "public"."exercise_subtasks" add constraint "exercise_subtasks_pkey" PRIMARY KEY using index "exercise_subtasks_pkey";

alter table "public"."external_calendars" add constraint "external_calendars_pkey" PRIMARY KEY using index "external_calendars_pkey";

alter table "public"."external_event_mappings" add constraint "external_event_mappings_pkey" PRIMARY KEY using index "external_event_mappings_pkey";

alter table "public"."external_event_tasks" add constraint "external_event_tasks_pkey" PRIMARY KEY using index "external_event_tasks_pkey";

alter table "public"."external_events" add constraint "external_events_pkey" PRIMARY KEY using index "external_events_pkey";

alter table "public"."hidden_activity_categories" add constraint "hidden_activity_categories_pkey" PRIMARY KEY using index "hidden_activity_categories_pkey";

alter table "public"."hidden_task_templates" add constraint "hidden_task_templates_pkey" PRIMARY KEY using index "hidden_task_templates_pkey";

alter table "public"."local_event_meta" add constraint "local_event_meta_pkey" PRIMARY KEY using index "local_event_meta_pkey";

alter table "public"."player_invitations" add constraint "player_invitations_pkey" PRIMARY KEY using index "player_invitations_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."subscription_plans" add constraint "subscription_plans_pkey" PRIMARY KEY using index "subscription_plans_pkey";

alter table "public"."subscriptions" add constraint "subscriptions_pkey" PRIMARY KEY using index "subscriptions_pkey";

alter table "public"."task_template_categories" add constraint "task_template_categories_pkey" PRIMARY KEY using index "task_template_categories_pkey";

alter table "public"."task_template_subtasks" add constraint "task_template_subtasks_pkey" PRIMARY KEY using index "task_template_subtasks_pkey";

alter table "public"."task_templates" add constraint "task_templates_pkey" PRIMARY KEY using index "task_templates_pkey";

alter table "public"."tasks" add constraint "tasks_pkey" PRIMARY KEY using index "tasks_pkey";

alter table "public"."team_members" add constraint "team_members_pkey" PRIMARY KEY using index "team_members_pkey";

alter table "public"."teams" add constraint "teams_pkey" PRIMARY KEY using index "teams_pkey";

alter table "public"."trophies" add constraint "trophies_pkey" PRIMARY KEY using index "trophies_pkey";

alter table "public"."user_roles" add constraint "user_roles_pkey" PRIMARY KEY using index "user_roles_pkey";

alter table "public"."weekly_performance" add constraint "weekly_performance_pkey" PRIMARY KEY using index "weekly_performance_pkey";

alter table "public"."activities" add constraint "activities_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.activity_categories(id) ON DELETE SET NULL not valid;

alter table "public"."activities" validate constraint "activities_category_id_fkey";

alter table "public"."activities" add constraint "activities_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."activities" validate constraint "activities_player_id_fkey";

alter table "public"."activities" add constraint "activities_series_id_fkey" FOREIGN KEY (series_id) REFERENCES public.activity_series(id) ON DELETE CASCADE not valid;

alter table "public"."activities" validate constraint "activities_series_id_fkey";

alter table "public"."activities" add constraint "activities_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE not valid;

alter table "public"."activities" validate constraint "activities_team_id_fkey";

alter table "public"."activities" add constraint "activities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."activities" validate constraint "activities_user_id_fkey";

alter table "public"."activity_categories" add constraint "activity_categories_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."activity_categories" validate constraint "activity_categories_player_id_fkey";

alter table "public"."activity_categories" add constraint "activity_categories_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE not valid;

alter table "public"."activity_categories" validate constraint "activity_categories_team_id_fkey";

alter table "public"."activity_categories" add constraint "activity_categories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."activity_categories" validate constraint "activity_categories_user_id_fkey";

alter table "public"."activity_series" add constraint "activity_series_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.activity_categories(id) ON DELETE SET NULL not valid;

alter table "public"."activity_series" validate constraint "activity_series_category_id_fkey";

alter table "public"."activity_series" add constraint "activity_series_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."activity_series" validate constraint "activity_series_player_id_fkey";

alter table "public"."activity_series" add constraint "activity_series_recurrence_type_check" CHECK ((recurrence_type = ANY (ARRAY['daily'::text, 'weekly'::text, 'biweekly'::text, 'triweekly'::text, 'monthly'::text]))) not valid;

alter table "public"."activity_series" validate constraint "activity_series_recurrence_type_check";

alter table "public"."activity_series" add constraint "activity_series_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE not valid;

alter table "public"."activity_series" validate constraint "activity_series_team_id_fkey";

alter table "public"."activity_series" add constraint "activity_series_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."activity_series" validate constraint "activity_series_user_id_fkey";

alter table "public"."activity_task_subtasks" add constraint "activity_task_subtasks_activity_task_id_fkey" FOREIGN KEY (activity_task_id) REFERENCES public.activity_tasks(id) ON DELETE CASCADE not valid;

alter table "public"."activity_task_subtasks" validate constraint "activity_task_subtasks_activity_task_id_fkey";

alter table "public"."activity_tasks" add constraint "activity_tasks_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE not valid;

alter table "public"."activity_tasks" validate constraint "activity_tasks_activity_id_fkey";

alter table "public"."activity_tasks" add constraint "activity_tasks_task_template_id_fkey" FOREIGN KEY (task_template_id) REFERENCES public.task_templates(id) ON DELETE SET NULL not valid;

alter table "public"."activity_tasks" validate constraint "activity_tasks_task_template_id_fkey";

alter table "public"."admin_player_relationships" add constraint "admin_player_relationships_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."admin_player_relationships" validate constraint "admin_player_relationships_admin_id_fkey";

alter table "public"."admin_player_relationships" add constraint "admin_player_relationships_admin_id_player_id_key" UNIQUE using index "admin_player_relationships_admin_id_player_id_key";

alter table "public"."admin_player_relationships" add constraint "admin_player_relationships_check" CHECK ((admin_id <> player_id)) not valid;

alter table "public"."admin_player_relationships" validate constraint "admin_player_relationships_check";

alter table "public"."admin_player_relationships" add constraint "admin_player_relationships_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."admin_player_relationships" validate constraint "admin_player_relationships_player_id_fkey";

alter table "public"."category_mappings" add constraint "category_mappings_internal_category_id_fkey" FOREIGN KEY (internal_category_id) REFERENCES public.activity_categories(id) ON DELETE CASCADE not valid;

alter table "public"."category_mappings" validate constraint "category_mappings_internal_category_id_fkey";

alter table "public"."category_mappings" add constraint "category_mappings_user_id_external_category_key" UNIQUE using index "category_mappings_user_id_external_category_key";

alter table "public"."category_mappings" add constraint "category_mappings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."category_mappings" validate constraint "category_mappings_user_id_fkey";

alter table "public"."event_sync_log" add constraint "event_sync_log_action_check" CHECK ((action = ANY (ARRAY['created'::text, 'updated'::text, 'deleted'::text, 'ignored'::text, 'conflict'::text]))) not valid;

alter table "public"."event_sync_log" validate constraint "event_sync_log_action_check";

alter table "public"."event_sync_log" add constraint "event_sync_log_calendar_id_fkey" FOREIGN KEY (calendar_id) REFERENCES public.external_calendars(id) ON DELETE CASCADE not valid;

alter table "public"."event_sync_log" validate constraint "event_sync_log_calendar_id_fkey";

alter table "public"."event_sync_log" add constraint "event_sync_log_external_event_id_fkey" FOREIGN KEY (external_event_id) REFERENCES public.events_external(id) ON DELETE CASCADE not valid;

alter table "public"."event_sync_log" validate constraint "event_sync_log_external_event_id_fkey";

alter table "public"."event_sync_log" add constraint "event_sync_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."event_sync_log" validate constraint "event_sync_log_user_id_fkey";

alter table "public"."events_external" add constraint "events_external_provider_calendar_id_fkey" FOREIGN KEY (provider_calendar_id) REFERENCES public.external_calendars(id) ON DELETE CASCADE not valid;

alter table "public"."events_external" validate constraint "events_external_provider_calendar_id_fkey";

alter table "public"."events_external" add constraint "events_external_provider_calendar_id_provider_event_uid_rec_key" UNIQUE using index "events_external_provider_calendar_id_provider_event_uid_rec_key";

alter table "public"."events_external" add constraint "events_external_provider_check" CHECK ((provider = ANY (ARRAY['ics'::text, 'google'::text, 'outlook'::text, 'caldav'::text]))) not valid;

alter table "public"."events_external" validate constraint "events_external_provider_check";

alter table "public"."events_local_meta" add constraint "events_local_meta_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.activity_categories(id) ON DELETE SET NULL not valid;

alter table "public"."events_local_meta" validate constraint "events_local_meta_category_id_fkey";

alter table "public"."events_local_meta" add constraint "events_local_meta_external_event_id_fkey" FOREIGN KEY (external_event_id) REFERENCES public.events_external(id) ON DELETE CASCADE not valid;

alter table "public"."events_local_meta" validate constraint "events_local_meta_external_event_id_fkey";

alter table "public"."events_local_meta" add constraint "events_local_meta_external_event_id_user_id_key" UNIQUE using index "events_local_meta_external_event_id_user_id_key";

alter table "public"."events_local_meta" add constraint "events_local_meta_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."events_local_meta" validate constraint "events_local_meta_player_id_fkey";

alter table "public"."events_local_meta" add constraint "events_local_meta_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE not valid;

alter table "public"."events_local_meta" validate constraint "events_local_meta_team_id_fkey";

alter table "public"."events_local_meta" add constraint "events_local_meta_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."events_local_meta" validate constraint "events_local_meta_user_id_fkey";

alter table "public"."exercise_assignments" add constraint "check_player_or_team" CHECK ((((player_id IS NOT NULL) AND (team_id IS NULL)) OR ((player_id IS NULL) AND (team_id IS NOT NULL)))) not valid;

alter table "public"."exercise_assignments" validate constraint "check_player_or_team";

alter table "public"."exercise_assignments" add constraint "exercise_assignments_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_assignments" validate constraint "exercise_assignments_exercise_id_fkey";

alter table "public"."exercise_assignments" add constraint "exercise_assignments_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_assignments" validate constraint "exercise_assignments_player_id_fkey";

alter table "public"."exercise_assignments" add constraint "exercise_assignments_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_assignments" validate constraint "exercise_assignments_team_id_fkey";

alter table "public"."exercise_assignments" add constraint "exercise_assignments_trainer_id_fkey" FOREIGN KEY (trainer_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_assignments" validate constraint "exercise_assignments_trainer_id_fkey";

alter table "public"."exercise_library" add constraint "exercise_library_trainer_id_fkey" FOREIGN KEY (trainer_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_library" validate constraint "exercise_library_trainer_id_fkey";

alter table "public"."exercise_subtasks" add constraint "exercise_subtasks_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE CASCADE not valid;

alter table "public"."exercise_subtasks" validate constraint "exercise_subtasks_exercise_id_fkey";

alter table "public"."external_calendars" add constraint "external_calendars_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."external_calendars" validate constraint "external_calendars_user_id_fkey";

alter table "public"."external_event_mappings" add constraint "external_event_mappings_external_event_id_fkey" FOREIGN KEY (external_event_id) REFERENCES public.external_events(id) ON DELETE CASCADE not valid;

alter table "public"."external_event_mappings" validate constraint "external_event_mappings_external_event_id_fkey";

alter table "public"."external_event_tasks" add constraint "external_event_tasks_local_meta_id_fkey" FOREIGN KEY (local_meta_id) REFERENCES public.events_local_meta(id) ON DELETE CASCADE not valid;

alter table "public"."external_event_tasks" validate constraint "external_event_tasks_local_meta_id_fkey";

alter table "public"."external_event_tasks" add constraint "external_event_tasks_task_template_id_fkey" FOREIGN KEY (task_template_id) REFERENCES public.task_templates(id) ON DELETE CASCADE not valid;

alter table "public"."external_event_tasks" validate constraint "external_event_tasks_task_template_id_fkey";

alter table "public"."hidden_activity_categories" add constraint "hidden_activity_categories_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.activity_categories(id) ON DELETE CASCADE not valid;

alter table "public"."hidden_activity_categories" validate constraint "hidden_activity_categories_category_id_fkey";

alter table "public"."hidden_activity_categories" add constraint "hidden_activity_categories_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."hidden_activity_categories" validate constraint "hidden_activity_categories_user_id_fkey";

alter table "public"."local_event_meta" add constraint "local_event_meta_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.activity_categories(id) not valid;

alter table "public"."local_event_meta" validate constraint "local_event_meta_category_id_fkey";

alter table "public"."local_event_meta" add constraint "local_event_meta_external_event_id_fkey" FOREIGN KEY (external_event_id) REFERENCES public.external_events(id) not valid;

alter table "public"."local_event_meta" validate constraint "local_event_meta_external_event_id_fkey";

alter table "public"."local_event_meta" add constraint "local_event_meta_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."local_event_meta" validate constraint "local_event_meta_user_id_fkey";

alter table "public"."player_invitations" add constraint "player_invitations_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."player_invitations" validate constraint "player_invitations_admin_id_fkey";

alter table "public"."player_invitations" add constraint "player_invitations_invitation_code_key" UNIQUE using index "player_invitations_invitation_code_key";

alter table "public"."player_invitations" add constraint "player_invitations_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."player_invitations" validate constraint "player_invitations_player_id_fkey";

alter table "public"."player_invitations" add constraint "player_invitations_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text]))) not valid;

alter table "public"."player_invitations" validate constraint "player_invitations_status_check";

alter table "public"."profiles" add constraint "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_user_id_fkey";

alter table "public"."profiles" add constraint "profiles_user_id_key" UNIQUE using index "profiles_user_id_key";

alter table "public"."subscriptions" add constraint "subscriptions_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_admin_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_plan_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_status_check" CHECK ((status = ANY (ARRAY['trial'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'expired'::text]))) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_status_check";

alter table "public"."task_template_categories" add constraint "task_template_categories_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.activity_categories(id) ON DELETE CASCADE not valid;

alter table "public"."task_template_categories" validate constraint "task_template_categories_category_id_fkey";

alter table "public"."task_template_categories" add constraint "task_template_categories_task_template_id_category_id_key" UNIQUE using index "task_template_categories_task_template_id_category_id_key";

alter table "public"."task_template_categories" add constraint "task_template_categories_task_template_id_fkey" FOREIGN KEY (task_template_id) REFERENCES public.task_templates(id) ON DELETE CASCADE not valid;

alter table "public"."task_template_categories" validate constraint "task_template_categories_task_template_id_fkey";

alter table "public"."task_template_subtasks" add constraint "task_template_subtasks_task_template_id_fkey" FOREIGN KEY (task_template_id) REFERENCES public.task_templates(id) ON DELETE CASCADE not valid;

alter table "public"."task_template_subtasks" validate constraint "task_template_subtasks_task_template_id_fkey";

alter table "public"."task_templates" add constraint "task_templates_after_training_delay_minutes_check" CHECK (((after_training_delay_minutes IS NULL) OR ((after_training_delay_minutes >= 1) AND (after_training_delay_minutes <= 240)))) not valid;

alter table "public"."task_templates" validate constraint "task_templates_after_training_delay_minutes_check";

alter table "public"."task_templates" add constraint "task_templates_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."task_templates" validate constraint "task_templates_player_id_fkey";

alter table "public"."task_templates" add constraint "task_templates_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE not valid;

alter table "public"."task_templates" validate constraint "task_templates_team_id_fkey";

alter table "public"."task_templates" add constraint "task_templates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."task_templates" validate constraint "task_templates_user_id_fkey";

alter table "public"."tasks" add constraint "tasks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."tasks" validate constraint "tasks_user_id_fkey";

alter table "public"."team_members" add constraint "team_members_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."team_members" validate constraint "team_members_player_id_fkey";

alter table "public"."team_members" add constraint "team_members_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE not valid;

alter table "public"."team_members" validate constraint "team_members_team_id_fkey";

alter table "public"."team_members" add constraint "team_members_team_id_player_id_key" UNIQUE using index "team_members_team_id_player_id_key";

alter table "public"."teams" add constraint "teams_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."teams" validate constraint "teams_admin_id_fkey";

alter table "public"."training_reflections" add constraint "training_reflections_activity_id_fkey" FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE not valid;

alter table "public"."training_reflections" validate constraint "training_reflections_activity_id_fkey";

alter table "public"."trophies" add constraint "trophies_percentage_check" CHECK (((percentage >= 0) AND (percentage <= 100))) not valid;

alter table "public"."trophies" validate constraint "trophies_percentage_check";

alter table "public"."trophies" add constraint "trophies_type_check" CHECK ((type = ANY (ARRAY['gold'::text, 'silver'::text, 'bronze'::text]))) not valid;

alter table "public"."trophies" validate constraint "trophies_type_check";

alter table "public"."trophies" add constraint "trophies_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."trophies" validate constraint "trophies_user_id_fkey";

alter table "public"."trophies" add constraint "trophies_user_id_week_year_key" UNIQUE using index "trophies_user_id_week_year_key";

alter table "public"."user_roles" add constraint "user_roles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'player'::text, 'trainer'::text]))) not valid;

alter table "public"."user_roles" validate constraint "user_roles_role_check";

alter table "public"."user_roles" add constraint "user_roles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."user_roles" validate constraint "user_roles_user_id_fkey";

alter table "public"."user_roles" add constraint "user_roles_user_id_key" UNIQUE using index "user_roles_user_id_key";

alter table "public"."weekly_performance" add constraint "weekly_performance_percentage_check" CHECK (((percentage >= 0) AND (percentage <= 100))) not valid;

alter table "public"."weekly_performance" validate constraint "weekly_performance_percentage_check";

alter table "public"."weekly_performance" add constraint "weekly_performance_player_id_fkey" FOREIGN KEY (player_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."weekly_performance" validate constraint "weekly_performance_player_id_fkey";

alter table "public"."weekly_performance" add constraint "weekly_performance_team_id_fkey" FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE not valid;

alter table "public"."weekly_performance" validate constraint "weekly_performance_team_id_fkey";

alter table "public"."weekly_performance" add constraint "weekly_performance_trophy_type_check" CHECK ((trophy_type = ANY (ARRAY['gold'::text, 'silver'::text, 'bronze'::text]))) not valid;

alter table "public"."weekly_performance" validate constraint "weekly_performance_trophy_type_check";

alter table "public"."weekly_performance" add constraint "weekly_performance_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."weekly_performance" validate constraint "weekly_performance_user_id_fkey";

alter table "public"."weekly_performance" add constraint "weekly_performance_user_id_week_number_year_key" UNIQUE using index "weekly_performance_user_id_week_number_year_key";

set check_function_bodies = off;

create or replace view "public"."activities_combined" as  SELECT COALESCE(elm.id, ee.id) AS id,
    ee.id AS external_event_id,
    elm.id AS local_meta_id,
    elm.user_id,
    COALESCE(elm.local_title_override, ee.title) AS title,
    COALESCE(elm.local_description, ee.description) AS description,
    ee.location,
    COALESCE(date(elm.local_start_override), ee.start_date) AS activity_date,
    COALESCE((elm.local_start_override)::time without time zone, ee.start_time) AS activity_time,
    elm.category_id,
    elm.manually_set_category,
    elm.category_updated_at,
    ee.provider,
    ee.provider_event_uid AS external_event_uid,
    ee.provider_calendar_id AS external_calendar_id,
    ee.is_all_day,
    elm.reminders,
    elm.pinned,
    elm.custom_fields,
    ee.created_at,
    GREATEST(ee.updated_at, COALESCE(elm.updated_at, ee.updated_at)) AS updated_at,
    ee.external_last_modified,
    elm.last_local_modified,
    true AS is_external
   FROM (public.events_external ee
     LEFT JOIN public.events_local_meta elm ON ((ee.id = elm.external_event_id)))
UNION ALL
 SELECT a.id,
    NULL::uuid AS external_event_id,
    NULL::uuid AS local_meta_id,
    a.user_id,
    a.title,
    NULL::text AS description,
    a.location,
    a.activity_date,
    a.activity_time,
    a.category_id,
    a.manually_set_category,
    a.category_updated_at,
    'internal'::text AS provider,
    NULL::text AS external_event_uid,
    NULL::uuid AS external_calendar_id,
    false AS is_all_day,
    '[]'::jsonb AS reminders,
    false AS pinned,
    '{}'::jsonb AS custom_fields,
    a.created_at,
    a.updated_at,
    NULL::timestamp with time zone AS external_last_modified,
    NULL::timestamp with time zone AS last_local_modified,
    false AS is_external
   FROM public.activities a
  WHERE ((a.is_external = false) OR (a.is_external IS NULL));


CREATE OR REPLACE FUNCTION public.calculate_weekly_performance(p_user_id uuid, p_week_number integer, p_year integer)
 RETURNS TABLE(percentage integer, completed_tasks integer, total_tasks integer, trophy_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_completed integer;
  v_total integer;
  v_percentage integer;
  v_trophy text;
begin
  -- Calculate completed and total tasks for the week
  select
    count(*) filter (where at.completed = true),
    count(*)
  into v_completed, v_total
  from activities a
  join activity_tasks at on at.activity_id = a.id
  where a.user_id = p_user_id
  and extract(week from a.activity_date) = p_week_number
  and extract(year from a.activity_date) = p_year;

  -- Calculate percentage
  if v_total > 0 then
    v_percentage := round((v_completed::numeric / v_total::numeric) * 100);
  else
    v_percentage := 0;
  end if;

  -- Determine trophy type
  if v_percentage >= 80 then
    v_trophy := 'gold';
  elsif v_percentage >= 60 then
    v_trophy := 'silver';
  else
    v_trophy := 'bronze';
  end if;

  return query select v_percentage, v_completed, v_total, v_trophy;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_player_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  admin_user_id UUID;
  current_player_count INTEGER;
  max_allowed_players INTEGER;
  subscription_status TEXT;
BEGIN
  -- Get the admin_id from the new relationship
  admin_user_id := NEW.admin_id;
  
  -- Count current players for this admin
  SELECT COUNT(*) INTO current_player_count
  FROM admin_player_relationships
  WHERE admin_id = admin_user_id;
  
  -- Get the admin's subscription details
  SELECT s.status, sp.max_players INTO subscription_status, max_allowed_players
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.admin_id = admin_user_id
    AND s.status IN ('trial', 'active')
  ORDER BY s.created_at DESC
  LIMIT 1;
  
  -- If no active subscription, allow 0 players (admin only)
  IF subscription_status IS NULL THEN
    RAISE EXCEPTION 'No active subscription found. Please subscribe to add players.';
  END IF;
  
  -- Check if adding this player would exceed the limit
  IF current_player_count >= max_allowed_players THEN
    RAISE EXCEPTION 'Player limit reached. Your plan allows % player(s). Please upgrade your subscription.', max_allowed_players;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_admin_player_relationship(p_admin_id uuid, p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO admin_player_relationships (admin_id, player_id)
  VALUES (p_admin_id, p_player_id)
  ON CONFLICT DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_player_profile(p_user_id uuid, p_full_name text, p_phone_number text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO profiles (user_id, full_name, phone_number)
  VALUES (p_user_id, p_full_name, p_phone_number)
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      phone_number = EXCLUDED.phone_number,
      updated_at = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_player_role(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, 'player')
  ON CONFLICT (user_id) DO UPDATE
  SET role = 'player',
      updated_at = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_tasks_for_activity(p_activity_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_category_id uuid;
  v_template record;
  v_task_id uuid;
  v_subtask record;
  v_existing_task_id uuid;
begin
  -- Get the category of the activity
  select category_id into v_category_id
  from activities
  where id = p_activity_id;

  -- If no category, exit
  if v_category_id is null then
    return;
  end if;

  -- Loop through all task templates for this category
  for v_template in
    select distinct tt.*
    from task_templates tt
    join task_template_categories ttc on ttc.task_template_id = tt.id
    where ttc.category_id = v_category_id
    and tt.user_id = (select user_id from activities where id = p_activity_id)
  loop
    -- Check if task already exists for this activity-template combination
    select id into v_existing_task_id
    from activity_tasks
    where activity_id = p_activity_id
    and task_template_id = v_template.id;

    if v_existing_task_id is not null then
      -- Task exists - UPDATE it with the latest template data
      update activity_tasks
      set 
        title = v_template.title,
        description = v_template.description,
        reminder_minutes = v_template.reminder_minutes,
        updated_at = now()
      where id = v_existing_task_id;

      -- Delete existing subtasks
      delete from activity_task_subtasks
      where activity_task_id = v_existing_task_id;

      -- Create new subtasks from template
      for v_subtask in
        select * from task_template_subtasks
        where task_template_id = v_template.id
        order by sort_order
      loop
        insert into activity_task_subtasks (
          activity_task_id,
          title,
          sort_order
        )
        values (
          v_existing_task_id,
          v_subtask.title,
          v_subtask.sort_order
        );
      end loop;

      raise notice 'Task updated for activity % and template %', p_activity_id, v_template.id;
    else
      -- Task doesn't exist - CREATE it
      insert into activity_tasks (
        activity_id,
        task_template_id,
        title,
        description,
        reminder_minutes
      )
      values (
        p_activity_id,
        v_template.id,
        v_template.title,
        v_template.description,
        v_template.reminder_minutes
      )
      returning id into v_task_id;

      -- Create subtasks
      for v_subtask in
        select * from task_template_subtasks
        where task_template_id = v_template.id
        order by sort_order
      loop
        insert into activity_task_subtasks (
          activity_task_id,
          title,
          sort_order
        )
        values (
          v_task_id,
          v_subtask.title,
          v_subtask.sort_order
        );
      end loop;

      raise notice 'Task created for activity % and template %', p_activity_id, v_template.id;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_tasks_for_external_event(p_local_meta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_category_id uuid;
  v_user_id uuid;
  v_template record;
  v_existing_task_id uuid;
BEGIN
  -- Get the category and user from the local metadata
  SELECT category_id, user_id
  INTO v_category_id, v_user_id
  FROM events_local_meta
  WHERE id = p_local_meta_id;

  -- If no category, exit
  IF v_category_id IS NULL THEN
    RETURN;
  END IF;

  -- Loop through all task templates for this category
  FOR v_template IN
    SELECT DISTINCT tt.*
    FROM task_templates tt
    JOIN task_template_categories ttc ON ttc.task_template_id = tt.id
    WHERE ttc.category_id = v_category_id
    AND tt.user_id = v_user_id
  LOOP
    -- Check if task already exists
    SELECT id INTO v_existing_task_id
    FROM external_event_tasks
    WHERE local_meta_id = p_local_meta_id
    AND task_template_id = v_template.id;

    IF v_existing_task_id IS NOT NULL THEN
      -- Task exists - UPDATE it
      UPDATE external_event_tasks
      SET 
        title = v_template.title,
        description = v_template.description,
        reminder_minutes = v_template.reminder_minutes,
        updated_at = now()
      WHERE id = v_existing_task_id;
    ELSE
      -- Task doesn't exist - CREATE it
      INSERT INTO external_event_tasks (
        local_meta_id,
        task_template_id,
        title,
        description,
        reminder_minutes
      )
      VALUES (
        p_local_meta_id,
        v_template.id,
        v_template.title,
        v_template.description,
        v_template.reminder_minutes
      );
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fix_missing_activity_tasks()
 RETURNS TABLE(activity_id uuid, tasks_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_activity RECORD;
  v_tasks_before integer;
  v_tasks_after integer;
BEGIN
  -- Loop through all non-external activities with categories
  FOR v_activity IN
    SELECT a.id, a.category_id, a.user_id
    FROM activities a
    WHERE a.is_external = false
      AND a.category_id IS NOT NULL
  LOOP
    -- Count existing tasks
    SELECT COUNT(*) INTO v_tasks_before
    FROM activity_tasks
    WHERE activity_tasks.activity_id = v_activity.id;
    
    -- Check if there are task templates for this category
    IF EXISTS (
      SELECT 1
      FROM task_templates tt
      JOIN task_template_categories ttc ON tt.id = ttc.task_template_id
      WHERE ttc.category_id = v_activity.category_id
        AND tt.user_id = v_activity.user_id
    ) THEN
      -- Delete existing template-linked tasks to avoid duplicates
      DELETE FROM activity_tasks
      WHERE activity_tasks.activity_id = v_activity.id
        AND task_template_id IS NOT NULL;
      
      -- Create tasks for this activity
      PERFORM create_tasks_for_activity(v_activity.id);
      
      -- Count tasks after
      SELECT COUNT(*) INTO v_tasks_after
      FROM activity_tasks
      WHERE activity_tasks.activity_id = v_activity.id;
      
      -- Return result if tasks were created
      IF v_tasks_after > v_tasks_before THEN
        activity_id := v_activity.id;
        tasks_created := v_tasks_after - v_tasks_before;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
  
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_player_admins(p_player_id uuid)
 RETURNS TABLE(admin_id uuid, admin_email text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    apr.admin_id,
    au.email::TEXT,
    apr.created_at
  FROM admin_player_relationships apr
  JOIN auth.users au ON au.id = apr.admin_id
  WHERE apr.player_id = p_player_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_subscription_status(user_id uuid)
 RETURNS TABLE(has_subscription boolean, status text, plan_name text, max_players integer, current_players integer, trial_end timestamp with time zone, current_period_end timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    CASE WHEN s.id IS NOT NULL THEN true ELSE false END as has_subscription,
    s.status,
    sp.name as plan_name,
    sp.max_players,
    (SELECT COUNT(*)::INTEGER FROM admin_player_relationships WHERE admin_id = user_id) as current_players,
    s.trial_end,
    s.current_period_end
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.admin_id = user_id
    AND s.status IN ('trial', 'active')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    SELECT role FROM user_roles
    WHERE user_id = p_user_id
    LIMIT 1
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  user_role TEXT;
  plan_id UUID;
  trial_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get role and plan_id from user metadata
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'player');
  plan_id := (NEW.raw_user_meta_data->>'plan_id')::UUID;
  
  -- Insert user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Create profile
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- If plan_id is provided, create subscription
  IF plan_id IS NOT NULL THEN
    trial_end := NOW() + INTERVAL '14 days';
    
    INSERT INTO public.subscriptions (
      admin_id,
      plan_id,
      status,
      trial_start,
      trial_end,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    )
    VALUES (
      NEW.id,
      plan_id,
      'trial',
      NOW(),
      trial_end,
      NOW(),
      trial_end,
      false
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id AND role = 'admin'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.migrate_external_activities()
 RETURNS TABLE(migrated_count integer, error_count integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_migrated_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_activity RECORD;
  v_external_event_id UUID;
BEGIN
  -- Migrate external activities
  FOR v_activity IN 
    SELECT * FROM activities WHERE is_external = TRUE
  LOOP
    BEGIN
      -- Insert into events_external
      INSERT INTO events_external (
        provider,
        provider_event_uid,
        provider_calendar_id,
        title,
        description,
        location,
        start_date,
        start_time,
        end_date,
        end_time,
        is_all_day,
        external_last_modified,
        fetched_at,
        created_at,
        updated_at
      ) VALUES (
        'ics',
        COALESCE(v_activity.external_event_id, 'migrated-' || v_activity.id::text),
        v_activity.external_calendar_id,
        v_activity.title,
        NULL,
        v_activity.location,
        v_activity.activity_date,
        v_activity.activity_time,
        v_activity.activity_date,
        v_activity.activity_time,
        FALSE,
        v_activity.updated_at,
        v_activity.created_at,
        v_activity.created_at,
        v_activity.updated_at
      )
      ON CONFLICT (provider_calendar_id, provider_event_uid, recurrence_id) 
      DO UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING id INTO v_external_event_id;
      
      -- Insert into events_local_meta
      INSERT INTO events_local_meta (
        external_event_id,
        user_id,
        category_id,
        manually_set_category,
        category_updated_at,
        last_local_modified,
        created_at,
        updated_at
      ) VALUES (
        v_external_event_id,
        v_activity.user_id,
        v_activity.category_id,
        COALESCE(v_activity.manually_set_category, FALSE),
        v_activity.category_updated_at,
        v_activity.updated_at,
        v_activity.created_at,
        v_activity.updated_at
      )
      ON CONFLICT (external_event_id, user_id) DO NOTHING;
      
      v_migrated_count := v_migrated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE NOTICE 'Error migrating activity %: %', v_activity.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_migrated_count, v_error_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_default_data_for_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  v_cat_training uuid;
  v_cat_strength uuid;
  v_cat_vr uuid;
  v_cat_match uuid;
  v_cat_tournament uuid;
  v_cat_meeting uuid;
  v_cat_sprint uuid;
  v_cat_other uuid;
  v_task_vr uuid;
  v_task_focus_training uuid;
  v_task_breathing uuid;
  v_task_strength uuid;
  v_task_pack uuid;
  v_task_focus_match uuid;
begin
  -- Get system category IDs instead of creating new ones
  SELECT id INTO v_cat_training FROM activity_categories WHERE is_system = TRUE AND name = 'Træning' LIMIT 1;
  SELECT id INTO v_cat_match FROM activity_categories WHERE is_system = TRUE AND name = 'Kamp' LIMIT 1;
  SELECT id INTO v_cat_tournament FROM activity_categories WHERE is_system = TRUE AND name = 'Turnering' LIMIT 1;
  SELECT id INTO v_cat_meeting FROM activity_categories WHERE is_system = TRUE AND name = 'Møde' LIMIT 1;
  SELECT id INTO v_cat_strength FROM activity_categories WHERE is_system = TRUE AND name = 'Fysisk træning' LIMIT 1;
  SELECT id INTO v_cat_vr FROM activity_categories WHERE is_system = TRUE AND name = 'VR træning' LIMIT 1;
  SELECT id INTO v_cat_sprint FROM activity_categories WHERE is_system = TRUE AND name = 'Sprinttræning' LIMIT 1;
  SELECT id INTO v_cat_other FROM activity_categories WHERE is_system = TRUE AND name = 'Andet' LIMIT 1;

  -- Create default task templates
  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'VR træning', 'Gennemfør VR træning', 15)
  returning id into v_task_vr;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Fokuspunkter til træning', 'Gennemgå fokuspunkter', 45)
  returning id into v_task_focus_training;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Åndedrætsøvelser', 'Udfør åndedrætsøvelser', 15)
  returning id into v_task_breathing;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Styrketræning', 'Gennemfør styrketræning', 15)
  returning id into v_task_strength;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Pak fodboldtaske', 'Pak alt nødvendigt udstyr', 90)
  returning id into v_task_pack;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Fokuspunkter til kamp', 'Gennemgå fokuspunkter', 60)
  returning id into v_task_focus_match;

  -- Link tasks to system categories
  insert into task_template_categories (task_template_id, category_id)
  values
    (v_task_vr, v_cat_vr),
    (v_task_focus_training, v_cat_training),
    (v_task_breathing, v_cat_training),
    (v_task_breathing, v_cat_match),
    (v_task_breathing, v_cat_tournament),
    (v_task_strength, v_cat_strength),
    (v_task_pack, v_cat_training),
    (v_task_pack, v_cat_match),
    (v_task_pack, v_cat_tournament),
    (v_task_focus_match, v_cat_match);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_create_tasks_for_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Only create tasks if the activity has a category and is not external
  if new.category_id is not null and new.is_external = false then
    perform create_tasks_for_activity(new.id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_create_tasks_for_external_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Only create tasks if the category is set
  IF NEW.category_id IS NOT NULL THEN
    -- If this is an insert or the category changed
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
      -- Delete existing tasks that are linked to templates (if category changed)
      IF TG_OP = 'UPDATE' THEN
        DELETE FROM external_event_tasks
        WHERE local_meta_id = NEW.id
        AND task_template_id IS NOT NULL;
      END IF;
      
      -- Create new tasks based on category
      PERFORM create_tasks_for_external_event(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_fix_external_tasks_on_template_category_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- When a task template is assigned to a new category, create tasks for all external events in that category
  IF TG_OP = 'INSERT' THEN
    -- Get the user_id from the task template
    PERFORM create_tasks_for_external_event(elm.id)
    FROM events_local_meta elm
    JOIN task_templates tt ON tt.id = NEW.task_template_id
    WHERE elm.category_id = NEW.category_id
      AND elm.user_id = tt.user_id;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_fix_tasks_on_template_category_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- When a task template is assigned to a new category, create tasks for all activities in that category
  IF TG_OP = 'INSERT' THEN
    -- Get the user_id from the task template
    PERFORM create_tasks_for_activity(a.id)
    FROM activities a
    JOIN task_templates tt ON tt.id = NEW.task_template_id
    WHERE a.category_id = NEW.category_id
      AND a.user_id = tt.user_id
      AND a.is_external = false;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_seed_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.seed_default_data_for_user(new.id);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_tasks_on_category_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- If category changed and not external
  if new.category_id is distinct from old.category_id and new.is_external = false then
    -- Delete existing tasks that are linked to templates
    delete from activity_tasks
    where activity_id = new.id
    and task_template_id is not null;
    
    -- Create new tasks based on new category
    if new.category_id is not null then
      perform create_tasks_for_activity(new.id);
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_tasks_on_subtask_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_template_id uuid;
BEGIN
  -- Get the template ID from the subtask
  IF TG_OP = 'DELETE' THEN
    v_template_id := OLD.task_template_id;
  ELSE
    v_template_id := NEW.task_template_id;
  END IF;

  -- Update all tasks linked to this template
  PERFORM update_all_tasks_from_template(v_template_id);
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_tasks_on_template_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- When a task template is updated, update all tasks linked to it
  IF TG_OP = 'UPDATE' THEN
    -- Only update if title, description, or reminder_minutes changed
    IF NEW.title IS DISTINCT FROM OLD.title 
       OR NEW.description IS DISTINCT FROM OLD.description 
       OR NEW.reminder_minutes IS DISTINCT FROM OLD.reminder_minutes THEN
      PERFORM update_all_tasks_from_template(NEW.id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_weekly_performance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_user_id uuid;
  v_activity_date date;
  v_week_number integer;
  v_year integer;
begin
  -- Get activity info
  -- For DELETE operations, the activity might already be deleted, so we need to handle that
  select a.user_id, a.activity_date
  into v_user_id, v_activity_date
  from activities a
  where a.id = coalesce(new.activity_id, old.activity_id);

  -- If we couldn't find the activity (it was deleted), skip the update
  -- This prevents the NULL user_id error
  if v_user_id is null then
    return coalesce(new, old);
  end if;

  -- Calculate week and year
  v_week_number := extract(week from v_activity_date);
  v_year := extract(year from v_activity_date);

  -- Update performance
  perform update_weekly_performance(v_user_id, v_week_number, v_year);

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_all_tasks_from_template(p_template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_activity_id uuid;
  v_local_meta_id uuid;
BEGIN
  -- Update all activity tasks linked to this template
  FOR v_activity_id IN
    SELECT DISTINCT activity_id
    FROM activity_tasks
    WHERE task_template_id = p_template_id
  LOOP
    PERFORM create_tasks_for_activity(v_activity_id);
  END LOOP;

  -- Update all external event tasks linked to this template
  FOR v_local_meta_id IN
    SELECT DISTINCT local_meta_id
    FROM external_event_tasks
    WHERE task_template_id = p_template_id
  LOOP
    PERFORM create_tasks_for_external_event(v_local_meta_id);
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_category_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only update category_updated_at if category_id actually changed
  IF (TG_OP = 'UPDATE' AND OLD.category_id IS DISTINCT FROM NEW.category_id) THEN
    NEW.category_updated_at = NOW();
  END IF;
  
  -- For new records, set category_updated_at to now
  IF (TG_OP = 'INSERT' AND NEW.category_updated_at IS NULL) THEN
    NEW.category_updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_series_activities()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Update all activities in the series with the new information
  UPDATE activities
  SET
    title = NEW.title,
    location = NEW.location,
    category_id = NEW.category_id,
    activity_time = NEW.activity_time,
    updated_at = now()
  WHERE series_id = NEW.id;
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_weekly_performance(p_user_id uuid, p_week_number integer, p_year integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_stats record;
begin
  -- Safety check: if user_id is NULL, don't proceed
  if p_user_id is null then
    return;
  end if;

  -- Get the stats
  select * into v_stats
  from calculate_weekly_performance(p_user_id, p_week_number, p_year);

  -- Upsert the performance record
  insert into weekly_performance (
    user_id,
    week_number,
    year,
    trophy_type,
    percentage,
    completed_tasks,
    total_tasks
  )
  values (
    p_user_id,
    p_week_number,
    p_year,
    v_stats.trophy_type,
    v_stats.percentage,
    v_stats.completed_tasks,
    v_stats.total_tasks
  )
  on conflict (user_id, week_number, year)
  do update set
    trophy_type = excluded.trophy_type,
    percentage = excluded.percentage,
    completed_tasks = excluded.completed_tasks,
    total_tasks = excluded.total_tasks;
end;
$function$
;

grant delete on table "public"."activities" to "anon";

grant insert on table "public"."activities" to "anon";

grant references on table "public"."activities" to "anon";

grant select on table "public"."activities" to "anon";

grant trigger on table "public"."activities" to "anon";

grant truncate on table "public"."activities" to "anon";

grant update on table "public"."activities" to "anon";

grant delete on table "public"."activities" to "authenticated";

grant insert on table "public"."activities" to "authenticated";

grant references on table "public"."activities" to "authenticated";

grant select on table "public"."activities" to "authenticated";

grant trigger on table "public"."activities" to "authenticated";

grant truncate on table "public"."activities" to "authenticated";

grant update on table "public"."activities" to "authenticated";

grant delete on table "public"."activities" to "service_role";

grant insert on table "public"."activities" to "service_role";

grant references on table "public"."activities" to "service_role";

grant select on table "public"."activities" to "service_role";

grant trigger on table "public"."activities" to "service_role";

grant truncate on table "public"."activities" to "service_role";

grant update on table "public"."activities" to "service_role";

grant delete on table "public"."activity_categories" to "anon";

grant insert on table "public"."activity_categories" to "anon";

grant references on table "public"."activity_categories" to "anon";

grant select on table "public"."activity_categories" to "anon";

grant trigger on table "public"."activity_categories" to "anon";

grant truncate on table "public"."activity_categories" to "anon";

grant update on table "public"."activity_categories" to "anon";

grant delete on table "public"."activity_categories" to "authenticated";

grant insert on table "public"."activity_categories" to "authenticated";

grant references on table "public"."activity_categories" to "authenticated";

grant select on table "public"."activity_categories" to "authenticated";

grant trigger on table "public"."activity_categories" to "authenticated";

grant truncate on table "public"."activity_categories" to "authenticated";

grant update on table "public"."activity_categories" to "authenticated";

grant delete on table "public"."activity_categories" to "service_role";

grant insert on table "public"."activity_categories" to "service_role";

grant references on table "public"."activity_categories" to "service_role";

grant select on table "public"."activity_categories" to "service_role";

grant trigger on table "public"."activity_categories" to "service_role";

grant truncate on table "public"."activity_categories" to "service_role";

grant update on table "public"."activity_categories" to "service_role";

grant delete on table "public"."activity_series" to "anon";

grant insert on table "public"."activity_series" to "anon";

grant references on table "public"."activity_series" to "anon";

grant select on table "public"."activity_series" to "anon";

grant trigger on table "public"."activity_series" to "anon";

grant truncate on table "public"."activity_series" to "anon";

grant update on table "public"."activity_series" to "anon";

grant delete on table "public"."activity_series" to "authenticated";

grant insert on table "public"."activity_series" to "authenticated";

grant references on table "public"."activity_series" to "authenticated";

grant select on table "public"."activity_series" to "authenticated";

grant trigger on table "public"."activity_series" to "authenticated";

grant truncate on table "public"."activity_series" to "authenticated";

grant update on table "public"."activity_series" to "authenticated";

grant delete on table "public"."activity_series" to "service_role";

grant insert on table "public"."activity_series" to "service_role";

grant references on table "public"."activity_series" to "service_role";

grant select on table "public"."activity_series" to "service_role";

grant trigger on table "public"."activity_series" to "service_role";

grant truncate on table "public"."activity_series" to "service_role";

grant update on table "public"."activity_series" to "service_role";

grant delete on table "public"."activity_task_subtasks" to "anon";

grant insert on table "public"."activity_task_subtasks" to "anon";

grant references on table "public"."activity_task_subtasks" to "anon";

grant select on table "public"."activity_task_subtasks" to "anon";

grant trigger on table "public"."activity_task_subtasks" to "anon";

grant truncate on table "public"."activity_task_subtasks" to "anon";

grant update on table "public"."activity_task_subtasks" to "anon";

grant delete on table "public"."activity_task_subtasks" to "authenticated";

grant insert on table "public"."activity_task_subtasks" to "authenticated";

grant references on table "public"."activity_task_subtasks" to "authenticated";

grant select on table "public"."activity_task_subtasks" to "authenticated";

grant trigger on table "public"."activity_task_subtasks" to "authenticated";

grant truncate on table "public"."activity_task_subtasks" to "authenticated";

grant update on table "public"."activity_task_subtasks" to "authenticated";

grant delete on table "public"."activity_task_subtasks" to "service_role";

grant insert on table "public"."activity_task_subtasks" to "service_role";

grant references on table "public"."activity_task_subtasks" to "service_role";

grant select on table "public"."activity_task_subtasks" to "service_role";

grant trigger on table "public"."activity_task_subtasks" to "service_role";

grant truncate on table "public"."activity_task_subtasks" to "service_role";

grant update on table "public"."activity_task_subtasks" to "service_role";

grant delete on table "public"."activity_tasks" to "anon";

grant insert on table "public"."activity_tasks" to "anon";

grant references on table "public"."activity_tasks" to "anon";

grant select on table "public"."activity_tasks" to "anon";

grant trigger on table "public"."activity_tasks" to "anon";

grant truncate on table "public"."activity_tasks" to "anon";

grant update on table "public"."activity_tasks" to "anon";

grant delete on table "public"."activity_tasks" to "authenticated";

grant insert on table "public"."activity_tasks" to "authenticated";

grant references on table "public"."activity_tasks" to "authenticated";

grant select on table "public"."activity_tasks" to "authenticated";

grant trigger on table "public"."activity_tasks" to "authenticated";

grant truncate on table "public"."activity_tasks" to "authenticated";

grant update on table "public"."activity_tasks" to "authenticated";

grant delete on table "public"."activity_tasks" to "service_role";

grant insert on table "public"."activity_tasks" to "service_role";

grant references on table "public"."activity_tasks" to "service_role";

grant select on table "public"."activity_tasks" to "service_role";

grant trigger on table "public"."activity_tasks" to "service_role";

grant truncate on table "public"."activity_tasks" to "service_role";

grant update on table "public"."activity_tasks" to "service_role";

grant delete on table "public"."admin_player_relationships" to "anon";

grant insert on table "public"."admin_player_relationships" to "anon";

grant references on table "public"."admin_player_relationships" to "anon";

grant select on table "public"."admin_player_relationships" to "anon";

grant trigger on table "public"."admin_player_relationships" to "anon";

grant truncate on table "public"."admin_player_relationships" to "anon";

grant update on table "public"."admin_player_relationships" to "anon";

grant delete on table "public"."admin_player_relationships" to "authenticated";

grant insert on table "public"."admin_player_relationships" to "authenticated";

grant references on table "public"."admin_player_relationships" to "authenticated";

grant select on table "public"."admin_player_relationships" to "authenticated";

grant trigger on table "public"."admin_player_relationships" to "authenticated";

grant truncate on table "public"."admin_player_relationships" to "authenticated";

grant update on table "public"."admin_player_relationships" to "authenticated";

grant delete on table "public"."admin_player_relationships" to "service_role";

grant insert on table "public"."admin_player_relationships" to "service_role";

grant references on table "public"."admin_player_relationships" to "service_role";

grant select on table "public"."admin_player_relationships" to "service_role";

grant trigger on table "public"."admin_player_relationships" to "service_role";

grant truncate on table "public"."admin_player_relationships" to "service_role";

grant update on table "public"."admin_player_relationships" to "service_role";

grant delete on table "public"."category_mappings" to "anon";

grant insert on table "public"."category_mappings" to "anon";

grant references on table "public"."category_mappings" to "anon";

grant select on table "public"."category_mappings" to "anon";

grant trigger on table "public"."category_mappings" to "anon";

grant truncate on table "public"."category_mappings" to "anon";

grant update on table "public"."category_mappings" to "anon";

grant delete on table "public"."category_mappings" to "authenticated";

grant insert on table "public"."category_mappings" to "authenticated";

grant references on table "public"."category_mappings" to "authenticated";

grant select on table "public"."category_mappings" to "authenticated";

grant trigger on table "public"."category_mappings" to "authenticated";

grant truncate on table "public"."category_mappings" to "authenticated";

grant update on table "public"."category_mappings" to "authenticated";

grant delete on table "public"."category_mappings" to "service_role";

grant insert on table "public"."category_mappings" to "service_role";

grant references on table "public"."category_mappings" to "service_role";

grant select on table "public"."category_mappings" to "service_role";

grant trigger on table "public"."category_mappings" to "service_role";

grant truncate on table "public"."category_mappings" to "service_role";

grant update on table "public"."category_mappings" to "service_role";

grant delete on table "public"."event_sync_log" to "anon";

grant insert on table "public"."event_sync_log" to "anon";

grant references on table "public"."event_sync_log" to "anon";

grant select on table "public"."event_sync_log" to "anon";

grant trigger on table "public"."event_sync_log" to "anon";

grant truncate on table "public"."event_sync_log" to "anon";

grant update on table "public"."event_sync_log" to "anon";

grant delete on table "public"."event_sync_log" to "authenticated";

grant insert on table "public"."event_sync_log" to "authenticated";

grant references on table "public"."event_sync_log" to "authenticated";

grant select on table "public"."event_sync_log" to "authenticated";

grant trigger on table "public"."event_sync_log" to "authenticated";

grant truncate on table "public"."event_sync_log" to "authenticated";

grant update on table "public"."event_sync_log" to "authenticated";

grant delete on table "public"."event_sync_log" to "service_role";

grant insert on table "public"."event_sync_log" to "service_role";

grant references on table "public"."event_sync_log" to "service_role";

grant select on table "public"."event_sync_log" to "service_role";

grant trigger on table "public"."event_sync_log" to "service_role";

grant truncate on table "public"."event_sync_log" to "service_role";

grant update on table "public"."event_sync_log" to "service_role";

grant delete on table "public"."events_external" to "anon";

grant insert on table "public"."events_external" to "anon";

grant references on table "public"."events_external" to "anon";

grant select on table "public"."events_external" to "anon";

grant trigger on table "public"."events_external" to "anon";

grant truncate on table "public"."events_external" to "anon";

grant update on table "public"."events_external" to "anon";

grant delete on table "public"."events_external" to "authenticated";

grant insert on table "public"."events_external" to "authenticated";

grant references on table "public"."events_external" to "authenticated";

grant select on table "public"."events_external" to "authenticated";

grant trigger on table "public"."events_external" to "authenticated";

grant truncate on table "public"."events_external" to "authenticated";

grant update on table "public"."events_external" to "authenticated";

grant delete on table "public"."events_external" to "service_role";

grant insert on table "public"."events_external" to "service_role";

grant references on table "public"."events_external" to "service_role";

grant select on table "public"."events_external" to "service_role";

grant trigger on table "public"."events_external" to "service_role";

grant truncate on table "public"."events_external" to "service_role";

grant update on table "public"."events_external" to "service_role";

grant delete on table "public"."events_local_meta" to "anon";

grant insert on table "public"."events_local_meta" to "anon";

grant references on table "public"."events_local_meta" to "anon";

grant select on table "public"."events_local_meta" to "anon";

grant trigger on table "public"."events_local_meta" to "anon";

grant truncate on table "public"."events_local_meta" to "anon";

grant update on table "public"."events_local_meta" to "anon";

grant delete on table "public"."events_local_meta" to "authenticated";

grant insert on table "public"."events_local_meta" to "authenticated";

grant references on table "public"."events_local_meta" to "authenticated";

grant select on table "public"."events_local_meta" to "authenticated";

grant trigger on table "public"."events_local_meta" to "authenticated";

grant truncate on table "public"."events_local_meta" to "authenticated";

grant update on table "public"."events_local_meta" to "authenticated";

grant delete on table "public"."events_local_meta" to "service_role";

grant insert on table "public"."events_local_meta" to "service_role";

grant references on table "public"."events_local_meta" to "service_role";

grant select on table "public"."events_local_meta" to "service_role";

grant trigger on table "public"."events_local_meta" to "service_role";

grant truncate on table "public"."events_local_meta" to "service_role";

grant update on table "public"."events_local_meta" to "service_role";

grant delete on table "public"."exercise_assignments" to "anon";

grant insert on table "public"."exercise_assignments" to "anon";

grant references on table "public"."exercise_assignments" to "anon";

grant select on table "public"."exercise_assignments" to "anon";

grant trigger on table "public"."exercise_assignments" to "anon";

grant truncate on table "public"."exercise_assignments" to "anon";

grant update on table "public"."exercise_assignments" to "anon";

grant delete on table "public"."exercise_assignments" to "authenticated";

grant insert on table "public"."exercise_assignments" to "authenticated";

grant references on table "public"."exercise_assignments" to "authenticated";

grant select on table "public"."exercise_assignments" to "authenticated";

grant trigger on table "public"."exercise_assignments" to "authenticated";

grant truncate on table "public"."exercise_assignments" to "authenticated";

grant update on table "public"."exercise_assignments" to "authenticated";

grant delete on table "public"."exercise_assignments" to "service_role";

grant insert on table "public"."exercise_assignments" to "service_role";

grant references on table "public"."exercise_assignments" to "service_role";

grant select on table "public"."exercise_assignments" to "service_role";

grant trigger on table "public"."exercise_assignments" to "service_role";

grant truncate on table "public"."exercise_assignments" to "service_role";

grant update on table "public"."exercise_assignments" to "service_role";

grant delete on table "public"."exercise_library" to "anon";

grant insert on table "public"."exercise_library" to "anon";

grant references on table "public"."exercise_library" to "anon";

grant select on table "public"."exercise_library" to "anon";

grant trigger on table "public"."exercise_library" to "anon";

grant truncate on table "public"."exercise_library" to "anon";

grant update on table "public"."exercise_library" to "anon";

grant delete on table "public"."exercise_library" to "authenticated";

grant insert on table "public"."exercise_library" to "authenticated";

grant references on table "public"."exercise_library" to "authenticated";

grant select on table "public"."exercise_library" to "authenticated";

grant trigger on table "public"."exercise_library" to "authenticated";

grant truncate on table "public"."exercise_library" to "authenticated";

grant update on table "public"."exercise_library" to "authenticated";

grant delete on table "public"."exercise_library" to "service_role";

grant insert on table "public"."exercise_library" to "service_role";

grant references on table "public"."exercise_library" to "service_role";

grant select on table "public"."exercise_library" to "service_role";

grant trigger on table "public"."exercise_library" to "service_role";

grant truncate on table "public"."exercise_library" to "service_role";

grant update on table "public"."exercise_library" to "service_role";

grant delete on table "public"."exercise_subtasks" to "anon";

grant insert on table "public"."exercise_subtasks" to "anon";

grant references on table "public"."exercise_subtasks" to "anon";

grant select on table "public"."exercise_subtasks" to "anon";

grant trigger on table "public"."exercise_subtasks" to "anon";

grant truncate on table "public"."exercise_subtasks" to "anon";

grant update on table "public"."exercise_subtasks" to "anon";

grant delete on table "public"."exercise_subtasks" to "authenticated";

grant insert on table "public"."exercise_subtasks" to "authenticated";

grant references on table "public"."exercise_subtasks" to "authenticated";

grant select on table "public"."exercise_subtasks" to "authenticated";

grant trigger on table "public"."exercise_subtasks" to "authenticated";

grant truncate on table "public"."exercise_subtasks" to "authenticated";

grant update on table "public"."exercise_subtasks" to "authenticated";

grant delete on table "public"."exercise_subtasks" to "service_role";

grant insert on table "public"."exercise_subtasks" to "service_role";

grant references on table "public"."exercise_subtasks" to "service_role";

grant select on table "public"."exercise_subtasks" to "service_role";

grant trigger on table "public"."exercise_subtasks" to "service_role";

grant truncate on table "public"."exercise_subtasks" to "service_role";

grant update on table "public"."exercise_subtasks" to "service_role";

grant delete on table "public"."external_calendars" to "anon";

grant insert on table "public"."external_calendars" to "anon";

grant references on table "public"."external_calendars" to "anon";

grant select on table "public"."external_calendars" to "anon";

grant trigger on table "public"."external_calendars" to "anon";

grant truncate on table "public"."external_calendars" to "anon";

grant update on table "public"."external_calendars" to "anon";

grant delete on table "public"."external_calendars" to "authenticated";

grant insert on table "public"."external_calendars" to "authenticated";

grant references on table "public"."external_calendars" to "authenticated";

grant select on table "public"."external_calendars" to "authenticated";

grant trigger on table "public"."external_calendars" to "authenticated";

grant truncate on table "public"."external_calendars" to "authenticated";

grant update on table "public"."external_calendars" to "authenticated";

grant delete on table "public"."external_calendars" to "service_role";

grant insert on table "public"."external_calendars" to "service_role";

grant references on table "public"."external_calendars" to "service_role";

grant select on table "public"."external_calendars" to "service_role";

grant trigger on table "public"."external_calendars" to "service_role";

grant truncate on table "public"."external_calendars" to "service_role";

grant update on table "public"."external_calendars" to "service_role";

grant delete on table "public"."external_event_mappings" to "anon";

grant insert on table "public"."external_event_mappings" to "anon";

grant references on table "public"."external_event_mappings" to "anon";

grant select on table "public"."external_event_mappings" to "anon";

grant trigger on table "public"."external_event_mappings" to "anon";

grant truncate on table "public"."external_event_mappings" to "anon";

grant update on table "public"."external_event_mappings" to "anon";

grant delete on table "public"."external_event_mappings" to "authenticated";

grant insert on table "public"."external_event_mappings" to "authenticated";

grant references on table "public"."external_event_mappings" to "authenticated";

grant select on table "public"."external_event_mappings" to "authenticated";

grant trigger on table "public"."external_event_mappings" to "authenticated";

grant truncate on table "public"."external_event_mappings" to "authenticated";

grant update on table "public"."external_event_mappings" to "authenticated";

grant delete on table "public"."external_event_mappings" to "service_role";

grant insert on table "public"."external_event_mappings" to "service_role";

grant references on table "public"."external_event_mappings" to "service_role";

grant select on table "public"."external_event_mappings" to "service_role";

grant trigger on table "public"."external_event_mappings" to "service_role";

grant truncate on table "public"."external_event_mappings" to "service_role";

grant update on table "public"."external_event_mappings" to "service_role";

grant delete on table "public"."external_event_tasks" to "anon";

grant insert on table "public"."external_event_tasks" to "anon";

grant references on table "public"."external_event_tasks" to "anon";

grant select on table "public"."external_event_tasks" to "anon";

grant trigger on table "public"."external_event_tasks" to "anon";

grant truncate on table "public"."external_event_tasks" to "anon";

grant update on table "public"."external_event_tasks" to "anon";

grant delete on table "public"."external_event_tasks" to "authenticated";

grant insert on table "public"."external_event_tasks" to "authenticated";

grant references on table "public"."external_event_tasks" to "authenticated";

grant select on table "public"."external_event_tasks" to "authenticated";

grant trigger on table "public"."external_event_tasks" to "authenticated";

grant truncate on table "public"."external_event_tasks" to "authenticated";

grant update on table "public"."external_event_tasks" to "authenticated";

grant delete on table "public"."external_event_tasks" to "service_role";

grant insert on table "public"."external_event_tasks" to "service_role";

grant references on table "public"."external_event_tasks" to "service_role";

grant select on table "public"."external_event_tasks" to "service_role";

grant trigger on table "public"."external_event_tasks" to "service_role";

grant truncate on table "public"."external_event_tasks" to "service_role";

grant update on table "public"."external_event_tasks" to "service_role";

grant delete on table "public"."external_events" to "anon";

grant insert on table "public"."external_events" to "anon";

grant references on table "public"."external_events" to "anon";

grant select on table "public"."external_events" to "anon";

grant trigger on table "public"."external_events" to "anon";

grant truncate on table "public"."external_events" to "anon";

grant update on table "public"."external_events" to "anon";

grant delete on table "public"."external_events" to "authenticated";

grant insert on table "public"."external_events" to "authenticated";

grant references on table "public"."external_events" to "authenticated";

grant select on table "public"."external_events" to "authenticated";

grant trigger on table "public"."external_events" to "authenticated";

grant truncate on table "public"."external_events" to "authenticated";

grant update on table "public"."external_events" to "authenticated";

grant delete on table "public"."external_events" to "service_role";

grant insert on table "public"."external_events" to "service_role";

grant references on table "public"."external_events" to "service_role";

grant select on table "public"."external_events" to "service_role";

grant trigger on table "public"."external_events" to "service_role";

grant truncate on table "public"."external_events" to "service_role";

grant update on table "public"."external_events" to "service_role";

grant delete on table "public"."hidden_activity_categories" to "anon";

grant insert on table "public"."hidden_activity_categories" to "anon";

grant references on table "public"."hidden_activity_categories" to "anon";

grant select on table "public"."hidden_activity_categories" to "anon";

grant trigger on table "public"."hidden_activity_categories" to "anon";

grant truncate on table "public"."hidden_activity_categories" to "anon";

grant update on table "public"."hidden_activity_categories" to "anon";

grant delete on table "public"."hidden_activity_categories" to "authenticated";

grant insert on table "public"."hidden_activity_categories" to "authenticated";

grant references on table "public"."hidden_activity_categories" to "authenticated";

grant select on table "public"."hidden_activity_categories" to "authenticated";

grant trigger on table "public"."hidden_activity_categories" to "authenticated";

grant truncate on table "public"."hidden_activity_categories" to "authenticated";

grant update on table "public"."hidden_activity_categories" to "authenticated";

grant delete on table "public"."hidden_activity_categories" to "service_role";

grant insert on table "public"."hidden_activity_categories" to "service_role";

grant references on table "public"."hidden_activity_categories" to "service_role";

grant select on table "public"."hidden_activity_categories" to "service_role";

grant trigger on table "public"."hidden_activity_categories" to "service_role";

grant truncate on table "public"."hidden_activity_categories" to "service_role";

grant update on table "public"."hidden_activity_categories" to "service_role";

grant delete on table "public"."hidden_task_templates" to "anon";

grant insert on table "public"."hidden_task_templates" to "anon";

grant references on table "public"."hidden_task_templates" to "anon";

grant select on table "public"."hidden_task_templates" to "anon";

grant trigger on table "public"."hidden_task_templates" to "anon";

grant truncate on table "public"."hidden_task_templates" to "anon";

grant update on table "public"."hidden_task_templates" to "anon";

grant delete on table "public"."hidden_task_templates" to "authenticated";

grant insert on table "public"."hidden_task_templates" to "authenticated";

grant references on table "public"."hidden_task_templates" to "authenticated";

grant select on table "public"."hidden_task_templates" to "authenticated";

grant trigger on table "public"."hidden_task_templates" to "authenticated";

grant truncate on table "public"."hidden_task_templates" to "authenticated";

grant update on table "public"."hidden_task_templates" to "authenticated";

grant delete on table "public"."hidden_task_templates" to "service_role";

grant insert on table "public"."hidden_task_templates" to "service_role";

grant references on table "public"."hidden_task_templates" to "service_role";

grant select on table "public"."hidden_task_templates" to "service_role";

grant trigger on table "public"."hidden_task_templates" to "service_role";

grant truncate on table "public"."hidden_task_templates" to "service_role";

grant update on table "public"."hidden_task_templates" to "service_role";

grant delete on table "public"."local_event_meta" to "anon";

grant insert on table "public"."local_event_meta" to "anon";

grant references on table "public"."local_event_meta" to "anon";

grant select on table "public"."local_event_meta" to "anon";

grant trigger on table "public"."local_event_meta" to "anon";

grant truncate on table "public"."local_event_meta" to "anon";

grant update on table "public"."local_event_meta" to "anon";

grant delete on table "public"."local_event_meta" to "authenticated";

grant insert on table "public"."local_event_meta" to "authenticated";

grant references on table "public"."local_event_meta" to "authenticated";

grant select on table "public"."local_event_meta" to "authenticated";

grant trigger on table "public"."local_event_meta" to "authenticated";

grant truncate on table "public"."local_event_meta" to "authenticated";

grant update on table "public"."local_event_meta" to "authenticated";

grant delete on table "public"."local_event_meta" to "service_role";

grant insert on table "public"."local_event_meta" to "service_role";

grant references on table "public"."local_event_meta" to "service_role";

grant select on table "public"."local_event_meta" to "service_role";

grant trigger on table "public"."local_event_meta" to "service_role";

grant truncate on table "public"."local_event_meta" to "service_role";

grant update on table "public"."local_event_meta" to "service_role";

grant delete on table "public"."player_invitations" to "anon";

grant insert on table "public"."player_invitations" to "anon";

grant references on table "public"."player_invitations" to "anon";

grant select on table "public"."player_invitations" to "anon";

grant trigger on table "public"."player_invitations" to "anon";

grant truncate on table "public"."player_invitations" to "anon";

grant update on table "public"."player_invitations" to "anon";

grant delete on table "public"."player_invitations" to "authenticated";

grant insert on table "public"."player_invitations" to "authenticated";

grant references on table "public"."player_invitations" to "authenticated";

grant select on table "public"."player_invitations" to "authenticated";

grant trigger on table "public"."player_invitations" to "authenticated";

grant truncate on table "public"."player_invitations" to "authenticated";

grant update on table "public"."player_invitations" to "authenticated";

grant delete on table "public"."player_invitations" to "service_role";

grant insert on table "public"."player_invitations" to "service_role";

grant references on table "public"."player_invitations" to "service_role";

grant select on table "public"."player_invitations" to "service_role";

grant trigger on table "public"."player_invitations" to "service_role";

grant truncate on table "public"."player_invitations" to "service_role";

grant update on table "public"."player_invitations" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."subscription_plans" to "anon";

grant insert on table "public"."subscription_plans" to "anon";

grant references on table "public"."subscription_plans" to "anon";

grant select on table "public"."subscription_plans" to "anon";

grant trigger on table "public"."subscription_plans" to "anon";

grant truncate on table "public"."subscription_plans" to "anon";

grant update on table "public"."subscription_plans" to "anon";

grant delete on table "public"."subscription_plans" to "authenticated";

grant insert on table "public"."subscription_plans" to "authenticated";

grant references on table "public"."subscription_plans" to "authenticated";

grant select on table "public"."subscription_plans" to "authenticated";

grant trigger on table "public"."subscription_plans" to "authenticated";

grant truncate on table "public"."subscription_plans" to "authenticated";

grant update on table "public"."subscription_plans" to "authenticated";

grant delete on table "public"."subscription_plans" to "service_role";

grant insert on table "public"."subscription_plans" to "service_role";

grant references on table "public"."subscription_plans" to "service_role";

grant select on table "public"."subscription_plans" to "service_role";

grant trigger on table "public"."subscription_plans" to "service_role";

grant truncate on table "public"."subscription_plans" to "service_role";

grant update on table "public"."subscription_plans" to "service_role";

grant delete on table "public"."subscriptions" to "anon";

grant insert on table "public"."subscriptions" to "anon";

grant references on table "public"."subscriptions" to "anon";

grant select on table "public"."subscriptions" to "anon";

grant trigger on table "public"."subscriptions" to "anon";

grant truncate on table "public"."subscriptions" to "anon";

grant update on table "public"."subscriptions" to "anon";

grant delete on table "public"."subscriptions" to "authenticated";

grant insert on table "public"."subscriptions" to "authenticated";

grant references on table "public"."subscriptions" to "authenticated";

grant select on table "public"."subscriptions" to "authenticated";

grant trigger on table "public"."subscriptions" to "authenticated";

grant truncate on table "public"."subscriptions" to "authenticated";

grant update on table "public"."subscriptions" to "authenticated";

grant delete on table "public"."subscriptions" to "service_role";

grant insert on table "public"."subscriptions" to "service_role";

grant references on table "public"."subscriptions" to "service_role";

grant select on table "public"."subscriptions" to "service_role";

grant trigger on table "public"."subscriptions" to "service_role";

grant truncate on table "public"."subscriptions" to "service_role";

grant update on table "public"."subscriptions" to "service_role";

grant delete on table "public"."task_template_categories" to "anon";

grant insert on table "public"."task_template_categories" to "anon";

grant references on table "public"."task_template_categories" to "anon";

grant select on table "public"."task_template_categories" to "anon";

grant trigger on table "public"."task_template_categories" to "anon";

grant truncate on table "public"."task_template_categories" to "anon";

grant update on table "public"."task_template_categories" to "anon";

grant delete on table "public"."task_template_categories" to "authenticated";

grant insert on table "public"."task_template_categories" to "authenticated";

grant references on table "public"."task_template_categories" to "authenticated";

grant select on table "public"."task_template_categories" to "authenticated";

grant trigger on table "public"."task_template_categories" to "authenticated";

grant truncate on table "public"."task_template_categories" to "authenticated";

grant update on table "public"."task_template_categories" to "authenticated";

grant delete on table "public"."task_template_categories" to "service_role";

grant insert on table "public"."task_template_categories" to "service_role";

grant references on table "public"."task_template_categories" to "service_role";

grant select on table "public"."task_template_categories" to "service_role";

grant trigger on table "public"."task_template_categories" to "service_role";

grant truncate on table "public"."task_template_categories" to "service_role";

grant update on table "public"."task_template_categories" to "service_role";

grant delete on table "public"."task_template_subtasks" to "anon";

grant insert on table "public"."task_template_subtasks" to "anon";

grant references on table "public"."task_template_subtasks" to "anon";

grant select on table "public"."task_template_subtasks" to "anon";

grant trigger on table "public"."task_template_subtasks" to "anon";

grant truncate on table "public"."task_template_subtasks" to "anon";

grant update on table "public"."task_template_subtasks" to "anon";

grant delete on table "public"."task_template_subtasks" to "authenticated";

grant insert on table "public"."task_template_subtasks" to "authenticated";

grant references on table "public"."task_template_subtasks" to "authenticated";

grant select on table "public"."task_template_subtasks" to "authenticated";

grant trigger on table "public"."task_template_subtasks" to "authenticated";

grant truncate on table "public"."task_template_subtasks" to "authenticated";

grant update on table "public"."task_template_subtasks" to "authenticated";

grant delete on table "public"."task_template_subtasks" to "service_role";

grant insert on table "public"."task_template_subtasks" to "service_role";

grant references on table "public"."task_template_subtasks" to "service_role";

grant select on table "public"."task_template_subtasks" to "service_role";

grant trigger on table "public"."task_template_subtasks" to "service_role";

grant truncate on table "public"."task_template_subtasks" to "service_role";

grant update on table "public"."task_template_subtasks" to "service_role";

grant delete on table "public"."task_templates" to "anon";

grant insert on table "public"."task_templates" to "anon";

grant references on table "public"."task_templates" to "anon";

grant select on table "public"."task_templates" to "anon";

grant trigger on table "public"."task_templates" to "anon";

grant truncate on table "public"."task_templates" to "anon";

grant update on table "public"."task_templates" to "anon";

grant delete on table "public"."task_templates" to "authenticated";

grant insert on table "public"."task_templates" to "authenticated";

grant references on table "public"."task_templates" to "authenticated";

grant select on table "public"."task_templates" to "authenticated";

grant trigger on table "public"."task_templates" to "authenticated";

grant truncate on table "public"."task_templates" to "authenticated";

grant update on table "public"."task_templates" to "authenticated";

grant delete on table "public"."task_templates" to "service_role";

grant insert on table "public"."task_templates" to "service_role";

grant references on table "public"."task_templates" to "service_role";

grant select on table "public"."task_templates" to "service_role";

grant trigger on table "public"."task_templates" to "service_role";

grant truncate on table "public"."task_templates" to "service_role";

grant update on table "public"."task_templates" to "service_role";

grant delete on table "public"."tasks" to "anon";

grant insert on table "public"."tasks" to "anon";

grant references on table "public"."tasks" to "anon";

grant select on table "public"."tasks" to "anon";

grant trigger on table "public"."tasks" to "anon";

grant truncate on table "public"."tasks" to "anon";

grant update on table "public"."tasks" to "anon";

grant delete on table "public"."tasks" to "authenticated";

grant insert on table "public"."tasks" to "authenticated";

grant references on table "public"."tasks" to "authenticated";

grant select on table "public"."tasks" to "authenticated";

grant trigger on table "public"."tasks" to "authenticated";

grant truncate on table "public"."tasks" to "authenticated";

grant update on table "public"."tasks" to "authenticated";

grant delete on table "public"."tasks" to "service_role";

grant insert on table "public"."tasks" to "service_role";

grant references on table "public"."tasks" to "service_role";

grant select on table "public"."tasks" to "service_role";

grant trigger on table "public"."tasks" to "service_role";

grant truncate on table "public"."tasks" to "service_role";

grant update on table "public"."tasks" to "service_role";

grant delete on table "public"."team_members" to "anon";

grant insert on table "public"."team_members" to "anon";

grant references on table "public"."team_members" to "anon";

grant select on table "public"."team_members" to "anon";

grant trigger on table "public"."team_members" to "anon";

grant truncate on table "public"."team_members" to "anon";

grant update on table "public"."team_members" to "anon";

grant delete on table "public"."team_members" to "authenticated";

grant insert on table "public"."team_members" to "authenticated";

grant references on table "public"."team_members" to "authenticated";

grant select on table "public"."team_members" to "authenticated";

grant trigger on table "public"."team_members" to "authenticated";

grant truncate on table "public"."team_members" to "authenticated";

grant update on table "public"."team_members" to "authenticated";

grant delete on table "public"."team_members" to "service_role";

grant insert on table "public"."team_members" to "service_role";

grant references on table "public"."team_members" to "service_role";

grant select on table "public"."team_members" to "service_role";

grant trigger on table "public"."team_members" to "service_role";

grant truncate on table "public"."team_members" to "service_role";

grant update on table "public"."team_members" to "service_role";

grant delete on table "public"."teams" to "anon";

grant insert on table "public"."teams" to "anon";

grant references on table "public"."teams" to "anon";

grant select on table "public"."teams" to "anon";

grant trigger on table "public"."teams" to "anon";

grant truncate on table "public"."teams" to "anon";

grant update on table "public"."teams" to "anon";

grant delete on table "public"."teams" to "authenticated";

grant insert on table "public"."teams" to "authenticated";

grant references on table "public"."teams" to "authenticated";

grant select on table "public"."teams" to "authenticated";

grant trigger on table "public"."teams" to "authenticated";

grant truncate on table "public"."teams" to "authenticated";

grant update on table "public"."teams" to "authenticated";

grant delete on table "public"."teams" to "service_role";

grant insert on table "public"."teams" to "service_role";

grant references on table "public"."teams" to "service_role";

grant select on table "public"."teams" to "service_role";

grant trigger on table "public"."teams" to "service_role";

grant truncate on table "public"."teams" to "service_role";

grant update on table "public"."teams" to "service_role";

grant delete on table "public"."trophies" to "anon";

grant insert on table "public"."trophies" to "anon";

grant references on table "public"."trophies" to "anon";

grant select on table "public"."trophies" to "anon";

grant trigger on table "public"."trophies" to "anon";

grant truncate on table "public"."trophies" to "anon";

grant update on table "public"."trophies" to "anon";

grant delete on table "public"."trophies" to "authenticated";

grant insert on table "public"."trophies" to "authenticated";

grant references on table "public"."trophies" to "authenticated";

grant select on table "public"."trophies" to "authenticated";

grant trigger on table "public"."trophies" to "authenticated";

grant truncate on table "public"."trophies" to "authenticated";

grant update on table "public"."trophies" to "authenticated";

grant delete on table "public"."trophies" to "service_role";

grant insert on table "public"."trophies" to "service_role";

grant references on table "public"."trophies" to "service_role";

grant select on table "public"."trophies" to "service_role";

grant trigger on table "public"."trophies" to "service_role";

grant truncate on table "public"."trophies" to "service_role";

grant update on table "public"."trophies" to "service_role";

grant delete on table "public"."user_roles" to "anon";

grant insert on table "public"."user_roles" to "anon";

grant references on table "public"."user_roles" to "anon";

grant select on table "public"."user_roles" to "anon";

grant trigger on table "public"."user_roles" to "anon";

grant truncate on table "public"."user_roles" to "anon";

grant update on table "public"."user_roles" to "anon";

grant delete on table "public"."user_roles" to "authenticated";

grant insert on table "public"."user_roles" to "authenticated";

grant references on table "public"."user_roles" to "authenticated";

grant select on table "public"."user_roles" to "authenticated";

grant trigger on table "public"."user_roles" to "authenticated";

grant truncate on table "public"."user_roles" to "authenticated";

grant update on table "public"."user_roles" to "authenticated";

grant delete on table "public"."user_roles" to "service_role";

grant insert on table "public"."user_roles" to "service_role";

grant references on table "public"."user_roles" to "service_role";

grant select on table "public"."user_roles" to "service_role";

grant trigger on table "public"."user_roles" to "service_role";

grant truncate on table "public"."user_roles" to "service_role";

grant update on table "public"."user_roles" to "service_role";

grant delete on table "public"."weekly_performance" to "anon";

grant insert on table "public"."weekly_performance" to "anon";

grant references on table "public"."weekly_performance" to "anon";

grant select on table "public"."weekly_performance" to "anon";

grant trigger on table "public"."weekly_performance" to "anon";

grant truncate on table "public"."weekly_performance" to "anon";

grant update on table "public"."weekly_performance" to "anon";

grant delete on table "public"."weekly_performance" to "authenticated";

grant insert on table "public"."weekly_performance" to "authenticated";

grant references on table "public"."weekly_performance" to "authenticated";

grant select on table "public"."weekly_performance" to "authenticated";

grant trigger on table "public"."weekly_performance" to "authenticated";

grant truncate on table "public"."weekly_performance" to "authenticated";

grant update on table "public"."weekly_performance" to "authenticated";

grant delete on table "public"."weekly_performance" to "service_role";

grant insert on table "public"."weekly_performance" to "service_role";

grant references on table "public"."weekly_performance" to "service_role";

grant select on table "public"."weekly_performance" to "service_role";

grant trigger on table "public"."weekly_performance" to "service_role";

grant truncate on table "public"."weekly_performance" to "service_role";

grant update on table "public"."weekly_performance" to "service_role";


  create policy "Admins can view activities assigned to their players"
  on "public"."activities"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = activities.player_id) AND (apr.admin_id = auth.uid()) AND (activities.player_id IS NOT NULL)))));



  create policy "Admins can view their players activities"
  on "public"."activities"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = activities.user_id) AND (apr.admin_id = auth.uid())))));



  create policy "Users can create their own activities"
  on "public"."activities"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can delete their own activities"
  on "public"."activities"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert their own activities"
  on "public"."activities"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own activities"
  on "public"."activities"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view their own activities"
  on "public"."activities"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR (player_id = auth.uid()) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.player_id = auth.uid())))));



  create policy "Admins can view system and players categories"
  on "public"."activity_categories"
  as permissive
  for select
  to public
using (((is_system = true) OR (EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = activity_categories.user_id) AND (apr.admin_id = auth.uid()))))));



  create policy "Users can create their own categories"
  on "public"."activity_categories"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can delete their own categories"
  on "public"."activity_categories"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert their own categories"
  on "public"."activity_categories"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own categories"
  on "public"."activity_categories"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view system and own categories"
  on "public"."activity_categories"
  as permissive
  for select
  to public
using (((is_system = true) OR (user_id = auth.uid()) OR (player_id = auth.uid()) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.player_id = auth.uid())))));



  create policy "Admins can view their players activity series"
  on "public"."activity_series"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = activity_series.user_id) AND (apr.admin_id = auth.uid())))));



  create policy "Users can create their own activity series"
  on "public"."activity_series"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can delete their own activity series"
  on "public"."activity_series"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can update their own activity series"
  on "public"."activity_series"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view their own activity series"
  on "public"."activity_series"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Users can delete their own activity task subtasks"
  on "public"."activity_task_subtasks"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM (public.activity_tasks
     JOIN public.activities ON ((activities.id = activity_tasks.activity_id)))
  WHERE ((activity_tasks.id = activity_task_subtasks.activity_task_id) AND (activities.user_id = auth.uid())))));



  create policy "Users can insert their own activity task subtasks"
  on "public"."activity_task_subtasks"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM (public.activity_tasks
     JOIN public.activities ON ((activities.id = activity_tasks.activity_id)))
  WHERE ((activity_tasks.id = activity_task_subtasks.activity_task_id) AND (activities.user_id = auth.uid())))));



  create policy "Users can update their own activity task subtasks"
  on "public"."activity_task_subtasks"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM (public.activity_tasks
     JOIN public.activities ON ((activities.id = activity_tasks.activity_id)))
  WHERE ((activity_tasks.id = activity_task_subtasks.activity_task_id) AND (activities.user_id = auth.uid())))));



  create policy "Users can view their own activity task subtasks"
  on "public"."activity_task_subtasks"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.activity_tasks
     JOIN public.activities ON ((activities.id = activity_tasks.activity_id)))
  WHERE ((activity_tasks.id = activity_task_subtasks.activity_task_id) AND (activities.user_id = auth.uid())))));



  create policy "Admins can view their players activity tasks"
  on "public"."activity_tasks"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.activities a
     JOIN public.admin_player_relationships apr ON ((apr.player_id = a.user_id)))
  WHERE ((a.id = activity_tasks.activity_id) AND (apr.admin_id = auth.uid())))));



  create policy "Users can delete their own activity tasks"
  on "public"."activity_tasks"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.activities
  WHERE ((activities.id = activity_tasks.activity_id) AND (activities.user_id = auth.uid())))));



  create policy "Users can insert their own activity tasks"
  on "public"."activity_tasks"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.activities
  WHERE ((activities.id = activity_tasks.activity_id) AND (activities.user_id = auth.uid())))));



  create policy "Users can update their own activity tasks"
  on "public"."activity_tasks"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.activities
  WHERE ((activities.id = activity_tasks.activity_id) AND (activities.user_id = auth.uid())))));



  create policy "Users can view their own activity tasks"
  on "public"."activity_tasks"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.activities
  WHERE ((activities.id = activity_tasks.activity_id) AND (activities.user_id = auth.uid())))));



  create policy "Admins can delete their player relationships"
  on "public"."admin_player_relationships"
  as permissive
  for delete
  to public
using ((admin_id = auth.uid()));



  create policy "Admins can view their player relationships"
  on "public"."admin_player_relationships"
  as permissive
  for select
  to public
using ((admin_id = auth.uid()));



  create policy "Players can view their admin relationships"
  on "public"."admin_player_relationships"
  as permissive
  for select
  to public
using ((player_id = auth.uid()));



  create policy "Users can create player relationships"
  on "public"."admin_player_relationships"
  as permissive
  for insert
  to public
with check ((admin_id = auth.uid()));



  create policy "Users can delete their own category mappings"
  on "public"."category_mappings"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert their own category mappings"
  on "public"."category_mappings"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can update their own category mappings"
  on "public"."category_mappings"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view their own category mappings"
  on "public"."category_mappings"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Service role can manage sync logs"
  on "public"."event_sync_log"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'role'::text) = 'service_role'::text));



  create policy "Users can view their own sync logs"
  on "public"."event_sync_log"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Admins can view external events from their players calendars"
  on "public"."events_external"
  as permissive
  for select
  to public
using ((provider_calendar_id IN ( SELECT ec.id
   FROM (public.external_calendars ec
     JOIN public.admin_player_relationships apr ON ((apr.player_id = ec.user_id)))
  WHERE (apr.admin_id = auth.uid()))));



  create policy "Service role can manage external events"
  on "public"."events_external"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'role'::text) = 'service_role'::text));



  create policy "Users can view external events from their calendars"
  on "public"."events_external"
  as permissive
  for select
  to public
using ((provider_calendar_id IN ( SELECT external_calendars.id
   FROM public.external_calendars
  WHERE (external_calendars.user_id = auth.uid()))));



  create policy "Admins can delete their players event metadata"
  on "public"."events_local_meta"
  as permissive
  for delete
  to public
using ((user_id IN ( SELECT admin_player_relationships.player_id
   FROM public.admin_player_relationships
  WHERE (admin_player_relationships.admin_id = auth.uid()))));



  create policy "Admins can update their players event metadata"
  on "public"."events_local_meta"
  as permissive
  for update
  to public
using ((user_id IN ( SELECT admin_player_relationships.player_id
   FROM public.admin_player_relationships
  WHERE (admin_player_relationships.admin_id = auth.uid()))));



  create policy "Admins can view their players external events"
  on "public"."events_local_meta"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = events_local_meta.user_id) AND (apr.admin_id = auth.uid())))));



  create policy "Users can delete their event metadata"
  on "public"."events_local_meta"
  as permissive
  for delete
  to public
using (((auth.uid() = user_id) OR (auth.uid() = player_id) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.player_id = auth.uid())))));



  create policy "Users can insert their own event metadata"
  on "public"."events_local_meta"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their event metadata"
  on "public"."events_local_meta"
  as permissive
  for update
  to public
using (((auth.uid() = user_id) OR (auth.uid() = player_id) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.player_id = auth.uid())))));



  create policy "Users can view their event metadata"
  on "public"."events_local_meta"
  as permissive
  for select
  to public
using (((auth.uid() = user_id) OR (auth.uid() = player_id) OR (team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.player_id = auth.uid())))));



  create policy "Players can delete their own assignments"
  on "public"."exercise_assignments"
  as permissive
  for delete
  to public
using ((player_id = auth.uid()));



  create policy "Players can view exercises assigned to them"
  on "public"."exercise_assignments"
  as permissive
  for select
  to public
using ((player_id = auth.uid()));



  create policy "Trainers can create assignments"
  on "public"."exercise_assignments"
  as permissive
  for insert
  to public
with check ((trainer_id = auth.uid()));



  create policy "Trainers can delete their assignments"
  on "public"."exercise_assignments"
  as permissive
  for delete
  to public
using ((trainer_id = auth.uid()));



  create policy "Trainers can view their assignments"
  on "public"."exercise_assignments"
  as permissive
  for select
  to public
using ((trainer_id = auth.uid()));



  create policy "Anyone can view system exercises"
  on "public"."exercise_library"
  as permissive
  for select
  to public
using ((is_system = true));



  create policy "Players can view exercises assigned to them"
  on "public"."exercise_library"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.exercise_assignments
  WHERE ((exercise_assignments.exercise_id = exercise_library.id) AND (exercise_assignments.player_id = auth.uid())))));



  create policy "Trainers can create exercises"
  on "public"."exercise_library"
  as permissive
  for insert
  to public
with check ((trainer_id = auth.uid()));



  create policy "Trainers can delete their own exercises"
  on "public"."exercise_library"
  as permissive
  for delete
  to public
using ((trainer_id = auth.uid()));



  create policy "Trainers can update their own exercises"
  on "public"."exercise_library"
  as permissive
  for update
  to public
using ((trainer_id = auth.uid()));



  create policy "Trainers can view their own exercises"
  on "public"."exercise_library"
  as permissive
  for select
  to public
using ((trainer_id = auth.uid()));



  create policy "Trainers can create subtasks for their exercises"
  on "public"."exercise_subtasks"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.exercise_library
  WHERE ((exercise_library.id = exercise_subtasks.exercise_id) AND (exercise_library.trainer_id = auth.uid())))));



  create policy "Trainers can delete subtasks for their exercises"
  on "public"."exercise_subtasks"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.exercise_library
  WHERE ((exercise_library.id = exercise_subtasks.exercise_id) AND (exercise_library.trainer_id = auth.uid())))));



  create policy "Trainers can update subtasks for their exercises"
  on "public"."exercise_subtasks"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.exercise_library
  WHERE ((exercise_library.id = exercise_subtasks.exercise_id) AND (exercise_library.trainer_id = auth.uid())))));



  create policy "Users can view subtasks of exercises they can access"
  on "public"."exercise_subtasks"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.exercise_library
  WHERE ((exercise_library.id = exercise_subtasks.exercise_id) AND ((exercise_library.trainer_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM public.exercise_assignments
          WHERE ((exercise_assignments.exercise_id = exercise_library.id) AND (exercise_assignments.player_id = auth.uid())))) OR (exercise_library.is_system = true))))));



  create policy "Admins can view their players calendars"
  on "public"."external_calendars"
  as permissive
  for select
  to public
using ((user_id IN ( SELECT admin_player_relationships.player_id
   FROM public.admin_player_relationships
  WHERE (admin_player_relationships.admin_id = auth.uid()))));



  create policy "Users can delete their own calendars"
  on "public"."external_calendars"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own calendars"
  on "public"."external_calendars"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own calendars"
  on "public"."external_calendars"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own calendars"
  on "public"."external_calendars"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users can view mappings through local_event_meta"
  on "public"."external_event_mappings"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.local_event_meta
  WHERE ((local_event_meta.external_event_id = external_event_mappings.external_event_id) AND (local_event_meta.user_id = auth.uid())))));



  create policy "Admins can delete their players external event tasks"
  on "public"."external_event_tasks"
  as permissive
  for delete
  to public
using ((local_meta_id IN ( SELECT events_local_meta.id
   FROM public.events_local_meta
  WHERE (events_local_meta.user_id IN ( SELECT admin_player_relationships.player_id
           FROM public.admin_player_relationships
          WHERE (admin_player_relationships.admin_id = auth.uid()))))));



  create policy "Admins can insert their players external event tasks"
  on "public"."external_event_tasks"
  as permissive
  for insert
  to public
with check ((local_meta_id IN ( SELECT events_local_meta.id
   FROM public.events_local_meta
  WHERE (events_local_meta.user_id IN ( SELECT admin_player_relationships.player_id
           FROM public.admin_player_relationships
          WHERE (admin_player_relationships.admin_id = auth.uid()))))));



  create policy "Admins can update their players external event tasks"
  on "public"."external_event_tasks"
  as permissive
  for update
  to public
using ((local_meta_id IN ( SELECT events_local_meta.id
   FROM public.events_local_meta
  WHERE (events_local_meta.user_id IN ( SELECT admin_player_relationships.player_id
           FROM public.admin_player_relationships
          WHERE (admin_player_relationships.admin_id = auth.uid()))))));



  create policy "Admins can view their players external event tasks"
  on "public"."external_event_tasks"
  as permissive
  for select
  to public
using ((local_meta_id IN ( SELECT events_local_meta.id
   FROM public.events_local_meta
  WHERE (events_local_meta.user_id IN ( SELECT admin_player_relationships.player_id
           FROM public.admin_player_relationships
          WHERE (admin_player_relationships.admin_id = auth.uid()))))));



  create policy "Users can delete their own external event tasks"
  on "public"."external_event_tasks"
  as permissive
  for delete
  to public
using ((local_meta_id IN ( SELECT events_local_meta.id
   FROM public.events_local_meta
  WHERE (events_local_meta.user_id = auth.uid()))));



  create policy "Users can insert their own external event tasks"
  on "public"."external_event_tasks"
  as permissive
  for insert
  to public
with check ((local_meta_id IN ( SELECT events_local_meta.id
   FROM public.events_local_meta
  WHERE (events_local_meta.user_id = auth.uid()))));



  create policy "Users can update their own external event tasks"
  on "public"."external_event_tasks"
  as permissive
  for update
  to public
using ((local_meta_id IN ( SELECT events_local_meta.id
   FROM public.events_local_meta
  WHERE (events_local_meta.user_id = auth.uid()))));



  create policy "Users can view their own external event tasks"
  on "public"."external_event_tasks"
  as permissive
  for select
  to public
using ((local_meta_id IN ( SELECT events_local_meta.id
   FROM public.events_local_meta
  WHERE (events_local_meta.user_id = auth.uid()))));



  create policy "Users can view external events through local_event_meta"
  on "public"."external_events"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.local_event_meta
  WHERE ((local_event_meta.external_event_id = external_events.id) AND (local_event_meta.user_id = auth.uid())))));



  create policy "Allow delete own hidden categories"
  on "public"."hidden_activity_categories"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Allow insert own hidden categories"
  on "public"."hidden_activity_categories"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Allow select own hidden categories"
  on "public"."hidden_activity_categories"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Users can delete their own hidden tasks"
  on "public"."hidden_task_templates"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own hidden tasks"
  on "public"."hidden_task_templates"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can upsert their own hidden tasks"
  on "public"."hidden_task_templates"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can view their own hidden tasks"
  on "public"."hidden_task_templates"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users can delete their own local event metadata"
  on "public"."local_event_meta"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert their own local event metadata"
  on "public"."local_event_meta"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can update their own local event metadata"
  on "public"."local_event_meta"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view their own local event metadata"
  on "public"."local_event_meta"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Admins can create invitations"
  on "public"."player_invitations"
  as permissive
  for insert
  to public
with check (((admin_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.user_roles
  WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::text))))));



  create policy "Admins can update their invitations"
  on "public"."player_invitations"
  as permissive
  for update
  to public
using ((admin_id = auth.uid()));



  create policy "Admins can view their invitations"
  on "public"."player_invitations"
  as permissive
  for select
  to public
using ((admin_id = auth.uid()));



  create policy "Anyone can view invitations by code"
  on "public"."player_invitations"
  as permissive
  for select
  to public
using (true);



  create policy "Users can update invitations they're accepting"
  on "public"."player_invitations"
  as permissive
  for update
  to public
using (((status = 'pending'::text) AND (invitation_code IS NOT NULL)));



  create policy "Admins can view their players profiles"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = profiles.user_id) AND (apr.admin_id = auth.uid())))));



  create policy "Players can view their admin profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.admin_id = profiles.user_id) AND (apr.player_id = auth.uid())))));



  create policy "Users can insert their own profile"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can update their own profile"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view their own profile"
  on "public"."profiles"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Anyone can view subscription plans"
  on "public"."subscription_plans"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Admins can insert their own subscriptions"
  on "public"."subscriptions"
  as permissive
  for insert
  to authenticated
with check ((admin_id = auth.uid()));



  create policy "Admins can update their own subscriptions"
  on "public"."subscriptions"
  as permissive
  for update
  to authenticated
using ((admin_id = auth.uid()));



  create policy "Admins can view their own subscriptions"
  on "public"."subscriptions"
  as permissive
  for select
  to authenticated
using ((admin_id = auth.uid()));



  create policy "Admins can view their players task template categories"
  on "public"."task_template_categories"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.task_templates tt
     JOIN public.admin_player_relationships apr ON ((apr.player_id = tt.user_id)))
  WHERE ((tt.id = task_template_categories.task_template_id) AND (apr.admin_id = auth.uid())))));



  create policy "Users can delete their own task template categories"
  on "public"."task_template_categories"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.task_templates
  WHERE ((task_templates.id = task_template_categories.task_template_id) AND (task_templates.user_id = auth.uid())))));



  create policy "Users can insert their own task template categories"
  on "public"."task_template_categories"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.task_templates
  WHERE ((task_templates.id = task_template_categories.task_template_id) AND (task_templates.user_id = auth.uid())))));



  create policy "Users can view their own task template categories"
  on "public"."task_template_categories"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.task_templates
  WHERE ((task_templates.id = task_template_categories.task_template_id) AND (task_templates.user_id = auth.uid())))));



  create policy "Users can delete their own task template subtasks"
  on "public"."task_template_subtasks"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.task_templates
  WHERE ((task_templates.id = task_template_subtasks.task_template_id) AND (task_templates.user_id = auth.uid())))));



  create policy "Users can insert their own task template subtasks"
  on "public"."task_template_subtasks"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.task_templates
  WHERE ((task_templates.id = task_template_subtasks.task_template_id) AND (task_templates.user_id = auth.uid())))));



  create policy "Users can update their own task template subtasks"
  on "public"."task_template_subtasks"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.task_templates
  WHERE ((task_templates.id = task_template_subtasks.task_template_id) AND (task_templates.user_id = auth.uid())))));



  create policy "Users can view their own task template subtasks"
  on "public"."task_template_subtasks"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.task_templates
  WHERE ((task_templates.id = task_template_subtasks.task_template_id) AND (task_templates.user_id = auth.uid())))));



  create policy "Admins can view their players task templates v2"
  on "public"."task_templates"
  as permissive
  for select
  to public
using (((EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = task_templates.user_id) AND (apr.admin_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = task_templates.player_id) AND (apr.admin_id = auth.uid()) AND (task_templates.player_id IS NOT NULL))))));



  create policy "Users can create their own task templates"
  on "public"."task_templates"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can delete their own task templates"
  on "public"."task_templates"
  as permissive
  for delete
  to public
using ((user_id = auth.uid()));



  create policy "Users can insert their own task templates"
  on "public"."task_templates"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own task templates"
  on "public"."task_templates"
  as permissive
  for update
  to public
using ((user_id = auth.uid()));



  create policy "Users can view their own task templates v2"
  on "public"."task_templates"
  as permissive
  for select
  to public
using (((user_id = auth.uid()) OR ((player_id = auth.uid()) AND (player_id IS NOT NULL)) OR ((team_id IN ( SELECT team_members.team_id
   FROM public.team_members
  WHERE (team_members.player_id = auth.uid()))) AND (team_id IS NOT NULL))));



  create policy "Users can delete their own tasks"
  on "public"."tasks"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own tasks"
  on "public"."tasks"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own tasks"
  on "public"."tasks"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own tasks"
  on "public"."tasks"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Admins can add members to their teams"
  on "public"."team_members"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.teams
  WHERE ((teams.id = team_members.team_id) AND (teams.admin_id = auth.uid())))));



  create policy "Admins can remove members from their teams"
  on "public"."team_members"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.teams
  WHERE ((teams.id = team_members.team_id) AND (teams.admin_id = auth.uid())))));



  create policy "Admins can view team members for their teams"
  on "public"."team_members"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.teams
  WHERE ((teams.id = team_members.team_id) AND (teams.admin_id = auth.uid())))));



  create policy "Admins can create teams"
  on "public"."teams"
  as permissive
  for insert
  to public
with check ((admin_id = auth.uid()));



  create policy "Admins can delete their own teams"
  on "public"."teams"
  as permissive
  for delete
  to public
using ((admin_id = auth.uid()));



  create policy "Admins can update their own teams"
  on "public"."teams"
  as permissive
  for update
  to public
using ((admin_id = auth.uid()));



  create policy "Admins can view their own teams"
  on "public"."teams"
  as permissive
  for select
  to public
using ((admin_id = auth.uid()));



  create policy "Admins can view their players trophies"
  on "public"."trophies"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = trophies.user_id) AND (apr.admin_id = auth.uid())))));



  create policy "Users can delete their own trophies"
  on "public"."trophies"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own trophies"
  on "public"."trophies"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own trophies"
  on "public"."trophies"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own trophies"
  on "public"."trophies"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own role on signup"
  on "public"."user_roles"
  as permissive
  for insert
  to public
with check ((user_id = auth.uid()));



  create policy "Users can update their own role"
  on "public"."user_roles"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "Users can view their own role"
  on "public"."user_roles"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "Admins can view their players weekly performance"
  on "public"."weekly_performance"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.admin_player_relationships apr
  WHERE ((apr.player_id = weekly_performance.user_id) AND (apr.admin_id = auth.uid())))));



  create policy "Users can delete their own weekly performance"
  on "public"."weekly_performance"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert their own weekly performance"
  on "public"."weekly_performance"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update their own weekly performance"
  on "public"."weekly_performance"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own weekly performance"
  on "public"."weekly_performance"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));


CREATE TRIGGER on_activity_category_changed AFTER UPDATE ON public.activities FOR EACH ROW WHEN ((old.category_id IS DISTINCT FROM new.category_id)) EXECUTE FUNCTION public.trigger_update_tasks_on_category_change();

CREATE TRIGGER on_activity_created AFTER INSERT ON public.activities FOR EACH ROW EXECUTE FUNCTION public.trigger_create_tasks_for_activity();

CREATE TRIGGER trigger_update_category_updated_at BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.update_category_updated_at();

CREATE TRIGGER update_activities_timestamp BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.trigger_update_timestamp();

CREATE TRIGGER update_activity_categories_timestamp BEFORE UPDATE ON public.activity_categories FOR EACH ROW EXECUTE FUNCTION public.trigger_update_timestamp();

CREATE TRIGGER trigger_update_series_activities AFTER UPDATE ON public.activity_series FOR EACH ROW WHEN (((old.title IS DISTINCT FROM new.title) OR (old.location IS DISTINCT FROM new.location) OR (old.category_id IS DISTINCT FROM new.category_id) OR (old.activity_time IS DISTINCT FROM new.activity_time))) EXECUTE FUNCTION public.update_series_activities();

CREATE TRIGGER on_activity_task_changed AFTER INSERT OR DELETE OR UPDATE ON public.activity_tasks FOR EACH ROW EXECUTE FUNCTION public.trigger_update_weekly_performance();

CREATE TRIGGER update_activity_tasks_timestamp BEFORE UPDATE ON public.activity_tasks FOR EACH ROW EXECUTE FUNCTION public.trigger_update_timestamp();

CREATE TRIGGER enforce_player_limit BEFORE INSERT ON public.admin_player_relationships FOR EACH ROW EXECUTE FUNCTION public.check_player_limit();

CREATE TRIGGER on_external_event_category_changed AFTER INSERT OR UPDATE OF category_id ON public.events_local_meta FOR EACH ROW EXECUTE FUNCTION public.trigger_create_tasks_for_external_event();

CREATE TRIGGER update_external_calendars_timestamp BEFORE UPDATE ON public.external_calendars FOR EACH ROW EXECUTE FUNCTION public.trigger_update_timestamp();

CREATE TRIGGER update_external_event_tasks_timestamp BEFORE UPDATE ON public.external_event_tasks FOR EACH ROW EXECUTE FUNCTION public.trigger_update_timestamp();

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_profiles_updated_at();

CREATE TRIGGER on_task_template_category_added AFTER INSERT ON public.task_template_categories FOR EACH ROW EXECUTE FUNCTION public.trigger_fix_tasks_on_template_category_change();

CREATE TRIGGER on_task_template_category_added_external AFTER INSERT ON public.task_template_categories FOR EACH ROW EXECUTE FUNCTION public.trigger_fix_external_tasks_on_template_category_change();

CREATE TRIGGER update_tasks_on_subtask_change AFTER INSERT OR DELETE OR UPDATE ON public.task_template_subtasks FOR EACH ROW EXECUTE FUNCTION public.trigger_update_tasks_on_subtask_change();

CREATE TRIGGER update_task_templates_timestamp BEFORE UPDATE ON public.task_templates FOR EACH ROW EXECUTE FUNCTION public.trigger_update_timestamp();

CREATE TRIGGER update_tasks_on_template_change AFTER UPDATE ON public.task_templates FOR EACH ROW EXECUTE FUNCTION public.trigger_update_tasks_on_template_change();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_signup();

CREATE TRIGGER on_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.trigger_seed_new_user();


